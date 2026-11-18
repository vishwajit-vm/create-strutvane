/**
 * End to end, for real: the installer CLI runs in a temporary folder with real npm (the generated
 * .npmrc guards included), real git, a real SQLite database, real Vitest and the generated
 * `node strut`. The Strutvane packages are local stand-ins (`STRUT_LOCAL_PACKAGES`), because they
 * are not on npm yet; Vitest comes from the registry like in any app.
 *
 * The flow proves resume with a real failure: git has no identity on the first run (exit 2), then
 * `npm run setup` (real npm) finishes the job after the identity is set. A fresh clone is then set
 * up from the committed strutvane.json alone.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { parseEnv } from '../src/env-file.ts'
import { resolveNpmCli } from '../src/npm-cli.ts'
import { isForbiddenInCommit } from '../src/steps/git.ts'
import { ABSORBED_PACKAGES } from '../src/version.ts'
import { tempFolder } from './helpers/fakes.ts'
import { localPackages } from './helpers/local-packages.ts'

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const NPM = resolveNpmCli(process.env, process.execPath)
const PACKAGES = localPackages()

/**
 * A clean environment: no npm_* variables from the test runner, no git identity, a private git
 * config file, npm's network extras off, and the local package stand-ins.
 */
function cleanEnvironment(
  gitConfig: string,
  extra: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(npm_|GIT_|EMAIL$|CI$)/i.test(key)) continue
    env[key] = value
  }
  return {
    ...env,
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
    STRUT_LOCAL_PACKAGES: PACKAGES,
    ...extra,
  }
}

/** Run a program to completion and return its exit code and output. */
function run(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, [...args], {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 240_000,
    windowsHide: true,
  })
  return { code: result.status ?? -1, output: `${result.stdout}${result.stderr}` }
}

/** Request a path with a chosen Host header (fetch cannot set Host). */
function get(
  port: number,
  path: string,
  host: string,
  method = 'GET',
): Promise<{ status: number; body: string; type: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: { host } }, (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString()
      })
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          body,
          type: String(res.headers['content-type'] ?? ''),
        }),
      )
    })
    req.on('error', reject)
    req.end()
  })
}

/** Start a server process and resolve once it prints its URL. */
function started(child: ChildProcess, what: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error(`${what} did not start: ${output}`)), 30_000)
    const seen = (chunk: Buffer) => {
      output += chunk.toString()
      if (output.includes('http://localhost:')) {
        clearTimeout(timer)
        resolve(child)
      }
    }
    child.stdout?.on('data', seen)
    child.stderr?.on('data', seen)
  })
}

const children: ChildProcess[] = []
afterAll(() => {
  for (const child of children) child.kill()
})

describe('real end-to-end run (SQLite, no Docker)', () => {
  const root = tempFolder('cs-e2e-')
  const gitConfig = join(root, 'gitconfig')
  const directory = join(root, 'acme-e2e')

  it('first run: creates, installs, migrates and seeds; stops at git (no identity) with exit 2', () => {
    // useConfigOnly makes "no identity" deterministic on every machine.
    writeFileSync(
      gitConfig,
      '[user]\n\tuseConfigOnly = true\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n',
    )
    const result = run(
      process.execPath,
      [CLI, 'acme-e2e', '--yes', '--db', 'sqlite'],
      root,
      cleanEnvironment(gitConfig),
    )
    expect(result.code, result.output).toBe(2)
    expect(result.output).toMatch(/Dependencies installed with npm/)
    expect(result.output).toMatch(/Migrations run \(1 new, 1 total\)/)
    expect(result.output).toMatch(/git config --global user.name/)
    expect(result.output).toContain('cd acme-e2e; npm run setup')

    const state = JSON.parse(
      readFileSync(join(directory, '.strutvane', 'local', 'setup.json'), 'utf8'),
    ) as { steps: Record<string, { status: string }> }
    expect(
      Object.fromEntries(Object.entries(state.steps).map(([id, step]) => [id, step.status])),
    ).toEqual({
      files: 'done',
      secrets: 'done',
      ports: 'done',
      install: 'done',
      database: 'done',
      migrate: 'done',
      git: 'failed',
    })
    expect(
      existsSync(join(directory, 'node_modules', '@strutvane', 'framework', 'package.json')),
    ).toBe(true)
    // npm wrote the lockfile on the first install (it is committed with the project).
    expect(existsSync(join(directory, 'package-lock.json'))).toBe(true)
    // Only the merged framework: no second kernel anywhere in node_modules (finding C1).
    for (const absorbed of ABSORBED_PACKAGES) {
      expect(existsSync(join(directory, 'node_modules', ...absorbed.split('/'))), absorbed).toBe(
        false,
      )
    }

    const env = parseEnv(readFileSync(join(directory, '.env'), 'utf8'))
    const example = parseEnv(readFileSync(join(directory, '.env.example'), 'utf8'))
    expect(env.get('APP_KEY')?.length).toBe(43)
    expect(example.get('APP_KEY')).toBe('')
    expect(example.has('AUTH_SECRET')).toBe(false) // APP_KEY is the one root secret (#26)
    expect(env.get('DB_CONNECTION')).toBe('sqlite')
    expect(env.get('DB_DATABASE')).toBe('database/database.sqlite')
    expect(env.has('SEED_ADMIN_PASSWORD')).toBe(false) // never stored (security review F-18)

    const db = new DatabaseSync(join(directory, 'database', 'database.sqlite'))
    try {
      // The first admin, through @strutvane/auth's createFirstAdmin() (the stand-in's). The
      // must-change-password flag is auth's own column (its migrations), not the skeleton's.
      const admin = db
        .prepare("SELECT email, password FROM users WHERE email = 'admin@acme-e2e.test'")
        .all()
      expect(admin).toHaveLength(1)
      expect(String(admin[0]?.['password'])).toMatch(/^scrypt\$/)
      // Sample data (the default for the admin starter): the skeleton's user seeder and factory
      // (INSTALLER.md §5 bug 5: sequence is a number), fake users with no password.
      const fake = db
        .prepare("SELECT email, password FROM users WHERE email LIKE 'user%@example.test'")
        .all()
      expect(fake.map((row) => row['email'])).toEqual(
        [1, 2, 3, 4, 5].map((n) => `user${n}@example.test`),
      )
      expect(fake.every((row) => row['password'] === null)).toBe(true)
      // Applied migrations are recorded in Laravel's table (#36).
      expect(db.prepare('SELECT COUNT(*) AS n FROM migrations').get()).toEqual({ n: 1 })
    } finally {
      db.close()
    }
  })

  it('npm run setup resumes at git and finishes (exit 0)', () => {
    writeFileSync(
      gitConfig,
      '[user]\n\tname = Spike Tester\n\temail = spike@example.test\n[commit]\n\tgpgsign = false\n',
    )
    const result = run(
      process.execPath,
      [NPM, 'run', 'setup'],
      directory,
      cleanEnvironment(gitConfig),
    )
    expect(result.code, result.output).toBe(0)
    expect(result.output).toMatch(/Git repository created \(main, 1 commit\)/)
    expect(result.output).not.toMatch(/Running migrations/) // done steps are not run again
  })

  it('install scripts never run; strict-allow-scripts guards a rebuild unless allowlisted (L5)', () => {
    // A dependency with an install script that would leave a CANARY file behind.
    const canary = join(directory, '.strutvane', 'local', 'canary')
    mkdirSync(canary, { recursive: true })
    writeFileSync(
      join(canary, 'package.json'),
      JSON.stringify({
        name: 'canary',
        version: '1.0.0',
        scripts: {
          postinstall:
            "node -e \"require('fs').writeFileSync(require('path').join(process.env.INIT_CWD,'CANARY'),'ran')\"",
        },
      }),
    )
    const manifestPath = join(directory, 'package.json')
    const original = readFileSync(manifestPath, 'utf8')
    const manifest = JSON.parse(original) as {
      dependencies: Record<string, string>
      allowScripts: Record<string, boolean>
    }
    manifest.dependencies['canary'] = 'file:./.strutvane/local/canary'
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    const env = cleanEnvironment(gitConfig)
    try {
      const install = run(process.execPath, [NPM, 'install'], directory, env)
      expect(install.code, install.output).toBe(0)
      expect(existsSync(join(directory, 'node_modules', 'canary', 'package.json'))).toBe(true)
      expect(existsSync(join(directory, 'CANARY'))).toBe(false)

      // Switching scripts back on is not enough: strict-allow-scripts refuses an unlisted one.
      const refused = run(
        process.execPath,
        [NPM, 'rebuild', 'canary', '--ignore-scripts=false'],
        directory,
        env,
      )
      expect(refused.code, refused.output).not.toBe(0)
      expect(refused.output).toMatch(/ESTRICTALLOWSCRIPTS|allowScripts/)
      expect(existsSync(join(directory, 'CANARY'))).toBe(false)

      // Control: approved into "allowScripts" (npm's own command), the script runs, so the
      // checks above are meaningful.
      const approve = run(
        process.execPath,
        [NPM, 'install-scripts', 'approve', 'canary'],
        directory,
        env,
      )
      expect(approve.code, approve.output).toBe(0)
      expect(JSON.parse(readFileSync(manifestPath, 'utf8')).allowScripts).not.toEqual({})
      const rebuild = run(
        process.execPath,
        [NPM, 'rebuild', 'canary', '--ignore-scripts=false'],
        directory,
        env,
      )
      expect(rebuild.code, rebuild.output).toBe(0)
      expect(existsSync(join(directory, 'CANARY'))).toBe(true)
    } finally {
      writeFileSync(manifestPath, original)
      run(process.execPath, [NPM, 'install'], directory, env)
    }
  })

  it('the first commit holds the lockfile and no secrets, local data or local state', () => {
    const env = cleanEnvironment(gitConfig)
    expect(run('git', ['rev-list', '--count', 'HEAD'], directory, env).output.trim()).toBe('1')
    const committed = run('git', ['ls-tree', '-r', '--name-only', 'HEAD'], directory, env)
      .output.split(/\r?\n/)
      .filter(Boolean)
    expect(committed).toContain('package-lock.json')
    expect(committed).toContain('strutvane.json')
    expect(committed).toContain('.npmrc')
    expect(committed).not.toContain('CANARY')
    expect(committed).toContain('.env.example')
    expect(committed).toContain('strut.js')
    expect(committed.filter(isForbiddenInCommit)).toEqual([])
    expect(committed.some((path) => path.startsWith('.strutvane/local/'))).toBe(false)
    expect(committed.some((path) => path.startsWith('node_modules/'))).toBe(false)
  })

  it('node strut works: list, npm test (Vitest), and dev on 127.0.0.1 refusing foreign hosts', async () => {
    const env = cleanEnvironment(gitConfig)
    const list = run(process.execPath, ['strut.js', 'list'], directory, env)
    expect(list.output).toMatch(/migrate \[--seed\]/)
    expect(run(process.execPath, ['strut.js', 'help'], directory, env).output).toBe(list.output)
    const tests = run(process.execPath, [NPM, 'test'], directory, env)
    expect(tests.code, tests.output).toBe(0)
    // The skeleton's own tests: the booted app answers /up, /api/health and a 404.
    expect(tests.output).toMatch(/Tests\s+4 passed/)

    const port = Number(parseEnv(readFileSync(join(directory, '.env'), 'utf8')).get('APP_PORT'))
    const dev = await started(
      spawn(process.execPath, ['strut.js', 'dev'], { cwd: directory, env, windowsHide: true }),
      'dev',
    )
    children.push(dev)
    const home = await get(port, '/', `localhost:${port}`)
    expect(home.status).toBe(200)
    expect(home.body).toContain('acme-e2e')
    expect((await get(port, '/api/health', `127.0.0.1:${port}`)).body).toBe('{"status":"ok"}')
    // The health route answers JSON to GET and HEAD (#45).
    const up = await get(port, '/up', `localhost:${port}`)
    expect(up).toMatchObject({ status: 200, body: '{"status":"ok"}' })
    expect(up.type).toContain('application/json')
    expect((await get(port, '/up', `localhost:${port}`, 'HEAD')).status).toBe(200)
    // DNS rebinding defence (security review F-19).
    expect((await get(port, '/', 'evil.example')).status).toBe(403)
    dev.kill()
  })

  // Regression (class: a production start that only works inside the source tree, and INSTALLER.md
  // §5 bug 4: `npm start` ran build/server.js, which the framework never writes). The image ships
  // exactly what the Dockerfile copies; settings come from the environment, never a .env.
  it('the production start runs alone: what the Dockerfile copies, settings from the environment', async () => {
    const env = cleanEnvironment(gitConfig)
    expect(run(process.execPath, ['strut.js', 'build'], directory, env).code).toBe(0)
    const image = tempFolder('cs-image-')
    // The Dockerfile's run stage, plus the local package copies node_modules links to (tests only).
    for (const part of [
      'node_modules',
      'package.json',
      'strut.js',
      'app',
      'bootstrap',
      'config',
      'database',
      'routes',
      'public',
      '.strutvane',
    ])
      cpSync(join(directory, part), join(image, part), { recursive: true, verbatimSymlinks: true })
    expect(existsSync(join(image, '.env'))).toBe(false)
    expect(JSON.parse(readFileSync(join(image, 'package.json'), 'utf8')).scripts.start).toBe(
      'node strut start',
    )
    const port = 39_000 + Math.floor(Math.random() * 500)
    const server = await started(
      spawn(process.execPath, ['strut.js', 'start'], {
        cwd: image,
        env: { ...env, NODE_ENV: 'production', APP_PORT: String(port), APP_NAME: 'acme-e2e' },
        windowsHide: true,
      }),
      'server',
    )
    children.push(server)
    expect((await get(port, '/up', `localhost:${port}`)).body).toBe('{"status":"ok"}')
    expect((await get(port, '/', 'evil.example')).status).toBe(403)
    server.kill()
  })

  it('every other command goes to the framework program, and its exit code comes back', () => {
    const env = cleanEnvironment(gitConfig)
    // The stand-in framework answers commands it does not have with 2 ("comes with the
    // framework"), and unknown ones with 1; strut.js passes both through unchanged.
    expect(run(process.execPath, ['strut.js', 'design:use', 'vivid'], directory, env).code).toBe(2)
    expect(run(process.execPath, ['strut.js', 'no-such-command'], directory, env).code).toBe(1)
  })

  it('the setup log is local state and holds no generated secret', () => {
    const logs = join(directory, '.strutvane', 'local', 'logs')
    const text = readdirSync(logs)
      .map((name) => readFileSync(join(logs, name), 'utf8'))
      .join('\n')
    expect(text).toMatch(/npm-cli\.js" install --ignore-scripts/)
    const env = parseEnv(readFileSync(join(directory, '.env'), 'utf8'))
    expect(text).not.toContain(env.get('APP_KEY') ?? 'missing')
  })

  it('a fresh clone is set up from the committed strutvane.json alone (#9)', () => {
    const env = cleanEnvironment(gitConfig)
    const clone = join(root, 'acme-clone')
    expect(run('git', ['clone', '-q', directory, clone], root, env).code).toBe(0)
    expect(existsSync(join(clone, '.env'))).toBe(false)
    expect(existsSync(join(clone, '.strutvane', 'local'))).toBe(false)
    // The local package copies are git-ignored; a teammate on the umbrella workspace has them.
    cpSync(
      join(directory, '.strutvane', 'local', 'packages'),
      join(clone, '.strutvane', 'local', 'packages'),
      { recursive: true },
    )
    const result = run(process.execPath, [CLI, '--resume', clone], root, env)
    expect(result.code, result.output).toBe(0)
    expect(result.output).toMatch(/setting up from strutvane.json/)
    expect(result.output).toMatch(/Restored local files: \.env/)
    expect(result.output).toMatch(/Migrations run \(1 new, 1 total\)/)
    expect(result.output).toMatch(/already has its first commit/)
    const env2 = parseEnv(readFileSync(join(clone, '.env'), 'utf8'))
    expect(env2.get('APP_KEY')?.length).toBe(43)
    expect(env2.get('APP_KEY')).not.toBe(
      parseEnv(readFileSync(join(directory, '.env'), 'utf8')).get('APP_KEY'),
    )
    expect(existsSync(join(clone, '.strutvane', 'local', 'setup.json'))).toBe(true)
  })
})

describe('real run with Docker missing (CI mode)', () => {
  it('exits 2 with a friendly message, keeps the project, and leaves the rest for npm run setup', () => {
    const root = tempFolder('cs-nodocker-')
    const gitConfig = join(root, 'gitconfig')
    writeFileSync(gitConfig, '')
    const result = run(
      process.execPath,
      // --docker: asked for explicitly (without it, a missing Docker simply means "your own server").
      [CLI, 'acme-nodocker', '--yes', '--docker', '--no-git'],
      root,
      cleanEnvironment(gitConfig, { STRUT_CONTAINER_CLI: 'definitely-not-docker-13' }),
    )
    expect(result.code, result.output).toBe(2)
    expect(result.output).toMatch(/Docker is not installed/)
    expect(result.output).toMatch(/or set up without Docker: your own database server .* or SQLite/)
    const state = JSON.parse(
      readFileSync(join(root, 'acme-nodocker', '.strutvane', 'local', 'setup.json'), 'utf8'),
    ) as { steps: Record<string, { status: string }> }
    expect(state.steps['database']?.status).toBe('failed')
    expect(state.steps['install']?.status).toBe('pending') // npm runs in the container, which never started
    expect(state.steps['migrate']?.status).toBe('pending')
  })
})
