/**
 * Turn validated options into the complete list of files to write.
 *
 * Pure: no disk access, no randomness. `.env` and `.env.example` are not in this list: they are
 * written from the returned env sections through devkit's env editor (which generates secrets and
 * keeps secrets out of `.env.example`).
 *
 * @module
 */
import type { GeneratedFile } from '@strutvane/devkit'
import { buildEnvSpec, type EnvSection } from './env-spec.ts'
import type { ProjectOptions } from './options.ts'
import { appAndDatabaseFiles, strutvaneConfigFile } from './templates/app.ts'
import { ciFiles } from './templates/ci.ts'
import { configFiles } from './templates/config.ts'
import { dockerFiles } from './templates/docker.ts'
import { claudeFile, readmeFile } from './templates/docs.ts'
import { envFile, envSchemaFile } from './templates/env.ts'
import { rootFiles } from './templates/root.ts'
import { testFiles } from './templates/tests.ts'
import { file, lines } from './templates/util.ts'
import { webFiles } from './templates/web.ts'

/** Everything a project consists of. */
export interface RenderedProject {
  /** Files sorted by path (POSIX, project-relative). */
  readonly files: readonly GeneratedFile[]
  /** Environment sections for `.env` / `.env.example`, in order. */
  readonly env: readonly EnvSection[]
}

/**
 * `.strutvane/README.md`: explains the state folder to anyone who opens it. Which parts are
 * committed follows ADR-0012 and must match the generated `.gitignore` (a test checks both).
 */
function stateReadme(): GeneratedFile {
  return file(
    '.strutvane/README.md',
    lines(
      '# .strutvane',
      '',
      'Managed by Strutvane. Do not edit files here by hand.',
      '',
      'Committed (shared by the team, needed by `sv upgrade` to merge template changes):',
      '',
      '- `lock.json`: which files were ejected, from which template version, with their hashes',
      '- `base/`: the original template output of each ejected file (the merge base)',
      '- `templates/`: generator templates you ejected to customise (`sv eject templates`)',
      '',
      'Git-ignored (local, rebuilt on `dev` / `build`):',
      '',
      '- `registry.gen.ts` and other `*.gen.ts` files: generated registry and types',
      '- `staging/`: the temporary area for safe, all-or-nothing file changes',
    ),
  )
}

/** Render every file for `options`. Throws if two templates claim the same path (a template bug). */
export function renderProject(options: ProjectOptions): RenderedProject {
  const env = buildEnvSpec(options)
  const files = [
    ...rootFiles(options),
    envSchemaFile(env),
    envFile(),
    strutvaneConfigFile(options),
    ...configFiles(options),
    ...appAndDatabaseFiles(options),
    ...webFiles(options),
    ...testFiles(options, env),
    ...dockerFiles(options),
    ...ciFiles(options),
    readmeFile(options, env),
    claudeFile(options),
    stateReadme(),
  ]
  assertUniquePaths(files)
  return { files: [...files].sort((a, b) => (a.path < b.path ? -1 : 1)), env }
}

/** Two templates writing the same path is a bug in create-strutvane: fail loudly, never merge. */
export function assertUniquePaths(files: readonly GeneratedFile[]): void {
  const seen = new Set<string>()
  for (const f of files) {
    if (seen.has(f.path)) throw new Error(`internal error: two templates generate ${f.path}`)
    seen.add(f.path)
  }
}

/** An ASCII tree of paths, for `--dry-run` and the final summary. */
export function renderTree(root: string, paths: readonly string[]): string {
  interface Node {
    readonly children: Map<string, Node>
  }
  const top: Node = { children: new Map() }
  for (const path of paths) {
    let node = top
    for (const part of path.split('/')) {
      let next = node.children.get(part)
      if (next === undefined) {
        next = { children: new Map() }
        node.children.set(part, next)
      }
      node = next
    }
  }
  const out = [`${root}/`]
  const walk = (node: Node, prefix: string): void => {
    // Folders first, then files; each group alphabetical (how editors show a project).
    const entries = [...node.children.entries()].sort(([a, na], [b, nb]) => {
      const dirA = na.children.size > 0
      const dirB = nb.children.size > 0
      if (dirA !== dirB) return dirA ? -1 : 1
      return a < b ? -1 : 1
    })
    entries.forEach(([name, child], i) => {
      const last = i === entries.length - 1
      const isDir = child.children.size > 0
      out.push(`${prefix}${last ? '└─ ' : '├─ '}${name}${isDir ? '/' : ''}`)
      if (isDir) walk(child, `${prefix}${last ? '   ' : '│  '}`)
    })
  }
  walk(top, '')
  return out.join('\n')
}
