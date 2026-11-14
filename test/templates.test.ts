/**
 * Template-level behaviour: the documented layout per preset (docs/05 §3.1), the env spec, the
 * Zod mapping, package.json contents, and the small helpers.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { allEnvVars, buildEnvSpec, sqlIdentifier } from '../src/env-spec.ts'
import {
  AUTH_SESSION_DRIVER_DEFAULT,
  persistentIdentity,
  type RawProjectInput,
} from '../src/options.ts'
import { ciInstallCommand, installCommand, runScript, svCommand } from '../src/package-manager.ts'
import { renderProject, renderTree } from '../src/render.ts'
import { providerSpecifiers, strutvaneConfigFile } from '../src/templates/app.ts'
import { IMAGES } from '../src/templates/docker.ts'
import { envTable } from '../src/templates/docs.ts'
import { envSchemaFile, zodFor } from '../src/templates/env.ts'
import { dependencies, devDependencies, gitignore, scripts } from '../src/templates/root.ts'
import { json, LINE_WIDTH, lines, quote, sortKeys } from '../src/templates/util.ts'
import { STRUTVANE_VERSION, VERSIONS } from '../src/versions.ts'
import { optionsFor, PKG_ROOT } from './helpers.ts'

const at = (input: RawProjectInput) => optionsFor(input, resolve('/work'))
const pathsOf = (input: RawProjectInput) => renderProject(at(input)).files.map((f) => f.path)
const contentOf = (input: RawProjectInput, path: string) =>
  renderProject(at(input)).files.find((f) => f.path === path)?.content ?? ''

describe('layout (docs/05 §3.1)', () => {
  test('full: app, config, database, web, tests, docker, state folder, root files', () => {
    const paths = pathsOf({ name: 'acme' })
    for (const p of [
      'app/http/routes/api.ts',
      'app/providers/app.provider.ts',
      'app/models/README.md',
      'app/policies/README.md',
      'app/jobs/README.md',
      'config/app.ts',
      'config/database.ts',
      'config/auth.ts',
      'config/ui.ts',
      'env.ts',
      'env.schema.ts',
      'database/migrations/README.md',
      'database/seeders/database.seeder.ts',
      'database/factories/README.md',
      'web/app.tsx',
      'web/router.tsx',
      'web/theme/tokens.css',
      'web/pages/README.md',
      'web/components/ui/README.md',
      'tests/unit/env.test.ts',
      'tests/feature/README.md',
      'tests/e2e/smoke.spec.ts',
      'storage/logs/.gitkeep',
      'storage/app/.gitkeep',
      '.strutvane/README.md',
      'docker/compose.yaml',
      'strutvane.config.ts',
      'package.json',
      'tsconfig.json',
      'biome.json',
      'vitest.config.ts',
      'playwright.config.ts',
      'vite.config.ts',
      '.gitignore',
      '.gitattributes',
      '.editorconfig',
      'README.md',
      'CLAUDE.md',
      '.github/workflows/ci.yml',
    ]) {
      expect(paths, p).toContain(p)
    }
  })

  test('api: no web/, no Playwright, no Vite', () => {
    const paths = pathsOf({ name: 'acme', preset: 'api' })
    expect(paths.some((p) => p.startsWith('web/'))).toBe(false)
    expect(paths).not.toContain('playwright.config.ts')
    expect(paths).not.toContain('vite.config.ts')
    expect(paths).not.toContain('tests/e2e/smoke.spec.ts')
    expect(paths).toContain('app/http/routes/api.ts')
  })

  test('ui: no app/, database/, config/database.ts or storage; adds config/api-client.ts', () => {
    const paths = pathsOf({ name: 'portal', preset: 'ui' })
    expect(
      paths.some(
        (p) => p.startsWith('app/') || p.startsWith('database/') || p.startsWith('storage/'),
      ),
    ).toBe(false)
    expect(paths).not.toContain('config/database.ts')
    expect(paths).toContain('config/api-client.ts')
    // @strutvane/ui reads the Strutvane manifest only; there is no OpenAPI resource file to tune.
    expect(paths).not.toContain('web/ui.resources.ts')
    expect(paths).not.toContain('docker/compose.yaml')
  })

  test('config files follow the choices', () => {
    const all = pathsOf({
      name: 'a',
      tenancy: true,
      extras: ['queue', 'cache', 'mail', 'otel', 'logs', 'audit'],
    })
    for (const p of [
      'config/tenancy.ts',
      'config/queue.ts',
      'config/cache.ts',
      'config/mail.ts',
      'config/observability.ts',
    ]) {
      expect(all).toContain(p)
    }
    const minimal = pathsOf({ name: 'a', preset: 'api', auth: [], extras: [], database: 'sqlite' })
    for (const p of [
      'config/auth.ts',
      'config/tenancy.ts',
      'config/queue.ts',
      'docker/compose.yaml',
      'app/models/user.model.ts',
    ]) {
      expect(minimal).not.toContain(p)
    }
    expect(minimal).toContain('app/models/README.md')
  })

  test('paths are unique, sorted and POSIX', () => {
    const paths = pathsOf({ name: 'acme' })
    expect(new Set(paths).size).toBe(paths.length)
    expect([...paths].sort()).toEqual(paths)
    expect(paths.every((p) => !p.includes('\\') && !p.startsWith('/'))).toBe(true)
  })

  test('no generated TypeScript line is longer than the configured width', () => {
    for (const f of renderProject(
      at({ name: 'a-very-long-project-name-for-width-checks', packageManager: 'npm' }),
    ).files) {
      if (!/\.(ts|tsx|json)$/.test(f.path)) continue
      for (const line of f.content.split('\n')) {
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) continue
        expect(line.length, `${f.path}: ${line}`).toBeLessThanOrEqual(LINE_WIDTH)
      }
    }
  })
})

describe('strutvane.config.ts', () => {
  test('providers in boot order, imports sorted like Biome', () => {
    const o = at({ name: 'acme', auth: ['email'], extras: ['logs'] })
    expect(providerSpecifiers(o)).toEqual([
      '@strutvane/framework/provider',
      '@strutvane/logs/provider',
      '@strutvane/auth/provider',
      './app/providers/app.provider.ts',
    ])
    const text = strutvaneConfigFile(o).content
    expect(text.indexOf('@strutvane/auth/provider')).toBeLessThan(text.indexOf('@strutvane/core'))
    expect(text).toContain(
      'providers: [frameworkProvider, logsProvider, authProvider, appProvider],',
    )
  })

  test('the ui preset has no providers', () => {
    expect(strutvaneConfigFile(at({ name: 'portal', preset: 'ui' })).content).toContain(
      'providers: [],',
    )
  })
})

describe('env spec', () => {
  test('keys depend on the choices', () => {
    const keys = (input: RawProjectInput) => allEnvVars(buildEnvSpec(at(input))).map((v) => v.key)
    expect(keys({ name: 'a' })).toContain('LOGS_VIEWER')
    expect(keys({ name: 'a', extras: [] })).not.toContain('LOGS_VIEWER')
    expect(keys({ name: 'a', extras: ['otel'] })).toContain('OTEL_EXPORTER_OTLP_ENDPOINT')
    expect(keys({ name: 'a', auth: ['google', 'microsoft', 'github'] })).toEqual(
      expect.arrayContaining([
        'AUTH_GOOGLE_CLIENT_SECRET',
        'AUTH_MICROSOFT_TENANT_ID',
        'AUTH_GITHUB_CLIENT_ID',
      ]),
    )
    expect(keys({ name: 'a', extras: ['audit'] })).toContain('AUDIT_ENABLED')
    expect(keys({ name: 'a', tenancy: true })).toContain('TENANCY_RESOLVE')
    const ui = keys({ name: 'p', preset: 'ui' })
    expect(ui).toEqual([
      'APP_NAME',
      'APP_ENV',
      'APP_URL',
      'APP_PORT',
      'VITE_APP_NAME',
      'VITE_API_URL',
      'API_OPENAPI_URL',
    ])
  })

  test('database sections', () => {
    const db = (database: string) =>
      new Map(
        buildEnvSpec(at({ name: 'acme-co', database }))
          .find((s) => s.title === 'Database')
          ?.vars.map((v) => [v.key, v]),
      )
    expect(db('sqlite').get('DB_DATABASE')?.value).toBe('storage/database.sqlite')
    expect(db('mysql').get('DB_PORT')?.value).toBe('3306')
    expect(db('postgres').get('DB_DATABASE')?.value).toBe('acme_co')
    expect(db('postgres').get('DB_PASSWORD')?.secret).toBe(true)
    const azure = db('azure-postgres')
    expect(azure.get('DB_AUTH')?.value).toBe('entra')
    expect(azure.get('DB_PASSWORD')?.optional).toBe(true)
    expect(azure.get('DB_SSL')?.value).toBe('true')
    expect(db('azure-mysql').get('DB_HOST')?.value).toContain('.mysql.database.azure.com')
  })

  test('drivers default to Docker services when Docker is on, in-process otherwise', () => {
    const vars = (input: RawProjectInput) =>
      new Map(allEnvVars(buildEnvSpec(at(input))).map((v) => [v.key, v.value]))
    const docker = vars({ name: 'a', extras: ['queue', 'cache', 'mail'] })
    expect([
      docker.get('QUEUE_DRIVER'),
      docker.get('CACHE_DRIVER'),
      docker.get('MAIL_DRIVER'),
    ]).toEqual(['valkey', 'valkey', 'smtp'])
    const plain = vars({ name: 'a', extras: ['queue', 'cache', 'mail'], docker: 'off' })
    expect([
      plain.get('QUEUE_DRIVER'),
      plain.get('CACHE_DRIVER'),
      plain.get('MAIL_DRIVER'),
    ]).toEqual(['sync', 'memory', 'log'])
  })

  test('sqlIdentifier makes safe SQL names', () => {
    expect(sqlIdentifier('acme-portal')).toBe('acme_portal')
    expect(sqlIdentifier('my.app~2')).toBe('my_app_2')
    expect(sqlIdentifier('1password')).toBe('app_1password')
    expect(sqlIdentifier('--x--')).toBe('x')
  })
})

describe('zodFor / env.schema.ts', () => {
  const v = (kind: string, extra: object = {}) =>
    zodFor({ key: 'K', comment: 'c', kind: kind as never, ...extra })

  test.each([
    ['url', 'z.url()'],
    ['email', 'z.email()'],
    ['port', 'z.coerce.number().int().min(1).max(65535)'],
    ['integer', 'z.coerce.number().int().min(0)'],
    ['boolean', 'bool'],
    ['list', 'list'],
    ['string', 'z.string().min(1)'],
  ])('%s → %s', (kind, expr) => {
    expect(v(kind).expr).toBe(expr)
  })

  test('enum, size, rate, secret and optional', () => {
    expect(v('enum', { options: ['a', "b'c"] }).expr).toBe("z.enum(['a', 'b\\'c'])")
    expect(v('enum').expr).toBe('z.enum([])')
    expect(v('size').expr).toContain('30MB')
    expect(v('rate').expr).toContain('120/min')
    expect(v('secret').expr).toContain('.min(32')
    expect(v('url', { optional: true })).toEqual({
      expr: 'optional(z.url())',
      helpers: ['optional'],
    })
  })

  test('only used helpers are emitted; the production guard needs APP_DEBUG and APP_ENV', () => {
    const plain = envSchemaFile([
      { title: 'T', vars: [{ key: 'A', comment: 'c', kind: 'string', value: 'x' }] },
    ]).content
    expect(plain).not.toMatch(/const (optional|bool|list)/)
    expect(plain).not.toContain('superRefine')
    expect(plain).toContain('export const envSchema = z.object({')
    const full = contentOf({ name: 'a', tenancy: true }, 'env.schema.ts')
    expect(full).toMatch(/const optional[\s\S]*const bool[\s\S]*const list/)
    expect(full).toContain('.superRefine(')
  })
})

describe('package.json', () => {
  test('pins every Strutvane package to the current train and third parties exactly', () => {
    const deps = dependencies(at({ name: 'a', extras: ['queue', 'mail', 'otel', 'logs'] }))
    for (const name of [
      '@strutvane/core',
      '@strutvane/framework',
      '@strutvane/auth',
      '@strutvane/logs',
      '@strutvane/ui',
    ]) {
      expect(deps[name], name).toBe(STRUTVANE_VERSION)
    }
    for (const version of Object.values({ ...deps, ...devDependencies(at({ name: 'a' })) })) {
      expect(version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/)
    }
    expect(Object.keys(deps)).toEqual(Object.keys(deps).sort())
  })

  test.each([
    ['postgres', ['pg']],
    ['azure-postgres', ['pg', '@azure/identity', '@azure/postgresql-auth']],
    ['mysql', ['mysql2']],
    ['azure-mysql', ['mysql2', '@azure/identity']],
    ['sqlite', ['@libsql/client']],
  ])('%s installs its driver', (database, drivers) => {
    const deps = dependencies(at({ name: 'a', database }))
    for (const d of drivers) expect(deps[d], d).toBe(VERSIONS[d as keyof typeof VERSIONS])
  })

  test('scripts per preset', () => {
    expect(scripts(at({ name: 'a' }))).toMatchObject({
      dev: 'strutvane dev',
      // The project-local CLI, so `sv help` lists the project's commands (the launcher never
      // delegates help).
      sv: 'strutvane-cli',
      'test:e2e': 'playwright test',
    })
    expect(scripts(at({ name: 'a', preset: 'ui' }))).toMatchObject({
      dev: 'vite',
      build: 'vite build',
      start: 'vite preview',
    })
    const api = scripts(at({ name: 'a', preset: 'api', database: 'sqlite', extras: [] }))
    expect(api['test:e2e']).toBeUndefined()
    expect(api['services:up']).toBeUndefined()
    expect(api).toMatchObject({ typecheck: 'tsc --noEmit' })
  })

  // Drift check: the bin the sv script calls is the one @strutvane/cli publishes.
  const cliManifest = join(PKG_ROOT, '..', 'cli', 'packages', 'cli', 'package.json')
  test.skipIf(!existsSync(cliManifest))('sv calls the bin @strutvane/cli publishes', () => {
    const manifest = JSON.parse(readFileSync(cliManifest, 'utf8')) as {
      name: string
      bin: Record<string, string>
    }
    expect(manifest.name).toBe('@strutvane/cli')
    expect(Object.keys(manifest.bin)).toContain(scripts(at({ name: 'a' }))['sv'])
    expect(devDependencies(at({ name: 'a' }))).toHaveProperty('@strutvane/cli')
  })

  test('the README explains sv and the global launcher', () => {
    const readme = contentOf({ name: 'a' }, 'README.md')
    expect(readme).toContain('| `pnpm sv help` |')
    expect(readme).toContain('everything except `help`, which describes the launcher itself')
  })

  test('packageManager field only for pnpm', () => {
    expect(contentOf({ name: 'a' }, 'package.json')).toContain('"packageManager": "pnpm@')
    expect(contentOf({ name: 'a', packageManager: 'npm' }, 'package.json')).not.toContain(
      'packageManager',
    )
  })
})

describe('git and Docker files', () => {
  test('.gitignore ignores docker/ unless committing it', () => {
    expect(gitignore(at({ name: 'a' }))).toMatch(/^docker\/$/m)
    const commit = gitignore(at({ name: 'a', docker: 'commit' }))
    expect(commit).not.toMatch(/^docker\/$/m)
    expect(commit).toContain('--docker=commit')
  })

  test('compose binds every port to localhost and never contains a secret', () => {
    const yaml = contentOf(
      { name: 'a', database: 'mysql', extras: ['queue', 'mail'] },
      'docker/compose.yaml',
    )
    for (const port of yaml.match(/- "[^"]*:\d+"/g) ?? []) expect(port).toContain('127.0.0.1:')
    expect(yaml).toContain('$' + '{DB_PASSWORD:?set DB_PASSWORD in .env}')
    expect(yaml).toContain(IMAGES.mysql)
    expect(yaml).toMatch(/volumes:\n {2}mysql-data:\n {2}valkey-data:/)
  })

  test('commit mode says so in the compose header', () => {
    expect(contentOf({ name: 'a', docker: 'commit' }, 'docker/compose.yaml')).toContain(
      'Committed on purpose',
    )
  })
})

describe('docs and CI', () => {
  test('README commands match the package manager', () => {
    expect(contentOf({ name: 'a', packageManager: 'npm' }, 'README.md')).toContain(
      'npm run sv -- make:model Invoice',
    )
    expect(contentOf({ name: 'a', packageManager: 'bun' }, 'README.md')).toContain('bun run dev')
    expect(contentOf({ name: 'p', preset: 'ui' }, 'README.md')).toContain('http://localhost:5173')
  })

  test('envTable shows defaults and hides secrets', () => {
    const table = envTable(buildEnvSpec(at({ name: 'a', auth: ['google'] }))).join('\n')
    expect(table).toContain('| `APP_KEY` | _generated_ |')
    expect(table).toContain('| `AUTH_GOOGLE_CLIENT_ID` | _empty_ |')
    expect(table).toContain('| `APP_PORT` | `3000` |')
    expect(table).toContain('(trace \\| debug')
  })

  test('CI installs with a frozen lockfile and pins actions to SHAs', () => {
    for (const [pm, setup] of [
      ['pnpm', 'pnpm/action-setup@'],
      ['bun', 'oven-sh/setup-bun@'],
      ['yarn', 'corepack enable'],
      ['npm', 'cache: npm'],
    ] as const) {
      const ci = contentOf({ name: 'a', packageManager: pm }, '.github/workflows/ci.yml')
      expect(ci).toContain(setup)
      expect(ci).toContain(ciInstallCommand(pm))
      for (const use of ci.match(/uses: \S+/g) ?? []) expect(use).toMatch(/@[0-9a-f]{40}$/)
    }
  })

  test('CLAUDE.md summarises the choices', () => {
    const text = contentOf({ name: 'a', tenancy: true, docker: 'local' }, 'CLAUDE.md')
    expect(text).toContain('Preset: `full`, database: `postgres`, auth: `email`, multi-tenant.')
    expect(text).toContain('`docker/` is local-only')
    expect(contentOf({ name: 'p', preset: 'ui' }, 'CLAUDE.md')).toContain('Preset: `ui`.')
  })
})

describe('pnpm-workspace.yaml (pnpm 12 settings)', () => {
  test('pnpm projects approve exactly esbuild and exempt only Strutvane from the release age', () => {
    for (const preset of ['full', 'api', 'ui'] as const) {
      const yaml = contentOf({ name: 'a', preset, packageManager: 'pnpm' }, 'pnpm-workspace.yaml')
      // The settings, verified against pnpm 12.18.0 (ERR_PNPM_IGNORED_BUILDS without allowBuilds).
      expect(yaml).toContain('allowBuilds:\n  esbuild: true\n')
      expect(yaml).toContain('minimumReleaseAgeExclude:\n  - "@strutvane/*"\n  - strutvane\n')
      // Nothing else is approved or exempted, and it is not a monorepo.
      const keys = yaml.split('\n').filter((l) => /^[A-Za-z]/.test(l))
      expect(keys).toEqual(['allowBuilds:', 'minimumReleaseAgeExclude:'])
      expect(yaml.match(/^ {2}\S/gm)).toHaveLength(3)
      expect(yaml).not.toMatch(/^packages:/m)
      // Every setting explains why.
      expect(yaml).toContain('ADR-0018')
      expect(yaml).toContain('build step')
      expect(yaml.endsWith('\n')).toBe(true)
    }
  })

  test.each(['npm', 'yarn', 'bun'] as const)('%s projects get no pnpm-workspace.yaml', (pm) => {
    expect(pathsOf({ name: 'a', packageManager: pm })).not.toContain('pnpm-workspace.yaml')
  })

  test('the README lists the file and the Corepack fallback for pnpm only', () => {
    const readme = contentOf({ name: 'a' }, 'README.md')
    expect(readme).toContain('- `pnpm-workspace.yaml`: pnpm settings')
    expect(readme).toContain(
      `\`pnpm\` not installed? Run the same commands through Corepack: \`corepack pnpm@${VERSIONS.pnpm} <command>\`.`,
    )
    const npm = contentOf({ name: 'a', packageManager: 'npm' }, 'README.md')
    expect(npm).not.toContain('pnpm-workspace.yaml')
    expect(npm).not.toContain('corepack')
  })
})

describe('package-manager commands', () => {
  test.each([
    ['pnpm', 'pnpm dev', 'pnpm sv migrate', 'pnpm install', 'pnpm install --frozen-lockfile'],
    ['npm', 'npm run dev', 'npm run sv -- migrate', 'npm install', 'npm ci'],
    ['yarn', 'yarn dev', 'yarn sv migrate', 'yarn install', 'yarn install --frozen-lockfile'],
    ['bun', 'bun run dev', 'bun run sv migrate', 'bun install', 'bun install --frozen-lockfile'],
  ] as const)('%s', (pm, dev, sv, install, ci) => {
    expect(runScript(pm, 'dev')).toBe(dev)
    expect(svCommand(pm, 'migrate')).toBe(sv)
    expect(installCommand(pm)).toBe(install)
    expect(ciInstallCommand(pm)).toBe(ci)
  })
})

describe('util', () => {
  test('lines skips false/undefined/null and ends with one newline', () => {
    expect(lines('a', false, undefined, null, 'b', '', '')).toBe('a\nb\n')
    expect(lines()).toBe('\n')
  })

  test('json formats like Biome', () => {
    expect(json({})).toBe('{}\n')
    expect(json({ a: [], b: ['x', 'y'], c: { d: 1 } })).toBe(
      '{\n  "a": [],\n  "b": ["x", "y"],\n  "c": {\n    "d": 1\n  }\n}\n',
    )
    const long = Array.from({ length: 20 }, (_, i) => `item-${i}`)
    expect(json({ long })).toContain('"long": [\n    "item-0",\n')
    expect(json([{ a: 1 }])).toBe('[\n  {\n    "a": 1\n  }\n]\n')
    expect(json(null)).toBe('null\n')
  })

  test('quote escapes quotes, backslashes and control characters', () => {
    expect(quote("it's")).toBe("'it\\'s'")
    expect(quote('a"b')).toBe(`'a"b'`)
    expect(quote('back\\slash\n')).toBe("'back\\\\slash\\n'")
  })

  test('sortKeys', () => {
    expect(Object.keys(sortKeys({ b: '1', a: '2', c: '3' }))).toEqual(['a', 'b', 'c'])
  })

  test('renderTree lists folders first', () => {
    expect(renderTree('acme', ['b.txt', 'a/x.ts', 'a/b/y.ts', 'c/z.ts'])).toBe(
      [
        'acme/',
        '├─ a/',
        '│  ├─ b/',
        '│  │  └─ y.ts',
        '│  └─ x.ts',
        '├─ c/',
        '│  └─ z.ts',
        '└─ b.txt',
      ].join('\n'),
    )
  })
})

describe('database seeder and factories', () => {
  // `sv make:model` (@strutvane/cli) edits this file by these anchors: keep it byte-for-byte.
  const canonical = (command: string, auth: boolean) =>
    [
      '/**',
      ` * Seeds the database (\`${command}\`). \`sv make:model\` registers each new model's seeder here,`,
      ' * after the seeders of the models it belongs to.',
      ...(auth
        ? [' * The first admin user comes from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env.']
        : []),
      ' */',
      "import { defineSeeder } from '@strutvane/framework/database'",
      '',
      "export default defineSeeder('DatabaseSeeder', async () => {",
      '  // `sv make:model` adds `await call(…)` lines here, parents before children.',
      '})',
      '',
    ].join('\n')
  const seeder = (input: RawProjectInput) => contentOf(input, 'database/seeders/database.seeder.ts')

  test('database.seeder.ts is the canonical string-form seeder', () => {
    expect(seeder({ name: 'a' })).toBe(canonical('pnpm sv db:seed', true))
    expect(seeder({ name: 'a', preset: 'api', auth: [], packageManager: 'npm' })).toBe(
      canonical('npm run sv -- db:seed', false),
    )
  })

  test('no seeder API shape or helper that is not in scope', () => {
    const text = seeder({ name: 'a' })
    expect(text).not.toContain('defineSeeder({')
    expect(text).not.toMatch(/^\s*await call\(/m)
    expect(pathsOf({ name: 'p', preset: 'ui' })).not.toContain(
      'database/seeders/database.seeder.ts',
    )
  })

  test('the factories README shows the real factory API and seeder order', () => {
    const readme = contentOf({ name: 'a' }, 'database/factories/README.md')
    expect(readme).toContain('export default defineFactory(Invoice, ({ fake, related }) => ({')
    expect(readme).toContain("import { defineFactory } from '@strutvane/framework/testing'")
    expect(readme).toContain(
      "`related('Customer')` reuses an existing Customer when there is one and creates one otherwise.",
    )
    expect(readme).toContain('`await create(InvoiceFactory, 20)`')
    expect(readme).toContain('parents before children')
    // The old, non-existent API is gone.
    expect(readme).not.toContain('factory(Invoice).count(')
  })
})

describe('persistent identity (auth on PostgreSQL)', () => {
  test('postgres and azure-postgres apps with auth depend on better-auth; others do not', () => {
    for (const database of ['postgres', 'azure-postgres'] as const) {
      expect(dependencies(at({ name: 'a', database }))['better-auth']).toBe(VERSIONS['better-auth'])
    }
    expect(dependencies(at({ name: 'a', auth: [] }))['better-auth']).toBeUndefined()
    for (const database of ['mysql', 'azure-mysql', 'sqlite'] as const) {
      expect(dependencies(at({ name: 'a', database }))['better-auth']).toBeUndefined()
    }
    expect(dependencies(at({ name: 'p', preset: 'ui' }))['better-auth']).toBeUndefined()
  })

  const authManifest = join(PKG_ROOT, '..', 'auth', 'package.json')
  test.skipIf(!existsSync(authManifest))(
    "better-auth is pinned to exactly @strutvane/auth's peer version",
    () => {
      const pkg = JSON.parse(readFileSync(authManifest, 'utf8')) as {
        peerDependencies?: Record<string, string>
      }
      expect(pkg.peerDependencies?.['better-auth']).toBe(VERSIONS['better-auth'])
    },
  )
})

describe('web app shell (@strutvane/ui StrutvaneApp)', () => {
  const app = (input: RawProjectInput) => contentOf(input, 'web/app.tsx')

  test('full preset with auth: the shell with the env API URL, app name and routes', () => {
    const text = app({ name: 'a' })
    expect(text).toContain("import { StrutvaneApp } from '@strutvane/ui/react'")
    expect(text).toContain("import { routes } from './router.tsx'")
    expect(text).toContain(
      [
        '    <StrutvaneApp',
        '      apiUrl={import.meta.env.VITE_API_URL}',
        '      appName={import.meta.env.VITE_APP_NAME}',
        '      routes={routes}',
        '    />',
      ].join('\n'),
    )
    expect(text).not.toContain('auth={false}')
    expect(text).not.toContain('credentials=')
  })

  test('full preset without auth turns the session endpoints off', () => {
    const text = app({ name: 'a', auth: [] })
    expect(text).toContain('      auth={false}\n')
    expect(text).not.toContain('credentials=')
  })

  test('ui preset talks to another origin with cookies and keeps sign-in on', () => {
    const text = app({ name: 'p', preset: 'ui' })
    expect(text).toContain('      credentials="include"\n')
    expect(text).not.toContain('auth={false}')
  })

  test('router.tsx exports RouteDefinition[]; the env has both VITE_ keys the shell reads', () => {
    expect(contentOf({ name: 'a' }, 'web/router.tsx')).toContain(
      "import type { RouteDefinition } from '@strutvane/ui/react'\n\nexport const routes: RouteDefinition[] = []\n",
    )
    for (const input of [{ name: 'a' }, { name: 'p', preset: 'ui' as const }]) {
      const keys = allEnvVars(buildEnvSpec(at(input))).map((v) => v.key)
      expect(keys).toEqual(expect.arrayContaining(['VITE_API_URL', 'VITE_APP_NAME']))
    }
  })

  test('the theme uses the variables the shell styles with, and outranks its defaults', () => {
    const css = contentOf({ name: 'a' }, 'web/theme/tokens.css')
    expect(css).toContain('html:root {')
    expect(css).toContain('--sv-radius:')
    expect(css).not.toContain('--sv-color-')
    expect(css).not.toContain('.sv-shell')
  })

  test('web READMEs name only commands and props that exist', () => {
    const all = ['pages', 'components/ui', 'layouts', 'dashboard']
      .map((d) => contentOf({ name: 'a' }, `web/${d}/README.md`))
      .join('\n')
    expect(all).not.toMatch(/eject|ui:add/)
    expect(all).toContain('web/router.tsx')
    expect(all).toContain('overrides')
    expect(all).toContain('home={<Dashboard />}')
  })
})

describe('no User model (accounts belong to @strutvane/auth)', () => {
  test('no app/models/user.model.ts in any preset; the models README explains the actor link', () => {
    for (const input of [
      { name: 'a' },
      { name: 'a', tenancy: true },
      { name: 'a', preset: 'api' as const },
    ]) {
      expect(pathsOf(input)).not.toContain('app/models/user.model.ts')
    }
    const readme = contentOf({ name: 'a' }, 'app/models/README.md')
    expect(readme).toContain('`actor.id`')
    expect(readme).toContain('pnpm sv make:model Profile userId:string:unique jobTitle:string')
    expect(contentOf({ name: 'a', auth: [] }, 'app/models/README.md')).not.toContain('actor')
  })
})

describe('persistent identity on PostgreSQL', () => {
  test('persistentIdentity: auth + postgres family + the database session driver', () => {
    expect(persistentIdentity(at({ name: 'a' }))).toBe(true)
    expect(persistentIdentity(at({ name: 'a', database: 'azure-postgres' }))).toBe(true)
    expect(AUTH_SESSION_DRIVER_DEFAULT).toBe('database')
    expect(persistentIdentity(at({ name: 'a', auth: [] }))).toBe(false)
    for (const database of ['mysql', 'azure-mysql', 'sqlite'] as const) {
      expect(persistentIdentity(at({ name: 'a', database }))).toBe(false)
    }
    expect(persistentIdentity(at({ name: 'p', preset: 'ui' }))).toBe(false)
  })

  test('sv migrate creates the auth tables: no separate step anywhere in the docs', () => {
    const readme = contentOf({ name: 'a', packageManager: 'npm' }, 'README.md')
    expect(readme).toContain('npm run sv -- migrate')
    expect(contentOf({ name: 'a' }, 'database/migrations/README.md')).toContain(
      'ship with @strutvane/auth: `pnpm sv migrate` applies them',
    )
    for (const input of [
      { name: 'a' },
      { name: 'a', packageManager: 'npm' as const },
      { name: 'a', database: 'sqlite' as const },
      { name: 'a', auth: [] },
    ]) {
      expect(contentOf(input, 'README.md')).not.toContain('auth:migration')
      expect(contentOf(input, 'database/migrations/README.md')).not.toContain('auth:migration')
    }
  })
})

describe('integration regressions (local e2e journey)', () => {
  test('the project-local CLI is a dev dependency, so the `strutvane` launcher never falls back to npx', () => {
    expect(devDependencies(at({ name: 'a' }))['@strutvane/cli']).toBe(STRUTVANE_VERSION)
  })

  test('the starter route is explicitly public (custom routes require sign-in by default)', () => {
    expect(contentOf({ name: 'a' }, 'app/http/routes/api.ts')).toContain('public: true,')
  })
})
