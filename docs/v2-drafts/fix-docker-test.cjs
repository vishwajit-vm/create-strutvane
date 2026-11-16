const fs = require('node:fs')
const path = require('node:path')
const f = path.join(process.argv[2], 'test/docker.e2e.test.ts')
let t = fs.readFileSync(f, 'utf8')
const rep = (a, b) => {
  if (!t.includes(a)) throw new Error(`missing ${a.slice(0, 80)}`)
  t = t.replace(a, b)
}
rep(
  ` * Real Docker smoke tests (skipped when Docker is not available): the installer runs in Docker
 * mode for real, so containers start, \`npm ci\`, migrations and seeding run INSIDE the app
 * container, and \`node strut\` on the host forwards into it.`,
  ` * Real Docker smoke tests (skipped when Docker is not available): the installer runs in Docker
 * mode for real, so containers start, \`npm install\`, migrations and seeding run INSIDE the app
 * container, and \`node strut\` on the host forwards into it. The Strutvane packages are local
 * stand-ins (\`STRUT_LOCAL_PACKAGES\`), copied into the project, so the container sees them.`,
)
rep(
  `import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'`,
  `import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'`,
)
rep(
  `import { tempFolder } from './helpers/fakes.ts'`,
  `import { tempFolder } from './helpers/fakes.ts'
import { localPackages } from './helpers/local-packages.ts'

const PACKAGES = localPackages()`,
)
rep(
  `/** A clean environment without the test runner's npm variables or git identity. */
function cleanEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^(npm_|GIT_|CI$)/i.test(key)) env[key] = value
  }
  return env
}`,
  `/** A clean environment without the test runner's npm variables or git identity. */
function cleanEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^(npm_|GIT_|CI$)/i.test(key)) env[key] = value
  }
  return { ...env, STRUT_LOCAL_PACKAGES: PACKAGES }
}`,
)
rep(
  `    [CLI, project, '--yes', '--docker', '--no-git', ...flags],`,
  `    [CLI, project, '--yes', '--docker', '--no-git', '--testing', 'none', ...flags],`,
)
rep(
  `  it('SQLite: app + Mailpit start, npm ci / migrate / seed run in the container, node strut forwards, npm run dev serves', async () => {`,
  `  it('SQLite: app + Mailpit start, npm install / migrate / seed run in the container, node strut forwards, npm run dev serves', async () => {`,
)
rep(
  `    const help = spawnSync(process.execPath, ['strut.js', 'help'], {`,
  `    const help = spawnSync(process.execPath, ['strut.js', 'list'], {`,
)
rep(
  `    expect(home.body).toContain(result.project)
    expect((await get(port, '/', 'evil.example')).status).toBe(403)`,
  `    expect(home.body).toContain(result.project)
    expect(await get(port, '/up')).toEqual({ status: 200, body: '{"status":"ok"}' })
    expect((await get(port, '/', 'evil.example')).status).toBe(403)`,
)
rep(
  `    const directory = join(root, name)
    const secrets = parseEnv(readFileSync(join(directory, '.env'), 'utf8'))`,
  `    const directory = join(root, name)
    // Test only: the image must also see the local package stand-ins (a real app installs from
    // npm). The generated files keep .strutvane/local/ out of the build context (#111).
    const dockerfile = readFileSync(join(directory, 'Dockerfile'), 'utf8')
    expect(dockerfile).toMatch(/^ENV LOG_CHANNEL=stderr$/m)
    writeFileSync(
      join(directory, 'Dockerfile'),
      dockerfile
        .replaceAll(
          'COPY package.json package-lock.json .npmrc ./\\n',
          'COPY package.json package-lock.json .npmrc ./\\nCOPY .strutvane/local/packages ./.strutvane/local/packages\\n',
        )
        .replace(
          'COPY --from=deps /app/node_modules ./node_modules\\n',
          'COPY --from=deps /app/node_modules ./node_modules\\nCOPY --from=deps /app/.strutvane/local/packages ./.strutvane/local/packages\\n',
        ),
    )
    const ignore = readFileSync(join(directory, '.dockerignore'), 'utf8')
    expect(ignore).toContain('.strutvane/local/\\n')
    writeFileSync(
      join(directory, '.dockerignore'),
      ignore.replace('.strutvane/local/\\n', '.strutvane/local/*\\n!.strutvane/local/packages/\\n'),
    )
    const secrets = parseEnv(readFileSync(join(directory, '.env'), 'utf8'))`,
)
rep(
  `      secrets.get('APP_KEY') ?? 'x',
      secrets.get('AUTH_SECRET') ?? 'x',`,
  `      secrets.get('APP_KEY') ?? 'x',
      secrets.get('APP_KEY') ?? 'x',`,
)
rep(
  `    expect(await get(port, '/up')).toEqual({ status: 200, body: 'up' })`,
  `    expect(await get(port, '/up')).toEqual({ status: 200, body: '{"status":"ok"}' })
    // Logs go to stderr as JSON (ADR-0022, #7): the platform collects them.
    expect(dockerOk(['inspect', '--format', '{{.Config.Env}}', container])).toMatch(
      /LOG_CHANNEL=stderr.*LOG_FORMAT=json/,
    )`,
)
rep(
  `        'docker',
        '--no-git',
        '--no-dev',
      ],`,
  `        'docker',
        '--no-git',
        '--no-dev',
        '--testing',
        'none',
      ],`,
)
fs.writeFileSync(f, t)
