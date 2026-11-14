/**
 * The generated .gitignore, checked by git itself (`git check-ignore`), plus the first commit:
 * secrets, Docker files and runtime state must never be committed; what the team needs must be.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { ProjectOptions } from '../src/options.ts'
import { generate, git, removeDir } from './helpers.ts'

async function ignored(dir: string, path: string): Promise<boolean> {
  // Exit code 0 = ignored, 1 = not ignored. --no-index also checks paths that do not exist yet.
  return (await git(dir, 'check-ignore', '-q', '--no-index', path)).code === 0
}

describe.each([
  { docker: 'local', dockerIgnored: true },
  { docker: 'commit', dockerIgnored: false },
] as const)('docker=$docker', ({ docker, dockerIgnored }) => {
  let options: ProjectOptions
  let root: string

  beforeAll(async () => {
    ;({ options, root } = await generate({ name: 'acme', docker }))
    expect((await git(options.directory, 'init', '-q', '-b', 'main')).code).toBe(0)
  })
  afterAll(async () => {
    await removeDir(root)
  })

  test.each([
    '.env',
    '.env.local',
    '.env.production',
    '.strutvane/staging/journal.json',
    '.strutvane/staging/tx-1/base/app/x.ts',
    '.strutvane/registry.gen.ts',
    '.strutvane/types.gen.ts',
    'storage/logs/app-2026-11-14.log',
    'storage/app/upload.pdf',
    'storage/database.sqlite',
    'node_modules/zod/package.json',
    'dist/server.js',
    'coverage/lcov.info',
    'test-results/run.json',
  ])('ignores %s', async (path) => {
    expect(await ignored(options.directory, path)).toBe(true)
  })

  test.each([
    '.env.example',
    'storage/.gitkeep',
    'package.json',
    'env.ts',
    'app/models/invoice.model.ts',
    'database/migrations/0001_create_users.sql',
    'web/app.tsx',
    '.github/workflows/ci.yml',
    // ADR-0012: the upgrade state is shared, so `sv upgrade` works for the whole team.
    '.strutvane/README.md',
    '.strutvane/lock.json',
    '.strutvane/base/app/resources/invoice.resource.ts',
    '.strutvane/templates/model.ts',
  ])('keeps %s', async (path) => {
    expect(await ignored(options.directory, path)).toBe(false)
  })

  test(`docker/compose.yaml is ${dockerIgnored ? 'ignored' : 'committed'}`, async () => {
    expect(await ignored(options.directory, 'docker/compose.yaml')).toBe(dockerIgnored)
  })

  test('the first commit contains .env.example but never .env, storage or generated state', async () => {
    const dir = options.directory
    expect((await git(dir, 'add', '-A')).code).toBe(0)
    expect((await git(dir, 'commit', '-q', '-m', 'init')).code).toBe(0)
    const files = (await git(dir, 'ls-files')).output.split('\n').filter(Boolean)
    expect(files).toContain('.env.example')
    expect(files).toContain('storage/.gitkeep')
    expect(files).not.toContain('.env')
    // Only the explanatory README of .strutvane/ exists at creation time.
    expect(files.filter((f) => f.startsWith('.strutvane/'))).toEqual(['.strutvane/README.md'])
    expect(files.some((f) => f.startsWith('storage/logs'))).toBe(false)
    expect(files.includes('docker/compose.yaml')).toBe(!dockerIgnored)
  })
})
