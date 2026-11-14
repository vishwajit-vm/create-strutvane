/**
 * Every `bin` target in package.json is a real, executable file after the build: it exists, it
 * starts with a `#!` shebang (npm links it as a command; without the shebang it fails to run on
 * macOS and Linux) and it runs.
 *
 * Why build here instead of reading `dist/`: `ci` runs the tests *before* `tsdown`, so `dist/` is
 * missing on a fresh checkout and stale after a source change. This test runs the same tsdown
 * config into a git-ignored `build/` folder (one level below the package root, like `dist/`, so the
 * CLI's `../package.json` lookup works), so the result never depends on the step order. When a
 * `dist/` from a previous build exists, it is checked as well.
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join, posix } from 'node:path'
import { promisify } from 'node:util'
import { build } from 'tsdown'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { PKG_ROOT } from './helpers.ts'

const exec = promisify(execFile)
const OUT = join(PKG_ROOT, 'build')

interface Manifest {
  readonly version: string
  readonly bin: Readonly<Record<string, string>>
}
const manifest = JSON.parse(await readFile(join(PKG_ROOT, 'package.json'), 'utf8')) as Manifest
const bins = Object.entries(manifest.bin)

/** `dist/cli.mjs` → the same file inside `root`. */
const inside = (root: string, target: string) =>
  join(root, ...posix.relative('dist', posix.normalize(target)).split('/'))

async function shebang(path: string): Promise<string> {
  return (await readFile(path, 'utf8')).split('\n', 1)[0] ?? ''
}

beforeAll(async () => {
  await rm(OUT, { recursive: true, force: true })
  await build({
    // The repo's own tsdown.config.ts (entries, format, target); only the output differs.
    config: join(PKG_ROOT, 'tsdown.config.ts'),
    cwd: PKG_ROOT,
    outDir: OUT,
    dts: false,
    sourcemap: false,
    logLevel: 'silent',
  })
})
afterAll(async () => {
  await rm(OUT, { recursive: true, force: true })
})

describe('package.json bin', () => {
  test('has at least one command, with npm-normalised paths inside dist/', () => {
    expect(bins.length).toBeGreaterThan(0)
    for (const [name, target] of bins) {
      // A leading "./" makes npm rewrite the path ("auto-corrected ... invalid and removed").
      expect(target, name).not.toMatch(/^\.\//)
      expect(target, name).toMatch(/^dist\/[^/]+\.mjs$/)
    }
  })

  test.each(bins)('%s: the build produces %s with a shebang, and it runs', async (_, target) => {
    const file = inside(OUT, target)
    expect(existsSync(file), `${target} was not produced by tsdown`).toBe(true)
    expect(await shebang(file)).toBe('#!/usr/bin/env node')
    const { stdout } = await exec(process.execPath, [file, '--version'], { cwd: PKG_ROOT })
    expect(stdout.trim()).toBe(manifest.version)
  })

  test.skipIf(!existsSync(join(PKG_ROOT, 'dist')))(
    'an existing dist/ (from a previous build) has every bin target with a shebang',
    async () => {
      for (const [, target] of bins) {
        const file = join(PKG_ROOT, ...target.split('/'))
        expect(existsSync(file), `${target} is missing from dist/: run the build`).toBe(true)
        expect(await shebang(file)).toMatch(/^#!/)
      }
    },
  )
})
