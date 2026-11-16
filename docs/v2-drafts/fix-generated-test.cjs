const fs = require('node:fs')
const path = require('node:path')
const f = path.join(process.argv[2], 'test/generated-files.test.ts')
let t = fs.readFileSync(f, 'utf8')
const rep = (a, b) => {
  if (!t.includes(a)) throw new Error(`missing ${a.slice(0, 80)}`)
  t = t.replace(a, b)
}
rep(
  `      file(files({ teams: true, features: ['billing'] }), 'strutvane.json'),`,
  `      file(files({ teams: true, features: ['billing'], previewCatalogue: true }), 'strutvane.json'),`,
)
rep(
  `    expect(manifest).toMatchObject({
      version: 1,
      createdWith: 'create-strutvane 0.0.0-spike.13',
      framework: '0.1.0',
    })`,
  `    expect(manifest).toMatchObject({
      version: 1,
      createdWith: \`create-strutvane \${VERSION}\`,
      framework: FRAMEWORK_RANGE,
    })`,
)
rep(
  `      featureOptions: { 'billing.provider': 'stripe' },
      activityLog: true,`,
  `      featureOptions: { 'billing.provider': 'stripe', 'billing.stripe-tax': 'no' },
      activityLog: true,
      previewCatalogue: true,`,
)
rep(
  `    const project = files({ cache: 'redis', monitoring: 'otel' })
    const { packages } = JSON.parse(file(project, 'strutvane.json')) as { packages: string[] }
    const { dependencies } = JSON.parse(file(project, 'package.json')) as {
      dependencies: Record<string, string>
    }
    expect(Object.keys(dependencies).sort()).toEqual([...packages, 'mysql2'].sort())
    const lock = JSON.parse(file(project, 'package-lock.json')) as {
      packages: Record<string, unknown>
    }
    for (const name of packages)
      expect(lock.packages[\`node_modules/\${name}\`], name).toEqual({
        resolved: \`stubs/\${name.slice(1).replace('/', '-')}\`,
        link: true,
      })
  })`,
  `    const project = files({ cache: 'redis', monitoring: 'otel', previewCatalogue: true })
    const { packages } = JSON.parse(file(project, 'strutvane.json')) as { packages: string[] }
    const { dependencies } = JSON.parse(file(project, 'package.json')) as {
      dependencies: Record<string, string>
    }
    expect(Object.keys(dependencies).sort()).toEqual([...packages, 'mysql2'].sort())
    // Catalogue packages get a caret range on their newest listed version (preview).
    expect(dependencies['@strutvane/redis']).toMatch(/^\\^\\d+\\.\\d+\\.\\d+$/)
  })

  // The two-kernels fix (release/0.2 patches, B7): an app names the merged framework and the
  // packages its answers bring, never core, contracts, cli, devkit or logs.
  it('generated package.json files never name an absorbed package, for any answers', () => {
    fc.assert(
      fc.property(
        fc.record({
          stack: fc.constantFrom('full', 'api'),
          auth: fc.constantFrom('email', 'magic-link', 'none'),
          database: fc.constantFrom('mysql', 'postgres', 'sqlite'),
          testing: fc.constantFrom('vitest', 'none'),
          agents: fc.boolean(),
          previewCatalogue: fc.boolean(),
          features: fc.subarray(['log-viewer', 'billing', 'search', 'charts', 'tags']),
        }),
        (answers) => {
          const resolved = resolveOptions(
            { name: 'acme-portal', ...answers, ...(answers.previewCatalogue ? {} : { features: [] }) },
            '/code',
          )
          const text = file(renderProject(resolved), 'package.json')
          const manifest = JSON.parse(text) as Record<string, Record<string, string>>
          const named = [
            ...Object.keys(manifest['dependencies'] ?? {}),
            ...Object.keys(manifest['devDependencies'] ?? {}),
          ]
          for (const absorbed of ABSORBED_PACKAGES) expect(named).not.toContain(absorbed)
          expect(named).toContain('@strutvane/framework')
          expect(manifest['dependencies']?.['@strutvane/framework']).toBe('^0.1.0-next.1')
        },
      ),
      { numRuns: 200 },
    )
  })

  it('refuses to render an absorbed package even if one ever reached the list', () => {
    expect(() => dependencies({ ...options(), features: [] }, {})).not.toThrow()
    expect(ABSORBED_PACKAGES).toEqual([
      '@strutvane/core',
      '@strutvane/contracts',
      '@strutvane/cli',
      '@strutvane/devkit',
      '@strutvane/logs',
    ])
  })`,
)
rep(
  `      argv: ['acme', '--yes', '--db', 'sqlite', '--ai', '--ai-provider', 'openai'],`,
  `      argv: ['acme', '--yes', '--db', 'sqlite', '--ai', '--ai-provider', 'openai', '--preview-catalogue'],`,
)
rep(
  `  it('public registration is off by default', () => {
    expect(parseEnv(file(files(), '.env.example')).get('AUTH_REGISTRATION')).toBe('false')
    expect(
      parseEnv(file(files({ security: ['registration'] }), '.env')).get('AUTH_REGISTRATION'),
    ).toBe('true')
  })`,
  `  it('public registration is off by default; features live in config/auth.ts, not AUTH_* keys (#26)', () => {
    const features = (answers: Answers = {}) =>
      (JSON.parse(file(files(answers), 'config/auth.ts').replace(/^[\\s\\S]*?export default /, '')) as {
        features: Record<string, boolean>
      }).features
    expect(features().registration).toBe(false)
    expect(features({ security: ['registration'] }).registration).toBe(true)
    for (const answers of [{}, { auth: 'magic-link' as const }, { teams: true }]) {
      const project = files(answers)
      for (const envFile of ['.env', '.env.example']) {
        const keys = [...parseEnv(file(project, envFile)).keys()]
        expect(keys.filter((key) => key.startsWith('AUTH_')), envFile).toEqual([])
        expect(keys, envFile).not.toContain('TENANCY_ENABLED')
      }
    }
  })

  it('config/auth.ts uses the one feature list (#25) with the password switch (#107)', () => {
    const features = (answers: Answers = {}) =>
      (JSON.parse(file(files(answers), 'config/auth.ts').replace(/^[\\s\\S]*?export default /, '')) as {
        features: Record<string, boolean>
      }).features
    expect(Object.keys(features()).sort()).toEqual(
      [
        'password',
        'registration',
        'emailVerification',
        'passwordReset',
        'passwordConfirmation',
        'twoFactor',
        'passkeys',
        'emailLink',
        'apiTokens',
        'teams',
        'impersonation',
      ].sort(),
    )
    expect(features()).toMatchObject({
      password: true,
      emailLink: false,
      passwordReset: true,
      twoFactor: true,
      emailVerification: true,
      passkeys: false,
      apiTokens: true,
      teams: false,
    })
    // "Email link only" = password: false, emailLink: true.
    expect(features({ auth: 'magic-link' })).toMatchObject({ password: false, emailLink: true })
    expect(features({ teams: true }).teams).toBe(true)
    // "No sign-in" = auth is not installed: no config/auth.ts, no @strutvane/auth.
    const none = files({ auth: 'none' })
    expect(none.some((f) => f.path === 'config/auth.ts')).toBe(false)
    expect(file(none, 'package.json')).not.toContain('@strutvane/auth')
  })`,
)
rep(
  `    expect(copies.map((line) => line.split(' ').at(-1))).toEqual([
      './node_modules',
      './stubs',`,
  `    expect(copies.map((line) => line.split(' ').at(-1))).toEqual([
      './node_modules',`,
)
rep(
  `  it('a deploy target writes a recipe and the public /up route', () => {
    for (const deploy of ['node', 'docker'] as const) {
      const project = files({ deploy })
      expect(file(project, 'deploy/README.md')).toContain('/up')
      expect(file(project, 'routes/web.ts')).toContain("router.get('/up', () => 'up')")
    }
    expect(file(files(), 'routes/web.ts')).not.toContain('/up')
  })`,
  `  it('/up always exists and answers JSON (#45); a deploy target writes a recipe that names it', () => {
    for (const deploy of ['later', 'node', 'docker'] as const) {
      expect(file(files({ deploy }), 'bootstrap/app.ts')).toContain("health: '/up'")
    }
    for (const deploy of ['node', 'docker'] as const) {
      expect(file(files({ deploy }), 'deploy/README.md')).toContain('\`{"status":"ok"}\`')
    }
    expect(file(files(), 'bootstrap/app.ts')).toMatch(/\\{"status":"ok"\\} to GET and HEAD/)
  })

  it('the production image logs JSON to stderr (#7) and never forwards strut commands', () => {
    const dockerfile = file(files({ deploy: 'docker' }), 'Dockerfile')
    expect(dockerfile).toMatch(/^ENV LOG_CHANNEL=stderr$/m)
    expect(dockerfile).toMatch(/^ENV LOG_FORMAT=json$/m)
    expect(dockerfile).toMatch(/^ENV STRUTVANE_IN_CONTAINER=1$/m)
    expect(dockerfile).not.toContain('stubs')
  })

  it('.dockerignore leaves out .strutvane/local/ but keeps the generated .strutvane/ files (#111)', () => {
    const ignore = file(files({ deploy: 'docker' }), '.dockerignore').split('\\n')
    expect(ignore).toContain('.strutvane/local/')
    expect(ignore).not.toContain('.strutvane/')
    for (const line of ['.env*', '.git', 'node_modules', 'storage/', 'tests/']) {
      expect(ignore).toContain(line)
    }
  })`,
)
rep(`    expect(file(project, 'config/tenancy.ts')).toContain('resolver: "subdomain"')`, `    expect(file(project, 'config/tenancy.ts')).toContain('"resolver": "subdomain"')`)
rep(
  `    const project = files({
      cache: 'redis',
      storage: 's3',`,
  `    const project = files({
      previewCatalogue: true,
      cache: 'redis',
      storage: 's3',`,
)
rep(
  `    expect(file(project, 'config/permissions.ts')).toContain('"manager"')`,
  `    expect(file(project, 'config/permissions.ts')).toContain(
      '"preset": "admin-manager-member-viewer"',
    )
    expect(file(project, 'config/permissions.ts')).toContain('"manager"')`,
)
rep(
  `    expect(file(project, 'config/auth.ts')).toMatch(/social: \\["github"\\],\\n\\s+enterpriseSso: true/)`,
  `    expect(file(project, 'config/auth.ts')).toMatch(
      /"social": \\[\\n\\s+"github"\\n\\s+\\],\\n\\s+"enterpriseSso": true/,
    )`,
)
rep(
  `  it('sample data writes its own seeder only when chosen', () => {
    expect(paths()).toContain('database/seeders/sample-data-seeder.ts')
    expect(paths({ sampleData: false })).not.toContain('database/seeders/sample-data-seeder.ts')
  })`,
  `  it('sample data writes its own seeder only when chosen, listed in database.seeder.ts (#104)', () => {
    expect(paths()).toContain('database/seeders/sample-data.seeder.ts')
    expect(paths({ sampleData: false })).not.toContain('database/seeders/sample-data.seeder.ts')
    const main = file(files(), 'database/seeders/database.seeder.ts')
    expect(main).toMatch(
      /\\/\\/ strut:seeders:start\\n\\s+await call\\(\\[AdminSeeder, SampleDataSeeder\\]\\)\\n\\s+\\/\\/ strut:seeders:end/,
    )
    expect(main).toContain("import AdminSeeder from './admin.seeder.ts'")
    expect(main).toContain('export default defineSeeder({')
    const none = file(files({ auth: 'none', stack: 'api' }), 'database/seeders/database.seeder.ts')
    expect(none).toMatch(/strut:seeders:start\\n\\s+await call\\(\\[\\]\\)/)
  })

  it('teams: config/tenancy.ts is { enabled, column } and off unless teams (#90)', () => {
    const config = (answers: Answers) =>
      JSON.parse(file(files(answers), 'config/tenancy.ts').replace(/^[\\s\\S]*?export default /, ''))
    expect(config({})).toEqual({ enabled: false, column: 'tenant_id' })
    expect(config({ teams: true })).toEqual({ enabled: true, column: 'tenant_id', resolver: 'switcher' })
  })

  it('the database config reads mysql|mariadb|pgsql|sqlite, SQLite at database/database.sqlite, the migrations table (#14, #36, #96)', () => {
    const config = file(files(), 'config/database.ts')
    expect(config).toContain("process.env['DB_CONNECTION'] === 'postgres' ? 'pgsql'")
    expect(config).toContain("'database/database.sqlite'")
    expect(config).toContain("migrations: { table: 'migrations' }")
    expect(parseEnv(file(files({ database: 'postgres' }), '.env')).get('DB_CONNECTION')).toBe('pgsql')
    expect(parseEnv(file(files({ database: 'sqlite' }), '.env')).get('DB_DATABASE')).toBe(
      'database/database.sqlite',
    )
  })

  it('the factory, model and policy follow the framework shapes (#59, #73, #89)', () => {
    const project = files()
    expect(file(project, 'app/models/user.ts')).toContain("export class User extends Model('users', {")
    expect(file(project, 'database/factories/user.factory.ts')).toContain(
      'export default defineFactory(User, ({ faker, sequence }) => ({',
    )
    expect(file(project, 'app/policies/user.policy.ts')).toContain('export default class UserPolicy')
  })

  it('generated tests use Vitest, never node:test (#76)', () => {
    const test = file(files(), 'tests/feature/health.test.ts')
    expect(test).toContain("from 'vitest'")
    expect(test).not.toContain('node:test')
    expect(paths({ testing: 'none' }).some((p) => p.startsWith('tests/'))).toBe(false)
  })

  it('the API is served under /api, never /api/v1 (#33)', () => {
    const project = files()
    for (const f of project) {
      if (f.path.startsWith('app/') || f.path.startsWith('routes/') || f.path === 'AGENTS.md') {
        expect(f.content, f.path).not.toMatch(/\\/api\\/v1\\b(?! is opt-in)/)
      }
    }
    expect(file(project, 'AGENTS.md')).toContain('served under /api)')
    expect(file(project, 'config/api.ts')).toContain('"prefix": "/api"')
  })`,
)
const lastImport = t.lastIndexOf('\nimport ')
const end = t.indexOf('\n', t.indexOf(' from ', lastImport))
t = `${t.slice(0, end + 1)}import fc from 'fast-check'
import { dependencies } from '../src/templates/project.ts'
import { ABSORBED_PACKAGES, FRAMEWORK_RANGE, VERSION } from '../src/version.ts'
${t.slice(end + 1)}`
fs.writeFileSync(f, t)
