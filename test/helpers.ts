/**
 * Shared test helpers: temp folders, deterministic secrets, and running the real tools (tsc,
 * Biome, git, Vitest) against generated projects.
 */
import { execFile } from 'node:child_process'
import { lstat, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
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
export const STUBS = `declare module '@strutvane/framework/http' {
  export const route: {
    get(path: string, definition: { public?: boolean; permission?: string; handler: () => unknown }): unknown
  }
}
declare module '@strutvane/framework/database' {
  // Mirrors packages/framework/src/runtime/seeders.ts (both overloads).
  export interface SeedFactory {
    createMany(target: SeederContext, count: number, overrides?: never, scope?: object): Promise<unknown[]>
  }
  export interface SeederContext {
    readonly db: object
    repository(model: object | string): object
    create(factory: SeedFactory, count?: number, scope?: object): Promise<unknown[]>
    call(seeder: Seeder): Promise<void>
  }
  export interface Seeder {
    readonly name: string
    run(context: SeederContext): Promise<void> | void
  }
  export function defineSeeder(name: string, run: Seeder['run']): Seeder
  export function defineSeeder(seeder: { readonly name?: string; readonly run: Seeder['run'] }): Seeder
}
declare module '@strutvane/framework/provider' {
  const provider: object
  export default provider
}
declare module '@strutvane/auth' {
  export function defineAuthConfig<const T extends object>(config: T): T
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

/**
 * The built type declarations of the sibling `@strutvane/auth` checkout (local workspace layout
 * only; it is unpublished, so the regular type-check uses a stub).
 */
export const AUTH_TYPES: string = join(PKG_ROOT, '..', 'auth', 'dist', 'index.d.mts')

/**
 * Type-check the generated `config/auth.ts` against the REAL `@strutvane/auth` types
 * (`defineAuthConfig` rejects unknown keys and wrong value shapes), not the stub.
 */
export async function typecheckAuthConfig(dir: string): Promise<ToolResult> {
  const config = join(dir, 'tsconfig.auth-check.json')
  await writeFile(
    config,
    JSON.stringify({
      extends: './tsconfig.json',
      compilerOptions: { paths: { '@strutvane/auth': [AUTH_TYPES.split(sep).join('/')] } },
      include: ['config/auth.ts'],
    }),
  )
  try {
    return await tool(process.execPath, [BIN.tsc, '--noEmit', '-p', config], dir)
  } finally {
    await rm(config, { force: true })
  }
}

/**
 * The sibling `@strutvane/ui` checkout (local workspace layout only). Its built `dist/` typings
 * must include the app shell (`StrutvaneApp`, `RouteDefinition`: 0.1.0-next.1 and later; rebuild
 * with `tsdown` in ../ui when they are missing), and its `node_modules` has the React and TanStack
 * types the generated `web/` needs (this repo installs no browser packages).
 */
export const UI_ROOT: string = join(PKG_ROOT, '..', 'ui')
export const UI_TYPES: string = join(UI_ROOT, 'dist', 'react', 'index.d.mts')

/**
 * Type-check the generated `web/` folder (its own tsconfig: DOM, JSX, strict) against the REAL
 * `@strutvane/ui` typings, not a stub, so a template that uses a prop or export the package does
 * not have is a compile error. `vite/client` is replaced by a two-line `import.meta.env` shim.
 */
export async function typecheckWeb(dir: string): Promise<ToolResult> {
  const posixPath = (...parts: string[]) =>
    join(...parts)
      .split(sep)
      .join('/')
  const config = join(dir, 'web', 'tsconfig.ui-check.json')
  const shim = join(dir, 'web', 'env.ui-check.d.ts')
  await writeFile(
    shim,
    // The two declarations of `vite/client` that web/ relies on (its own shapes, `any` included).
    [
      '// biome-ignore lint: test-only shim',
      'interface ImportMetaEnv { readonly [key: string]: any }',
      'interface ImportMeta { readonly env: ImportMetaEnv }',
      "declare module '*.css' {}",
      '',
    ].join('\n'),
  )
  await writeFile(
    config,
    JSON.stringify({
      extends: './tsconfig.json',
      compilerOptions: {
        types: [],
        paths: {
          '@strutvane/ui': [posixPath(UI_ROOT, 'dist', 'index.d.mts')],
          '@strutvane/ui/react': [posixPath(UI_ROOT, 'dist', 'react', 'index.d.mts')],
          '*': [
            posixPath(UI_ROOT, 'node_modules', '@types', '*'),
            posixPath(UI_ROOT, 'node_modules', '*'),
          ],
        },
      },
      include: ['.'],
    }),
  )
  try {
    return await tool(process.execPath, [BIN.tsc, '--noEmit', '-p', config], dir)
  } finally {
    await rm(config, { force: true })
    await rm(shim, { force: true })
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
