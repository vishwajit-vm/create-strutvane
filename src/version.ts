/**
 * Every version the installer writes into a new app, in one place.
 *
 * Why one module: the generated `package.json`, `strutvane.json`, the catalogue's compatibility
 * check and the `--version` output must never disagree, and a release changes exactly these lines.
 *
 * @module
 */
import manifest from '../package.json' with { type: 'json' }

/**
 * The installer's own version, read from its package.json so `changeset version` is the only
 * place it changes.
 *
 * @example
 * VERSION // '1.0.0-next.0'
 */
export const VERSION: string = manifest.version

/**
 * The framework release generated apps depend on: the merged `@strutvane/framework`, which
 * absorbed core, contracts, cli and devkit (hub release/0.2/patches, B7). Generated apps name only
 * this package and the ones the answers bring, never an absorbed one.
 *
 * Why a caret range on a pre-release: `^0.2.0-next.0` accepts the later pre-releases of 0.2.0 and
 * the 0.2.x releases, so an app created today keeps installing when 0.2.0 itself ships.
 */
export const FRAMEWORK_RANGE = '^0.2.0-next.0'

/**
 * The lowest @strutvane/auth a generated app may install: 0.2.0-next.1 is the first with
 * `createFirstAdmin()`, `FirstAdminError` and `auth:migration`, which the first-admin seeder and
 * the migrate step use. Within the core train, but with its own floor: an older auth would make
 * the seeder fail to import.
 */
export const AUTH_RANGE = '^0.2.0-next.1'

/**
 * The framework version catalogue ranges are checked against: the lowest version
 * {@link FRAMEWORK_RANGE} accepts. A pre-release satisfies no catalogue range (they name releases
 * only), so add-ons are offered once the framework they declare is released (fail closed).
 */
export const FRAMEWORK_VERSION = '0.2.0-next.0'

/**
 * The core train (blueprint §3.3 item 5): framework, auth, ui and the first-party designs are
 * released together with this installer, so they are always available and use one range. Every
 * other package comes from the catalogue.
 *
 * @example
 * CORE_TRAIN.includes('@strutvane/auth') // true
 */
export const CORE_TRAIN: readonly string[] = Object.freeze([
  '@strutvane/framework',
  '@strutvane/auth',
  '@strutvane/ui',
  '@strutvane/design-crisp',
  '@strutvane/design-vivid',
])

/**
 * Packages merged into `@strutvane/framework` (or split out of it) that must never appear in a
 * generated app: depending on one installs a second kernel, whose container tokens and error
 * classes do not match the framework's (integration finding C1).
 */
export const ABSORBED_PACKAGES: readonly string[] = Object.freeze([
  '@strutvane/core',
  '@strutvane/contracts',
  '@strutvane/cli',
  '@strutvane/devkit',
  '@strutvane/logs',
])

/** One pinned npm dependency. */
export interface PinnedPackage {
  readonly name: string
  readonly version: string
}

/**
 * Install scripts every generated app refuses, as package.json `"allowScripts"` entries.
 *
 * Why: the app's `.npmrc` sets `strict-allow-scripts`, so any dependency with an install script
 * that `allowScripts` does not cover fails the install or rebuild the moment scripts run (the
 * installer's `npm rebuild <allowlist>`, or a developer approving a package). The app's toolchain
 * (Vite, Vitest) pulls in `fsevents`, the macOS file-watching addon, whose install script only
 * rebuilds a native binary the package already ships prebuilt. On macOS every such rebuild failed
 * with ESTRICTALLOWSCRIPTS (other systems never install it: npm skips optional dependencies for
 * another `os`).
 *
 * Why a name-only `false` and not `"fsevents@2.3.3": false`: npm 11.19 pins approvals to a version
 * on purpose (you reviewed that release), but a refusal is name-only (what `npm deny-scripts`
 * writes) and covers every version. A pinned refusal would break again as soon as Vite moved to the
 * next fsevents release; refusing a script needs no review of the new version. Checked on
 * 2026-11-19 with npm 11.19.0 and the real fsevents 2.3.3 installed for darwin/arm64
 * (`--os=darwin --cpu=arm64`): no entry or `fsevents@2.3.2` fails, `"fsevents": false` installs.
 * `test/install-scripts.e2e.test.ts` repeats that check.
 */
export const REFUSED_INSTALL_SCRIPTS: Readonly<Record<string, false>> = Object.freeze({
  fsevents: false,
})

/**
 * Database drivers, pinned exactly (versions at least three days old when chosen). SQLite needs
 * none: the framework uses Node's built-in `node:sqlite`.
 */
export const DRIVERS: Readonly<Record<'mysql' | 'postgres', PinnedPackage>> = Object.freeze({
  mysql: Object.freeze({ name: 'mysql2', version: '3.24.6' }),
  postgres: Object.freeze({ name: 'pg', version: '8.23.1' }),
})

/** The test runner generated apps use (Vitest, decision #76), pinned exactly. */
export const VITEST: PinnedPackage = Object.freeze({ name: 'vitest', version: '5.1.0' })

/**
 * The npm dist-tag this installer is published under: pre-releases go to `next` (ADR-0018), so a
 * command printed by a pre-release must say `@next`; `@latest` would fetch another version (or,
 * before 1.0, the name placeholder). Every printed `npm create` / `npx` command uses this.
 *
 * @example
 * releaseTag('0.2.0-next.0') // 'next'
 * releaseTag('1.0.0')        // 'latest'
 */
export function releaseTag(version: string = VERSION): 'next' | 'latest' {
  return version.includes('-') ? 'next' : 'latest'
}
