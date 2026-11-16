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
 * Why a caret range on a pre-release: `^0.1.0-next.1` accepts the later pre-releases of 0.1.0 and
 * the 0.1.x releases, so an app created today keeps installing when 0.1.0 itself ships.
 */
export const FRAMEWORK_RANGE = '^0.1.0-next.1'

/**
 * The framework version catalogue ranges are checked against: the lowest version
 * {@link FRAMEWORK_RANGE} accepts. A pre-release satisfies no catalogue range (they name releases
 * only), so add-ons are offered once the framework they declare is released (fail closed).
 */
export const FRAMEWORK_VERSION = '0.1.0-next.1'

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
 * Database drivers, pinned exactly (versions at least three days old when chosen). SQLite needs
 * none: the framework uses Node's built-in `node:sqlite`.
 */
export const DRIVERS: Readonly<Record<'mysql' | 'postgres', PinnedPackage>> = Object.freeze({
  mysql: Object.freeze({ name: 'mysql2', version: '3.24.6' }),
  postgres: Object.freeze({ name: 'pg', version: '8.23.1' }),
})

/** The test runner generated apps use (Vitest, decision #76), pinned exactly. */
export const VITEST: PinnedPackage = Object.freeze({ name: 'vitest', version: '5.1.0' })
