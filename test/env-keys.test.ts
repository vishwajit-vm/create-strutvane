/**
 * Decision #132: a generated app's `.env` and `.env.example` list every key the framework reads
 * (app, database with the extra connections, logging, cache, session, queue, mail, files/S3,
 * broadcast) plus `REDIS_*`, with server-free defaults filled in and secrets empty in the example;
 * generated and typed secrets go into `.env` only. Checked for every database/Docker mode, and
 * after the recovery switches (SQLite fallback, your own server), which used to comment keys out.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEnv } from '../src/env-file.ts'
import { type ProjectOptions, resolveOptions } from '../src/options.ts'
import { initialState } from '../src/setup-state.ts'
import { readEnvFile } from '../src/steps/env-io.ts'
import { retireKeys, switchToSqlite, useOwnServer } from '../src/steps/sqlite-fallback.ts'
import { secretKeys, type TypedSecrets } from '../src/templates/env.ts'
import { renderProject } from '../src/templates/project.ts'
import { tempFolder } from './helpers/fakes.ts'

const SERVER = ['HOST', 'PORT', 'DATABASE', 'TEST_DATABASE', 'USERNAME', 'PASSWORD', 'URL']
const SERVER_TLS = ['SOCKET', 'SSLMODE', 'SSL_CA']

/** Every key the framework (and @strutvane/redis, @strutvane/files) reads, by group. */
const FRAMEWORK_KEYS: readonly string[] = [
  'APP_NAME',
  'APP_ENV',
  'APP_KEY',
  'APP_PREVIOUS_KEYS',
  'APP_DEBUG',
  'APP_URL',
  'APP_PORT',
  'APP_LOCALE',
  'APP_TIMEZONE',
  'APP_CURRENCY',
  'DB_CONNECTION',
  ...[...SERVER, ...SERVER_TLS].map((key) => `DB_${key}`),
  'DB_MIGRATION_LOCK_TIMEOUT',
  'DB_MIGRATION_REPLAY_TIMEOUT',
  ...['MYSQL', 'PGSQL'].flatMap((name) =>
    [...SERVER, ...SERVER_TLS].map((key) => `DB_${name}_${key}`),
  ),
  'DB_SQLITE_DATABASE',
  'DB_SQLITE_TEST_DATABASE',
  'LOG_CHANNEL',
  'LOG_STACK',
  'LOG_LEVEL',
  'LOG_SLACK_WEBHOOK_URL',
  'CACHE_STORE',
  'SESSION_DRIVER',
  'SESSION_LIFETIME',
  'SESSION_COOKIE',
  'QUEUE_CONNECTION',
  'MAIL_MAILER',
  'MAIL_HOST',
  'MAIL_PORT',
  'MAIL_USERNAME',
  'MAIL_PASSWORD',
  'MAIL_FROM_ADDRESS',
  'BROADCAST_CONNECTION',
  'FILESYSTEM_DISK',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_DEFAULT_REGION',
  'AWS_BUCKET',
  'AWS_ENDPOINT',
  'REDIS_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'REDIS_DB',
]

/** A value that is (or holds) a secret: always empty in `.env.example`. */
const SECRET =
  /^(APP_KEY|APP_PREVIOUS_KEYS|REDIS_URL)$|^DB_([A-Z0-9]+_)?URL$|PASSWORD|SECRET|TOKEN|WEBHOOK|ACCESS_KEY/

interface Mode {
  readonly name: string
  readonly answers: Parameters<typeof resolveOptions>[0]
  readonly typed?: TypedSecrets
  readonly docker: boolean
}

const MODES: readonly Mode[] = [
  { name: 'SQLite', answers: { database: 'sqlite', docker: false }, docker: false },
  { name: 'MySQL in Docker', answers: { database: 'mysql', docker: true }, docker: true },
  { name: 'PostgreSQL in Docker', answers: { database: 'postgres', docker: true }, docker: true },
  {
    name: 'your own MySQL server (typed password)',
    answers: { database: 'mysql', docker: false, dbHost: '127.0.0.1', dbUser: 'root' },
    typed: { dbPassword: 'Typed-Pass-4711' },
    docker: false,
  },
  {
    name: 'your own PostgreSQL server (a URL)',
    answers: { database: 'postgres', docker: false, dbHost: 'db.internal', dbUser: 'app' },
    typed: { dbUrl: 'postgres://app:Url-Pass-0815@db.internal:5432/acme' },
    docker: false,
  },
]

const options = (answers: Mode['answers']): ProjectOptions =>
  resolveOptions({ name: 'acme-portal', ...answers }, '/code')

function envFiles(mode: Mode): { env: string; example: string } {
  const project = renderProject(options(mode.answers), mode.typed ?? {})
  const text = (path: string): string => project.find((file) => file.path === path)?.content ?? ''
  return { env: text('.env'), example: text('.env.example') }
}

/** The active `KEY=` lines of a file, refusing a key that appears twice. */
function activeKeys(text: string): string[] {
  const keys = text
    .split('\n')
    .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
    .filter((key): key is string => key !== undefined)
  const twice = keys.filter((key, index) => keys.indexOf(key) !== index)
  expect(twice, 'keys listed twice').toEqual([])
  return keys
}

describe.each(MODES)('.env and .env.example: $name', (mode) => {
  const { env, example } = envFiles(mode)

  it('list every key the framework reads, once, in both files', () => {
    const envKeys = activeKeys(env)
    const exampleKeys = activeKeys(example)
    for (const key of FRAMEWORK_KEYS) {
      expect(envKeys, `.env misses ${key}`).toContain(key)
      expect(exampleKeys, `.env.example misses ${key}`).toContain(key)
    }
    // The same keys in both: the example is complete, .env has nothing the example lacks.
    expect([...envKeys].sort()).toEqual([...exampleKeys].sort())
  })

  it('fill in what works without a server', () => {
    for (const text of [env, example]) {
      const values = parseEnv(text)
      expect(values.get('REDIS_HOST')).toBe('127.0.0.1')
      expect(values.get('REDIS_PORT')).toBe('6379')
      expect(values.get('REDIS_DB')).toBe('0')
      expect(values.get('CACHE_STORE')).toBe('file')
      expect(values.get('QUEUE_CONNECTION')).toBe('database')
      expect(values.get('DB_PGSQL_PORT')).toBe('5432')
    }
    expect(example).toMatch(/@strutvane\/redis/)
  })

  it('keep every secret out of .env.example; generated ones wait for the secrets step', () => {
    const exampleValues = parseEnv(example)
    for (const [key, value] of exampleValues)
      if (SECRET.test(key)) expect(value, `${key} in .env.example`).toBe('')
    const envValues = parseEnv(env)
    for (const key of secretKeys(options(mode.answers)))
      expect(envValues.get(key), `${key} is generated later, into .env only`).toBe('')
    for (const typed of Object.values(mode.typed ?? {})) {
      expect(env).toContain(typed)
      expect(example).not.toContain(typed)
    }
  })

  it.runIf(mode.docker)('Docker mode: the db service without TLS, Mailpit for mail', () => {
    for (const text of [env, example]) {
      const values = parseEnv(text)
      expect(values.get('DB_HOST')).toBe('db')
      expect(values.get('DB_SSLMODE')).toBe('disable')
      expect(values.get('MAIL_HOST')).toBe('mailpit')
    }
    expect(parseEnv(env).get('MAIL_MAILER')).toBe('smtp')
    expect(parseEnv(example).get('MAIL_MAILER')).toBe('log')
  })
})

/** Write a rendered project's env files into a folder, as the files step does. */
function writtenProject(answers: Mode['answers']): { directory: string; options: ProjectOptions } {
  const directory = tempFolder('env-keys-')
  const resolved = options(answers)
  const { env, example } = envFiles({ name: 'x', answers, docker: true })
  // The secrets step has run: a generated Docker password is in .env.
  writeFileSync(join(directory, '.env'), env.replace(/^DB_PASSWORD=$/m, 'DB_PASSWORD=Generated-1'))
  writeFileSync(join(directory, '.env.example'), example)
  return { directory, options: resolved }
}

describe('the recovery switches keep every key listed (#132)', () => {
  it('Docker → SQLite: framework keys get the SQLite app values, Docker-only keys are commented', () => {
    const { directory, options: resolved } = writtenProject({ database: 'postgres', docker: true })
    switchToSqlite(directory, initialState(resolved, []))
    for (const file of ['.env', '.env.example'] as const) {
      const text = readEnvFile(directory, file)
      const keys = activeKeys(text)
      for (const key of FRAMEWORK_KEYS) expect(keys, `${file} misses ${key}`).toContain(key)
      const values = parseEnv(text)
      expect(values.get('DB_CONNECTION')).toBe('sqlite')
      expect(values.get('DB_HOST')).toBe('127.0.0.1')
      expect(values.get('DB_PASSWORD')).toBe('')
      expect(values.get('MAIL_HOST')).toBe('127.0.0.1')
      expect(values.get('MAIL_MAILER')).toBe('log')
      for (const dockerOnly of ['COMPOSE_PROJECT_NAME', 'FORWARD_DB_PORT', 'DB_ROOT_PASSWORD'])
        expect(text, `${file}: ${dockerOnly}`).toMatch(new RegExp(`^# ${dockerOnly}=`, 'm'))
    }
    expect(readEnvFile(directory)).not.toContain('Generated-1')
  })

  it('Docker → your own server: optional connection keys are listed empty, mail goes local', () => {
    const { directory, options: resolved } = writtenProject({ database: 'mysql', docker: true })
    useOwnServer(directory, initialState(resolved, []), {
      dbHost: '127.0.0.1',
      dbUser: 'root',
      dbPassword: 'Own-Pass-1',
    })
    for (const file of ['.env', '.env.example'] as const) {
      const text = readEnvFile(directory, file)
      const keys = activeKeys(text)
      for (const key of FRAMEWORK_KEYS) expect(keys, `${file} misses ${key}`).toContain(key)
      const values = parseEnv(text)
      expect(values.get('DB_HOST')).toBe('127.0.0.1')
      expect(values.get('DB_URL')).toBe('')
      expect(values.get('DB_SOCKET')).toBe('')
      expect(values.get('MAIL_HOST')).toBe('127.0.0.1')
      expect(text).toMatch(/^# COMPOSE_PROJECT_NAME=/m)
    }
    expect(parseEnv(readEnvFile(directory)).get('DB_PASSWORD')).toBe('Own-Pass-1')
    expect(parseEnv(readEnvFile(directory, '.env.example')).get('DB_PASSWORD')).toBe('')
  })

  it('retireKeys: a listed key gets its neutral value, an unlisted one is commented out', () => {
    expect(
      retireKeys(
        'DB_HOST=db\nSTRUT_UID=1000\n',
        ['DB_HOST', 'STRUT_UID', 'MISSING'],
        new Map([['DB_HOST', '127.0.0.1']]),
      ),
    ).toBe('DB_HOST=127.0.0.1\n# STRUT_UID=1000\n')
  })
})
