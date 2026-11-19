// TEST STAND-IN for the framework's `node strut` command registry (create-strutvane's tests only). It implements the
// commands the installer calls (migrate --seed) plus dev/build/test/user:password/help (strut.js
// itself handles setup and the Docker services:* commands), so the installer's end-to-end test exercises a real project, real files and a real
// database.
//
// Exit codes: 0 ok, 1 failed, 3 database unreachable (the installer offers Retry / Skip for 3).
import { spawnSync } from 'node:child_process'
import { randomBytes, scryptSync } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { faker, useSeedingDatabase } from './database.js'
import { connect, connectionSettings, DatabaseError, dialectOf, prepareDatabase } from './db.js'
import { createSchema, sqlValue } from './index.js'

const UNREACHABLE = 3

/**
 * The settings: real environment variables, with `.env` (read by Node's own parser, the same one
 * as `node --env-file`) on top when it exists. A production container has no `.env`: its host
 * passes everything as environment variables (ADR-0021), so they must count too.
 */
function readEnv(root) {
  const file = join(root, '.env')
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}
  const fromProcess = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => typeof value === 'string'),
  )
  return { ...fromProcess, ...fromFile }
}

/** A friendly failure: what went wrong and how to fix it. */
class CommandError extends Error {
  constructor(message, code = 1) {
    super(message)
    this.code = code
  }
}

/** A database handle: `exec(sql)` runs a statement, `column(sql)` returns the first column as strings. */
async function openDatabase(root, env, role) {
  const dialect = dialectOf(env.DB_CONNECTION)
  if (dialect === 'sqlite') {
    const { DatabaseSync } = await import('node:sqlite')
    const file = join(root, env.DB_DATABASE || 'database/database.sqlite')
    if (!existsSync(file)) {
      throw new CommandError(
        `The SQLite file ${file} does not exist. Run: npm run setup`,
        UNREACHABLE,
      )
    }
    const db = new DatabaseSync(file)
    return {
      dialect,
      exec: async (sql) => void db.exec(sql),
      column: async (sql) =>
        db
          .prepare(sql)
          .all()
          .map((row) => String(Object.values(row)[0])),
      close: async () => db.close(),
    }
  }
  // MySQL, MariaDB or PostgreSQL, in Docker or your own server (see db.js).
  return connect(connectionSettings(env, role))
}

/**
 * `node strut db:prepare [--json]`: what setup runs once against your own server (see db.js).
 * With --json the report is one line, `STRUT_DB_PREPARE {...}`, for the installer.
 */
async function dbPrepare(env, json) {
  const report = await prepareDatabase({
    ...env,
    ...pick(process.env, [
      'STRUT_DB_OWNER',
      'STRUT_DB_APP',
      'STRUT_DB_OWNER_PASSWORD',
      'STRUT_DB_APP_PASSWORD',
    ]),
  })
  if (json) {
    process.stdout.write(`STRUT_DB_PREPARE ${JSON.stringify(report)}\n`)
    return 0
  }
  process.stdout.write(
    `${report.flavor} ${report.version}: created ${report.created.join(', ') || 'nothing'}\n`,
  )
  for (const line of report.sql) process.stdout.write(`  An administrator must run: ${line}\n`)
  for (const line of report.warnings) process.stdout.write(`  WARNING: ${line}\n`)
  return report.sql.length > 0 ? 2 : 0
}

/** Only these keys of an object (the role settings setup hands over in the environment). */
function pick(source, keys) {
  return Object.fromEntries(
    keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  )
}

/** Run every migration in database/migrations that has not run yet, in file-name order. */
async function migrate(root, db) {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS migrations (name VARCHAR(255) PRIMARY KEY, ran_at VARCHAR(40) NOT NULL)',
  )
  const done = new Set(await db.column('SELECT name FROM migrations'))
  const folder = join(root, 'database', 'migrations')
  const files = existsSync(folder)
    ? readdirSync(folder)
        .filter((f) => f.endsWith('.ts'))
        .sort()
    : []
  let ran = 0
  for (const file of files) {
    const name = file.replace(/\.ts$/, '')
    if (done.has(name)) continue
    const { default: definition } = await import(pathToFileURL(join(folder, file)).href)
    const schema = createSchema(db.dialect)
    await definition.up(schema)
    for (const statement of schema.statements) await db.exec(statement)
    await db.exec(
      `INSERT INTO migrations (name, ran_at) VALUES (${sqlValue(name)}, ${sqlValue(new Date().toISOString())})`,
    )
    process.stdout.write(`  ran  ${name}\n`)
    ran += 1
  }
  process.stdout.write(`Migrations run (${ran} new, ${done.size + ran} total)\n`)
}

/** scrypt hash with a random salt (the real auth package owns the format). */
function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url')
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString('base64url')}`
}

/** A readable one-time password like `q7Vd-3kPz-Xm2c-8RtL`. */
function readablePassword() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const limit = 256 - (256 % alphabet.length)
  let text = ''
  while (text.length < 16) {
    const byte = randomBytes(1)[0]
    if (byte < limit) text += alphabet[byte % alphabet.length]
  }
  return text.match(/.{4}/g).join('-')
}

/** Seeding is for development: refuse anywhere that looks like a real deployment (security review F-18). */
function assertDevelopment(env) {
  // Either source saying production is enough: a deployment may set APP_ENV in its environment
  // while an old .env copied along still says "local".
  const deployed = [env.APP_ENV, process.env.APP_ENV].find((value) =>
    ['production', 'staging'].includes(value),
  )
  if (deployed !== undefined) {
    throw new CommandError(
      `Refusing to seed with APP_ENV=${deployed}: seeded accounts are for development only. ` +
        'Create a production admin with: node strut user:create --password-env',
    )
  }
}

/** Run database/seeders/database.seeder.ts, whose call([...]) runs the listed seeders. */
async function seed(root, db, env) {
  assertDevelopment(env)
  const file = join(root, 'database', 'seeders', 'database.seeder.ts')
  if (!existsSync(file)) return
  const { default: seeder } = await import(pathToFileURL(file).href)
  const verb = { sqlite: 'INSERT OR IGNORE', mysql: 'INSERT IGNORE', postgres: 'INSERT' }[
    db.dialect
  ]
  const tail = db.dialect === 'postgres' ? ' ON CONFLICT DO NOTHING' : ''
  const handle = {
    ...db,
    insertOrIgnore: async (table, row) => {
      const columns = Object.keys(row).join(', ')
      const values = Object.values(row).map(sqlValue).join(', ')
      await db.exec(`${verb} INTO ${table} (${columns}) VALUES (${values})${tail}`)
    },
  }
  useSeedingDatabase(handle)
  // The real SeedContext: env is APP_ENV (a string), not the environment variables.
  const context = {
    db: handle,
    env: env.APP_ENV,
    tenantId: undefined,
    faker,
    call: async (list) => {
      for (const definition of list) await definition.run(context)
    },
  }
  await seeder.run(context)
  process.stdout.write('Database seeded\n')
}

/** `node strut user:password <email>`: set a new one-time password and print it once. */
async function resetPassword(root, env, email) {
  if (!email) throw new CommandError('Usage: node strut user:password <email>')
  const db = await openDatabase(root, env, 'app')
  try {
    if (
      (await db.column(`SELECT COUNT(*) FROM users WHERE email = ${sqlValue(email)}`))[0] === '0'
    ) {
      throw new CommandError(`No user with the email ${email}.`)
    }
    const password = readablePassword()
    await db.exec(
      `UPDATE users SET password = ${sqlValue(hashPassword(password))} WHERE email = ${sqlValue(email)}`,
    )
    process.stdout.write(
      `New one-time password for ${email} (shown once, change it at first sign-in): ${password}\n`,
    )
  } finally {
    await db.close()
  }
}

/** Host names the dev server answers (DNS-rebinding defence, security review F-19). */
function allowedHosts(env) {
  const hosts = new Set(['localhost', '127.0.0.1', '[::1]'])
  try {
    hosts.add(new URL(env.APP_URL).hostname)
  } catch {}
  return hosts
}

/**
 * Serve the app on APP_HOST:APP_PORT until Ctrl+C or SIGTERM. APP_HOST is 127.0.0.1 unless set:
 * 0.0.0.0 inside a container (compose and the production Dockerfile set it; the host publishes
 * the port). On SIGTERM/SIGINT the server stops taking connections, finishes, and exits 0, so
 * `docker stop` takes a moment, not its 10-second kill timeout.
 */
async function serve(root, env, label) {
  // The app's config() reads process.env, as the real framework's does after loading .env.
  for (const [key, value] of Object.entries(env)) process.env[key] ??= value
  const { default: app } = await import(pathToFileURL(join(root, 'bootstrap', 'app.ts')).href)
  const port = Number(env.APP_PORT || 3000)
  const hosts = allowedHosts(env)
  const server = createServer(async (request, response) => {
    // A web page you visit could point its own domain at 127.0.0.1 (DNS rebinding); the Host
    // header then names that domain. Only answer our own names (APP_URL's host in production).
    const host = (request.headers.host ?? '').replace(/:\d+$/, '')
    if (!hosts.has(host)) {
      response.writeHead(403, { 'content-type': 'application/problem+json' })
      response.end(
        JSON.stringify({
          title: 'Forbidden host',
          status: 403,
          detail: `Host "${host}" is not allowed. Set APP_URL to the address people use.`,
        }),
      )
      return
    }
    const answer = await app.handle(
      new Request(new URL(request.url, 'http://localhost'), { method: request.method }),
    )
    response.writeHead(answer.status, {
      'content-type': answer.headers.get('content-type') ?? 'text/plain',
    })
    response.end(request.method === 'HEAD' ? undefined : await answer.text())
  })
  await new Promise((resolve, reject) => {
    server.once('error', (error) =>
      reject(
        new CommandError(
          error.code === 'EADDRINUSE'
            ? `Port ${port} is in use. Change APP_PORT in .env.`
            : error.message,
        ),
      ),
    )
    server.listen(port, env.APP_HOST || '127.0.0.1', resolve)
  })
  process.stdout.write(
    `\n  ${env.APP_NAME ?? 'app'}  ${label}\n  App + API   http://localhost:${port}\n  Press Ctrl+C to stop\n`,
  )
  await new Promise((resolve) => {
    const stop = () => {
      server.close(() => resolve(undefined))
      server.closeIdleConnections()
      // Requests still running get a few seconds, then the rest are cut.
      setTimeout(() => server.closeAllConnections(), 5000).unref()
    }
    process.once('SIGTERM', stop)
    process.once('SIGINT', stop)
  })
  return 0
}

/**
 * `node strut build`: the real one checks that the app loads and runs `vite build` into dist/web.
 * The stand-in loads bootstrap/app.ts (so a broken app fails the build) and builds nothing.
 */
async function build(root) {
  await import(pathToFileURL(join(root, 'bootstrap', 'app.ts')).href)
  process.stdout.write('Project loads (stand-in: no web UI to build)\n')
  return 0
}

const HELP = `Usage: node strut <command>

  dev                    Start the app (API + UI) on 127.0.0.1:APP_PORT
  build                  Check the app loads and build the web UI (then: npm start)
  start                  Start the app server (production)
  migrate [--seed]       Run new migrations (and the seeders)
  db:prepare             Check your own database server, create the databases (setup runs it)
  db:seed                Run the seeders (development only)
  user:password <email>  Set a new one-time password and show it once
  test                   Run the tests
  setup                  Finish or repeat setup (what npm run setup calls)
  services:up / services:down / services:status
                         Docker mode: start / stop / list the containers (data is kept)
  list                   Show this list (help is an alias)

Coming with the framework (the spike's stand-in exits with code 2 and changes nothing):
  design:use <name>, token:create, docker:prod, add, install:<name>, user:create, make:model
`

/**
 * Commands the generated files and messages already mention, which the real framework brings.
 * The spike's stand-in says so clearly and exits non-zero (never a silent no-op that looks done).
 */
const COMING = {
  'design:use': 'switch the UI design package and update config/ui.ts',
  'token:create': 'create an API token',
  'docker:prod': 'write the production Dockerfile and .dockerignore',
  add: 'add a package from the catalogue',
  'user:create': 'create a user (a production admin: --password-env)',
  'make:model': 'generate a model, its migration and factory',
}

/** The friendly "not in this stand-in yet" answer, or undefined for a command that exists. */
function comingInFramework(command) {
  const what = command.startsWith('install:')
    ? `install the ${command.slice('install:'.length)} package and its settings`
    : COMING[command]
  if (what === undefined) return undefined
  return `node strut ${command} (${what}) comes with the Strutvane framework. This project uses the spike's stand-in, which does not have it yet: nothing was changed.`
}

/** Open the database for one role, run `work`, always close. */
async function withDatabase(root, env, role, work) {
  const db = await openDatabase(root, env, role)
  try {
    await work(db)
  } finally {
    await db.close()
  }
}

/**
 * A command a package contributes (package.json `strutvane.commands`, a module whose default export
 * is a list of commands), like the real CLI's plugin commands: `auth:migration` comes from auth.
 */
async function packageCommand(root, name) {
  const scope = join(root, 'node_modules', '@strutvane')
  if (!existsSync(scope)) return undefined
  for (const folder of readdirSync(scope)) {
    const manifestFile = join(scope, folder, 'package.json')
    if (!existsSync(manifestFile)) continue
    const entry = JSON.parse(readFileSync(manifestFile, 'utf8')).strutvane?.commands
    if (typeof entry !== 'string') continue
    const { default: commands = [] } = await import(pathToFileURL(join(scope, folder, entry)).href)
    const found = commands.find((command) => command.name === name)
    if (found !== undefined) return found
  }
  return undefined
}

/** The command context a contributed command gets (the parts the stand-ins use). */
function commandContext(root, rest) {
  const line = (text = '') =>
    process.stdout.write(`${text}
`)
  return {
    flags: Object.fromEntries(
      rest.filter((a) => a.startsWith('--')).map((a) => [a.slice(2), true]),
    ),
    requireProject: () => ({ root }),
    out: {
      line,
      success: line,
      info: line,
      warn: (text) =>
        process.stderr.write(`${text}
`),
    },
  }
}

/** Entry point used by strut.js. Returns the exit code. */
export async function run(argv, { root }) {
  const [given = 'list', ...rest] = argv
  const command = given === 'help' ? 'list' : given
  const env = readEnv(root)
  try {
    switch (command) {
      case 'list':
        process.stdout.write(HELP)
        return 0
      case 'migrate':
        await withDatabase(root, env, 'migrate', (db) => migrate(root, db))
        if (rest.includes('--seed'))
          await withDatabase(root, env, 'app', (db) => seed(root, db, env))
        return 0
      case 'db:prepare':
        return await dbPrepare(env, rest.includes('--json'))
      case 'db:seed':
        await withDatabase(root, env, 'app', (db) => seed(root, db, env))
        return 0
      case 'user:password':
        await resetPassword(root, env, rest[0])
        return 0
      case 'dev':
        return await serve(root, env, 'development')
      case 'start':
      case 'serve':
        return await serve(
          root,
          env,
          process.env.NODE_ENV === 'production' ? 'production' : 'server',
        )
      case 'build':
        return await build(root)
      case 'test': {
        const result = spawnSync(process.execPath, ['--test', 'tests/**/*.test.ts'], {
          cwd: root,
          stdio: 'inherit',
        })
        return result.status ?? 1
      }
      default: {
        const contributed = await packageCommand(root, command)
        if (contributed !== undefined)
          return (await contributed.run(commandContext(root, rest)))?.exitCode ?? 0
        const coming = comingInFramework(command)
        process.stderr.write(
          coming === undefined
            ? `Unknown command "${command}". Run: node strut help\n`
            : `${coming}\n`,
        )
        return coming === undefined ? 1 : 2
      }
    }
  } catch (error) {
    if (error instanceof DatabaseError && rest.includes('--json')) {
      process.stdout.write(
        `STRUT_DB_PREPARE ${JSON.stringify({ ok: false, kind: error.kind, message: error.message })}\n`,
      )
    }
    process.stderr.write(`${error.message}\n`)
    return error instanceof CommandError || error instanceof DatabaseError ? error.code : 1
  }
}
