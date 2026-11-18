/**
 * The app part of a new project, rendered from the vendored strutvane-skeleton with the
 * skeleton's own renderer (`renderSkeleton` / `resolveAnswers`), so there is one app layout,
 * tested and booted in the skeleton repo, and the installer only applies answers (skeleton
 * INSTALLER.md §2).
 *
 * What this module does, step by step:
 * 1. map the installer's {@link ProjectOptions} to the skeleton's answers ({@link skeletonAnswers});
 * 2. `resolveAnswers` checks them (unknown answers and values are refused, never defaulted);
 * 3. `renderSkeleton` returns the files whose `when` holds, with placeholders and `@strut:if`
 *    blocks applied and the answer-dependent package.json entries;
 * 4. `answers`-mode files are rewritten by the installer generator the manifest names, and an
 *    unknown generator stops the run (fail closed: a newer skeleton needs a newer installer).
 *
 * Everything else the installer adds (secrets, Docker, CI, answer-only configs) is in
 * `templates/project.ts`.
 *
 * @module
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadManifest, type Manifest, resolveAnswers } from '../../skeleton/src/manifest.ts'
import { renderSkeleton } from '../../skeleton/src/render.ts'
import type { ProjectOptions } from '../options.ts'
import { packageRoot } from '../package-root.ts'
import type { GeneratedFile } from '../templates/app-files.ts'
import { SKELETON_FOLDER, storedPath } from './vendor-record.ts'

/** Writes one `answers`-mode file from the options (skeleton.json names it as `generator`). */
export type AnswerGenerator = (options: ProjectOptions) => string

/** The vendored skeleton folder. */
export function skeletonRoot(): string {
  return join(packageRoot(), SKELETON_FOLDER)
}

let manifestCache: Manifest | undefined

/**
 * The vendored `skeleton.json`, validated once per process.
 *
 * @example
 * skeletonManifest().framework // '^0.2.0-next.0'
 */
export function skeletonManifest(): Manifest {
  manifestCache ??= loadManifest(join(skeletonRoot(), 'skeleton.json'))
  return manifestCache
}

/** Template files never change while the installer runs: read each one once. */
const contents = new Map<string, string>()

/**
 * Read a template file by the path the renderer asks for. The vendored copy stores `.gitignore`
 * and `.npmrc` as `_gitignore` and `_npmrc` (npm pack drops them), so map the name first.
 */
function readTemplate(path: string): string {
  const stored = storedPath(path.split('\\').join('/'))
  let text = contents.get(stored)
  if (text === undefined) {
    text = readFileSync(stored, 'utf8')
    contents.set(stored, text)
  }
  return text
}

/**
 * The skeleton's answers for these options (skeleton INSTALLER.md §2, the mapping table).
 * Booleans become the strings `true` / `false`, as the manifest wants them.
 *
 * @example
 * skeletonAnswers(options) // { name: 'acme', ui: 'admin', design: 'crisp', auth: 'email', ... }
 */
export function skeletonAnswers(options: ProjectOptions): Record<string, string> {
  return {
    name: options.name,
    // No UI starter means the API-only stack.
    ui: options.ui ?? 'none',
    // Ignored by the skeleton when ui is none; crisp is the default design.
    design: options.design ?? 'crisp',
    auth: options.auth,
    teams: String(options.teams),
    database: options.database,
    docker: String(options.docker),
    testing: options.testing,
    locale: options.locale,
    timezone: options.timezone,
    currency: options.currency,
  }
}

/**
 * Render the skeleton for these options. `generators` writes the `answers`-mode files; a file
 * whose generator is not in the map stops the run with a message that says what to update.
 *
 * @example
 * renderSkeletonApp(options, { configAuth, tenancyConfig }).map((f) => f.path)
 */
export function renderSkeletonApp(
  options: ProjectOptions,
  generators: Readonly<Record<string, AnswerGenerator>>,
): GeneratedFile[] {
  const manifest = skeletonManifest()
  const answers = resolveAnswers(manifest, skeletonAnswers(options))
  const modes = new Map(manifest.files.map((spec) => [spec.path, spec]))
  return renderSkeleton({ root: skeletonRoot(), manifest, answers, read: readTemplate }).map(
    (file) => {
      const spec = modes.get(file.path)
      if (spec?.mode !== 'answers') return file
      const generator = spec.generator === undefined ? undefined : generators[spec.generator]
      if (generator === undefined) {
        throw new Error(
          `The skeleton wants ${file.path} written by "${spec.generator ?? '(none)'}", which this create-strutvane does not have. Vendor a matching skeleton (npm run vendor:skeleton) or update the installer.`,
        )
      }
      return { path: file.path, content: generator(options) }
    },
  )
}
