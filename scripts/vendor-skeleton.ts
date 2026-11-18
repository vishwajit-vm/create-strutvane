/**
 * `npm run vendor:skeleton -- [--repo <skeleton clone>] [--ref <tag or commit>]`
 *
 * Copies the pinned strutvane-skeleton into `skeleton/` and writes `skeleton/vendor.json`
 * (src/skeleton/vendor-record.ts explains why). Everything is read from git objects at the ref,
 * never from the clone's working tree, so local edits in the clone can never leak in.
 *
 * - `--repo`: a local clone of strutvane-skeleton. Default: `STRUT_SKELETON_REPO`, else the
 *   sibling `../skeleton` (the hub's `packages/` layout).
 * - `--ref`: the tag (for example `v0.2.0-next.0`) or commit to vendor. Default: the ref already
 *   recorded in `skeleton/vendor.json`, so a plain run re-creates the same copy.
 *
 * Failure scenarios: the clone or the ref is missing (stops, says to fetch), the ref holds no
 * skeleton.json (stops). The old copy is replaced only after every file was read.
 *
 * Commit the result with the change that needs it; the vendoring check test fails on any drift.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  gitBlobId,
  readVendorRecord,
  SKELETON_FOLDER,
  SKELETON_REPOSITORY,
  storedPath,
  VENDOR_RECORD,
  VENDORED_PATHS,
  type VendoredFile,
} from '../src/skeleton/vendor-record.ts'

const root = resolve(import.meta.dirname, '..')

function git(repo: string, args: readonly string[]): Buffer {
  const result = spawnSync('git', ['-C', repo, ...args], { maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0)
    throw new Error(`git ${args.join(' ')} failed in ${repo}:\n${String(result.stderr)}`)
  return result.stdout
}

function fail(message: string): never {
  process.stderr.write(`vendor:skeleton: ${message}\n`)
  process.exit(1)
}

const { values } = parseArgs({
  options: { repo: { type: 'string' }, ref: { type: 'string' } },
  allowPositionals: false,
})
const repo = resolve(
  values.repo ?? process.env['STRUT_SKELETON_REPO'] ?? join(root, '..', 'skeleton'),
)
if (!existsSync(join(repo, '.git')) && !existsSync(join(repo, 'HEAD')))
  fail(`${repo} is not a git clone of ${SKELETON_REPOSITORY}. Pass --repo <path>.`)

let ref = values.ref
if (ref === undefined) {
  try {
    ref = readVendorRecord(root).ref
  } catch {
    fail('no --ref given and no skeleton/vendor.json to take it from.')
  }
}

let commit: string
try {
  commit = git(repo, ['rev-parse', '--verify', `${ref}^{commit}`])
    .toString('utf8')
    .trim()
} catch {
  fail(`${ref} is not in ${repo}. Run: git -C ${repo} fetch --tags origin`)
}

// `git ls-tree -r -z <commit> -- <paths>`: "<mode> blob <id>\t<path>\0" per file.
const listing = git(repo, ['ls-tree', '-r', '-z', commit, '--', ...VENDORED_PATHS])
  .toString('utf8')
  .split('\0')
  .filter((line) => line !== '')
const entries = listing.map((line) => {
  const tab = line.indexOf('\t')
  const [mode = '', type = '', blob = ''] = line.slice(0, tab).split(' ')
  if (type !== 'blob' || !['100644', '100755'].includes(mode))
    fail(`unexpected tree entry at ${commit}: ${line}`)
  return { path: line.slice(tab + 1), blob }
})
if (!entries.some((entry) => entry.path === 'skeleton.json'))
  fail(`${ref} has no skeleton.json: is ${repo} the skeleton repo?`)

// Read everything first; only then replace the old copy.
const files = entries.map(({ path, blob }) => {
  const content = git(repo, ['cat-file', 'blob', blob])
  if (gitBlobId(content) !== blob) fail(`${path}: git returned different bytes than ${blob}`)
  return { path, blob, content }
})
const folder = join(root, SKELETON_FOLDER)
rmSync(folder, { recursive: true, force: true })
const record: VendoredFile[] = []
for (const { path, blob, content } of files) {
  const stored = storedPath(path)
  mkdirSync(dirname(join(folder, stored)), { recursive: true })
  writeFileSync(join(folder, stored), content)
  record.push({ path, stored, blob })
}
record.sort((a, b) => (a.stored < b.stored ? -1 : a.stored > b.stored ? 1 : 0))
writeFileSync(
  join(folder, VENDOR_RECORD),
  `${JSON.stringify({ repository: SKELETON_REPOSITORY, ref, commit, files: record }, null, 2)}\n`,
)
process.stdout.write(
  `Vendored ${record.length} files from ${SKELETON_REPOSITORY} at ${ref} (${commit}) into ${SKELETON_FOLDER}/\n`,
)
