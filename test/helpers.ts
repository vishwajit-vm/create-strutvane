/**
 * Shared test helpers: temp folders, deterministic secrets, and running the real tools (tsc,
 * Biome, git, Vitest) against generated projects.
 */
import { execFile } from 'node:child_process'
import { lstat, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createProject } from '../src/generate.ts'
import { type ProjectOptions, type RawProjectInput, resolveOptions } from '../src/options.ts'

const exec = promisify(execFile)

/** This package's root (where node_modules with typescript, biome, vitest, zod and core live). */
export const PKG_ROOT: string = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = {
  tsc: join(PKG_ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
  vitest: join(PKG_ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
}

/** A fresh, empty temp folder. */
export async function tempDir(prefix = 'csv-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

/**
 * Remove a temp folder. A linked `node_modules` is unlinked first so the removal can never follow
 * the link into this package's real dependencies.
 */
export async function removeDir(dir: string): Promise<void> {
  const link = join(dir, 'node_modules')
  try {
    if ((await lstat(link)).isSymbolicLink()) await unlink(link)
  } catch {
    // no link
  }
  await rm(dir, { recursive: true, force: true })
}

/** Deterministic secrets: `test-secret-01-…`, padded to 43 chars like real base64url secrets. */
export function secretSequence(): () => string {
  let n = 0
  return () => {
    n++
    return `test-secret-${String(n).padStart(2, '0')}`.padEnd(43, 'x')
  }
}

/** Validated options for `input`, created under `cwd`. */
export function optionsFor(input: RawProjectInput, cwd: string): ProjectOptions {
  return resolveOptions({ git: false, ...input }, { cwd, userAgent: undefined }).options
}

/** Generate a project for `input` in a new temp folder. Returns the options (directory inside). */
export async function generate(
  input: RawProjectInput,
): Promise<{ readonly options: ProjectOptions; readonly root: string }> {
  const root = await tempDir()
  const options = optionsFor(input, root)
  await createProject(options, { generateSecret: secretSequence() })
  return { options, root }
}

/**
 * Minimal type stubs for packages that are not published yet (framework, auth, logs) and for
 * browser tooling not installed in this repo (Playwright, Vite). Only the surface the templates use.
 */
export const STUBS = `declare module '@strutvane/framework' {
  interface FieldBuilder {
    label(text: string): FieldBuilder
    searchable(): FieldBuilder
    unique(): FieldBuilder
  }
  export const field: { string(): FieldBuilder; email(): FieldBuilder }
  export function defineModel(name: string, fields: Record<string, FieldBuilder>, options?: object): unknown
}
declare module '@strutvane/framework/http' {
  export const route: {
    get(path: string, definition: { public?: boolean; permission?: string; handler: () => unknown }): unknown
  }
}
declare module '@strutvane/framework/database' {
  export function defineSeeder(definition: { run(): Promise<void> }): unknown
}
declare module '@strutvane/framework/provider' {
  const provider: object
  export default provider
}
declare module '@strutvane/auth/provider' {
  const provider: object
  export default provider
}
declare module '@strutvane/logs/provider' {
  const provider: object
  export default provider
}
declare module '@playwright/test' {
  type Page = { goto(url: string): Promise<unknown> }
  export const test: (name: string, fn: (ctx: { page: Page }) => Promise<void>) => void
  export const expect: (page: Page) => { toHaveTitle(title: string): Promise<void> }
  export function defineConfig(config: object): object
  export const devices: Record<string, object>
}
declare module 'vite' {
  export function defineConfig(config: object): object
}
declare module '@vitejs/plugin-react' {
  export default function react(): object
}
`

/** Link this package's node_modules into a generated project (a junction on Windows: no admin). */
export async function linkNodeModules(dir: string): Promise<void> {
  await symlink(join(PKG_ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction')
}

/** Result of a tool run. */
export interface ToolResult {
  readonly code: number
  readonly output: string
}

async function tool(command: string, args: readonly string[], cwd: string): Promise<ToolResult> {
  try {
    const { stdout, stderr } = await exec(command, [...args], {
      cwd,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    })
    return { code: 0, output: stdout + stderr }
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string; message: string }
    return {
      code: typeof e.code === 'number' ? e.code : 1,
      output: `${e.stdout ?? ''}${e.stderr ?? e.message}`,
    }
  }
}

/** `tsc --noEmit -p <dir>` with the stubs written next to the project's own files. */
export async function typecheck(dir: string): Promise<ToolResult> {
  const stubs = join(dir, 'stubs.d.ts')
  await writeFile(stubs, STUBS)
  try {
    return await tool(process.execPath, [BIN.tsc, '--noEmit', '-p', dir], dir)
  } finally {
    await rm(stubs, { force: true })
  }
}

/** `biome check` with the project's own biome.json (formatting + lint + import order). */
export async function biomeCheck(dir: string): Promise<ToolResult> {
  const bin = join(PKG_ROOT, 'node_modules', '@biomejs', 'biome', 'bin', 'biome')
  return tool(process.execPath, [bin, 'check', '--no-errors-on-unmatched', '.'], dir)
}

/** Run the generated project's own Vitest suite. */
export async function vitestRun(dir: string): Promise<ToolResult> {
  return tool(process.execPath, [BIN.vitest, 'run', '--root', dir], dir)
}

/** Run git in `dir` with a fixed identity (never the developer's own config). */
export async function git(dir: string, ...args: string[]): Promise<ToolResult> {
  return tool(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    dir,
  )
}
