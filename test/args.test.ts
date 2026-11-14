/** Command-line parsing: every flag form, folder handling (incl. Windows paths) and errors. */
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ArgsError, helpText, parseArgs } from '../src/args.ts'

const cwd = resolve('/work')
const parse = (...argv: string[]) => parseArgs(argv, cwd)

describe('parseArgs', () => {
  test('nothing given', () => {
    const a = parse()
    expect(a).toMatchObject({ input: {}, yes: false, dryRun: false, help: false, version: false })
    expect(a.given.size).toBe(0)
  })

  test('the folder sets the directory and, by default, the name', () => {
    const a = parse('acme')
    expect(a.input).toEqual({ directory: join(cwd, 'acme'), name: 'acme' })
    expect([...a.given].sort()).toEqual(['directory', 'name'])
  })

  test('--name overrides the folder name, in any order', () => {
    expect(parse('--name', 'portal', 'apps/web').input).toEqual({
      name: 'portal',
      directory: join(cwd, 'apps', 'web'),
    })
    expect(parse('apps/web', '--name=portal').input.name).toBe('portal')
  })

  test('"." means the current folder', () => {
    const a = parseArgs(['.'], join(cwd, 'acme'))
    expect(a.input).toEqual({ directory: join(cwd, 'acme'), name: 'acme' })
  })

  // A backslash path is only a path on Windows; on Linux and macOS `\` is an ordinary filename
  // character, so there the whole string is one (invalid) folder name, rejected later by
  // validate-name. Hence the Windows case runs on Windows only.
  test.skipIf(process.platform !== 'win32')('accepts Windows paths with spaces', () => {
    const a = parseArgs(['C:\\Users\\Ana Lee\\Projects\\acme'], 'C:\\')
    expect(a.input.name).toBe('acme')
    expect(a.input.directory).toBe('C:\\Users\\Ana Lee\\Projects\\acme')
  })

  test('accepts absolute POSIX-style paths with spaces on every platform', () => {
    const a = parseArgs(['/home/ana lee/projects/acme'], '/')
    expect(a.input.name).toBe('acme')
  })

  test('value flags in both forms', () => {
    const a = parse(
      '--preset',
      'api',
      '--db=mysql',
      '--pm',
      'npm',
      '--auth',
      'email, google',
      '--extras=queue,mail',
    )
    expect(a.input).toEqual({
      preset: 'api',
      database: 'mysql',
      packageManager: 'npm',
      auth: ['email', 'google'],
      extras: ['queue', 'mail'],
    })
    expect(parse('--database', 'sqlite', '--package-manager=bun').input).toEqual({
      database: 'sqlite',
      packageManager: 'bun',
    })
  })

  test('"none" and --no-* empty the lists', () => {
    expect(parse('--auth', 'none', '--extras=none').input).toEqual({ auth: [], extras: [] })
    expect(parse('--no-auth', '--no-extras').input).toEqual({ auth: [], extras: [] })
  })

  test.each([
    [['--tenancy'], true],
    [['--tenancy=shared'], true],
    [['--tenancy', 'shared'], true],
    [['--tenancy=true'], true],
    [['--tenancy=none'], false],
    [['--tenancy', 'false'], false],
    [['--no-tenancy'], false],
  ])('tenancy %j → %s', (argv, expected) => {
    expect(parse(...argv).input.tenancy).toBe(expected)
  })

  test('--tenancy does not swallow a following folder name', () => {
    expect(parse('--tenancy', 'acme').input).toMatchObject({ tenancy: true, name: 'acme' })
  })

  test('refuses an unknown tenancy mode', () => {
    expect(() => parse('--tenancy=schema')).toThrow(/shared or none/)
  })

  test.each([
    [['--docker'], 'local'],
    [['--docker=commit'], 'commit'],
    [['--docker', 'off'], 'off'],
    [['--no-docker'], 'off'],
    [['--docker=weird'], 'weird'], // validated later by resolveOptions, with every other problem
  ])('docker %j → %s', (argv, expected) => {
    expect(parse(...argv).input.docker).toBe(expected)
  })

  test('booleans and modes', () => {
    expect(parse('--git', '--install').input).toEqual({ git: true, install: true })
    expect(parse('--no-git', '--no-install').input).toEqual({ git: false, install: false })
    expect(parse('-y', '--dry-run')).toMatchObject({ yes: true, dryRun: true })
    expect(parse('--yes').yes).toBe(true)
    expect(parse('-h').help).toBe(true)
    expect(parse('--help').help).toBe(true)
    expect(parse('-v').version).toBe(true)
    expect(parse('--version').version).toBe(true)
  })

  test('a bare "--" separator (npm create … -- --flags) is ignored', () => {
    expect(parse('acme', '--', '--preset', 'api').input.preset).toBe('api')
  })

  test.each([
    [['--frobnicate'], /unknown option --frobnicate/],
    [['--preset'], /--preset needs a value/],
    [['--preset', '--yes'], /--preset needs a value/],
    [['a', 'b'], /only one folder/],
    [['--yes=please'], /does not take a value/],
    [['--no-git=1'], /does not take a value/],
  ])('refuses %j', (argv, message) => {
    expect(() => parse(...argv)).toThrow(ArgsError)
    expect(() => parse(...argv)).toThrow(message)
  })

  test('a lone "-" is treated as a folder name (and later refused as a name)', () => {
    expect(parse('-').input.name).toBe('-')
  })
})

describe('helpText', () => {
  test('documents every flag and shows the version', () => {
    const text = helpText('1.2.3')
    expect(text).toContain('create-strutvane 1.2.3')
    for (const flag of [
      '--preset',
      '--db',
      '--auth',
      '--tenancy',
      '--extras',
      '--docker',
      '--no-docker',
      '--pm',
      '--name',
      '--no-git',
      '--install',
      '--yes',
      '--dry-run',
      '--help',
      '--version',
    ]) {
      expect(text).toContain(flag)
    }
  })

  test('create commands follow the release channel of the version (no binary on @latest pre-1.0)', () => {
    const pre = helpText('0.1.0-next.0')
    expect(pre).toContain('  npm create strutvane@next [folder] -- [options]')
    expect(pre).toContain('  pnpm create strutvane@next [folder] [options]')
    expect(pre).toContain('  pnpm create strutvane@next portal --preset ui --dry-run')
    expect(pre).not.toContain('@latest')
    // Every create command names a tag: a bare `pnpm create strutvane` resolves to @latest too.
    expect(pre).not.toMatch(/create strutvane(?!@)/)
    const stable = helpText('1.0.0')
    expect(stable).toContain('  npm create strutvane@latest acme')
    expect(stable).not.toContain('@next')
  })
})
