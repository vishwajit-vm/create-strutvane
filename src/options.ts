/**
 * What the user chose, validated into one immutable {@link ProjectOptions} object.
 *
 * Every rule about which choices go together lives here, in one place, so the CLI, the prompts and
 * the programmatic API can never disagree. Validation collects **every** problem and reports them
 * together, so a user fixing their command line doesn't have to play whack-a-mole.
 *
 * @module
 */
import { isAbsolute, resolve } from 'node:path'
import { validateProjectName } from './validate-name.ts'

/** What kind of app to generate (docs/05 §2). */
export const PRESETS = ['full', 'api', 'ui'] as const
export type Preset = (typeof PRESETS)[number]

/** Supported databases (docs/06 §6). */
export const DATABASES = ['postgres', 'mysql', 'sqlite', 'azure-postgres', 'azure-mysql'] as const
export type Database = (typeof DATABASES)[number]

/** Sign-in methods offered by `@strutvane/auth`. */
export const AUTH_METHODS = ['email', 'magic-link', 'google', 'microsoft', 'github'] as const
export type AuthMethod = (typeof AUTH_METHODS)[number]

/** Optional capabilities. `logs` (`@strutvane/logs`) is on by default (RFC-0004). */
export const EXTRAS = ['queue', 'cache', 'mail', 'audit', 'otel', 'logs'] as const
export type Extra = (typeof EXTRAS)[number]

export const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun'] as const
export type PackageManager = (typeof PACKAGE_MANAGERS)[number]

/**
 * Local Docker services (ADR-0006):
 * - `local`: generate `docker/compose.yaml` and **git-ignore** it (default),
 * - `commit`: generate it and let the team commit it (opt-in),
 * - `off`: no Docker files at all.
 */
export const DOCKER_MODES = ['local', 'commit', 'off'] as const
export type DockerMode = (typeof DOCKER_MODES)[number]

/** Raw, possibly incomplete choices, as they come from flags or prompts. */
export interface ProjectInput {
  readonly name?: string
  /** Where to create the project. Defaults to `<cwd>/<name>`. */
  readonly directory?: string
  readonly preset?: Preset
  readonly database?: Database
  readonly auth?: readonly AuthMethod[]
  readonly tenancy?: boolean
  readonly extras?: readonly Extra[]
  readonly docker?: DockerMode
  readonly packageManager?: PackageManager
  readonly git?: boolean
  readonly install?: boolean
}

/**
 * The same choices as plain strings, as they arrive from a command line or a JavaScript caller.
 * {@link resolveOptions} accepts this and validates every value at runtime.
 */
export interface RawProjectInput {
  readonly name?: string
  readonly directory?: string
  readonly preset?: string
  readonly database?: string
  readonly auth?: readonly string[]
  readonly tenancy?: boolean
  readonly extras?: readonly string[]
  readonly docker?: string
  readonly packageManager?: string
  readonly git?: boolean
  readonly install?: boolean
}

/** Complete, validated choices. Everything downstream reads only this. */
export interface ProjectOptions {
  readonly name: string
  /** Absolute path of the project folder. */
  readonly directory: string
  readonly preset: Preset
  /** `undefined` for the `ui` preset (it talks to an existing API). */
  readonly database: Database | undefined
  /** Empty = no `@strutvane/auth`. Always empty for the `ui` preset. */
  readonly auth: readonly AuthMethod[]
  readonly tenancy: boolean
  readonly extras: readonly Extra[]
  readonly docker: DockerMode
  readonly packageManager: PackageManager
  readonly git: boolean
  readonly install: boolean
}

/** Every problem found in one set of choices. */
export class OptionsError extends Error {
  readonly problems: readonly string[]
  constructor(problems: readonly string[]) {
    super(`Invalid project options:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    this.name = 'OptionsError'
    this.problems = problems
  }
}

/** The shape of {@link DEFAULTS}. */
export interface Defaults {
  readonly preset: Preset
  readonly database: Database
  readonly auth: readonly AuthMethod[]
  readonly tenancy: boolean
  readonly extras: readonly Extra[]
  readonly packageManager: PackageManager
  readonly git: boolean
  readonly install: boolean
}

/** Default choices (docs/05 §2). Logs are installed by default (RFC-0004). */
export const DEFAULTS: Defaults = Object.freeze<Defaults>({
  preset: 'full',
  database: 'postgres',
  auth: ['email'],
  tenancy: false,
  extras: ['logs'],
  packageManager: 'pnpm',
  git: true,
  install: false,
})

/** Does the project use a server (framework) at all? */
export function hasServer(options: { readonly preset: string }): boolean {
  return options.preset !== 'ui'
}

/** Does the project have a web UI? */
export function hasWeb(options: { readonly preset: string }): boolean {
  return options.preset !== 'api'
}

/** The `AUTH_SESSION_DRIVER` default written to `.env` / `.env.example` (docs/07 §2.3). */
export const AUTH_SESSION_DRIVER_DEFAULT = 'database'

/** Databases `@strutvane/auth` treats as PostgreSQL. */
const POSTGRES_DATABASES: ReadonlySet<string> = new Set(['postgres', 'azure-postgres'])

/**
 * Does `@strutvane/auth` keep accounts and sessions in the app's own database? Only with auth on,
 * PostgreSQL (`postgres` / `azure-postgres`) and `session.driver: 'database'` (the generated
 * default). Then the app needs `better-auth` and the auth tables (`sv auth:migration`, then
 * `sv migrate`). Anywhere else auth uses its in-memory engine and warns at boot.
 */
export function persistentIdentity(options: {
  readonly preset: string
  readonly auth: readonly string[]
  readonly database: string | undefined
}): boolean {
  return (
    hasServer(options) &&
    options.auth.length > 0 &&
    POSTGRES_DATABASES.has(options.database ?? '') &&
    AUTH_SESSION_DRIVER_DEFAULT === 'database'
  )
}

/** Is a given extra enabled? */
export function hasExtra(options: { readonly extras: readonly string[] }, extra: Extra): boolean {
  return options.extras.includes(extra)
}

/** Which local services Docker should run for these choices (empty = nothing to run). */
export function dockerServices(options: {
  readonly preset: string
  readonly database: string | undefined
  readonly extras: readonly string[]
}): readonly ('postgres' | 'mysql' | 'valkey' | 'mailpit')[] {
  if (!hasServer(options)) return []
  const services: ('postgres' | 'mysql' | 'valkey' | 'mailpit')[] = []
  if (options.database === 'postgres') services.push('postgres')
  if (options.database === 'mysql') services.push('mysql')
  if (hasExtra(options, 'cache') || hasExtra(options, 'queue')) services.push('valkey')
  if (hasExtra(options, 'mail')) services.push('mailpit')
  return services
}

/**
 * Guess the package manager from how the starter was launched (`npm create`, `pnpm create`, …).
 * `npm_config_user_agent` looks like `pnpm/12.18.0 npm/? node/v24.21.0 win32 x64`.
 */
export function detectPackageManager(userAgent: string | undefined): PackageManager {
  const name = userAgent?.split(' ')[0]?.split('/')[0]
  return name && (PACKAGE_MANAGERS as readonly string[]).includes(name)
    ? (name as PackageManager)
    : DEFAULTS.packageManager
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function checkList<T extends string>(
  label: string,
  values: readonly string[] | undefined,
  allowed: readonly T[],
  problems: string[],
): T[] | undefined {
  if (values === undefined) return undefined
  const bad = values.filter((v) => !(allowed as readonly string[]).includes(v))
  if (bad.length > 0)
    problems.push(`unknown ${label} "${bad.join('", "')}" (choose from: ${allowed.join(', ')})`)
  return unique(values.filter((v): v is T => (allowed as readonly string[]).includes(v)))
}

function checkOne<T extends string>(
  label: string,
  value: string | undefined,
  allowed: readonly T[],
  problems: string[],
): T | undefined {
  if (value === undefined) return undefined
  if (!(allowed as readonly string[]).includes(value)) {
    problems.push(`unknown ${label} "${value}" (choose from: ${allowed.join(', ')})`)
    return undefined
  }
  return value as T
}

/**
 * Fill in defaults and validate. Throws {@link OptionsError} listing every problem.
 * Returns the options plus non-fatal `warnings` (e.g. Docker requested but nothing to run).
 */
export function resolveOptions(
  input: RawProjectInput,
  context: { readonly cwd: string; readonly userAgent?: string | undefined },
): { readonly options: ProjectOptions; readonly warnings: readonly string[] } {
  const problems: string[] = []
  const warnings: string[] = []

  const name = input.name?.trim() ?? ''
  for (const p of validateProjectName(name)) problems.push(p)

  const preset = checkOne('preset', input.preset, PRESETS, problems) ?? DEFAULTS.preset
  const server = preset !== 'ui'

  let database = checkOne('database', input.database, DATABASES, problems)
  let auth = checkList('auth method', input.auth, AUTH_METHODS, problems)
  let extras = checkList('extra', input.extras, EXTRAS, problems)
  const docker = checkOne('docker mode', input.docker, DOCKER_MODES, problems)
  const packageManager =
    checkOne('package manager', input.packageManager, PACKAGE_MANAGERS, problems) ??
    detectPackageManager(context.userAgent)
  let tenancy = input.tenancy

  if (!server) {
    // The ui preset connects to an existing API: server-side choices don't apply. Refuse them when
    // given explicitly (silently ignoring them would surprise the user later).
    if (database !== undefined)
      problems.push('the "ui" preset has no database (it connects to an existing API)')
    if (auth !== undefined && auth.length > 0)
      problems.push(
        'the "ui" preset has no server-side auth (sign-in comes from the API it connects to)',
      )
    if (tenancy === true) problems.push('the "ui" preset has no server-side tenancy')
    if (extras !== undefined && extras.length > 0)
      problems.push('extras are server-side and not available for the "ui" preset')
    database = undefined
    auth = []
    extras = []
    tenancy = false
  } else {
    database ??= DEFAULTS.database
    auth ??= [...DEFAULTS.auth]
    extras ??= [...DEFAULTS.extras]
    tenancy ??= DEFAULTS.tenancy
    if (tenancy && auth.length === 0)
      problems.push(
        'multi-tenancy needs authentication (tenants come from signed-in users): add --auth',
      )
    if (extras.includes('audit') && auth.length === 0)
      problems.push('the audit log needs authentication (it records who did what): add --auth')
  }

  const resolvedDirectory =
    input.directory === undefined
      ? resolve(context.cwd, name)
      : isAbsolute(input.directory)
        ? input.directory
        : resolve(context.cwd, input.directory)

  const draft = { preset, database, extras: extras ?? [] }
  const services = dockerServices(draft)
  let dockerMode: DockerMode = docker ?? (services.length > 0 ? 'local' : 'off')
  if (dockerMode !== 'off' && services.length === 0) {
    if (docker !== undefined)
      warnings.push(
        'Docker was requested but these choices need no local services, so no compose file is generated.',
      )
    dockerMode = 'off'
  }

  if (problems.length > 0) throw new OptionsError(problems)

  // Stable order makes generated output deterministic regardless of the order choices were given.
  const orderBy = <T extends string>(values: readonly T[], order: readonly T[]) =>
    [...values].sort((a, b) => order.indexOf(a) - order.indexOf(b))

  const options: ProjectOptions = Object.freeze({
    name,
    directory: resolvedDirectory,
    preset,
    database,
    auth: Object.freeze(orderBy(auth ?? [], AUTH_METHODS)),
    tenancy: tenancy ?? false,
    extras: Object.freeze(orderBy(extras ?? [], EXTRAS)),
    docker: dockerMode,
    packageManager,
    git: input.git ?? DEFAULTS.git,
    install: input.install ?? DEFAULTS.install,
  })
  return { options, warnings }
}
