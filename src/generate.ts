/**
 * Write a project to disk, safely.
 *
 * Failure scenarios and what happens:
 * - **Target folder is not empty / is a file:** refused before anything is written
 *   ({@link TargetNotEmptyError}). Existing files are never overwritten.
 * - **A template or the env editor throws:** staged writes are discarded; nothing touched disk.
 * - **Writing fails halfway (disk full, permissions):** devkit's transaction rolls every file back,
 *   then the folder is removed if this run created it (or emptied again if it was empty before).
 * - **`--dry-run`:** the same staging runs against an in-memory view; nothing is written and the
 *   preview never contains a real secret.
 *
 * @module
 */
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createEnvEditor, createStagedFs, type DevkitIo, nodeIo } from '@strutvane/devkit'
import { applyExampleValues } from './env-spec.ts'
import type { ProjectOptions } from './options.ts'
import { renderProject, renderTree } from './render.ts'

/** The target folder exists and is not empty (or is not a folder). */
export class TargetNotEmptyError extends Error {
  readonly directory: string
  constructor(directory: string, reason: 'not-empty' | 'not-a-directory') {
    super(
      reason === 'not-empty'
        ? `${directory} already exists and is not empty. Choose a new folder name, or empty it first (nothing is ever overwritten).`
        : `${directory} exists and is not a folder.`,
    )
    this.name = 'TargetNotEmptyError'
    this.directory = directory
  }
}

/** Settings for {@link createProject}. */
export interface CreateProjectSettings {
  /** Preview only: return the tree and diff, write nothing. */
  readonly dryRun?: boolean
  /** Secret generator (tests inject a deterministic one). Default: 32 random bytes, base64url. */
  readonly generateSecret?: () => string
  /** File-system surface for the transaction (tests inject failures). Default: the real disk. */
  readonly io?: DevkitIo
}

/** What {@link createProject} did. */
export interface CreateProjectResult {
  readonly directory: string
  /** Every file written (or that would be written), sorted, POSIX paths. */
  readonly files: readonly string[]
  /** An ASCII tree of {@link files}. */
  readonly tree: string
  /** Unified diff of every file (dry run only; empty otherwise). */
  readonly diff: string
  /** Keys whose values were generated into `.env`. */
  readonly generatedSecrets: readonly string[]
  /** Values to show the user exactly once (the seeded admin password). Empty on a dry run. */
  readonly showOnce: readonly { readonly key: string; readonly value: string }[]
}

/** Shown in a dry-run preview instead of a generated secret. */
export const SECRET_PLACEHOLDER = 'generated-on-create'

/** Secrets the user needs to see once (they sign in with them). Other secrets stay in `.env` only. */
const SHOW_ONCE = ['SEED_ADMIN_PASSWORD'] as const

/** `missing`, `empty`, or throws {@link TargetNotEmptyError}. */
export async function checkTarget(directory: string): Promise<'missing' | 'empty'> {
  let info: Awaited<ReturnType<typeof stat>>
  try {
    info = await stat(directory)
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') return 'missing'
    throw error
  }
  if (!info.isDirectory()) throw new TargetNotEmptyError(directory, 'not-a-directory')
  if ((await readdir(directory)).length > 0) throw new TargetNotEmptyError(directory, 'not-empty')
  return 'empty'
}

/** Read one key's value from env-file text (values devkit writes are unquoted base64url). */
function envValue(text: string, key: string): string | undefined {
  const line = text.split(/\r?\n/).find((l) => l.startsWith(`${key}=`))
  return line?.slice(key.length + 1)
}

/** Put the target back the way it was: removed if we created it, emptied if it was empty. */
async function cleanUp(directory: string, state: 'missing' | 'empty'): Promise<void> {
  if (state === 'missing') {
    await rm(directory, { recursive: true, force: true })
    return
  }
  for (const entry of await readdir(directory)) {
    await rm(join(directory, entry), { recursive: true, force: true })
  }
}

/** Generate the project described by `options`. */
export async function createProject(
  options: ProjectOptions,
  settings: CreateProjectSettings = {},
): Promise<CreateProjectResult> {
  const dryRun = settings.dryRun ?? false
  const directory = options.directory
  const state = await checkTarget(directory)
  const { files, env } = renderProject(options)

  const fs = createStagedFs(directory, { io: settings.io ?? nodeIo })
  const generateSecret = dryRun ? () => SECRET_PLACEHOLDER : settings.generateSecret
  const envEditor = createEnvEditor(fs, generateSecret === undefined ? {} : { generateSecret })

  let committed = false
  try {
    for (const f of files) await fs.write(f.path, f.content)
    for (const section of env) await envEditor.ensure(section.title, section.vars)
    // `.env.example` is committed and copied to staging/production: give it the safe defaults
    // (e.g. APP_DEBUG=false) where they differ from the convenient local `.env` values.
    const example = await fs.read('.env.example')
    const safeExample = applyExampleValues(example, env)
    if (safeExample !== example) await fs.write('.env.example', safeExample, { overwrite: true })

    const changes = await fs.changes()
    const paths = changes.map((c) => c.path)
    const tree = renderTree(options.name, paths)
    const generatedSecrets = env.flatMap((s) =>
      s.vars.filter((v) => v.secret === true).map((v) => v.key),
    )

    if (dryRun) {
      const diff = await fs.diff()
      fs.discard()
      return { directory, files: paths, tree, diff, generatedSecrets, showOnce: [] }
    }

    const envText = await fs.read('.env')
    const showOnce = SHOW_ONCE.flatMap((key) => {
      const value = envValue(envText, key)
      return value === undefined ? [] : [{ key, value }]
    })

    await mkdir(directory, { recursive: true })
    committed = true // from here on, a failure must clean the folder up
    await fs.commit()
    return { directory, files: paths, tree, diff: '', generatedSecrets, showOnce }
  } catch (error) {
    fs.discard()
    if (committed) await cleanUp(directory, state)
    throw error
  }
}
