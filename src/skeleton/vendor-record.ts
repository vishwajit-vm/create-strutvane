/**
 * The vendored copy of strutvane-skeleton (the app template, like `laravel/laravel` for
 * `laravel/installer`) inside this package, and the record that pins it.
 *
 * `npm run vendor:skeleton` (scripts/vendor-skeleton.ts) copies, from ONE pinned skeleton ref,
 * `skeleton.json`, `template/**`, `src/manifest.ts`, `src/render.ts` and `LICENSE` into
 * `skeleton/`, and writes `skeleton/vendor.json`: the repository, the ref, the full commit id and,
 * for every file, its git blob id at that commit. The installer renders new apps from that copy
 * only (skeleton INSTALLER.md §1).
 *
 * Why vendor (not download at install time, not inline templates): installs work offline and keep
 * the registry's integrity and provenance checks (`allow-git=none`), and there is one app layout,
 * tested and booted by the skeleton repo, instead of a second hand-written copy that drifts.
 *
 * Why git blob ids: they are what `git ls-tree` prints for the pinned commit, so the vendoring
 * check (test/vendored-skeleton.test.ts) can compare the copy with the skeleton repo itself, and
 * a hand edit of a vendored file (or of the record without the file) fails CI.
 *
 * npm pack never ships `.gitignore` or `.npmrc` files, so they are stored as `_gitignore` and
 * `_npmrc` ({@link storedPath}) and renamed back when an app is written.
 *
 * @module
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** The vendored copy's folder, relative to this package's root. */
export const SKELETON_FOLDER = 'skeleton'

/** The record's file name inside {@link SKELETON_FOLDER}. */
export const VENDOR_RECORD = 'vendor.json'

/** Where the skeleton comes from (the record names it; the script accepts a local clone). */
export const SKELETON_REPOSITORY = 'https://github.com/vishwajit-vm/strutvane-skeleton'

/** The skeleton repo paths that are vendored (a folder means everything under it). */
export const VENDORED_PATHS: readonly string[] = Object.freeze([
  'LICENSE',
  'skeleton.json',
  'src/manifest.ts',
  'src/render.ts',
  'template',
])

/** File names npm pack drops, and the names they are stored under in this package. */
const RENAMED: Readonly<Record<string, string>> = Object.freeze({
  '.gitignore': '_gitignore',
  '.npmrc': '_npmrc',
})

/**
 * The path a skeleton file is stored under here: `.gitignore` and `.npmrc` (in any folder) get a
 * `_` instead of the dot, because npm pack would leave them out of the tarball.
 *
 * @example
 * storedPath('template/storage/logs/.gitignore') // 'template/storage/logs/_gitignore'
 */
export function storedPath(path: string): string {
  const slash = path.lastIndexOf('/')
  const name = path.slice(slash + 1)
  const renamed = RENAMED[name]
  return renamed === undefined ? path : `${path.slice(0, slash + 1)}${renamed}`
}

/**
 * The git blob id of some bytes: what `git hash-object` and `git ls-tree` print.
 *
 * @example
 * gitBlobId(Buffer.from('')) // 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'
 */
export function gitBlobId(content: Uint8Array): string {
  return createHash('sha1').update(`blob ${content.byteLength}\0`).update(content).digest('hex')
}

/** One vendored file: its skeleton repo path, the path it is stored under, its git blob id. */
export interface VendoredFile {
  readonly path: string
  readonly stored: string
  readonly blob: string
}

/** `skeleton/vendor.json`. */
export interface VendorRecord {
  readonly repository: string
  /** What was asked for: a tag such as `v0.2.0-next.0`, or a full commit id until one exists. */
  readonly ref: string
  /** The full commit id the ref pointed at. */
  readonly commit: string
  readonly files: readonly VendoredFile[]
}

const HEX40 = /^[0-9a-f]{40}$/

/**
 * Read and check `skeleton/vendor.json` under a package root. Throws with a fix-it message when
 * it is missing or malformed (fail closed: never render from an unpinned copy).
 *
 * @example
 * readVendorRecord(packageRoot()).commit // 'ea317419…'
 */
export function readVendorRecord(root: string): VendorRecord {
  const file = join(root, SKELETON_FOLDER, VENDOR_RECORD)
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(
      `${file} is missing or not JSON (${error instanceof Error ? error.message : String(error)}). Run: npm run vendor:skeleton`,
    )
  }
  if (!isRecord(parsed)) throw new Error(`${file} must hold a JSON object`)
  const { repository, ref, commit, files } = parsed
  if (typeof repository !== 'string' || typeof ref !== 'string' || ref === '')
    throw new Error(`${file} needs "repository" and "ref"`)
  if (typeof commit !== 'string' || !HEX40.test(commit))
    throw new Error(`${file}: "commit" must be a full 40-character commit id`)
  if (!Array.isArray(files) || files.length === 0) throw new Error(`${file}: "files" is empty`)
  const checked = files.map((entry, index): VendoredFile => {
    if (
      !isRecord(entry) ||
      typeof entry['path'] !== 'string' ||
      typeof entry['stored'] !== 'string' ||
      typeof entry['blob'] !== 'string' ||
      !HEX40.test(entry['blob']) ||
      storedPath(entry['path']) !== entry['stored']
    )
      throw new Error(`${file}: files[${index}] needs path, stored (= the renamed path) and blob`)
    return { path: entry['path'], stored: entry['stored'], blob: entry['blob'] }
  })
  return { repository, ref, commit, files: checked }
}

/**
 * Everything that differs between the vendored folder and its record: missing files, files
 * that are not in the record, and files whose content changed. Empty means the copy is exactly
 * the pinned skeleton.
 *
 * @example
 * vendoredProblems(packageRoot()) // []
 */
export function vendoredProblems(
  root: string,
  record: VendorRecord = readVendorRecord(root),
): string[] {
  const folder = join(root, SKELETON_FOLDER)
  const problems: string[] = []
  const expected = new Map(record.files.map((entry) => [entry.stored, entry]))
  const present = new Set(
    walk(folder)
      .map((path) => relative(folder, path).split('\\').join('/'))
      .filter((path) => path !== VENDOR_RECORD),
  )
  for (const [stored, entry] of expected) {
    if (!present.has(stored)) {
      problems.push(`${stored} is missing`)
      continue
    }
    const blob = gitBlobId(readFileSync(join(folder, stored)))
    if (blob !== entry.blob)
      problems.push(`${stored} differs from ${entry.path} at ${record.commit.slice(0, 7)}`)
  }
  for (const stored of present)
    if (!expected.has(stored)) problems.push(`${stored} is not part of the pinned skeleton`)
  return problems.sort()
}

function walk(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const full = join(folder, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
