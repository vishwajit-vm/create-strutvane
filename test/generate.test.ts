/**
 * Writing to disk: refusal to overwrite, transactional rollback, dry runs, secrets shown once, and
 * Windows-style paths.
 */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type DevkitIo, nodeIo, TransactionAbortedError } from '@strutvane/devkit'
import { afterEach, describe, expect, test } from 'vitest'
import {
  checkTarget,
  createProject,
  SECRET_PLACEHOLDER,
  TargetNotEmptyError,
} from '../src/generate.ts'
import { renderProject } from '../src/render.ts'
import { optionsFor, removeDir, secretSequence, tempDir } from './helpers.ts'

const roots: string[] = []
async function root(): Promise<string> {
  const dir = await tempDir()
  roots.push(dir)
  return dir
}
afterEach(async () => {
  for (const dir of roots.splice(0)) await removeDir(dir)
})

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** A real-disk io whose `rename` fails after `okRenames` successful renames (a crash mid-commit). */
function failingIo(okRenames: number): DevkitIo {
  let renames = 0
  return {
    ...nodeIo,
    async rename(from, to) {
      if (renames++ >= okRenames) throw new Error('disk full (simulated)')
      return nodeIo.rename(from, to)
    },
  }
}

describe('checkTarget', () => {
  test('missing and empty folders are fine', async () => {
    const r = await root()
    expect(await checkTarget(join(r, 'nope'))).toBe('missing')
    expect(await checkTarget(r)).toBe('empty')
  })

  test('a non-empty folder or a file is refused', async () => {
    const r = await root()
    await writeFile(join(r, 'keep.txt'), 'mine')
    await expect(checkTarget(r)).rejects.toThrow(TargetNotEmptyError)
    await expect(checkTarget(join(r, 'keep.txt'))).rejects.toThrow(/not a folder/)
  })

  test('other file-system errors are not swallowed', async () => {
    await expect(checkTarget('\0bad')).rejects.toThrow()
  })
})

describe('createProject', () => {
  test('writes every rendered file plus .env and .env.example', async () => {
    const r = await root()
    const options = optionsFor({ name: 'acme' }, r)
    const result = await createProject(options, { generateSecret: secretSequence() })
    const rendered = renderProject(options).files.map((f) => f.path)
    expect(result.files).toEqual([...rendered, '.env', '.env.example'].sort())
    for (const path of result.files)
      expect(await exists(join(options.directory, path)), path).toBe(true)
    expect(await readFile(join(options.directory, 'package.json'), 'utf8')).toContain(
      '"name": "acme"',
    )
    expect(result.tree.split('\n')[0]).toBe('acme/')
    expect(result.diff).toBe('')
    // The transaction's staging area is cleaned up.
    expect(await exists(join(options.directory, '.strutvane', 'staging'))).toBe(false)
  })

  test('returns the seeded admin password once and names every generated secret', async () => {
    const r = await root()
    const options = optionsFor({ name: 'acme' }, r)
    const result = await createProject(options, { generateSecret: secretSequence() })
    expect(result.generatedSecrets).toEqual([
      'APP_KEY',
      'DB_PASSWORD',
      'AUTH_SECRET',
      'SEED_ADMIN_PASSWORD',
    ])
    const env = await readFile(join(options.directory, '.env'), 'utf8')
    expect(result.showOnce).toHaveLength(1)
    const [admin] = result.showOnce
    expect(admin?.key).toBe('SEED_ADMIN_PASSWORD')
    expect(env).toContain(`SEED_ADMIN_PASSWORD=${admin?.value}`)
  })

  test('uses real random secrets by default (unique, long, URL-safe)', async () => {
    const r = await root()
    const options = optionsFor({ name: 'acme' }, r)
    await createProject(options)
    const env = await readFile(join(options.directory, '.env'), 'utf8')
    const values = ['APP_KEY', 'DB_PASSWORD', 'AUTH_SECRET', 'SEED_ADMIN_PASSWORD'].map(
      (k) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1] ?? '',
    )
    for (const v of values) expect(v).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(new Set(values).size).toBe(values.length)
  })

  test('a project without auth shows nothing once', async () => {
    const r = await root()
    const options = optionsFor({ name: 'tiny', preset: 'api', database: 'sqlite', auth: [] }, r)
    const result = await createProject(options)
    expect(result.showOnce).toEqual([])
    expect(result.generatedSecrets).toEqual(['APP_KEY'])
  })

  test('refuses a non-empty folder and leaves it untouched', async () => {
    const r = await root()
    const options = optionsFor({ name: 'acme' }, r)
    await mkdir(options.directory)
    await writeFile(join(options.directory, 'notes.txt'), 'precious')
    await expect(createProject(options)).rejects.toThrow(TargetNotEmptyError)
    expect(await readdir(options.directory)).toEqual(['notes.txt'])
    expect(await readFile(join(options.directory, 'notes.txt'), 'utf8')).toBe('precious')
  })

  test('fills an existing empty folder', async () => {
    const r = await root()
    const options = optionsFor({ name: 'acme' }, r)
    await mkdir(options.directory)
    await createProject(options)
    expect(await exists(join(options.directory, 'package.json'))).toBe(true)
  })

  test('rolls back and removes the folder it created when writing fails halfway', async () => {
    const r = await root()
    const options = optionsFor({ name: 'acme' }, r)
    await expect(createProject(options, { io: failingIo(10) })).rejects.toThrow(
      TransactionAbortedError,
    )
    expect(await exists(options.directory)).toBe(false)
  })

  test('rolls back and empties a folder that was empty before', async () => {
    const r = await root()
    const options = optionsFor({ name: 'acme' }, r)
    await mkdir(options.directory)
    await expect(createProject(options, { io: failingIo(5) })).rejects.toThrow(/rolled back/)
    expect(await readdir(options.directory)).toEqual([])
  })

  test('a failure before writing touches nothing', async () => {
    const r = await root()
    const options = optionsFor({ name: 'acme' }, r)
    const broken = () => 'line\nbreak' // the env editor refuses multi-line values
    await expect(createProject(options, { generateSecret: broken })).rejects.toThrow()
    expect(await exists(options.directory)).toBe(false)
  })

  test('--dry-run writes nothing and shows the tree and a diff without real secrets', async () => {
    const r = await root()
    const options = optionsFor({ name: 'acme' }, r)
    const result = await createProject(options, {
      dryRun: true,
      generateSecret: () => 'REAL-SECRET',
    })
    expect(await exists(options.directory)).toBe(false)
    expect(result.files).toContain('.env')
    expect(result.tree).toContain('├─ app/')
    expect(result.diff).toContain('+++ b/package.json')
    // devkit redacts .env values in previews; the placeholder generator is a second safeguard.
    expect(result.diff).toContain('+APP_KEY=<redacted>')
    expect(result.diff).not.toContain('REAL-SECRET')
    expect(result.diff).not.toContain(SECRET_PLACEHOLDER)
    expect(result.diff).toContain('+APP_DEBUG=false')
    expect(result.showOnce).toEqual([])
  })

  test('works with Windows-style paths containing spaces; project paths stay POSIX', async () => {
    const r = await root()
    const parent = join(r, 'My Projects', 'Client A')
    await mkdir(parent, { recursive: true })
    const options = optionsFor({ name: 'acme', directory: join(parent, 'acme') }, r)
    const result = await createProject(options)
    expect(result.files.every((p) => !p.includes('\\'))).toBe(true)
    expect(await exists(join(parent, 'acme', 'app', 'http', 'routes', 'api.ts'))).toBe(true)
    if (process.platform === 'win32') {
      expect(options.directory).toMatch(/^[A-Za-z]:\\/)
    }
  })
})
