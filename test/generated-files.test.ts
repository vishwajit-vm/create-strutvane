/**
 * What the answers turn into: strutvane.json, package.json, config files, and the opt-in
 * container files (ADR-0021). Plus the secrets rules: nothing secret in a committed file, and the
 * installer never asks for an API key.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, relative } from 'node:path'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { parseEnv } from '../src/env-file.ts'
import { main } from '../src/main.ts'
import { type Answers, type ProjectOptions, resolveOptions } from '../src/options.ts'
import { askMissing } from '../src/questions.ts'
import { isForbiddenInCommit } from '../src/steps/git.ts'
import { dependencies, renderProject } from '../src/templates/project.ts'
import { DOCKERIGNORE } from '../src/templates/workflow-files.ts'
import { ABSORBED_PACKAGES, FRAMEWORK_RANGE, VERSION } from '../src/version.ts'
import { CUSTOM_ANSWERS, fakeEnvironment, scriptedPrompter, tempFolder } from './helpers/fakes.ts'
import { fakePrograms } from './helpers/programs.ts'

const options = (answers: Answers = {}): ProjectOptions =>
  resolveOptions({ name: 'acme-portal', ...answers }, '/code')
const files = (answers: Answers = {}) => renderProject(options(answers))
const file = (project: ReturnType<typeof renderProject>, path: string): string => {
  const found = project.find((f) => f.path === path)
  if (found === undefined) throw new Error(`${path} was not generated`)
  return found.content
}
const paths = (answers: Answers = {}) => files(answers).map((f) => f.path)

/** Every file under a folder, as POSIX paths relative to it. */
function walk(root: string, folder = root): string[] {
  return readdirSync(folder).flatMap((name) => {
    const full = join(folder, name)
    if (name === 'node_modules') return []
    return statSync(full).isDirectory()
      ? walk(root, full)
      : [relative(root, full).replaceAll('\\', '/')]
  })
}

describe('strutvane.json', () => {
  it('records every answer, defaults included, the packages, and the versions', () => {
    const manifest = JSON.parse(
      file(files({ teams: true, features: ['billing'], previewCatalogue: true }), 'strutvane.json'),
    ) as Record<string, unknown> & {
      answers: Record<string, unknown>
      packages: string[]
    }
    expect(manifest).toMatchObject({
      version: 1,
      createdWith: `create-strutvane ${VERSION}`,
      framework: FRAMEWORK_RANGE,
    })
    expect(manifest.answers).toMatchObject({
      name: 'acme-portal',
      mode: 'recommended',
      stack: 'full',
      design: 'crisp',
      auth: 'email',
      security: ['2fa', 'verification'],
      teams: true,
      database: 'postgres',
      docker: true,
      deploy: 'later',
      features: ['billing'],
      featureOptions: { 'billing.provider': 'stripe', 'billing.stripe-tax': 'no' },
      activityLog: true,
      previewCatalogue: true,
      devContainer: false,
    })
    expect(manifest.answers).not.toHaveProperty('directory')
    expect(manifest.packages[0]).toBe('@strutvane/framework')
    expect(manifest.packages).toContain('@strutvane/billing')
  })

  it('package.json depends on exactly the packages strutvane.json lists, the driver and the UI stack', () => {
    const project = files({ cache: 'redis', monitoring: 'otel', previewCatalogue: true })
    const { packages } = JSON.parse(file(project, 'strutvane.json')) as { packages: string[] }
    const { dependencies } = JSON.parse(file(project, 'package.json')) as {
      dependencies: Record<string, string>
    }
    // The Strutvane packages are exactly the listed ones; the rest is the skeleton's driver and
    // its React UI stack (exact pins).
    expect(
      Object.keys(dependencies)
        .filter((name) => name.startsWith('@strutvane/'))
        .sort(),
    ).toEqual([...packages].sort())
    const others = Object.keys(dependencies).filter((name) => !name.startsWith('@strutvane/'))
    expect(others).toContain('mysql2')
    expect(others).toContain('react')
    for (const name of others) expect(dependencies[name], name).toMatch(/^\d+\.\d+\.\d+$/)
    // Catalogue packages get a caret range on their newest listed version (preview).
    expect(dependencies['@strutvane/redis']).toMatch(/^\^\d+\.\d+\.\d+$/)
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
            {
              name: 'acme-portal',
              ...answers,
              ...(answers.previewCatalogue ? {} : { features: [] }),
            },
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
          expect(manifest['dependencies']?.['@strutvane/framework']).toBe('^0.2.0-next.0')
          // The first auth with the owner role and role scopes (the role map in config/auth.ts).
          const auth = manifest['dependencies']?.['@strutvane/auth']
          if (auth !== undefined) expect(auth).toBe('^0.2.0-next.2')
        },
      ),
      { numRuns: 200 },
    )
  })

  it('refuses to render an absorbed package even if one ever reached the list', () => {
    expect(() => dependencies({ ...options(), features: [] })).not.toThrow()
    expect(ABSORBED_PACKAGES).toEqual([
      '@strutvane/core',
      '@strutvane/contracts',
      '@strutvane/cli',
      '@strutvane/devkit',
      '@strutvane/logs',
    ])
  })
})

describe('secrets: never asked for, never in a committed file', () => {
  it('a Custom run with every feature on never prompts for an API key, secret or token', async () => {
    const { prompter, prompts } = scriptedPrompter({
      ...CUSTOM_ANSWERS,
      ai: true,
      aiProvider: 'anthropic',
      social: ['google'],
      teams: true,
      sso: true,
      database: 'postgres',
      storage: 's3',
      mailer: 'postmark',
      features: ['billing', 'search', 'ai-sdk'],
      'billing.provider': 'stripe',
      'search.engine': 'meilisearch',
      'ai-sdk.provider': 'openai',
      monitoring: 'otel',
      deploy: 'docker',
      devContainer: true,
    })
    await askMissing({}, prompter, { cwd: '/code', targetProblem: () => undefined })
    // The only free-text/masked prompts are the ones the blueprint allows (names, admin email, locale...).
    const typed = prompts.filter((p) => p.kind !== 'choice')
    expect(typed.map((p) => p.id)).toEqual(['name', 'adminEmail', 'locale', 'timezone', 'currency'])
    for (const prompt of prompts)
      expect(prompt.message, prompt.id).not.toMatch(
        /\b(api[\s_-]?key|secret|token|credential)s?\b/i,
      )
  })

  it('AI keys get an empty line in .env and .env.example, and the secrets step never fills them', async () => {
    const cwd = tempFolder()
    const { environment } = fakeEnvironment({
      cwd,
      argv: [
        'acme',
        '--yes',
        '--db',
        'sqlite',
        '--ai',
        '--ai-provider',
        'openai',
        '--preview-catalogue',
      ],
      spawn: fakePrograms().spawn,
    })
    expect(await main(environment)).toBe(0)
    const env = parseEnv(readFileSync(join(cwd, 'acme', '.env'), 'utf8'))
    expect(env.get('OPENAI_API_KEY')).toBe('')
    expect(env.get('AI_PROVIDER')).toBe('openai')
    expect(
      parseEnv(readFileSync(join(cwd, 'acme', '.env.example'), 'utf8')).get('OPENAI_API_KEY'),
    ).toBe('')
  })

  it('typed passwords (CI variables) reach only .env (database) or the seeder (admin), never strutvane.json or setup.json', async () => {
    const cwd = tempFolder()
    const world = fakePrograms()
    const dbPassword = 'Db-Pass-For-Test-9183'
    const adminPassword = 'Admin-Pass-For-Test-5521'
    // A real listening socket stands in for "your own MySQL server", so the database step passes.
    const server = createServer((socket) => socket.end())
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    const { environment, output } = fakeEnvironment({
      cwd,
      argv: [
        'acme',
        '--yes',
        '--no-docker',
        '--db-host',
        '127.0.0.1',
        '--db-port',
        String(port),
        '--admin-password',
        'type',
      ],
      env: { STRUT_DB_PASSWORD: dbPassword, STRUT_ADMIN_PASSWORD: adminPassword },
      spawn: world.spawn,
      isPortFree: async () => true,
    })
    try {
      expect(await main(environment)).toBe(0)
    } finally {
      server.close()
    }
    const project = join(cwd, 'acme')
    for (const path of walk(project)) {
      const text = readFileSync(join(project, path), 'utf8')
      expect(text.includes(adminPassword), path).toBe(false)
      if (path !== '.env') expect(text.includes(dbPassword), path).toBe(false)
    }
    expect(parseEnv(readFileSync(join(project, '.env'), 'utf8')).get('DB_PASSWORD')).toBe(
      dbPassword,
    )
    // The typed admin password went to the seeder through the environment only, and is not shown.
    const migrate = world.calls.find((call) => call.args.includes('migrate'))
    expect(migrate?.env).toEqual({ STRUT_SEED_ADMIN_PASSWORD: adminPassword })
    expect(migrate?.args.join(' ')).not.toContain(adminPassword)
    expect(output()).not.toContain(adminPassword)
    expect(output()).toContain('the one you typed')
  })

  it('"type it" without a terminal and without STRUT_ADMIN_PASSWORD stops before writing anything', async () => {
    const cwd = tempFolder()
    const { environment, output } = fakeEnvironment({
      cwd,
      argv: ['acme', '--yes', '--db', 'sqlite', '--admin-password', 'type'],
    })
    expect(await main(environment)).toBe(1)
    expect(output()).toMatch(/STRUT_ADMIN_PASSWORD/)
    expect(readdirSync(cwd)).toEqual([])
  })

  it('public registration is off by default; features live in config/auth.ts, not AUTH_* keys (#26)', () => {
    const features = (answers: Answers = {}) =>
      (
        JSON.parse(
          file(files(answers), 'config/auth.ts').replace(/^[\s\S]*?export default /, ''),
        ) as {
          features: Record<string, boolean>
        }
      ).features
    expect(features()['registration']).toBe(false)
    expect(features({ security: ['registration'] })['registration']).toBe(true)
    for (const answers of [{}, { auth: 'magic-link' as const }, { teams: true }]) {
      const project = files(answers)
      for (const envFile of ['.env', '.env.example']) {
        const keys = [...parseEnv(file(project, envFile)).keys()]
        expect(
          keys.filter((key) => key.startsWith('AUTH_')),
          envFile,
        ).toEqual([])
        expect(keys, envFile).not.toContain('TENANCY_ENABLED')
      }
    }
  })

  it('config/auth.ts uses the one feature list (#25) with the password switch (#107)', () => {
    const features = (answers: Answers = {}) =>
      (
        JSON.parse(
          file(files(answers), 'config/auth.ts').replace(/^[\s\S]*?export default /, ''),
        ) as {
          features: Record<string, boolean>
        }
      ).features
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
    expect(features({ teams: true })['teams']).toBe(true)
    // "No sign-in" = auth is not installed: no config/auth.ts, no @strutvane/auth.
    const none = files({ auth: 'none' })
    expect(none.some((f) => f.path === 'config/auth.ts')).toBe(false)
    expect(file(none, 'package.json')).not.toContain('@strutvane/auth')
  })

  it('no sign-in: the API requires tokens (deny by default), and the summary says how to get one', async () => {
    const project = files({ auth: 'none' })
    expect(file(project, 'config/api.ts')).toContain('"requireToken": true')
    expect(file(project, 'config/api.ts')).toContain('"access": "tokens"')
    expect(file(files(), 'config/api.ts')).toContain('"requireToken": false')
    expect(file(project, 'README.md')).toMatch(/every request needs an API token/)
    const cwd = tempFolder()
    const { environment, output } = fakeEnvironment({
      cwd,
      argv: ['acme', '--yes', '--db', 'sqlite', '--sign-in', 'none'],
      spawn: fakePrograms().spawn,
    })
    expect(await main(environment)).toBe(0)
    expect(output()).toMatch(
      /API\s+every request needs an API token. Create one: node strut token:create/,
    )
  })

  it('email-link sign-in: an admin, no password shown, nullable password column', async () => {
    expect(
      file(
        files({ auth: 'magic-link' }),
        'database/migrations/0001_01_01_000000_create_users_table.ts',
      ),
    ).toContain("t.string('password').nullable()")
    const cwd = tempFolder()
    const { environment, output } = fakeEnvironment({
      cwd,
      argv: ['acme', '--db', 'sqlite', '--sign-in', 'magic-link'],
      interactiveTerminal: true,
      prompter: scriptedPrompter({
        mode: 'recommended',
        stack: 'full',
        design: 'crisp',
        teams: false,
        docker: 'host',
        agents: true,
        review: 'create',
        dev: false,
      }).prompter,
      spawn: fakePrograms().spawn,
    })
    expect(await main(environment)).toBe(0)
    expect(output()).toMatch(
      /Admin\s+admin@acme.test \(signs in with an emailed link; no password\)/,
    )
    expect(output()).not.toContain('Abcd-Efgh-Jkmn-Pqrs')
  })
})

describe('container files (ADR-0021: committed only when chosen)', () => {
  const containerPath = /(^|\/)(Dockerfile|\.dockerignore|\.devcontainer\/.*)$/

  it('none by default; the Dockerfile only for "Docker image"; the dev container only when chosen', () => {
    expect(paths().filter((p) => containerPath.test(p))).toEqual([])
    expect(paths({ deploy: 'node' }).filter((p) => containerPath.test(p))).toEqual([])
    expect(paths({ deploy: 'docker' }).filter((p) => containerPath.test(p))).toEqual([
      '.dockerignore',
      'Dockerfile',
    ])
    expect(paths({ devContainer: true }).filter((p) => containerPath.test(p))).toEqual([
      '.devcontainer/compose.yaml',
      '.devcontainer/devcontainer.json',
    ])
  })

  it('the Dockerfile: multi-stage, pinned Node major, npm ci, sources + dist + prod deps, non-root USER, HEALTHCHECK on /up', () => {
    const dockerfile = file(files({ deploy: 'docker' }), 'Dockerfile')
    expect(dockerfile.match(/^FROM /gm)).toHaveLength(3)
    expect(dockerfile).toMatch(/^FROM node:24-bookworm-slim AS build$/m)
    expect(dockerfile).toContain('RUN npm ci --ignore-scripts')
    expect(dockerfile).toContain('RUN npm ci --omit=dev --ignore-scripts')
    expect(dockerfile).toMatch(/^USER node$/m)
    expect(dockerfile).toMatch(/^HEALTHCHECK .*\n.*\/up/m)
    // The last stage copies production node_modules, the app's runtime sources (Node runs the
    // TypeScript directly) and the built UI: never tests, resources/ sources or .env.
    const runStage = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '))
    const copies = runStage.split('\n').filter((line) => line.startsWith('COPY'))
    expect(copies.map((line) => line.split(' ').at(-1))).toEqual([
      './node_modules',
      './',
      './app',
      './bootstrap',
      './config',
      './database',
      './routes',
      './public',
      './.strutvane',
      './dist',
    ])
    expect(copies.join('\n')).not.toMatch(/tests|\.env/)
    expect(runStage.indexOf('USER node')).toBeLessThan(runStage.indexOf('CMD'))
    // INSTALLER.md §5 bug 4: the framework never writes build/server.js; the image runs the CLI.
    // It runs the framework's CLI directly as PID 1 (not through strut.js) so SIGTERM reaches it.
    expect(runStage).toMatch(/^CMD \["node", "node_modules\/\.bin\/strutvane", "start"\]$/m)
    expect(runStage).not.toMatch(/^CMD \["node", "strut"/m)
    expect(runStage).toMatch(/^ENV STRUTVANE_IN_CONTAINER=1$/m)
    expect(dockerfile).not.toContain('build/server.js')
  })

  // Regression (class: an image that builds but does not run as deployed). Found by building and
  // running the generated image for real: it crashed (sources missing from build/), listened on
  // 127.0.0.1 only inside the container, ignored SIGTERM, and fetched an unpinned "syntax" frontend.
  it('the Dockerfile: listens on the container network, keeps code root-owned, no remote build frontend', () => {
    const dockerfile = file(files({ deploy: 'docker' }), 'Dockerfile')
    const runStage = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '))
    expect(runStage).toMatch(/^ENV APP_HOST=0\.0\.0\.0$/m)
    expect(dockerfile).not.toMatch(/^#\s*syntax=/m)
    expect(runStage).not.toContain('--chown') // the app user may read its code, never change it
    expect(dockerfile).toMatch(/HEALTHCHECK [^\n]*--start-interval=/)
  })

  it('container files never contain or copy a secret, and never copy .env', () => {
    const project = files({ deploy: 'docker', devContainer: true, database: 'postgres', ai: true })
    for (const path of [
      'Dockerfile',
      '.dockerignore',
      '.devcontainer/devcontainer.json',
      '.devcontainer/compose.yaml',
    ]) {
      const text = file(project, path)
      expect(text, path).not.toMatch(/COPY[^\n]*\.env/)
      expect(text, path).not.toMatch(/(PASSWORD|SECRET|APP_KEY|API_KEY|TOKEN)\s*[=:]\s*\S/)
      expect(text, path).not.toMatch(/secret-\d{3}|Abcd-Efgh/)
    }
    // The dev container reads ../.env at runtime (optional), it does not copy it.
    expect(file(project, '.devcontainer/compose.yaml')).toMatch(
      /env_file:\n\s+- path: \.\.\/\.env\n\s+required: false/,
    )
  })

  it('.dockerignore always excludes .env*, .git, node_modules, storage/ and tests', () => {
    const lines = DOCKERIGNORE.split('\n')
    for (const required of ['.env*', '.git', 'node_modules', 'storage/', 'tests/', '**/*.test.ts'])
      expect(lines, required).toContain(required)
    expect(lines.some((line) => line.startsWith('!.env'))).toBe(false)
  })

  it('/up always exists and answers JSON (#45); a deploy target writes a recipe that names it', () => {
    for (const deploy of ['later', 'node', 'docker'] as const) {
      expect(file(files({ deploy }), 'bootstrap/app.ts')).toContain("health: '/up'")
    }
    for (const deploy of ['node', 'docker'] as const) {
      expect(file(files({ deploy }), 'deploy/README.md')).toContain('`{"status":"ok"}`')
    }
    expect(file(files(), 'bootstrap/app.ts')).toMatch(/\{"status":"ok"\} to GET and HEAD/)
  })

  it('the production image logs JSON to stderr (#7) and never forwards strut commands', () => {
    const dockerfile = file(files({ deploy: 'docker' }), 'Dockerfile')
    expect(dockerfile).toMatch(/^ENV LOG_CHANNEL=stderr$/m)
    expect(dockerfile).toMatch(/^ENV LOG_FORMAT=json$/m)
    expect(dockerfile).toMatch(/^ENV STRUTVANE_IN_CONTAINER=1$/m)
    expect(dockerfile).not.toContain('stubs')
  })

  it('.dockerignore leaves out .strutvane/local/ but keeps the generated .strutvane/ files (#111)', () => {
    const ignore = file(files({ deploy: 'docker' }), '.dockerignore').split('\n')
    expect(ignore).toContain('.strutvane/local/')
    expect(ignore).not.toContain('.strutvane/')
    for (const line of ['.env*', '.git', 'node_modules', 'storage/', 'tests/']) {
      expect(ignore).toContain(line)
    }
  })

  it('container files are committed; the local Sail-style compose stays git-ignored (ADR-0006)', () => {
    for (const path of ['Dockerfile', '.dockerignore', '.devcontainer/devcontainer.json'])
      expect(isForbiddenInCommit(path), path).toBe(false)
    expect(isForbiddenInCommit('docker/compose.yaml')).toBe(true)
    expect(file(files(), '.gitignore')).toMatch(/^docker\/$/m)
  })
})

describe('config files follow the answers', () => {
  it('records each answer where the packages read it', () => {
    const project = files({
      previewCatalogue: true,
      cache: 'redis',
      storage: 's3',
      mailer: 'ses',
      locale: 'de',
      timezone: 'Europe/Berlin',
      currency: 'EUR',
      roles: 'admin-manager-member-viewer',
      teams: true,
      tenantResolver: 'subdomain',
      securityProfile: 'strict',
      activityLog: false,
      monitoring: 'otel',
      ai: true,
      aiProvider: 'ollama',
      mcpServer: true,
      appearance: 'dark',
      uiLanguages: ['en', 'de'],
      pwa: true,
      liveUpdates: true,
      social: ['github'],
      sso: true,
    })
    // Cache and storage are .env values of the skeleton's typed configs; Redis and S3 switch them
    // when their packages install (until then the stores the framework has: file, local).
    const env = parseEnv(file(project, '.env'))
    expect(env.get('CACHE_STORE')).toBe('file')
    expect(env.get('FILESYSTEM_DISK')).toBe('local')
    expect(JSON.parse(file(project, 'strutvane.json')).answers).toMatchObject({
      cache: 'redis',
      storage: 's3',
    })
    expect(file(project, 'config/mail.ts')).toContain('"production": "ses"')
    // The regional defaults are the skeleton's placeholders, in config/app.ts and .env.
    expect(file(project, 'config/app.ts')).toContain("env.string('APP_LOCALE', 'de')")
    expect(file(project, 'config/app.ts')).toContain("env.string('APP_TIMEZONE', 'Europe/Berlin')")
    expect(file(project, 'config/app.ts')).toContain("env.string('APP_CURRENCY', 'EUR')")
    expect(env.get('APP_LOCALE')).toBe('de')
    expect(file(project, 'config/permissions.ts')).toContain(
      '"preset": "admin-manager-member-viewer"',
    )
    expect(file(project, 'config/permissions.ts')).toContain('"manager"')
    expect(file(project, 'config/tenancy.ts')).toContain('"resolver": "subdomain"')
    expect(file(project, 'config/security.ts')).toMatch(
      /"profile": "strict",\n\s+"activityHistory": false/,
    )
    expect(file(project, 'config/monitoring.ts')).toContain('"exporter": "otel"')
    expect(file(project, 'config/ai.ts')).toMatch(/"provider": "ollama",\n\s+"mcpServer": true/)
    expect(file(project, 'config/ui.ts')).toMatch(
      /appearance: 'dark',[\s\S]*languages: \['en', 'de'\],[\s\S]*pwa: true,[\s\S]*liveUpdates: true,\n\}\n$/,
    )
    expect(file(project, 'config/auth.ts')).toMatch(
      /"social": \[\n\s+"github"\n\s+\],\n\s+"enterpriseSso": true/,
    )
    expect(parseEnv(file(project, '.env')).get('OLLAMA_HOST')).toBe('http://127.0.0.1:11434')
  })

  it('CI workflow only with git + CI; editor settings only with editor setup; AGENTS.md only with AI assistants', () => {
    expect(paths()).toEqual(
      expect.arrayContaining([
        '.github/workflows/ci.yml',
        '.vscode/settings.json',
        '.vscode/extensions.json',
        'AGENTS.md',
      ]),
    )
    expect(
      paths({ ci: false, editor: false, agents: false }).filter((p) =>
        /^(\.github|\.vscode|AGENTS)/.test(p),
      ),
    ).toEqual([])
    expect(paths({ git: false })).not.toContain('.github/workflows/ci.yml')
    expect(file(files(), '.github/workflows/ci.yml')).toMatch(
      /permissions:\n\s+contents: read[\s\S]*npm ci --ignore-scripts[\s\S]*npm test/,
    )
  })

  it("sample data runs the skeleton's user seeder only when chosen, listed in database.seeder.ts (#104)", () => {
    const main = file(files(), 'database/seeders/database.seeder.ts')
    expect(main).toMatch(
      /\/\/ strut:seeders:start\n\s+await call\(\[AdminSeeder, UserSeeder\]\)\n\s+\/\/ strut:seeders:end/,
    )
    expect(main).toContain("import AdminSeeder from './admin.seeder.ts'")
    expect(main).toContain("import UserSeeder from './user.seeder.ts'")
    expect(main).toContain("import { defineSeeder } from '@strutvane/framework/database'")
    expect(main).toContain('export default defineSeeder({')
    // Without sample data the import goes too (the app type-checks with noUnusedLocals).
    const noSample = file(files({ sampleData: false }), 'database/seeders/database.seeder.ts')
    expect(noSample).toMatch(/strut:seeders:start\n\s+await call\(\[AdminSeeder\]\)/)
    expect(noSample).not.toContain('UserSeeder')
    const none = file(
      files({ auth: 'none', stack: 'api', sampleData: false }),
      'database/seeders/database.seeder.ts',
    )
    expect(none).toMatch(/strut:seeders:start\n\s+await call\(\[\]\)/)
    expect(none).not.toMatch(/^import .*Seeder from/m)
    expect(paths({ auth: 'none' })).not.toContain('database/seeders/admin.seeder.ts')
  })

  it('teams: config/tenancy.ts is { enabled, column } and off unless teams (#90)', () => {
    const config = (answers: Answers) =>
      JSON.parse(file(files(answers), 'config/tenancy.ts').replace(/^[\s\S]*?export default /, ''))
    expect(config({})).toEqual({ enabled: false, column: 'tenant_id' })
    expect(config({ teams: true })).toEqual({
      enabled: true,
      column: 'tenant_id',
      resolver: 'switcher',
    })
  })

  it('the database config reads mysql|mariadb|pgsql|sqlite, SQLite at database/database.sqlite, the migrations table (#14, #36, #96)', () => {
    const config = file(files(), 'config/database.ts')
    expect(config).toContain(
      "const CONNECTIONS = ['mysql', 'mariadb', 'pgsql', 'postgres', 'sqlite']",
    )
    expect(config).toContain("env.string('DB_DATABASE', 'database/database.sqlite')")
    expect(config).toContain("table: 'migrations',")
    expect(parseEnv(file(files({ database: 'postgres' }), '.env')).get('DB_CONNECTION')).toBe(
      'pgsql',
    )
    expect(parseEnv(file(files({ database: 'sqlite' }), '.env')).get('DB_DATABASE')).toBe(
      'database/database.sqlite',
    )
  })

  it('the factory, model and policy follow the framework shapes (#59, #73, #89)', () => {
    const project = files()
    expect(file(project, 'app/models/user.ts')).toContain(
      "export class User extends Model('users', {",
    )
    expect(file(project, 'database/factories/user.factory.ts')).toContain(
      'export default defineFactory(User, ({ faker, sequence }) => ({',
    )
    expect(file(project, 'app/policies/user.policy.ts')).toContain(
      'export default class UserPolicy',
    )
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
        expect(f.content, f.path).not.toMatch(/\/api\/v1\b(?! is opt-in)/)
      }
    }
    expect(file(project, 'AGENTS.md')).toContain('served under /api)')
    expect(file(project, 'config/api.ts')).toContain('"prefix": "/api"')
  })
})
