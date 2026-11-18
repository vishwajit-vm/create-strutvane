/**
 * The vendoring check (skeleton INSTALLER.md §1): the copy in skeleton/ is exactly the pinned
 * strutvane-skeleton ref, file list and hashes, so a hand edit in this repo fails CI. When a
 * clone of the skeleton repo is around (STRUT_SKELETON_REPO, or the sibling ../skeleton of the
 * hub layout), the record itself is compared with `git ls-tree` of the pinned commit too.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveNpmCli } from '../src/npm-cli.ts'
import { packageRoot } from '../src/package-root.ts'
import {
  gitBlobId,
  readVendorRecord,
  SKELETON_FOLDER,
  SKELETON_REPOSITORY,
  storedPath,
  VENDOR_RECORD,
  VENDORED_PATHS,
  vendoredProblems,
} from '../src/skeleton/vendor-record.ts'
import { tempFolder } from './helpers/fakes.ts'

const root = packageRoot()
const record = readVendorRecord(root)

/** A clone of the skeleton repo that has the pinned commit, or undefined. */
function skeletonClone(): string | undefined {
  const candidates = [process.env['STRUT_SKELETON_REPO'], join(root, '..', 'skeleton')]
  for (const candidate of candidates) {
    if (candidate === undefined || !existsSync(candidate)) continue
    const has = spawnSync('git', ['-C', candidate, 'cat-file', '-e', `${record.commit}^{commit}`])
    if (has.status === 0) return resolve(candidate)
  }
  return undefined
}
const clone = skeletonClone()

describe('the vendored skeleton', () => {
  it('is exactly the pinned ref: every file, nothing extra, every hash', () => {
    expect(vendoredProblems(root)).toEqual([])
  })

  it('is pinned to a full commit until the v0.2.0-next.0 tag exists, then to a release tag', () => {
    expect(record.repository).toBe(SKELETON_REPOSITORY)
    const tag = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/.test(record.ref)
    expect(tag || record.ref === record.commit).toBe(true)
  })

  it('holds the manifest, the renderer, the licence and the whole template', () => {
    const paths = record.files.map((file) => file.path)
    for (const path of ['LICENSE', 'skeleton.json', 'src/manifest.ts', 'src/render.ts'])
      expect(paths).toContain(path)
    expect(paths.filter((path) => path.startsWith('template/')).length).toBeGreaterThan(50)
    expect(
      paths.every((path) => VENDORED_PATHS.some((p) => path === p || path.startsWith(`${p}/`))),
    ).toBe(true)
  })

  it('stores every .gitignore and .npmrc under a name npm pack keeps', () => {
    expect(storedPath('template/.gitignore')).toBe('template/_gitignore')
    expect(storedPath('template/.npmrc')).toBe('template/_npmrc')
    expect(storedPath('template/storage/logs/.gitignore')).toBe('template/storage/logs/_gitignore')
    expect(storedPath('template/README.md')).toBe('template/README.md')
    const stored = record.files.map((file) => file.stored)
    expect(stored.filter((path) => /(^|\/)\.(gitignore|npmrc)$/.test(path))).toEqual([])
    expect(stored).toContain('template/_gitignore')
    expect(stored).toContain('template/_npmrc')
  })

  it('a hand edit, a missing file and an extra file are each reported', () => {
    const copy = tempFolder('cs-vendor-')
    cpSync(join(root, SKELETON_FOLDER), join(copy, SKELETON_FOLDER), { recursive: true })
    writeFileSync(join(copy, SKELETON_FOLDER, 'template', 'routes', 'api.ts'), '// edited\n')
    rmSync(join(copy, SKELETON_FOLDER, 'template', 'strut.js'))
    writeFileSync(join(copy, SKELETON_FOLDER, 'template', 'extra.ts'), 'export {}\n')
    expect(vendoredProblems(copy)).toEqual([
      'template/extra.ts is not part of the pinned skeleton',
      `template/routes/api.ts differs from template/routes/api.ts at ${record.commit.slice(0, 7)}`,
      'template/strut.js is missing',
    ])
  })

  it('a missing or malformed record stops with how to fix it (never an unpinned copy)', () => {
    const copy = tempFolder('cs-vendor-record-')
    expect(() => readVendorRecord(copy)).toThrow(/npm run vendor:skeleton/)
    mkdirSync(join(copy, SKELETON_FOLDER))
    const write = (value: unknown): void =>
      writeFileSync(join(copy, SKELETON_FOLDER, VENDOR_RECORD), JSON.stringify(value))
    write([])
    expect(() => readVendorRecord(copy)).toThrow(/JSON object/)
    write({ ...record, ref: '' })
    expect(() => readVendorRecord(copy)).toThrow(/"ref"/)
    write({ ...record, commit: 'ea31741' })
    expect(() => readVendorRecord(copy)).toThrow(/40-character/)
    write({ ...record, files: [] })
    expect(() => readVendorRecord(copy)).toThrow(/empty/)
    write({
      ...record,
      files: [{ path: 'template/.npmrc', stored: 'template/.npmrc', blob: '0'.repeat(40) }],
    })
    expect(() => readVendorRecord(copy)).toThrow(/files\[0\]/)
  })

  it('computes git blob ids like git does', () => {
    expect(gitBlobId(Buffer.from(''))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
    expect(gitBlobId(Buffer.from('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
  })

  it.skipIf(clone === undefined)(
    'the record matches git ls-tree of the pinned commit in the skeleton repo itself',
    () => {
      const listing = spawnSync(
        'git',
        ['-C', clone ?? '', 'ls-tree', '-r', '-z', record.commit, '--', ...VENDORED_PATHS],
        { encoding: 'utf8' },
      )
      expect(listing.status).toBe(0)
      const fromGit = listing.stdout
        .split('\0')
        .filter((line) => line !== '')
        .map((line) => {
          const [meta = '', path = ''] = line.split('\t')
          return { path, blob: meta.split(' ')[2] }
        })
        .sort((a, b) => (a.path < b.path ? -1 : 1))
      const recorded = record.files
        .map(({ path, blob }) => ({ path, blob }))
        .sort((a, b) => (a.path < b.path ? -1 : 1))
      expect(recorded).toEqual(fromGit)
    },
  )

  it('npm pack ships the template (renamed files included), the manifest and the record', () => {
    const npm = resolveNpmCli(process.env, process.execPath)
    const pack = spawnSync(
      process.execPath,
      [npm, 'pack', '--dry-run', '--json', '--ignore-scripts'],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      },
    )
    expect(pack.status, pack.stderr).toBe(0)
    const [result] = JSON.parse(pack.stdout) as [{ files: { path: string }[] }]
    const shipped = new Set(result.files.map((file) => file.path))
    for (const file of record.files) {
      if (file.path.startsWith('src/')) continue // bundled into dist/, not needed at runtime
      expect(shipped, file.stored).toContain(`${SKELETON_FOLDER}/${file.stored}`)
    }
    expect(shipped).toContain(`${SKELETON_FOLDER}/${VENDOR_RECORD}`)
    expect([...shipped].filter((path) => path.startsWith(`${SKELETON_FOLDER}/src/`))).toEqual([])
  })
})
