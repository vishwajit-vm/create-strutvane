/**
 * The real binary entry (`src/cli.ts`), run as a child process with Node's built-in type
 * stripping: argv, the version from package.json, exit codes, and non-TTY behaviour.
 */
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, test } from 'vitest'
import { assertUniquePaths } from '../src/render.ts'
import { PKG_ROOT } from './helpers.ts'

const exec = promisify(execFile)
const cli = join(PKG_ROOT, 'src', 'cli.ts')

async function run(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await exec(process.execPath, [cli, ...args], { cwd: PKG_ROOT })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string }
    return { code: e.code, stdout: e.stdout, stderr: e.stderr }
  }
}

describe('create-strutvane binary', () => {
  test('--version prints the package version', async () => {
    const pkg = JSON.parse(await readFile(join(PKG_ROOT, 'package.json'), 'utf8')) as {
      version: string
    }
    const result = await run('--version')
    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe(pkg.version)
  })

  test('--help prints usage', async () => {
    const result = await run('--help')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Usage:')
  })

  test('a bad flag exits with 1', async () => {
    const result = await run('--definitely-not-a-flag')
    expect(result.code).toBe(1)
    expect(`${result.stdout}${result.stderr}`).toContain('unknown option')
  })
})

describe('assertUniquePaths', () => {
  test('refuses two files with the same path', () => {
    expect(() =>
      assertUniquePaths([
        { path: 'a.ts', content: '' },
        { path: 'a.ts', content: 'x' },
      ]),
    ).toThrow(/two templates generate a\.ts/)
    expect(() => assertUniquePaths([{ path: 'a.ts', content: '' }])).not.toThrow()
  })
})
