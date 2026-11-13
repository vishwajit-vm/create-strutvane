/** Post steps: git init + first commit and the optional install, with fake and real commands. */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createProject } from '../src/generate.ts'
import {
  type CommandRunner,
  INITIAL_COMMIT_MESSAGE,
  runCommand,
  runPostSteps,
} from '../src/post.ts'
import { git, optionsFor, removeDir, tempDir } from './helpers.ts'

/** A fake runner answering each `command args…` with a scripted result. */
function fakeRunner(answers: Record<string, { code: number; output?: string }>) {
  const calls: { command: string; args: readonly string[]; shell: boolean | undefined }[] = []
  const run: CommandRunner = async (command, args, options) => {
    calls.push({ command, args, shell: options.shell })
    const key = [command, ...args].join(' ')
    const answer = answers[key] ?? answers[`${command} *`] ?? { code: 0 }
    return { code: answer.code, output: answer.output ?? '' }
  }
  return { run, calls }
}

const roots: string[] = []
afterEach(async () => {
  for (const dir of roots.splice(0)) await removeDir(dir)
})

describe('runPostSteps (fake commands)', () => {
  const options = optionsFor({ name: 'acme', git: true }, process.cwd())

  test('initialises git on main and commits', async () => {
    const { run, calls } = fakeRunner({ 'git rev-parse --is-inside-work-tree': { code: 128 } })
    const result = await runPostSteps(options, run)
    expect(result).toEqual({ git: 'committed', installed: false, warnings: [] })
    expect(calls.map((c) => c.args.join(' '))).toEqual([
      '--version',
      'rev-parse --is-inside-work-tree',
      'init -b main',
      'add -A',
      `commit -m ${INITIAL_COMMIT_MESSAGE}`,
    ])
  })

  test('skips git inside an existing repository', async () => {
    const { run } = fakeRunner({
      'git rev-parse --is-inside-work-tree': { code: 0, output: 'true\n' },
    })
    expect((await runPostSteps(options, run)).git).toBe('inside-existing-repo')
  })

  test('warns when git is missing', async () => {
    const { run } = fakeRunner({ 'git --version': { code: -1 } })
    const result = await runPostSteps(options, run)
    expect(result.git).toBe('unavailable')
    expect(result.warnings[0]).toMatch(/git was not found/)
  })

  test('warns when git init fails', async () => {
    const { run } = fakeRunner({
      'git rev-parse --is-inside-work-tree': { code: 128 },
      'git init -b main': { code: 1, output: 'permission denied' },
    })
    const result = await runPostSteps(options, run)
    expect(result.git).toBe('unavailable')
    expect(result.warnings[0]).toMatch(/permission denied/)
  })

  test('keeps the repository but warns when the commit fails (no identity)', async () => {
    const { run } = fakeRunner({
      'git rev-parse --is-inside-work-tree': { code: 128 },
      [`git commit -m ${INITIAL_COMMIT_MESSAGE}`]: { code: 128 },
    })
    const result = await runPostSteps(options, run)
    expect(result.git).toBe('initialised')
    expect(result.warnings[0]).toMatch(/user.email/)
  })

  test('--no-git runs nothing', async () => {
    const { run, calls } = fakeRunner({})
    const result = await runPostSteps({ ...options, git: false }, run)
    expect(result.git).toBe('skipped')
    expect(calls).toEqual([])
  })

  test('installs before committing (lockfile in the first commit), with a shell only on Windows', async () => {
    const { run, calls } = fakeRunner({ 'git rev-parse --is-inside-work-tree': { code: 128 } })
    const result = await runPostSteps(
      { ...options, install: true, packageManager: 'npm' },
      run,
      'win32',
    )
    expect(result.installed).toBe(true)
    expect(calls[0]).toEqual({ command: 'npm', args: ['install'], shell: true })
    const linux = fakeRunner({})
    await runPostSteps({ ...options, git: false, install: true }, linux.run, 'linux')
    expect(linux.calls[0]).toEqual({ command: 'pnpm', args: ['install'], shell: false })
  })

  test('a failed install becomes a warning with the command to run', async () => {
    const { run } = fakeRunner({ 'yarn install': { code: 1 } })
    const result = await runPostSteps(
      { ...options, git: false, install: true, packageManager: 'yarn' },
      run,
    )
    expect(result.installed).toBe(false)
    expect(result.warnings).toEqual([
      'Installing dependencies failed. Run it yourself: yarn install',
    ])
  })
})

describe('runCommand (real processes)', () => {
  test('collects output and exit codes', async () => {
    const ok = await runCommand(
      process.execPath,
      ['-e', 'process.stdout.write("hi");process.stderr.write("!")'],
      {
        cwd: process.cwd(),
      },
    )
    expect(ok).toEqual({ code: 0, output: 'hi!' })
    const fail = await runCommand(process.execPath, ['-e', 'process.exit(3)'], {
      cwd: process.cwd(),
    })
    expect(fail.code).toBe(3)
  })

  test('streams to the terminal with inherit', async () => {
    const result = await runCommand(process.execPath, ['-e', ''], {
      cwd: process.cwd(),
      inherit: true,
    })
    expect(result).toEqual({ code: 0, output: '' })
  })

  test('a missing command is reported, not thrown', async () => {
    const result = await runCommand('definitely-not-a-command-xyz', [], { cwd: process.cwd() })
    expect(result.code).toBe(-1)
    expect(result.output).not.toBe('')
  })

  test('real git: creates the repository with a first commit on main', async () => {
    const root = await tempDir()
    roots.push(root)
    const options = optionsFor({ name: 'acme', git: true }, root)
    await createProject(options)
    vi.stubEnv('GIT_AUTHOR_NAME', 'Test')
    vi.stubEnv('GIT_AUTHOR_EMAIL', 'test@example.com')
    vi.stubEnv('GIT_COMMITTER_NAME', 'Test')
    vi.stubEnv('GIT_COMMITTER_EMAIL', 'test@example.com')
    vi.stubEnv('GIT_CONFIG_COUNT', '1')
    vi.stubEnv('GIT_CONFIG_KEY_0', 'commit.gpgsign')
    vi.stubEnv('GIT_CONFIG_VALUE_0', 'false')
    const result = await runPostSteps(options)
    expect(result.warnings).toEqual([])
    expect(result.git).toBe('committed')
    expect((await git(options.directory, 'branch', '--show-current')).output.trim()).toBe('main')
    expect((await git(options.directory, 'log', '--format=%s')).output.trim()).toBe(
      INITIAL_COMMIT_MESSAGE,
    )
  })
})
