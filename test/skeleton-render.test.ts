/**
 * Rendering from the vendored skeleton (skeleton INSTALLER.md §2–§5): the option -> answer
 * mapping, the installer's edits on top of skeleton files, the env merge, and one regression test
 * per bug of INSTALLER.md §5 (the old inline templates disagreed with framework 0.2.0-next.0).
 * Each bug test runs over several answer sets, so it covers the whole class, not one rendering.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEnv } from '../src/env-file.ts'
import { type Answers, type ProjectOptions, resolveOptions } from '../src/options.ts'
import { renderSkeletonApp, skeletonAnswers, skeletonManifest } from '../src/skeleton/app.ts'
import { databaseSeeder, uiConfig } from '../src/templates/app-files.ts'
import { buildEnvSections, cacheStore, renderEnvFiles } from '../src/templates/env.ts'
import { renderProject } from '../src/templates/project.ts'
import { tempFolder } from './helpers/fakes.ts'

const options = (answers: Answers = {}): ProjectOptions =>
  resolveOptions({ name: 'acme-portal', ...answers }, '/code')

/** Answer sets that between them reach every skeleton condition. */
const ANSWER_SETS: readonly Answers[] = [
  {},
  { stack: 'api', auth: 'none', database: 'sqlite', docker: false, testing: 'none' },
  { database: 'postgres', docker: false, dbHost: '127.0.0.1', auth: 'magic-link', teams: true },
  { design: 'vivid', database: 'sqlite', sampleData: false, deploy: 'docker' },
]

const projects = ANSWER_SETS.map((answers) => renderProject(options(answers)))
const allFiles = projects.flat()
const tsFiles = allFiles.filter(
  (file) => file.path.endsWith('.ts') && !file.path.startsWith('.strutvane/'),
)

describe('the skeleton answers', () => {
  it('maps the installer options as INSTALLER.md §2 says (booleans as strings, API only = ui none)', () => {
    expect(skeletonAnswers(options())).toMatchObject({
      name: 'acme-portal',
      ui: 'admin',
      design: 'crisp',
      auth: 'email',
      teams: 'false',
      database: 'mysql',
      testing: 'vitest',
      currency: 'USD',
    })
    expect(skeletonAnswers(options({ stack: 'api' }))).toMatchObject({
      ui: 'none',
      design: 'crisp',
    })
    expect(skeletonAnswers(options({ ui: 'blank', teams: true, docker: false }))).toMatchObject({
      ui: 'blank',
      teams: 'true',
      docker: 'false',
    })
    // Every answer the manifest knows is given, and nothing else (resolveAnswers refuses extras).
    expect(Object.keys(skeletonAnswers(options())).sort()).toEqual(
      Object.keys(skeletonManifest().answers).sort(),
    )
  })

  it('renders every placeholder: no {{...}} and no @strut marker is left in any file', () => {
    for (const file of allFiles) {
      expect(file.content, file.path).not.toMatch(/\{\{\s*[A-Z_]+\s*\}\}/)
      expect(file.content, file.path).not.toMatch(/@strut:(if|endif)/)
    }
  })

  it('stops when the skeleton names a generator this installer does not have', () => {
    expect(() => renderSkeletonApp(options(), {})).toThrow(
      /config\/auth\.ts written by "configAuth"[\s\S]*npm run vendor:skeleton/,
    )
  })
})

describe("the installer's edits on skeleton files fail closed", () => {
  it('database.seeder.ts without the strut:seeders markers stops the run', () => {
    expect(() => databaseSeeder('export default {}\n', options())).toThrow(/strut:seeders markers/)
  })

  it('config/ui.ts without the expected lines stops the run (never a silently lost answer)', () => {
    expect(() => uiConfig('export default {}\n', options())).toThrow(/appearance: 'system'/)
  })
})

describe('.env and .env.example from the skeleton example (INSTALLER.md §3)', () => {
  it('sets keys in place, keeps comments, appends missing keys under a heading', () => {
    const template = '# Header\n# more\n\n# App\nAPP_ENV=production\n# DB_HOST=x\nAPP_KEY=\n'
    const { env, example } = renderEnvFiles(template, [
      {
        title: 'App',
        vars: [
          { key: 'APP_ENV', value: 'local', localOnly: true },
          { key: 'APP_KEY', value: 'k', secret: true },
          { key: 'DB_HOST', value: 'db' },
        ],
      },
    ])
    expect(example).toBe(
      '# Header\n# more\n\n# App\nAPP_ENV=production\n# DB_HOST=x\nAPP_KEY=\n\n# App\nDB_HOST=db\n',
    )
    expect(env).toMatch(/^# Local settings for this machine\. Never commit this file/)
    expect(env).not.toContain('# Header')
    expect(parseEnv(env).get('APP_ENV')).toBe('local')
    expect(parseEnv(env).get('APP_KEY')).toBe('k')
    expect(env).toContain('# DB_HOST=x') // a commented line is never taken for the key
  })

  it('.env.example is production-safe and lists every key a config file reads, with no secret', () => {
    for (const [index, project] of projects.entries()) {
      const exampleText = project.find((f) => f.path === '.env.example')?.content ?? ''
      const example = parseEnv(exampleText)
      const env = parseEnv(project.find((f) => f.path === '.env')?.content ?? '')
      expect(example.get('APP_ENV'), `set ${index}`).toBe('production')
      expect(example.get('APP_DEBUG')).toBe('false')
      expect(env.get('APP_ENV')).toBe('local')
      expect(env.get('APP_DEBUG')).toBe('true')
      expect(env.get('LOG_LEVEL')).toBe('debug')
      for (const secret of ['APP_KEY', 'DB_PASSWORD', 'DB_ROOT_PASSWORD', 'DB_URL'])
        if (example.has(secret)) expect(example.get(secret), secret).toBe('')
      // Every key the config files read is listed (a missing key would boot with a fallback).
      const configs = project.filter((f) => f.path.startsWith('config/'))
      const read = new Set(
        configs.flatMap((f) =>
          [...f.content.matchAll(/env\.\w+\('([A-Z0-9_]+)'/g)].map((m) => m[1]),
        ),
      )
      // (SQLite apps list the server keys as commented lines, ready to switch.)
      for (const key of read) {
        if (key === undefined) continue
        expect(new RegExp(`^(# )?${key}=`, 'm').test(exampleText), `${key} (set ${index})`).toBe(
          true,
        )
      }
      // Every key in .env is in .env.example too (the example is complete).
      for (const key of env.keys()) expect(example.has(key), `${key} (set ${index})`).toBe(true)
    }
  })

  it('the env sections name the logging and cache keys of the skeleton configs', () => {
    const titles = buildEnvSections(options()).map((section) => section.title)
    expect(titles).toEqual(expect.arrayContaining(['Logging', 'Cache, files and sessions']))
  })
})

describe('INSTALLER.md §5: the seven bugs of the old inline templates, each with its class', () => {
  it('1. imports: models, factories and seeders from /database, migrations only from /schema', () => {
    for (const file of tsFiles) {
      // Nothing imports a database or schema API from the package root (the root does not export it).
      const root = [...file.content.matchAll(/import \{([^}]*)\} from '@strutvane\/framework'/g)]
      for (const match of root)
        expect(match[1], file.path).not.toMatch(/\b(Model|migration|defineSeeder|defineFactory)\b/)
      if (file.path.startsWith('database/migrations/')) {
        const imports = [...file.content.matchAll(/from '([^']+)'/g)].map((m) => m[1])
        expect(imports, file.path).toEqual(['@strutvane/framework/schema'])
      }
      if (/^(database\/(seeders|factories)|app\/models)\//.test(file.path))
        expect(file.content, file.path).toContain("from '@strutvane/framework/database'")
    }
  })

  it('2. config: every file in config/index.ts is a defineConfig file; no config reads process.env', () => {
    for (const project of projects) {
      const index = project.find((f) => f.path === 'config/index.ts')?.content ?? ''
      const listed = [...index.matchAll(/import (\w+) from '\.\/(\w+)\.ts'/g)].map((m) => m[2])
      expect(listed.length).toBeGreaterThan(4)
      for (const name of listed) {
        const config = project.find((f) => f.path === `config/${name}.ts`)?.content ?? ''
        expect(config, name).toMatch(/export default defineConfig\(/)
      }
      for (const file of project.filter((f) => f.path.startsWith('config/')))
        expect(file.content, file.path).not.toContain('process.env')
      const bootstrap = project.find((f) => f.path === 'bootstrap/app.ts')?.content ?? ''
      expect(bootstrap).toContain('.withConfig(config)')
      expect(bootstrap).toContain('.withProviders(providers)')
    }
  })

  it('3. routes: defineRoutes with invokable controller classes, never (router) => void', () => {
    for (const project of projects) {
      for (const path of ['routes/web.ts', 'routes/api.ts']) {
        const routes = project.find((f) => f.path === path)?.content ?? ''
        expect(routes, path).toMatch(/export default defineRoutes\(/)
        expect(routes, path).not.toMatch(/\(router: Router\): void/)
      }
      for (const file of project.filter((f) => f.path.startsWith('app/http/controllers/')))
        expect(file.content, file.path).toMatch(/__invoke\(ctx: HttpContext\)/)
    }
  })

  it('4. npm start runs node strut start; nothing names build/server.js', () => {
    for (const project of projects) {
      const manifest = JSON.parse(project.find((f) => f.path === 'package.json')?.content ?? '{}')
      expect(manifest.scripts.start).toBe('node strut start')
      for (const file of project) expect(file.content, file.path).not.toContain('build/server.js')
    }
  })

  it('5. factories: sequence is a number, never sequence((n) => ...)', () => {
    for (const file of allFiles.filter((f) => f.path.startsWith('database/factories/'))) {
      // The skeleton writes the template literal `user${sequence}@example.test`.
      expect(file.content, file.path).toContain(['`user$', '{sequence}@example.test`'].join(''))
      expect(file.content, file.path).not.toMatch(/sequence\(/)
    }
  })

  it('6. seeders: env is APP_ENV, never env[...] (the admin address comes from the environment)', () => {
    const seeders = allFiles.filter((f) => f.path.startsWith('database/seeders/'))
    expect(seeders.some((f) => f.path.endsWith('admin.seeder.ts'))).toBe(true)
    for (const file of seeders) expect(file.content, file.path).not.toMatch(/(?<!process\.)env\[/)
  })

  it('7. cache: CACHE_STORE is a store the framework has (file or memory), never database', () => {
    for (const cache of ['database', 'redis'] as const) {
      const project = renderProject(options({ cache, previewCatalogue: true }))
      for (const name of ['.env', '.env.example']) {
        const store = parseEnv(project.find((f) => f.path === name)?.content ?? '').get(
          'CACHE_STORE',
        )
        expect(['file', 'memory'], `${cache} ${name}`).toContain(store)
      }
      const config = project.find((f) => f.path === 'config/cache.ts')?.content ?? ''
      expect(config).toContain("file: { driver: 'file'")
      expect(config).not.toMatch(/store['"]?: ['"]database/)
      expect(cacheStore(options({ cache }))).toBe('file')
    }
  })
})

describe('the generated first-admin seeder, run for real (@strutvane/auth createFirstAdmin)', () => {
  const seeder =
    renderProject(options()).find((f) => f.path === 'database/seeders/admin.seeder.ts')?.content ??
    ''

  // A stand-in with auth 0.2.0-next.1's contract: it echoes the call, then answers as STUB_MODE
  // says (created, or one of FirstAdminError's codes, or an error that only looks like one).
  const AUTH_STUB = `export class FirstAdminError extends Error {
  constructor(code, message) { super(message + ' (' + code + ')'); this.name = 'FirstAdminError'; this.code = code }
}
export async function createFirstAdmin(db, input) {
  process.stdout.write('CALL ' + JSON.stringify({ db, input }) + '\\n')
  const mode = process.env.STUB_MODE ?? 'created'
  if (mode === 'look-alike') throw Object.assign(new Error('not auth'), { code: 'first_admin_exists' })
  if (mode !== 'created') throw new FirstAdminError(mode, 'refused by auth')
  return { userId: '1', email: input.email, role: 'admin',
    ...(input.password === undefined ? { oneTimePassword: 'Shown-Once-Only-7' } : {}) }
}
`

  /** A throw-away app folder with stub packages; returns what the seeder printed. */
  function runSeeder(appEnv: string, extra: Record<string, string> = {}) {
    const folder = tempFolder('cs-admin-seeder-')
    mkdirSync(join(folder, 'database', 'seeders'), { recursive: true })
    writeFileSync(join(folder, 'database', 'seeders', 'admin.seeder.ts'), seeder)
    writeFileSync(join(folder, '.env'), 'SEED_ADMIN_EMAIL=boss@acme.test\n')
    const stub = (name: string, files: Record<string, string>, exports: Record<string, string>) => {
      const dir = join(folder, 'node_modules', '@strutvane', name)
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: `@strutvane/${name}`, type: 'module', exports }),
      )
      for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text)
    }
    stub('auth', { 'index.js': AUTH_STUB }, { '.': './index.js' })
    stub(
      'framework',
      { 'database.js': 'export const defineSeeder = (definition) => definition\n' },
      { './database': './database.js' },
    )
    writeFileSync(
      join(folder, 'run.mjs'),
      [
        "const { default: seeder } = await import('./database/seeders/admin.seeder.ts')",
        "await seeder.run({ db: 'the-db', env: process.argv[2] })",
        '',
      ].join('\n'),
    )
    const environment: NodeJS.ProcessEnv = { ...process.env, ...extra }
    delete environment['SEED_ADMIN_EMAIL']
    if (extra['STRUT_SEED_ADMIN_PASSWORD'] === undefined)
      delete environment['STRUT_SEED_ADMIN_PASSWORD']
    const result = spawnSync(process.execPath, ['run.mjs', appEnv], {
      cwd: folder,
      env: environment,
      encoding: 'utf8',
    })
    return { code: result.status, stdout: result.stdout, stderr: result.stderr }
  }

  /** The arguments createFirstAdmin received. */
  const callOf = (stdout: string): unknown =>
    JSON.parse(
      stdout
        .split('\n')
        .find((line) => line.startsWith('CALL '))
        ?.slice(5) ?? 'null',
    )

  it('imports createFirstAdmin and FirstAdminError statically (no guard for an older auth)', () => {
    expect(seeder).toContain("import { createFirstAdmin, FirstAdminError } from '@strutvane/auth'")
    expect(seeder).not.toContain('Reflect.get')
  })

  it('run by hand: createFirstAdmin(db, { name, email }) from .env, and the one-time password printed once', () => {
    const result = runSeeder('local')
    expect(result.code, result.stderr).toBe(0)
    expect(callOf(result.stdout)).toEqual({
      db: 'the-db',
      input: { name: 'Admin', email: 'boss@acme.test' },
    })
    expect(result.stdout).toContain('Admin created: boss@acme.test')
    expect(result.stdout.split('Shown-Once-Only-7')).toHaveLength(2) // exactly once
  })

  it('run by setup: the password from STRUT_SEED_ADMIN_PASSWORD goes to auth and is never printed', () => {
    const password = 'Setup-Pass-4711-abcd'
    const result = runSeeder('local', { STRUT_SEED_ADMIN_PASSWORD: password })
    expect(result.code, result.stderr).toBe(0)
    expect(callOf(result.stdout)).toEqual({
      db: 'the-db',
      input: { name: 'Admin', email: 'boss@acme.test', password },
    })
    expect(result.stdout).toContain('Admin created: boss@acme.test')
    expect(result.stdout.replace(/^CALL .*$/m, '')).not.toContain(password)
    expect(result.stdout).not.toMatch(/One-time password/)
  })

  it('seeding again: first_admin_exists is "already done", so the seed goes on', () => {
    const result = runSeeder('local', { STUB_MODE: 'first_admin_exists' })
    expect(result.code, result.stderr).toBe(0)
    expect(result.stdout).toContain('Admin exists (unchanged)')
  })

  it('every other refusal, and an error that only looks like auth`s, fails the seed with its message', () => {
    for (const mode of ['email_taken', 'validation_failed', 'auth_tables_missing', 'look-alike']) {
      const result = runSeeder('local', { STUB_MODE: mode })
      expect(result.code, mode).not.toBe(0)
      expect(result.stdout, mode).not.toContain('Admin created')
      expect(result.stderr, mode).toMatch(mode === 'look-alike' ? /not auth/ : /refused by auth/)
    }
  })

  it('never runs for APP_ENV=production or staging', () => {
    for (const appEnv of ['production', 'staging']) {
      const result = runSeeder(appEnv)
      expect(result.code, result.stderr).toBe(0)
      expect(result.stdout).toBe('')
    }
  })
})
