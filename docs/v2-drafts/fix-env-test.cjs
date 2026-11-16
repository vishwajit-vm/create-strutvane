const fs = require('node:fs')
const path = require('node:path')
const f = path.join(process.argv[2], 'test/env-and-templates.test.ts')
let t = fs.readFileSync(f, 'utf8')
const rep = (a, b) => {
  if (!t.includes(a)) throw new Error(`missing ${a.slice(0, 80)}`)
  t = t.replace(a, b)
}
const between = (start, end, replacement) => {
  const s = t.indexOf(start)
  const e = t.indexOf(end, s)
  if (s < 0 || e < 0) throw new Error(`missing block ${start.slice(0, 60)}`)
  t = t.slice(0, s) + replacement + t.slice(e)
}
between(
  `  it('ships the scripts, strut.js, AGENTS.md, a lockfile and ignore-scripts', () => {`,
  `  it('.gitignore really ignores every secret path (checked with git itself)', () => {`,
  `  it('ships the scripts, strut.js, AGENTS.md, engines and the npm guards (L5)', () => {
    const project = renderProject(options())
    const manifest: unknown = JSON.parse(file(project, 'package.json'))
    expect(manifest).toMatchObject({
      engines: { node: '>=24.3' },
      devEngines: { packageManager: { name: 'npm', version: '>=11.19.0', onFail: 'error' } },
      scripts: {
        dev: 'node strut dev',
        build: 'node strut build',
        start: 'node build/server.js',
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
      expect(npmrc.split('\\n')).toContain(guard)
    }
    // No shipped lockfile: the first install writes it (with the guards above) and git commits it.
    expect(project.some((f) => f.path === 'package-lock.json')).toBe(false)
    expect(file(project, 'strut.js')).toMatch(/node strut <command>/)
    expect(file(project, 'AGENTS.md')).toMatch(/node strut list/)
    expect(file(project, 'README.md')).toMatch(
      /npm run dev[\\s\\S]*node strut list[\\s\\S]*npm run setup/,
    )
  })

  it('without tests there is no vitest and no test script', () => {
    const manifest = JSON.parse(file(renderProject(options({ testing: 'none' })), 'package.json'))
    expect(manifest.scripts.test).toBeUndefined()
    expect(manifest.devDependencies).toEqual({})
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
      'config/app.ts',
      'config/cors.ts',
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
    expect(paths.filter((p) => /(^|\\/)[a-z]+-(policy|factory|seeder|controller)\\.ts$/.test(p))).toEqual([])
  })

`,
)
rep(`      '.strutvane/setup.json',
      'storage/x',`, `      '.strutvane/local/setup.json',
      '.strutvane/local/packages/x/package.json',
      'storage/x',`)
rep(`      'database/migrations/0001_x.ts',
      'strut.js',
    ]) {`, `      'database/migrations/0001_x.ts',
      'strut.js',
      // The rest of .strutvane/ (generated types, resources, client) is committed (#10).
      '.strutvane/types/models.d.ts',
    ]) {`)
between(
  `  it('points the app at service names, and tells strut.js to forward', () => {`,
  `  it('writes a typed database password (own server) escaped into .env only', () => {`,
  `  it('points the app at service names; strutvane.json records Docker mode (#110)', () => {
    const project = renderProject(options())
    const env = parseEnv(file(project, '.env'))
    expect(env.get('DB_HOST')).toBe('db')
    expect(env.get('MAIL_HOST')).toBe('mailpit')
    expect(env.get('FORWARD_DB_PORT')).toBe('3306')
    expect(JSON.parse(file(project, 'strutvane.json')).answers.docker).toBe(true)
    const sqlite = renderProject(options({ database: 'sqlite' }))
    expect(JSON.parse(file(sqlite, 'strutvane.json')).answers.docker).toBe(false)
    // The per-machine override is optional and never generated.
    expect(project.some((f) => f.path.startsWith('.strutvane/'))).toBe(false)
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
      expect(manifest.dependencies[driver]).toMatch(/^\\d+\\.\\d+\\.\\d+$/) // exact, never a range
    }
    // SQLite needs no driver (node:sqlite): only the Strutvane packages the default answers bring.
    expect(
      JSON.parse(file(renderProject(options({ database: 'sqlite' })), 'package.json')).dependencies,
    ).toEqual({
      '@strutvane/framework': FRAMEWORK_RANGE,
      '@strutvane/auth': FRAMEWORK_RANGE,
      '@strutvane/design-crisp': FRAMEWORK_RANGE,
      '@strutvane/ui': FRAMEWORK_RANGE,
    })
  })

`,
)
const lastImport = t.lastIndexOf('\nimport ')
const end = t.indexOf('\n', t.indexOf(' from ', lastImport))
t = `${t.slice(0, end + 1)}import { FRAMEWORK_RANGE, VITEST } from '../src/version.ts'\n${t.slice(end + 1)}`
fs.writeFileSync(f, t)
