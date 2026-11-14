/**
 * The CLI flow, independent of the real terminal so every path is testable:
 * parse → validate flags early → ask what's missing → validate → write → post steps → summary.
 *
 * Exit codes: `0` success, `1` error (nothing or nothing more was written), `130` cancelled.
 * All user-facing output goes through the {@link Ui} interface (clack in the real CLI), never
 * `console.*`.
 *
 * @module
 */
import { relative } from 'node:path'
import * as clack from '@clack/prompts'
import { ArgsError, helpText, parseArgs } from './args.ts'
import { checkTarget, createProject, TargetNotEmptyError } from './generate.ts'
import { hasServer, OptionsError, type ProjectOptions, resolveOptions } from './options.ts'
import { installCommand, runScript, svCommand } from './package-manager.ts'
import { type CommandRunner, runCommand, runPostSteps } from './post.ts'
import { askMissing, CancelledError, clackPrompter, type Prompter } from './prompts.ts'

/** Where the CLI writes. */
export interface Ui {
  intro(title: string): void
  info(message: string): void
  warn(message: string): void
  error(message: string): void
  success(message: string): void
  note(body: string, title: string): void
  outro(message: string): void
  /** Plain output (help, version, dry-run preview). */
  print(text: string): void
}

/** The real terminal UI. */
export const clackUi: Ui = {
  intro: (title) => clack.intro(title),
  info: (message) => clack.log.info(message),
  warn: (message) => clack.log.warn(message),
  error: (message) => clack.log.error(message),
  success: (message) => clack.log.success(message),
  note: (body, title) => clack.note(body, title),
  outro: (message) => clack.outro(message),
  print: (text) => {
    process.stdout.write(`${text}\n`)
  },
}

/** Everything the CLI needs from its environment. */
export interface MainDeps {
  readonly cwd: string
  readonly version: string
  /** `npm_config_user_agent`, to default the package manager to the one that ran us. */
  readonly userAgent?: string | undefined
  /** False when stdin or stdout is not a terminal (CI, pipes): then nothing is asked. */
  readonly interactive: boolean
  /**
   * True on a CI server (see {@link isCi}). CI logs are kept and often shared, so the first admin
   * password is never printed there, even if the runner provides a terminal.
   */
  readonly ci?: boolean
  readonly ui?: Ui
  readonly prompter?: Prompter
  readonly run?: CommandRunner
  readonly generateSecret?: () => string
}

/**
 * Whether the environment looks like a CI server: `CI` set to anything but empty, `0` or `false`
 * (GitHub Actions, GitLab, CircleCI, Buildkite and most others), or `TF_BUILD` (Azure Pipelines).
 */
export function isCi(env: Readonly<Record<string, string | undefined>>): boolean {
  const ci = env['CI']?.trim().toLowerCase()
  if (ci !== undefined && ci !== '' && ci !== '0' && ci !== 'false') return true
  return env['TF_BUILD'] !== undefined && env['TF_BUILD'] !== ''
}

/** Default project name for a non-interactive run without a folder. */
export const DEFAULT_NAME = 'strutvane-app'

/** Quote a path for a copy-paste shell command when it contains spaces. */
function shellPath(path: string): string {
  return /\s/.test(path) ? `"${path}"` : path
}

function nextSteps(options: ProjectOptions, cwd: string, installed: boolean): string {
  const run = (s: string) => runScript(options.packageManager, s)
  const steps = [`cd ${shellPath(relative(cwd, options.directory) || '.')}`]
  if (!installed) steps.push(installCommand(options.packageManager))
  if (options.docker !== 'off') steps.push(run('services:up'))
  if (hasServer(options))
    steps.push(
      svCommand(options.packageManager, 'migrate'),
      svCommand(options.packageManager, 'db:seed'),
    )
  steps.push(run('dev'))
  return steps.join('\n')
}

/** Run the CLI. Returns the process exit code. */
export async function main(argv: readonly string[], deps: MainDeps): Promise<number> {
  const ui = deps.ui ?? clackUi
  try {
    const args = parseArgs(argv, deps.cwd)
    if (args.help) {
      ui.print(helpText(deps.version))
      return 0
    }
    if (args.version) {
      ui.print(deps.version)
      return 0
    }

    ui.intro(`create-strutvane ${deps.version}`)

    // Fail fast on bad flags or an occupied folder, before asking any question.
    resolveOptions(
      { ...args.input, name: args.input.name ?? DEFAULT_NAME },
      { cwd: deps.cwd, userAgent: deps.userAgent },
    )
    if (args.input.directory !== undefined) await checkTarget(args.input.directory)

    const interactive = deps.interactive && !args.yes
    let input = args.input
    if (interactive) {
      input = await askMissing(args, deps.prompter ?? clackPrompter)
    } else if (input.name === undefined) {
      input = { ...input, name: DEFAULT_NAME }
    }

    const { options, warnings } = resolveOptions(input, {
      cwd: deps.cwd,
      userAgent: deps.userAgent,
    })
    for (const w of warnings) ui.warn(w)

    const result = await createProject(options, {
      dryRun: args.dryRun,
      ...(deps.generateSecret ? { generateSecret: deps.generateSecret } : {}),
    })

    if (args.dryRun) {
      ui.print(result.tree)
      ui.print('')
      ui.print(result.diff)
      ui.outro(
        `Dry run: ${result.files.length} files would be created in ${options.directory}. Nothing was written.`,
      )
      return 0
    }

    ui.success(`Created ${result.files.length} files in ${options.directory}`)
    const post = await runPostSteps(options, deps.run ?? runCommand)
    for (const w of post.warnings) ui.warn(w)
    if (post.git === 'committed')
      ui.success('Initialised a git repository with a first commit (branch main).')
    if (post.git === 'inside-existing-repo')
      ui.info('The folder is inside an existing git repository, so no new one was created.')

    if (result.generatedSecrets.length > 0) {
      ui.info(`Generated secrets in .env (never committed): ${result.generatedSecrets.join(', ')}`)
    }
    if (result.showOnce.length > 0) {
      // Print the password only to a person at a terminal: the output of `--yes`, piped and CI
      // runs usually ends up in logs, which outlive the password and are read by others.
      if (interactive && deps.ci !== true) {
        ui.note(
          `${result.showOnce.map((s) => `${s.key}=${s.value}`).join('\n')}\n\nShown once. It is also in .env; change it after your first sign-in.`,
          'Your first admin sign-in',
        )
      } else {
        ui.info(
          `Your first admin sign-in: the password is ${result.showOnce.map((s) => s.key).join(', ')} in .env (not printed outside an interactive terminal). Change it after your first sign-in.`,
        )
      }
    }
    ui.note(nextSteps(options, deps.cwd, post.installed), 'Next steps')
    ui.outro('Happy building!')
    return 0
  } catch (error) {
    if (error instanceof CancelledError) {
      ui.outro(error.message)
      return 130
    }
    if (error instanceof OptionsError) {
      ui.error(`Please fix:\n${error.problems.map((p) => `- ${p}`).join('\n')}`)
      return 1
    }
    if (error instanceof ArgsError) {
      ui.error(`${error.message}\nRun with --help to see every option.`)
      return 1
    }
    if (error instanceof TargetNotEmptyError) {
      ui.error(error.message)
      return 1
    }
    ui.error(
      `Could not create the project: ${error instanceof Error ? error.message : String(error)}`,
    )
    return 1
  }
}
