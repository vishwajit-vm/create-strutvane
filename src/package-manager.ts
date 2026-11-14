/**
 * Package-manager-specific commands, so generated READMEs, CLAUDE.md files and CI workflows show
 * exactly the commands that work with the user's choice.
 *
 * @module
 */
import type { PackageManager } from './options.ts'
import { VERSIONS } from './versions.ts'

/** The command that runs a package.json script, e.g. `pnpm dev` / `npm run dev`. */
export function runScript(pm: PackageManager, script: string): string {
  switch (pm) {
    case 'npm':
      return `npm run ${script}`
    case 'bun':
      return `bun run ${script}`
    default:
      return `${pm} ${script}`
  }
}

/** The command that runs the Strutvane CLI through the `sv` script, e.g. `pnpm sv make:model Post`. */
export function svCommand(pm: PackageManager, args: string): string {
  return pm === 'npm' ? `npm run sv -- ${args}` : `${runScript(pm, 'sv')} ${args}`
}

/** The install command (locally). */
export function installCommand(pm: PackageManager): string {
  return pm === 'yarn' ? 'yarn install' : `${pm} install`
}

/** The install command for CI (lockfile must match). */
export function ciInstallCommand(pm: PackageManager): string {
  switch (pm) {
    case 'pnpm':
      return 'pnpm install --frozen-lockfile'
    case 'npm':
      return 'npm ci'
    case 'yarn':
      // Yarn 1 and Yarn 2+ both accept --frozen-lockfile (Yarn 2+ maps it to --immutable).
      return 'yarn install --frozen-lockfile'
    case 'bun':
      return 'bun install --frozen-lockfile'
  }
}

/**
 * How to run the package manager through Corepack when it is not on the PATH, e.g.
 * `corepack pnpm@12.18.0`, or `undefined` when there is nothing pinned to run.
 *
 * Only pnpm projects pin a version (`packageManager` in the generated package.json), so only pnpm
 * gets a Corepack fallback; it uses exactly that pinned version.
 */
export function corepackRunner(pm: PackageManager): string | undefined {
  return pm === 'pnpm' ? `corepack pnpm@${VERSIONS.pnpm}` : undefined
}
