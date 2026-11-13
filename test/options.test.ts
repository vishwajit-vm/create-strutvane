/** Option rules: defaults, combinations, every problem reported at once, and name validation. */
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  DEFAULTS,
  detectPackageManager,
  dockerServices,
  hasExtra,
  hasServer,
  hasWeb,
  OptionsError,
  resolveOptions,
} from '../src/options.ts'
import { validateProjectName } from '../src/validate-name.ts'

const cwd = resolve('/work')
const resolveIn = (input: Parameters<typeof resolveOptions>[0], userAgent?: string) =>
  resolveOptions(input, { cwd, userAgent })

function problemsOf(input: Parameters<typeof resolveOptions>[0]): readonly string[] {
  try {
    resolveIn(input)
  } catch (error) {
    if (error instanceof OptionsError) return error.problems
    throw error
  }
  return []
}

describe('validateProjectName', () => {
  test.each(['acme', 'acme-portal', 'a1', 'my.app', 'my_app', 'x~y', 'a'.repeat(214)])(
    'accepts %s',
    (name) => {
      expect(validateProjectName(name)).toEqual([])
    },
  )

  test.each([
    ['', /required/],
    ['My-App', /lowercase/],
    ['my app', /spaces/],
    ['.hidden', /start with "\." or "_"/],
    ['_private', /start with "\." or "_"/],
    ['-dash', /start with "-"/],
    ['@scope/pkg', /"\/"/],
    ['a\\b', /"\/" or "\\"/],
    ['café', /letters, digits/],
    ['a!b', /letters, digits/],
    ['trailing.', /end with "\."/],
    ['node_modules', /not allowed/],
    ['favicon.ico', /not allowed/],
    ['con', /reserved name on Windows/],
    ['nul.txt', /reserved name on Windows/],
    ['lpt1', /reserved name on Windows/],
    ['a'.repeat(215), /214/],
  ])('refuses %j', (name, message) => {
    expect(validateProjectName(name).join('\n')).toMatch(message)
  })

  test('reports every problem of a name together', () => {
    expect(validateProjectName('My App!').length).toBeGreaterThanOrEqual(3)
  })
})

describe('resolveOptions', () => {
  test('fills the documented defaults', () => {
    const { options, warnings } = resolveIn({ name: 'acme' })
    expect(options).toEqual({
      name: 'acme',
      directory: join(cwd, 'acme'),
      preset: 'full',
      database: 'postgres',
      auth: ['email'],
      tenancy: false,
      extras: ['logs'],
      docker: 'local',
      packageManager: 'pnpm',
      git: true,
      install: false,
    })
    expect(warnings).toEqual([])
    expect(Object.isFrozen(options)).toBe(true)
    expect(Object.isFrozen(DEFAULTS)).toBe(true)
  })

  test('trims the name and resolves a relative or absolute directory', () => {
    expect(resolveIn({ name: '  acme  ' }).options.name).toBe('acme')
    expect(resolveIn({ name: 'acme', directory: 'apps/acme' }).options.directory).toBe(
      join(cwd, 'apps', 'acme'),
    )
    const absolute = resolve('/elsewhere/acme')
    expect(resolveIn({ name: 'acme', directory: absolute }).options.directory).toBe(absolute)
  })

  test('the ui preset has no server-side choices and no Docker', () => {
    const { options } = resolveIn({ name: 'portal', preset: 'ui' })
    expect(options).toMatchObject({
      database: undefined,
      auth: [],
      extras: [],
      tenancy: false,
      docker: 'off',
    })
  })

  test('the ui preset refuses server-side choices given explicitly', () => {
    const problems = problemsOf({
      name: 'portal',
      preset: 'ui',
      database: 'mysql',
      auth: ['email'],
      tenancy: true,
      extras: ['queue'],
    })
    expect(problems).toHaveLength(4)
    expect(problems.join('\n')).toMatch(
      /no database[\s\S]*no server-side auth[\s\S]*tenancy[\s\S]*extras/,
    )
  })

  test('the ui preset accepts empty lists', () => {
    expect(
      problemsOf({ name: 'portal', preset: 'ui', auth: [], extras: [], tenancy: false }),
    ).toEqual([])
  })

  test('tenancy and the audit log need auth', () => {
    const problems = problemsOf({ name: 'acme', auth: [], tenancy: true, extras: ['audit'] })
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/multi-tenancy needs authentication/)
    expect(problems[1]).toMatch(/audit log needs authentication/)
  })

  test('collects every problem in one error', () => {
    const problems = problemsOf({
      name: 'Bad Name',
      preset: 'desktop',
      database: 'oracle',
      auth: ['email', 'okta'],
      extras: ['cron'],
      docker: 'swarm',
      packageManager: 'deno',
    })
    expect(problems.join('\n')).toMatch(/lowercase/)
    for (const word of [
      'preset "desktop"',
      'database "oracle"',
      'auth method "okta"',
      'extra "cron"',
      'docker mode "swarm"',
      'package manager "deno"',
    ]) {
      expect(problems.join('\n')).toContain(word)
    }
    expect(() => resolveIn({ name: 'Bad Name' })).toThrow(/Invalid project options:\n {2}- /)
  })

  test('lists are de-duplicated and put in canonical order (deterministic output)', () => {
    const { options } = resolveIn({
      name: 'acme',
      auth: ['github', 'email', 'github'],
      extras: ['otel', 'queue', 'logs'],
    })
    expect(options.auth).toEqual(['email', 'github'])
    expect(options.extras).toEqual(['queue', 'otel', 'logs'])
  })

  test('Docker defaults to local only when there is something to run', () => {
    expect(resolveIn({ name: 'a', database: 'sqlite', extras: [] }).options.docker).toBe('off')
    expect(resolveIn({ name: 'a', database: 'sqlite', extras: ['mail'] }).options.docker).toBe(
      'local',
    )
    expect(resolveIn({ name: 'a', database: 'azure-postgres', extras: [] }).options.docker).toBe(
      'off',
    )
    expect(resolveIn({ name: 'a', docker: 'commit' }).options.docker).toBe('commit')
    expect(resolveIn({ name: 'a', docker: 'off' }).options.docker).toBe('off')
  })

  test('warns when Docker is requested but nothing needs it', () => {
    const { options, warnings } = resolveIn({
      name: 'a',
      database: 'sqlite',
      extras: [],
      docker: 'local',
    })
    expect(options.docker).toBe('off')
    expect(warnings[0]).toMatch(/no compose file/)
  })

  test('the package manager defaults to the one that launched the starter', () => {
    expect(
      resolveIn({ name: 'a' }, 'npm/11.0.0 node/v24.0.0 win32 x64').options.packageManager,
    ).toBe('npm')
    expect(
      resolveIn({ name: 'a', packageManager: 'bun' }, 'npm/11.0.0').options.packageManager,
    ).toBe('bun')
  })
})

describe('helpers', () => {
  test('detectPackageManager', () => {
    expect(detectPackageManager('pnpm/12.18.0 npm/? node/v24.21.0 win32 x64')).toBe('pnpm')
    expect(detectPackageManager('yarn/4.5.0 npm/? node/v24.0.0')).toBe('yarn')
    expect(detectPackageManager('bun/1.3.0')).toBe('bun')
    expect(detectPackageManager('deno/2.0.0')).toBe('pnpm')
    expect(detectPackageManager(undefined)).toBe('pnpm')
    expect(detectPackageManager('')).toBe('pnpm')
  })

  test('hasServer / hasWeb / hasExtra', () => {
    expect([
      hasServer({ preset: 'full' }),
      hasServer({ preset: 'api' }),
      hasServer({ preset: 'ui' }),
    ]).toEqual([true, true, false])
    expect([
      hasWeb({ preset: 'full' }),
      hasWeb({ preset: 'api' }),
      hasWeb({ preset: 'ui' }),
    ]).toEqual([true, false, true])
    expect(hasExtra({ extras: ['logs'] }, 'logs')).toBe(true)
    expect(hasExtra({ extras: [] }, 'logs')).toBe(false)
  })

  test('dockerServices', () => {
    expect(
      dockerServices({ preset: 'full', database: 'postgres', extras: ['queue', 'mail'] }),
    ).toEqual(['postgres', 'valkey', 'mailpit'])
    expect(dockerServices({ preset: 'api', database: 'mysql', extras: ['cache'] })).toEqual([
      'mysql',
      'valkey',
    ])
    expect(dockerServices({ preset: 'api', database: 'azure-mysql', extras: [] })).toEqual([])
    expect(dockerServices({ preset: 'ui', database: undefined, extras: ['mail'] })).toEqual([])
  })
})
