/**
 * The CLI flow end to end, with a recording UI, a scripted prompter and fake external commands:
 * flags-only runs, interactive runs, cancel, dry run, help/version and every error path.
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { DEFAULT_NAME, type MainDeps, main, type Ui } from '../src/main.ts'
import type { CommandRunner } from '../src/post.ts'
import { CANCEL, type Prompter } from '../src/prompts.ts'
import { removeDir, secretSequence, tempDir } from './helpers.ts'

/** A UI that records every message. */
function recordingUi() {
  const out: { kind: string; text: string }[] = []
  const rec =
    (kind: string) =>
    (text: string, title?: string): void => {
      out.push({ kind, text: title === undefined ? text : `${title}: ${text}` })
    }
  const ui: Ui = {
    intro: rec('intro'),
    info: rec('info'),
    warn: rec('warn'),
    error: rec('error'),
    success: rec('success'),
    note: (body, title) => rec('note')(body, title),
    outro: rec('outro'),
    print: rec('print'),
  }
  const text = (kind?: string) =>
    out
      .filter((o) => kind === undefined || o.kind === kind)
      .map((o) => o.text)
      .join('\n')
  return { ui, out, text }
}

/** A prompter answering from a queue; `CANCEL` cancels. Records the questions asked. */
function scriptedPrompter(answers: unknown[]) {
  const asked: string[] = []
  const next = async ({ message }: { message: string }) => {
    asked.push(message)
    if (answers.length === 0) throw new Error(`unexpected question: ${message}`)
    return answers.shift() as never
  }
  const prompter: Prompter = { text: next, select: next, multiselect: next, confirm: next }
  return { prompter, asked }
}

/** External commands that always succeed and are recorded. */
function okRunner() {
  const calls: string[] = []
  const run: CommandRunner = async (command, args) => {
    calls.push([command, ...args].join(' '))
    return { code: command === 'git' && args[0] === 'rev-parse' ? 128 : 0, output: '' }
  }
  return { run, calls }
}

const roots: string[] = []
afterEach(async () => {
  for (const dir of roots.splice(0)) await removeDir(dir)
})

async function setup(extra: Partial<MainDeps> = {}) {
  const cwd = await tempDir()
  roots.push(cwd)
  const ui = recordingUi()
  const runner = okRunner()
  const deps: MainDeps = {
    cwd,
    version: '9.9.9',
    interactive: false,
    ui: ui.ui,
    run: runner.run,
    generateSecret: secretSequence(),
    ...extra,
  }
  return { cwd, ui, runner, deps }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

describe('flags-only (non-interactive)', () => {
  test('creates the project, commits it, and prints next steps and the admin password once', async () => {
    const { cwd, ui, runner, deps } = await setup()
    const code = await main(['acme', '--preset', 'api', '--db', 'sqlite', '--yes'], deps)
    expect(code).toBe(0)
    expect(await exists(join(cwd, 'acme', 'package.json'))).toBe(true)
    expect(runner.calls).toContain('git init -b main')
    expect(ui.text('success')).toMatch(/Created \d+ files/)
    expect(ui.text('success')).toContain('first commit')
    expect(ui.text('info')).toContain('APP_KEY')
    const note = ui.text('note')
    // sqlite + auth: APP_KEY, AUTH_SECRET, then SEED_ADMIN_PASSWORD (the third generated secret).
    expect(note).toMatch(/Your first admin sign-in: SEED_ADMIN_PASSWORD=test-secret-03x+/)
    expect(note).toContain(
      'Next steps: cd acme\npnpm install\npnpm sv migrate\npnpm sv db:seed\npnpm dev',
    )
    expect(ui.text('outro')).toBe('Happy building!')
    // The admin password appears in exactly one message; the other secrets in none.
    expect(ui.out.filter((o) => o.text.includes('test-secret-03')).length).toBe(1)
    expect(ui.out.some((o) => /test-secret-0[12]/.test(o.text))).toBe(false)
  })

  test('without a folder uses the default name', async () => {
    const { cwd, deps } = await setup()
    expect(await main(['--yes', '--no-git'], deps)).toBe(0)
    expect(await exists(join(cwd, DEFAULT_NAME, 'package.json'))).toBe(true)
  })

  test('a non-terminal stdin never prompts, even without --yes', async () => {
    const { cwd, deps } = await setup({ prompter: scriptedPrompter([]).prompter })
    expect(await main(['acme', '--no-git'], deps)).toBe(0)
    expect(await exists(join(cwd, 'acme'))).toBe(true)
  })

  test('next steps include services and skip install when installed; folder paths with spaces are quoted', async () => {
    const { ui, runner, deps } = await setup()
    expect(
      await main(['my apps/acme', '--name', 'acme', '--install', '--no-git', '--pm', 'npm'], deps),
    ).toBe(0)
    expect(runner.calls).toContain('npm install')
    const steps = ui.text('note')
    expect(steps).toMatch(/cd "my apps[\\/]acme"/)
    expect(steps).not.toContain('npm install')
    expect(steps).toContain('npm run services:up')
  })

  test('ui preset next steps have no migrations', async () => {
    const { ui, deps } = await setup()
    expect(await main(['portal', '--preset', 'ui', '--no-git', '--pm', 'yarn'], deps)).toBe(0)
    expect(ui.text('note')).toBe('Next steps: cd portal\nyarn install\nyarn dev')
    expect(ui.text('info')).toBe('')
  })

  test('post-step warnings are shown; an existing repository is reported', async () => {
    const { ui, deps } = await setup({
      run: async (command, args) =>
        command === 'git' && args[0] === 'rev-parse'
          ? { code: 0, output: 'true' }
          : { code: 1, output: '' },
    })
    expect(await main(['acme', '--install', '--pm', 'pnpm'], deps)).toBe(0)
    expect(ui.text('warn')).toMatch(/Installing dependencies failed/)
    const steps = ui.text('note')
    expect(steps).toContain('pnpm install')
  })

  test('reports a repository that already contains the folder', async () => {
    const { ui, deps } = await setup({
      run: async (command, args) =>
        command === 'git' && args[0] === 'rev-parse'
          ? { code: 0, output: 'true\n' }
          : { code: 0, output: '' },
    })
    expect(await main(['acme'], deps)).toBe(0)
    expect(ui.text('info')).toContain('inside an existing git repository')
  })

  test('warnings from option resolution are shown', async () => {
    const { ui, deps } = await setup()
    expect(
      await main(
        ['tiny', '--preset', 'api', '--db', 'sqlite', '--extras', 'none', '--docker', '--no-git'],
        deps,
      ),
    ).toBe(0)
    expect(ui.text('warn')).toMatch(/no compose file/)
  })
})

describe('--dry-run', () => {
  test('prints the tree and diff and writes nothing', async () => {
    const { cwd, ui, runner, deps } = await setup()
    expect(await main(['acme', '--dry-run'], deps)).toBe(0)
    expect(await readdir(cwd)).toEqual([])
    expect(runner.calls).toEqual([])
    const printed = ui.text('print')
    expect(printed).toContain('acme/\n├─ .github/')
    expect(printed).toContain('+++ b/package.json')
    expect(printed).not.toMatch(/test-secret-\d/)
    expect(ui.text('outro')).toMatch(/Dry run: \d+ files would be created .* Nothing was written\./)
  })
})

describe('interactive', () => {
  test('asks only for what flags did not give', async () => {
    const { prompter, asked } = scriptedPrompter([
      'api',
      'mysql',
      ['email', 'github'],
      true,
      ['queue', 'logs'],
      'commit',
      false,
      false,
    ])
    const { cwd, ui, deps } = await setup({ interactive: true, prompter })
    expect(await main(['acme'], deps)).toBe(0)
    expect(asked).toEqual([
      'What are you building?',
      'Database',
      'Sign-in methods (none = no authentication)',
      'Multi-tenant? (each customer company only sees its own data)',
      'Extras',
      'Local services with Docker (mysql, valkey)?',
      'Create a git repository with a first commit?',
      'Install dependencies now?',
    ])
    expect(ui.text('intro')).toBe('create-strutvane 9.9.9')
    const pkg = await readFile(join(cwd, 'acme', 'package.json'), 'utf8')
    expect(pkg).toContain('"mysql2"')
    expect(await exists(join(cwd, 'acme', 'config', 'tenancy.ts'))).toBe(true)
    expect(await readFile(join(cwd, 'acme', '.gitignore'), 'utf8')).not.toMatch(/^docker\/$/m)
  })

  test('asks for the name when no folder is given; the ui preset skips server questions', async () => {
    const { prompter, asked } = scriptedPrompter(['  portal ', 'ui', true, false])
    const { cwd, deps } = await setup({ interactive: true, prompter })
    expect(await main([], deps)).toBe(0)
    expect(asked).toEqual([
      'Project name',
      'What are you building?',
      'Create a git repository with a first commit?',
      'Install dependencies now?',
    ])
    expect(await exists(join(cwd, 'portal', 'config', 'api-client.ts'))).toBe(true)
  })

  test('without auth, tenancy is not asked and audit is not offered', async () => {
    const { prompter, asked } = scriptedPrompter([[], [], 'off', false, false])
    const { deps } = await setup({ interactive: true, prompter })
    expect(await main(['acme', '--preset', 'full', '--db', 'postgres'], deps)).toBe(0)
    expect(asked).not.toContain('Multi-tenant? (each customer company only sees its own data)')
  })

  test('--yes skips every question', async () => {
    const { prompter, asked } = scriptedPrompter([])
    const { deps } = await setup({ interactive: true, prompter })
    expect(await main(['acme', '--yes', '--no-git'], deps)).toBe(0)
    expect(asked).toEqual([])
  })

  test('cancelling exits with 130 and creates nothing', async () => {
    const { prompter } = scriptedPrompter(['full', CANCEL])
    const { cwd, ui, deps } = await setup({ interactive: true, prompter })
    expect(await main(['acme'], deps)).toBe(130)
    expect(await readdir(cwd)).toEqual([])
    expect(ui.text('outro')).toBe('Cancelled. Nothing was created.')
  })
})

describe('help, version and errors', () => {
  test('--help and --version print and exit 0', async () => {
    const { ui, deps } = await setup()
    expect(await main(['--help'], deps)).toBe(0)
    expect(ui.text('print')).toContain('Usage:')
    expect(await main(['-v'], deps)).toBe(0)
    expect(ui.out.at(-1)).toEqual({ kind: 'print', text: '9.9.9' })
  })

  test('an unknown flag fails with a hint', async () => {
    const { ui, deps } = await setup()
    expect(await main(['--nope'], deps)).toBe(1)
    expect(ui.text('error')).toMatch(/unknown option --nope[\s\S]*--help/)
  })

  test('invalid choices fail before any question is asked, listing every problem', async () => {
    const { prompter, asked } = scriptedPrompter([])
    const { cwd, ui, deps } = await setup({ interactive: true, prompter })
    expect(await main(['Bad Name', '--preset', 'desktop'], deps)).toBe(1)
    expect(asked).toEqual([])
    expect(ui.text('error')).toMatch(
      /Please fix:\n- the project name must be lowercase[\s\S]*preset "desktop"/,
    )
    expect(await readdir(cwd)).toEqual([])
  })

  test('a non-empty folder fails before any question is asked', async () => {
    const { prompter, asked } = scriptedPrompter([])
    const { cwd, ui, deps } = await setup({ interactive: true, prompter })
    await writeFile(join(cwd, 'keep.txt'), 'x')
    expect(await main(['.', '--name', 'acme'], deps)).toBe(1)
    expect(asked).toEqual([])
    expect(ui.text('error')).toMatch(/not empty/)
    expect(await readdir(cwd)).toEqual(['keep.txt'])
  })

  test('unexpected failures are reported without a stack trace', async () => {
    const { ui, deps } = await setup({ generateSecret: () => 'bad\nsecret' })
    expect(await main(['acme', '--no-git'], deps)).toBe(1)
    expect(ui.text('error')).toMatch(/^Could not create the project: /)
  })

  test('non-Error throwables are reported too', async () => {
    const { ui, deps } = await setup({
      generateSecret: () => {
        throw 'boom'
      },
    })
    expect(await main(['acme', '--no-git'], deps)).toBe(1)
    expect(ui.text('error')).toBe('Could not create the project: boom')
  })
})
