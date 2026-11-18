/**
 * End to end for the files: three representative answer sets are rendered from the vendored
 * skeleton, written to disk with the real writer and committed with real git (no npm install;
 * the install, migrate and serve run in e2e.test.ts). Checks the file tree, that every
 * placeholder is resolved, that Docker files appear only when opted in (ADR-0006, ADR-0021), that
 * `.env` is never committed and that `.env.example` is complete and holds no secret.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEnv } from '../src/env-file.ts'
import { type Answers, resolveOptions } from '../src/options.ts'
import { secretKeys } from '../src/templates/env.ts'
import { renderProject } from '../src/templates/project.ts'
import { writeProjectFiles } from '../src/write-files.ts'
import { tempFolder } from './helpers/fakes.ts'

/** Every file under a folder (not .git), as POSIX paths relative to it. */
function walk(root: string, folder = root): string[] {
  return readdirSync(folder).flatMap((name) => {
    const full = join(folder, name)
    if (name === '.git') return []
    return statSync(full).isDirectory()
      ? walk(root, full)
      : [relative(root, full).replaceAll('\\', '/')]
  })
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.test',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.test',
    },
  })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  return result.stdout
}

interface Case {
  readonly label: string
  readonly answers: Answers
  readonly ui: boolean
  readonly tests: boolean
  readonly compose: boolean
  readonly productionImage: boolean
  readonly devContainer: boolean
}

const CASES: readonly Case[] = [
  {
    label: 'Recommended: full stack, Crisp, email sign-in, MySQL in Docker',
    answers: { docker: true },
    ui: true,
    tests: true,
    compose: true,
    productionImage: false,
    devContainer: false,
  },
  {
    label: 'API only, SQLite, no sign-in, no Docker, no tests',
    answers: { stack: 'api', auth: 'none', database: 'sqlite', docker: false, testing: 'none' },
    ui: false,
    tests: false,
    compose: false,
    productionImage: false,
    devContainer: false,
  },
  {
    label: 'Custom: Vivid, email link, teams, own PostgreSQL, production image and dev container',
    answers: {
      mode: 'custom',
      design: 'vivid',
      auth: 'magic-link',
      teams: true,
      database: 'postgres',
      docker: false,
      dbHost: '127.0.0.1',
      deploy: 'docker',
      devContainer: true,
    },
    ui: true,
    tests: true,
    compose: false,
    productionImage: true,
    devContainer: true,
  },
]

describe.each(CASES)('a generated app on disk: $label', (testCase) => {
  const parent = tempFolder('cs-apps-')
  const options = resolveOptions({ name: 'acme-portal', ...testCase.answers }, parent)
  const directory = join(parent, 'acme-portal')
  const ready = (async () => {
    await writeProjectFiles(directory, renderProject(options, { dbPassword: 's3cret-typed' }))
    git(directory, 'init', '-q')
    git(directory, 'add', '-A')
    git(directory, 'commit', '-q', '-m', 'test')
    return walk(directory)
  })()
  const read = (path: string): string => readFileSync(join(directory, path), 'utf8')

  it('has the skeleton layout for these answers', async () => {
    const tree = await ready
    for (const path of [
      '.gitignore',
      '.npmrc',
      'bootstrap/app.ts',
      'bootstrap/providers.ts',
      'config/index.ts',
      'config/logging.ts',
      'database/migrations/0001_01_01_000000_create_users_table.ts',
      'routes/api.ts',
      'storage/logs/.gitignore',
      'strut.js',
      'strutvane.json',
    ])
      expect(tree, path).toContain(path)
    // npm pack's renamed copies are renamed back.
    expect(tree.filter((path) => /(^|\/)_(gitignore|npmrc)$/.test(path))).toEqual([])
    expect(tree.includes('resources/ui/main.tsx')).toBe(testCase.ui)
    expect(tree.includes('config/ui.ts')).toBe(testCase.ui)
    expect(tree.includes('tests/feature/health.test.ts')).toBe(testCase.tests)
    expect(tree.includes('config/auth.ts')).toBe(testCase.answers.auth !== 'none')
    if (process.platform !== 'win32')
      expect(statSync(join(directory, 'strut.js')).mode & 0o111).not.toBe(0)
  })

  it('resolves every placeholder and template marker', async () => {
    for (const path of await ready) {
      const text = read(path)
      expect(text, path).not.toMatch(/\{\{\s*[A-Z_]+\s*\}\}/)
      expect(text, path).not.toMatch(/@strut:(if|endif)/)
    }
  })

  it('has Docker files only when opted in (ADR-0006, ADR-0021)', async () => {
    const tree = await ready
    expect(tree.includes('docker/compose.yaml')).toBe(testCase.compose)
    expect(tree.includes('Dockerfile')).toBe(testCase.productionImage)
    expect(tree.includes('.dockerignore')).toBe(testCase.productionImage)
    expect(tree.includes('.devcontainer/devcontainer.json')).toBe(testCase.devContainer)
  })

  it('never commits .env, the local compose stack or local state', async () => {
    await ready
    const committed = git(directory, 'ls-files').split('\n').filter(Boolean)
    expect(committed).toContain('.env.example')
    expect(committed).toContain('storage/logs/.gitignore')
    expect(committed.filter((path) => /(^|\/)\.env$/.test(path))).toEqual([])
    expect(committed.filter((path) => path.startsWith('docker/'))).toEqual([])
    expect(committed.filter((path) => path.startsWith('.strutvane/local/'))).toEqual([])
    expect(git(directory, 'check-ignore', '.env').trim()).toBe('.env')
  })

  it('.env.example is complete, production-safe and holds no secret', async () => {
    await ready
    const exampleText = read('.env.example')
    const example = parseEnv(exampleText)
    const env = parseEnv(read('.env'))
    for (const key of env.keys()) expect(example.has(key), key).toBe(true)
    for (const key of secretKeys(options)) expect(example.get(key), key).toBe('')
    expect(example.get('APP_ENV')).toBe('production')
    expect(example.get('APP_DEBUG')).toBe('false')
    expect(exampleText).not.toContain('s3cret-typed')
    // The typed password of your own server goes to .env only.
    if (options.connection !== undefined) expect(env.get('DB_PASSWORD')).toBe('s3cret-typed')
    // Logging channels come from .env (ADR-0022).
    for (const key of ['LOG_CHANNEL', 'LOG_STACK', 'LOG_LEVEL'])
      expect(example.has(key), key).toBe(true)
  })
})
