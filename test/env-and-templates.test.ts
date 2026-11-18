/**
 * The env writer (escaping, injection) and the generated files (secrets, Docker, git rules).
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv as nodeParseEnv } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  envValueProblem,
  formatEnvValue,
  generateReadablePassword,
  generateSecret,
  parseEnv,
  setEnvValue,
  UnsafeEnvValueError,
} from '../src/env-file.ts'
import { type ProjectOptions, resolveOptions } from '../src/options.ts'
import { isForbiddenInCommit, MUST_BE_IGNORED } from '../src/steps/git.ts'
import { secretKeys } from '../src/templates/env.ts'
import { renderProject } from '../src/templates/project.ts'
import { DRIVERS, FRAMEWORK_RANGE, VITEST } from '../src/version.ts'
import { tempFolder } from './helpers/fakes.ts'

const options = (extra: Parameters<typeof resolveOptions>[0] = {}): ProjectOptions =>
  resolveOptions({ name: 'acme-portal', ...extra }, '/code')

const file = (project: ReturnType<typeof renderProject>, path: string): string => {
  const found = project.find((f) => f.path === path)
  if (found === undefined) throw new Error(`${path} was not generated`)
  return found.content
}

describe('env writer (security review F-17)', () => {
  it("round-trips awkward values through Node's own .env parser", () => {
    const samples = [
      'plain',
      'with space',
      'hash # inside',
      'a#b',
      "it's",
      '$HOME',
      '${X}',
      'üñî ✓',
      ' padded ',
      'x=y',
      '"quoted"',
      '',
    ]
    for (const value of samples) {
      const text = setEnvValue('A=1\n', 'VALUE', value)
      expect(nodeParseEnv(text)['VALUE'] ?? '', `value ${JSON.stringify(value)}`).toBe(value)
      expect(parseEnv(text).get('A')).toBe('1')
    }
  })

  it('round-trips 500 random printable values', () => {
    const alphabet = ` abcXYZ019#$'"=;:&|%^!*()[]{}<>?,./\\~\`@üé✓`
    let seed = 7
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let i = 0; i < 500; i += 1) {
      let value = ''
      const length = Math.floor(random() * 20)
      for (let c = 0; c < length; c += 1)
        value += alphabet[Math.floor(random() * alphabet.length)] ?? ''
      let text: string
      try {
        text = setEnvValue('', 'V', value)
      } catch {
        // Only values holding all three quote kinds (', " or \, and `) may be refused.
        expect(
          value.includes("'") &&
            (value.includes('"') || value.includes('\\')) &&
            value.includes('`'),
        ).toBe(true)
        continue
      }
      const read = nodeParseEnv(text)['V'] ?? ''
      // Node trims unquoted values; we quote anything with spaces, so the value must survive whole.
      expect(read, `value ${JSON.stringify(value)} as ${JSON.stringify(text)}`).toBe(value)
    }
  })

  it('refuses newline injection and bad keys', () => {
    expect(() => setEnvValue('', 'DB_PASSWORD', 'x\nAPP_DEBUG=true')).toThrow(/line break/)
    expect(() => setEnvValue('', 'DB_PASSWORD', 'x\rY')).toThrow(/line break/)
    expect(() => setEnvValue('', 'DB_PASSWORD', 'x\0')).toThrow(/NUL/)
    expect(() => setEnvValue('', 'bad key', 'x')).toThrow(/not a valid .env key/)
    expect(formatEnvValue('a b')).toBe("'a b'")
  })

  // Regression (class: a real password with every quote kind). Passwords legitimately mix ' and ";
  // they must be written (backtick-quoted, which Node's parser and dotenv read literally), and a
  // value that truly cannot be written must never be echoed in the error (it is a secret).
  it('writes values mixing quote kinds, and never puts a refused value in the error message', () => {
    for (const value of [`it's "q"`, `a\\b'c`, `p'a"s$s#w\\o{rd}`]) {
      expect(nodeParseEnv(`V=${formatEnvValue(value)}`)['V'], value).toBe(value)
    }
    const secret = `S3cret'"\`mix`
    expect(() => formatEnvValue(secret)).toThrow(UnsafeEnvValueError)
    try {
      formatEnvValue(secret)
    } catch (error) {
      expect(String(error)).not.toContain('S3cret')
    }
    expect(envValueProblem(secret)).toMatch(/cannot hold/)
    expect(envValueProblem('ok value')).toBeUndefined()
    expect(envValueProblem('x\ny')).toMatch(/line break/)
  })

  it('generates 32-byte secrets and readable one-time passwords', () => {
    expect(generateSecret()).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(generateReadablePassword()).toMatch(
      /^([a-km-zA-HJ-NP-Z2-9]{4}-){3}[a-km-zA-HJ-NP-Z2-9]{4}$/,
    )
  })
})

describe('generated files', () => {
  it('writes secrets empty in both files; .env.example never holds one, and no admin password key exists', () => {
    const project = renderProject(options({ database: 'postgres' }))
    const example = parseEnv(file(project, '.env.example'))
    for (const key of secretKeys(options({ database: 'postgres' })))
      expect(example.get(key)).toBe('')
    expect(file(project, '.env')).not.toMatch(/SEED_ADMIN_PASSWORD/)
    expect(example.get('APP_DEBUG')).toBe('false')
    expect(example.get('APP_ENV')).toBe('production')
  })

  it('binds every Docker port to 127.0.0.1 and keeps passwords off command lines', () => {
    for (const database of ['mysql', 'postgres'] as const) {
      const compose = file(renderProject(options({ database })), 'docker/compose.yaml')
      const mappings = compose.split('\n').filter((line) => /^\s+- "[^"]*:\d+"$/.test(line))
      expect(mappings.length).toBeGreaterThan(0)
      for (const mapping of mappings) expect(mapping.trim()).toMatch(/^- "127\.0\.0\.1:/)
      expect(compose).not.toMatch(/--password=|-p\$\$/)
      expect(compose).toMatch(/\$\{DB_PASSWORD:\?/)
    }
  })

  it('gives PostgreSQL a separate owner role and a plain app role (security review F-20)', () => {
    const project = renderProject(options({ database: 'postgres' }))
    const env = parseEnv(file(project, '.env'))
    expect(env.get('DB_USERNAME')).toBe('acme_portal_app')
    expect(env.get('DB_MIGRATION_USERNAME')).toBe('acme_portal_owner')
    const init = file(project, 'docker/initdb/create-roles.sh')
    expect(init).toMatch(/CREATE ROLE :"app" LOGIN NOSUPERUSER NOBYPASSRLS/)
    expect(init).toMatch(/CREATE DATABASE :"test_db" OWNER :"owner"/)
    expect(file(project, 'docker/compose.yaml')).not.toMatch(/POSTGRES_USER:/)
  })

  it('creates a test database next to the dev one', () => {
    expect(file(renderProject(options()), 'docker/initdb/create-test-database.sql')).toMatch(
      /CREATE DATABASE IF NOT EXISTS acme_portal_test/,
    )
    expect(
      parseEnv(file(renderProject(options({ database: 'sqlite' })), '.env')).get(
        'DB_TEST_DATABASE',
      ),
    ).toBe('database/testing.sqlite')
  })

  it('has no Docker files for SQLite or without Docker', () => {
    expect(
      renderProject(options({ database: 'sqlite' })).some((f) => f.path.startsWith('docker/')),
    ).toBe(false)
    expect(
      renderProject(options({ docker: false })).some((f) => f.path.startsWith('docker/')),
    ).toBe(false)
  })

  it('ships the scripts, strut.js, AGENTS.md, engines and the npm guards (L5)', () => {
    const project = renderProject(options())
    const manifest: unknown = JSON.parse(file(project, 'package.json'))
    expect(manifest).toMatchObject({
      engines: { node: '>=24.3' },
      devEngines: { packageManager: { name: 'npm', version: '>=11.19.0', onFail: 'error' } },
      scripts: {
        dev: 'node strut dev',
        build: 'node strut build',
        // INSTALLER.md §5 bug 4: the framework never writes build/server.js.
        start: 'node strut start',
        test: 'vitest run',
        setup: 'node strut setup',
        strut: 'node strut',
      },
      devDependencies: { vitest: VITEST.version },
      allowScripts: {},
    })
    const npmrc = file(project, '.npmrc')
    for (const guard of [
      'ignore-scripts=true',
      'strict-allow-scripts=true',
      'min-release-age=1',
      'min-release-age-exclude[]=@strutvane/*',
      'allow-git=none',
      'engine-strict=true',
    ]) {
      expect(npmrc.split('\n')).toContain(guard)
    }
    // No shipped lockfile: the first install writes it (with the guards above) and git commits it.
    expect(project.some((f) => f.path === 'package-lock.json')).toBe(false)
    expect(file(project, 'strut.js')).toMatch(/node strut <command>/)
    expect(file(project, 'AGENTS.md')).toMatch(/node strut list/)
    expect(file(project, 'README.md')).toMatch(
      /npm run dev[\s\S]*node strut list[\s\S]*npm run setup/,
    )
    // strut.js is the skeleton's, and executable (written with mode 0o755 on macOS and Linux).
    expect(project.find((f) => f.path === 'strut.js')?.executable).toBe(true)
    expect(project.filter((f) => f.executable === true).map((f) => f.path)).toEqual(['strut.js'])
  })

  it('without tests there is no vitest, no test script and no test files', () => {
    const project = renderProject(options({ testing: 'none' }))
    const manifest = JSON.parse(file(project, 'package.json'))
    expect(manifest.scripts.test).toBeUndefined()
    expect(manifest.devDependencies.vitest).toBeUndefined()
    expect(project.some((f) => f.path.startsWith('tests/'))).toBe(false)
  })

  it('uses the MVC layout with dot-suffix file names (decision #34)', () => {
    const paths = renderProject(options()).map((f) => f.path)
    for (const expected of [
      'app/http/controllers/health.controller.ts',
      'app/models/user.ts',
      'app/policies/user.policy.ts',
      'bootstrap/app.ts',
      'routes/web.ts',
      'routes/api.ts',
      'app/providers/app.provider.ts',
      'bootstrap/providers.ts',
      'config/app.ts',
      'config/index.ts',
      'config/logging.ts',
      'config/tenancy.ts',
      'database/migrations/0001_01_01_000000_create_users_table.ts',
      'database/seeders/database.seeder.ts',
      'database/seeders/admin.seeder.ts',
      'database/factories/user.factory.ts',
      'resources/ui/main.tsx',
      'tests/feature/health.test.ts',
    ]) {
      expect(paths).toContain(expected)
    }
    expect(
      paths.filter((p) => /(^|\/)[a-z]+-(policy|factory|seeder|controller)\.ts$/.test(p)),
    ).toEqual([])
  })

  it('.gitignore really ignores every secret path (checked with git itself)', () => {
    const folder = tempFolder()
    writeFileSync(join(folder, '.gitignore'), file(renderProject(options()), '.gitignore'))
    mkdirSync(join(folder, 'database'))
    expect(spawnSync('git', ['init', '-q'], { cwd: folder }).status).toBe(0)
    const result = spawnSync('git', ['check-ignore', ...MUST_BE_IGNORED, '.env.example'], {
      cwd: folder,
      encoding: 'utf8',
    })
    const ignored = result.stdout.split(/\r?\n/).filter(Boolean)
    expect(ignored).toEqual([...MUST_BE_IGNORED])
  })

  it('knows which staged paths must never be committed', () => {
    for (const path of [
      '.env',
      '.env.local',
      'database/database.sqlite-wal',
      'docker/compose.yaml',
      '.strutvane/local/setup.json',
      '.strutvane/local/packages/x/package.json',
      'storage/x',
      'storage/logs/strutvane.log',
    ]) {
      expect(isForbiddenInCommit(path), path).toBe(true)
    }
    for (const path of [
      '.env.example',
      'package-lock.json',
      'database/migrations/0001_x.ts',
      'strut.js',
      // The rest of .strutvane/ (generated types, resources, client) is committed (#10).
      '.strutvane/types/models.d.ts',
      // The skeleton keeps each storage folder with a .gitignore (no data), like Laravel.
      'storage/logs/.gitignore',
      'storage/framework/cache/.gitignore',
    ]) {
      expect(isForbiddenInCommit(path), path).toBe(false)
    }
  })
})

describe('Docker mode files (everything in containers, like Sail)', () => {
  const portLines = (compose: string) =>
    compose.split('\n').filter(
      (line, index, all) =>
        /^\s+- "/.test(line) &&
        /ports:/.test(
          all
            .slice(0, index)
            .reverse()
            .find((l) => /:\s*$/.test(l)) ?? '',
        ),
    )

  it('runs app, database and Mailpit; node_modules in a named volume; secrets only from .env', () => {
    const compose = file(renderProject(options()), 'docker/compose.yaml')
    expect(compose).toMatch(/^ {2}app:\n {4}image: node:24$/m)
    expect(compose).toMatch(/^ {2}db:\n {4}image: mysql:8\.4$/m)
    expect(compose).toMatch(/^ {2}mailpit:\n {4}image: axllent\/mailpit:v1\.33$/m)
    expect(compose).toMatch(/- node-modules:\/app\/node_modules/)
    expect(compose).toMatch(/- \.\.:\/app/)
    expect(compose).toMatch(/env_file: \.\.\/\.env/)
    expect(compose).toMatch(/user: "\$\{STRUT_UID:-1000\}:\$\{STRUT_GID:-1000\}"/)
    expect(compose).toMatch(/STRUTVANE_IN_CONTAINER: "1"/)
    expect(compose).toMatch(/CHOKIDAR_USEPOLLING: "1"/)
    expect(compose).toMatch(/condition: service_healthy/)
    expect(compose).not.toMatch(/build:|Dockerfile/) // nothing baked into an image
  })

  it('publishes every port on 127.0.0.1 only (app, database, Mailpit inbox; never SMTP)', () => {
    for (const database of ['mysql', 'postgres', 'sqlite'] as const) {
      const lines = portLines(
        file(renderProject(options({ database, docker: true })), 'docker/compose.yaml'),
      )
      expect(lines.length, database).toBe(database === 'sqlite' ? 2 : 3)
      for (const line of lines) expect(line.trim(), database).toMatch(/^- "127\.0\.0\.1:/)
      expect(lines.join('\n')).not.toMatch(/1025/)
    }
  })

  it('has no db service for SQLite in Docker mode', () => {
    const compose = file(
      renderProject(options({ database: 'sqlite', docker: true })),
      'docker/compose.yaml',
    )
    expect(compose).not.toMatch(/^ {2}db:/m)
    expect(compose).not.toMatch(/depends_on/)
  })

  it('points the app at service names; strutvane.json records Docker mode (#110)', () => {
    const project = renderProject(options())
    const env = parseEnv(file(project, '.env'))
    expect(env.get('DB_HOST')).toBe('db')
    expect(env.get('MAIL_HOST')).toBe('mailpit')
    expect(env.get('FORWARD_DB_PORT')).toBe('3306')
    expect(JSON.parse(file(project, 'strutvane.json')).answers.docker).toBe(true)
    const sqlite = renderProject(options({ database: 'sqlite' }))
    expect(JSON.parse(file(sqlite, 'strutvane.json')).answers.docker).toBe(false)
    // The per-machine override (.strutvane/local/) is optional and never generated; the rest of
    // .strutvane/ is the skeleton's committed, generated schema and types.
    expect(project.some((f) => f.path.startsWith('.strutvane/local/'))).toBe(false)
  })

  it('pins the database driver exactly; Strutvane packages use the framework range', () => {
    for (const [database, driver] of [
      ['mysql', 'mysql2'],
      ['postgres', 'pg'],
    ] as const) {
      const project = renderProject(options({ database }))
      const manifest = JSON.parse(file(project, 'package.json')) as {
        dependencies: Record<string, string>
      }
      expect(manifest.dependencies[driver]).toMatch(/^\d+\.\d+\.\d+$/) // exact, never a range
    }
    // SQLite needs no driver (node:sqlite): only the Strutvane packages the default answers bring.
    expect(
      JSON.parse(file(renderProject(options({ database: 'sqlite' })), 'package.json')).dependencies,
    ).toMatchObject({
      '@strutvane/framework': FRAMEWORK_RANGE,
      '@strutvane/auth': FRAMEWORK_RANGE,
      '@strutvane/design-crisp': FRAMEWORK_RANGE,
      '@strutvane/ui': FRAMEWORK_RANGE,
    })
    const sqliteDeps = Object.keys(
      JSON.parse(file(renderProject(options({ database: 'sqlite' })), 'package.json')).dependencies,
    )
    expect(sqliteDeps.filter((name) => ['mysql2', 'pg'].includes(name))).toEqual([])
    // The installer's driver pins and the skeleton's agree (a drift would install two versions).
    for (const database of ['mysql', 'postgres'] as const) {
      const deps = JSON.parse(file(renderProject(options({ database })), 'package.json'))
        .dependencies as Record<string, string>
      expect(deps[DRIVERS[database].name]).toBe(DRIVERS[database].version)
    }
  })

  it('writes a typed database password (own server) escaped into .env only', () => {
    const own = options({ docker: false, dbHost: 'db.example.com' })
    const project = renderProject(own, { dbPassword: "pa ss#'word" })
    expect(parseEnv(file(project, '.env')).get('DB_PASSWORD')).toBe("pa ss#'word")
    expect(parseEnv(file(project, '.env.example')).get('DB_PASSWORD')).toBe('')
    expect(parseEnv(file(project, '.env')).get('DB_HOST')).toBe('db.example.com')
    expect(() => renderProject(own, { dbPassword: 'x\nAPP_DEBUG=true' })).toThrow(/line break/)
  })
})
