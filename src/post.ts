/**
 * Steps after the files are written: `git init` + first commit, and (only with `--install`) the
 * dependency install. Both are best-effort: a failure here never deletes the generated project,
 * it becomes a warning with the command to run by hand.
 *
 * Commands run without a shell (fixed arguments, no injection surface), except the package manager
 * on Windows, where `pnpm`/`npm` are `.cmd` shims that need one; its arguments are constants.
 *
 * @module
 */
import { spawn } from 'node:child_process'
import type { ProjectOptions } from './options.ts'
import { installCommand } from './package-manager.ts'

/** Result of one external command. */
export interface CommandResult {
  readonly code: number
  readonly output: string
}

/** Runs an external command in `cwd`. Injectable so tests never depend on the machine's tools. */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly inherit?: boolean; readonly shell?: boolean },
) => Promise<CommandResult>

/** The real runner: collects output, or streams it to the terminal with `inherit`. */
export const runCommand: CommandRunner = (command, args, options) =>
  new Promise((resolve) => {
    let output = ''
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      shell: options.shell ?? false,
      stdio: options.inherit === true ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.on('error', (error) => resolve({ code: -1, output: error.message }))
    child.on('close', (code) => resolve({ code: code ?? -1, output }))
  })

/** What happened to git. */
export type GitOutcome =
  | 'committed'
  | 'initialised'
  | 'inside-existing-repo'
  | 'unavailable'
  | 'skipped'

/** What the post steps did. */
export interface PostResult {
  readonly git: GitOutcome
  readonly installed: boolean
  readonly warnings: readonly string[]
}

export const INITIAL_COMMIT_MESSAGE = 'chore: initial commit from create-strutvane'

async function initGit(
  directory: string,
  run: CommandRunner,
  warnings: string[],
): Promise<GitOutcome> {
  const git = (...args: string[]) => run('git', args, { cwd: directory })
  if ((await git('--version')).code !== 0) {
    warnings.push(
      'git was not found, so no repository was created. Install git, then run: git init',
    )
    return 'unavailable'
  }
  // Inside another repository (e.g. a monorepo)? Then the project belongs to that repository.
  const inside = await git('rev-parse', '--is-inside-work-tree')
  if (inside.code === 0 && inside.output.trim() === 'true') return 'inside-existing-repo'

  const init = await git('init', '-b', 'main')
  if (init.code !== 0) {
    warnings.push(`git init failed: ${init.output.trim()}`)
    return 'unavailable'
  }
  await git('add', '-A')
  const commit = await git('commit', '-m', INITIAL_COMMIT_MESSAGE)
  if (commit.code !== 0) {
    warnings.push(
      'The repository was created but the first commit failed (is your git name/email set? git config --global user.email "you@example.com"). Commit when ready: git commit -m "initial commit"',
    )
    return 'initialised'
  }
  return 'committed'
}

/** Run the chosen post steps. Never throws for a failed command. */
export async function runPostSteps(
  options: ProjectOptions,
  run: CommandRunner = runCommand,
  platform: NodeJS.Platform = process.platform,
): Promise<PostResult> {
  const warnings: string[] = []
  // Install first, so the lockfile is part of the first commit.
  let installed = false
  if (options.install) {
    const result = await run(options.packageManager, ['install'], {
      cwd: options.directory,
      inherit: true,
      shell: platform === 'win32',
    })
    installed = result.code === 0
    if (!installed)
      warnings.push(
        `Installing dependencies failed. Run it yourself: ${installCommand(options.packageManager)}`,
      )
  }
  const git = options.git ? await initGit(options.directory, run, warnings) : 'skipped'
  return { git, installed, warnings }
}
