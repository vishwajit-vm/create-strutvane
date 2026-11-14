/**
 * The "Next steps" note printed after a project is created: the commands to run, in order, for the
 * chosen package manager.
 *
 * @module
 */
import { relative } from 'node:path'
import { hasServer, type ProjectOptions, persistentIdentity } from './options.ts'
import { corepackRunner, installCommand, runScript, svCommand } from './package-manager.ts'

/** Quote a path for a copy-paste shell command when it contains spaces. */
function shellPath(path: string): string {
  return /\s/.test(path) ? `"${path}"` : path
}

/**
 * The commands to run next, one per line.
 *
 * - `cd <folder>` only when the project is not the current folder (`cd .` would be noise).
 * - The install step only when dependencies were not installed already.
 * - `sv auth:migration` before `sv migrate` when auth keeps identity in the app's PostgreSQL
 *   database ({@link persistentIdentity}): the app refuses to boot until those tables exist.
 * - For pnpm, a last line with the Corepack fallback: the generated `packageManager` field pins a
 *   pnpm version, and people who ran `npm create` often have no `pnpm` on their PATH.
 *
 * @param cwd The folder the CLI was run from (the `cd` is relative to it).
 * @param installed Whether the post steps installed the dependencies.
 */
export function nextSteps(options: ProjectOptions, cwd: string, installed: boolean): string {
  const pm = options.packageManager
  const run = (s: string) => runScript(pm, s)
  const steps: string[] = []
  const folder = relative(cwd, options.directory)
  if (folder !== '') steps.push(`cd ${shellPath(folder)}`)
  if (!installed) steps.push(installCommand(pm))
  if (options.docker !== 'off') steps.push(run('services:up'))
  if (persistentIdentity(options)) steps.push(svCommand(pm, 'auth:migration'))
  if (hasServer(options)) steps.push(svCommand(pm, 'migrate'), svCommand(pm, 'db:seed'))
  steps.push(run('dev'))
  const corepack = corepackRunner(pm)
  if (corepack !== undefined) steps.push('', `${pm} not installed? use: ${corepack} <command>`)
  return steps.join('\n')
}
