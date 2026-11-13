/**
 * Interactive questions for every option that was not given as a flag.
 *
 * The questions talk to a small {@link Prompter} interface; {@link clackPrompter} implements it
 * with `@clack/prompts`, and tests use a scripted one. Cancelling (Ctrl+C / Esc) at any question
 * throws {@link CancelledError} before anything is written.
 *
 * @module
 */
import * as clack from '@clack/prompts'
import type { ParsedArgs } from './args.ts'
import {
  type AuthMethod,
  DEFAULTS,
  dockerServices,
  type Extra,
  type RawProjectInput,
} from './options.ts'
import { validateProjectName } from './validate-name.ts'

/** Returned by a {@link Prompter} when the user cancels. */
export const CANCEL: unique symbol = Symbol('cancel')
export type Cancel = typeof CANCEL

/** One choice in a select / multiselect. */
export interface Choice<T extends string> {
  readonly value: T
  readonly label: string
  readonly hint?: string
}

/** What the questions need from a prompt library. */
export interface Prompter {
  text(q: {
    readonly message: string
    readonly placeholder: string
    readonly validate: (value: string) => string | undefined
  }): Promise<string | Cancel>
  select<T extends string>(q: {
    readonly message: string
    readonly options: readonly Choice<T>[]
    readonly initialValue: T
  }): Promise<T | Cancel>
  multiselect<T extends string>(q: {
    readonly message: string
    readonly options: readonly Choice<T>[]
    readonly initialValues: readonly T[]
  }): Promise<T[] | Cancel>
  confirm(q: {
    readonly message: string
    readonly initialValue: boolean
  }): Promise<boolean | Cancel>
}

/** The user cancelled a question. Nothing has been written. */
export class CancelledError extends Error {
  constructor() {
    super('Cancelled. Nothing was created.')
    this.name = 'CancelledError'
  }
}

function answer<T>(value: T | Cancel): T {
  if (value === CANCEL) throw new CancelledError()
  return value
}

/** The `@clack/prompts` implementation. */
export const clackPrompter: Prompter = {
  async text(q) {
    const v = await clack.text({
      message: q.message,
      placeholder: q.placeholder,
      validate: (value) => q.validate(value ?? ''),
    })
    return clack.isCancel(v) ? CANCEL : v
  },
  async select(q) {
    const v = await clack.select({
      message: q.message,
      // clack's option type is a conditional type; our Choice is structurally the same.
      options: q.options.map((o) => ({
        value: o.value,
        label: o.label,
        ...(o.hint ? { hint: o.hint } : {}),
      })) as clack.Option<(typeof q.options)[number]['value']>[],
      initialValue: q.initialValue,
    })
    return clack.isCancel(v) ? CANCEL : v
  },
  async multiselect(q) {
    const v = await clack.multiselect({
      message: q.message,
      options: q.options.map((o) => ({
        value: o.value,
        label: o.label,
        ...(o.hint ? { hint: o.hint } : {}),
      })) as clack.Option<(typeof q.options)[number]['value']>[],
      initialValues: [...q.initialValues],
      required: false,
    })
    return clack.isCancel(v) ? CANCEL : v
  },
  async confirm(q) {
    const v = await clack.confirm({ message: q.message, initialValue: q.initialValue })
    return clack.isCancel(v) ? CANCEL : v
  },
}

const PRESET_CHOICES: readonly Choice<'full' | 'api' | 'ui'>[] = [
  { value: 'full', label: 'Full-stack', hint: 'API + database + generated UI' },
  { value: 'api', label: 'API only', hint: 'REST API + database' },
  { value: 'ui', label: 'UI only', hint: 'screens for an existing API' },
]

const DATABASE_CHOICES: readonly Choice<string>[] = [
  { value: 'postgres', label: 'PostgreSQL', hint: 'recommended; tenancy enforced by the database' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'sqlite', label: 'SQLite', hint: 'zero setup' },
  {
    value: 'azure-postgres',
    label: 'Azure Database for PostgreSQL',
    hint: 'passwordless (Entra ID)',
  },
  { value: 'azure-mysql', label: 'Azure Database for MySQL', hint: 'passwordless (Entra ID)' },
]

const AUTH_CHOICES: readonly Choice<AuthMethod>[] = [
  { value: 'email', label: 'Email + password' },
  { value: 'magic-link', label: 'Magic link (email)' },
  { value: 'google', label: 'Google' },
  { value: 'microsoft', label: 'Microsoft (Entra ID)' },
  { value: 'github', label: 'GitHub' },
]

const EXTRA_CHOICES: readonly Choice<Extra>[] = [
  { value: 'logs', label: 'Logs + log viewer', hint: '@strutvane/logs' },
  { value: 'queue', label: 'Background jobs' },
  { value: 'cache', label: 'Cache' },
  { value: 'mail', label: 'Email sending' },
  { value: 'audit', label: 'Audit log', hint: 'needs auth' },
  { value: 'otel', label: 'OpenTelemetry' },
]

/**
 * Ask for every option not in `args.given`. Returns the completed input (still to be validated by
 * `resolveOptions`). Throws {@link CancelledError} on cancel.
 */
export async function askMissing(args: ParsedArgs, prompter: Prompter): Promise<RawProjectInput> {
  const input: { -readonly [K in keyof RawProjectInput]: RawProjectInput[K] } = { ...args.input }
  const asked = (key: keyof RawProjectInput) => !args.given.has(key)

  if (asked('name')) {
    input.name = answer(
      await prompter.text({
        message: 'Project name',
        placeholder: 'acme-portal',
        validate: (v) => validateProjectName(v.trim())[0],
      }),
    ).trim()
  }
  if (asked('preset')) {
    input.preset = answer(
      await prompter.select({
        message: 'What are you building?',
        options: PRESET_CHOICES,
        initialValue: DEFAULTS.preset,
      }),
    )
  }
  const server = input.preset !== 'ui'
  if (server) {
    if (asked('database')) {
      input.database = answer(
        await prompter.select({
          message: 'Database',
          options: DATABASE_CHOICES,
          initialValue: DEFAULTS.database,
        }),
      )
    }
    if (asked('auth')) {
      input.auth = answer(
        await prompter.multiselect({
          message: 'Sign-in methods (none = no authentication)',
          options: AUTH_CHOICES,
          initialValues: DEFAULTS.auth,
        }),
      )
    }
    if (asked('tenancy') && (input.auth?.length ?? 0) > 0) {
      input.tenancy = answer(
        await prompter.confirm({
          message: 'Multi-tenant? (each customer company only sees its own data)',
          initialValue: DEFAULTS.tenancy,
        }),
      )
    }
    if (asked('extras')) {
      const hasAuth = (input.auth?.length ?? 0) > 0
      input.extras = answer(
        await prompter.multiselect({
          message: 'Extras',
          options: hasAuth ? EXTRA_CHOICES : EXTRA_CHOICES.filter((c) => c.value !== 'audit'),
          initialValues: DEFAULTS.extras,
        }),
      )
    }
  }
  const services = dockerServices({
    preset: input.preset ?? DEFAULTS.preset,
    database: server ? (input.database ?? DEFAULTS.database) : undefined,
    extras: input.extras ?? (server ? DEFAULTS.extras : []),
  })
  if (asked('docker') && services.length > 0) {
    input.docker = answer(
      await prompter.select({
        message: `Local services with Docker (${services.join(', ')})?`,
        options: [
          {
            value: 'local',
            label: 'Yes, local only',
            hint: 'docker/ is git-ignored (recommended)',
          },
          {
            value: 'commit',
            label: 'Yes, and commit the compose file',
            hint: 'shared with the team',
          },
          { value: 'off', label: 'No', hint: 'I run the services myself' },
        ],
        initialValue: 'local',
      }),
    )
  }
  if (asked('git')) {
    input.git = answer(
      await prompter.confirm({
        message: 'Create a git repository with a first commit?',
        initialValue: DEFAULTS.git,
      }),
    )
  }
  if (asked('install')) {
    input.install = answer(
      await prompter.confirm({
        message: 'Install dependencies now?',
        initialValue: DEFAULTS.install,
      }),
    )
  }
  return input
}
