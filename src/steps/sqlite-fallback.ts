/**
 * "Continue without Docker (SQLite)": the way out when Docker is missing or not running, so the
 * app still starts.
 *
 * What it changes (and only this):
 * - `.env` and `.env.example`: `DB_CONNECTION=sqlite`, the SQLite file paths and mail to the log.
 *   A key the framework reads stays listed (decision #132: every key is in `.env`) with the value
 *   the new mode's own `.env.example` gives it (`DB_HOST=127.0.0.1`, an empty `DB_PASSWORD`);
 *   only Docker-only keys (`COMPOSE_PROJECT_NAME`, `FORWARD_*`, …) are commented out;
 * - `strutvane.json`: docker false, so `node strut` stops forwarding into a container;
 * - removes the git-ignored `docker/` folder (it would start containers nobody uses);
 * - rewrites README.md and AGENTS.md, which describe how the app runs;
 * - the stored options: `database: 'sqlite'`, `docker: false`.
 *
 * @module
 */
import { rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { commentOutEnvKey, parseEnv, setEnvValue } from '../env-file.ts'
import { answersOf, type ProjectOptions, resolveOptions } from '../options.ts'
import type { SetupState } from '../setup-state.ts'
import { buildEnvSections, type TypedSecrets } from '../templates/env.ts'
import { renderProject } from '../templates/project.ts'
import { type EnvFile, readEnvFile, writeEnvFile } from './env-io.ts'
import type { ConnectionAnswers } from './runner.ts'

/** Keys that only make sense with a database server or Docker. */
const SERVER_KEYS = [
  'DB_HOST',
  'DB_PORT',
  'FORWARD_DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_MIGRATION_USERNAME',
  'DB_MIGRATION_PASSWORD',
  'DB_ROOT_PASSWORD',
  'MAIL_HOST',
  'MAIL_PORT',
  'FORWARD_MAILPIT_PORT',
  'COMPOSE_PROJECT_NAME',
  'STRUT_UID',
  'STRUT_GID',
] as const

/** Files regenerated for the new mode (they describe how the app runs; none holds user edits yet). */
const REGENERATED: ReadonlySet<string> = new Set(['README.md', 'AGENTS.md', 'strutvane.json'])

/**
 * Retire `keys` the new mode does not use. A key the new mode's own `.env.example` lists
 * (`listed`: the framework reads it) keeps being listed with that file's neutral value, so `.env`
 * still holds every key (decision #132) and nothing secret from the old mode survives (a generated
 * Docker password becomes empty). A key it does not list (Docker-only) is commented out, so
 * nothing is lost if the user switches back later.
 *
 * @example
 * retireKeys('DB_HOST=db
STRUT_UID=1000
', ['DB_HOST', 'STRUT_UID'], new Map([['DB_HOST', '127.0.0.1']]))
 * // 'DB_HOST=127.0.0.1
# STRUT_UID=1000
'
 */
export function retireKeys(
  text: string,
  keys: readonly string[],
  listed: ReadonlyMap<string, string>,
): string {
  let next = text
  for (const key of keys) {
    const neutral = listed.get(key)
    next = neutral === undefined ? commentOutEnvKey(next, key) : setEnvValue(next, key, neutral)
  }
  return next
}

/** The keys (and values) of the `.env.example` a project with `options` gets. */
function exampleKeys(options: ProjectOptions, typed: TypedSecrets = {}): Map<string, string> {
  const example = renderProject(options, typed).find((file) => file.path === '.env.example')
  return parseEnv(example?.content ?? '')
}

/** Point one env file at SQLite. */
function sqliteEnv(text: string, listed: ReadonlyMap<string, string>): string {
  let next = setEnvValue(text, 'DB_CONNECTION', 'sqlite')
  next = setEnvValue(next, 'DB_DATABASE', 'database/database.sqlite')
  next = setEnvValue(next, 'DB_TEST_DATABASE', 'database/testing.sqlite')
  next = setEnvValue(next, 'MAIL_MAILER', 'log')
  return retireKeys(next, SERVER_KEYS, listed)
}

/**
 * Switch a created project to SQLite without Docker and return the updated state (the caller
 * saves it).
 *
 * @example
 * state = switchToSqlite('C:/code/my-app', state)
 */
export function switchToSqlite(directory: string, state: SetupState): SetupState {
  const stored = {
    ...state.options,
    database: 'sqlite' as const,
    docker: false,
    connection: undefined,
  }
  const options: ProjectOptions = { ...stored, directory }
  const listed = exampleKeys(options)
  const files: EnvFile[] = ['.env', '.env.example']
  for (const file of files)
    writeEnvFile(directory, file, sqliteEnv(readEnvFile(directory, file), listed))
  rmSync(join(directory, 'docker'), { recursive: true, force: true })
  for (const file of renderProject(options)) {
    if (REGENERATED.has(file.path)) writeFileSync(join(directory, file.path), file.content)
  }
  return { ...state, options: stored }
}

/**
 * Keys that only Docker mode (or the roles setup creates) fills in. For your own server, the ones
 * the framework reads go back to their neutral value (`MAIL_HOST=127.0.0.1`), the rest are
 * commented out (see {@link retireKeys}).
 */
const DOCKER_ONLY_KEYS = [
  'FORWARD_DB_PORT',
  'DB_ROOT_PASSWORD',
  'DB_MIGRATION_USERNAME',
  'DB_MIGRATION_PASSWORD',
  'MAIL_HOST',
  'MAIL_PORT',
  'FORWARD_MAILPIT_PORT',
  'COMPOSE_PROJECT_NAME',
  'STRUT_UID',
  'STRUT_GID',
] as const

/** Connection keys your own server may not use (written only when set, else neutral/empty). */
const OPTIONAL_CONNECTION_KEYS = ['DB_SOCKET', 'DB_SSL_CA', 'DB_URL'] as const

/**
 * "Use my own database server" (after a Docker problem) and "Change the connection details" (after
 * a refused login): point the project at a MySQL/MariaDB/PostgreSQL server the user runs, without
 * Docker. Every rule of the questions applies again (resolveOptions), the password and URL go to
 * `.env` only, and the files that describe how the app runs are regenerated.
 *
 * @example
 * state = useOwnServer('C:/code/my-app', state, { dbHost: '127.0.0.1', dbUser: 'root', dbPassword: '' })
 */
export function useOwnServer(
  directory: string,
  state: SetupState,
  details: ConnectionAnswers,
): SetupState {
  if (state.options.database === 'sqlite') return switchToSqlite(directory, state)
  const answers = {
    ...answersOf({ ...state.options, docker: false, connection: undefined }),
    docker: false,
    ...details,
  }
  const resolved = resolveOptions(answers, dirname(directory))
  const typed: TypedSecrets = {
    ...(details.dbPassword === undefined ? {} : { dbPassword: details.dbPassword }),
    ...(details.dbUrl === undefined ? {} : { dbUrl: details.dbUrl }),
  }
  const section = buildEnvSections(resolved, typed).find(
    (candidate) => candidate.title === 'Database',
  )
  const listed = exampleKeys(resolved, typed)
  const files: EnvFile[] = ['.env', '.env.example']
  for (const file of files) {
    let text = readEnvFile(directory, file)
    for (const variable of section?.vars ?? []) {
      const value = file === '.env' ? variable.value : (variable.example ?? variable.value)
      text = setEnvValue(
        text,
        variable.key,
        variable.secret === true && file === '.env.example' ? '' : value,
      )
    }
    const written = new Set((section?.vars ?? []).map((variable) => variable.key))
    text = retireKeys(
      text,
      [...DOCKER_ONLY_KEYS, ...OPTIONAL_CONNECTION_KEYS].filter((key) => !written.has(key)),
      listed,
    )
    text = setEnvValue(text, 'MAIL_MAILER', 'log')
    writeEnvFile(directory, file, text)
  }
  rmSync(join(directory, 'docker'), { recursive: true, force: true })
  const { directory: _directory, ...stored } = resolved
  for (const file of renderProject(resolved, typed)) {
    if (REGENERATED.has(file.path)) writeFileSync(join(directory, file.path), file.content)
  }
  return { ...state, options: stored }
}
