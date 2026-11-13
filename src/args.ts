/**
 * Command-line parsing. Every prompt has a flag, so the starter is fully scriptable:
 *
 * ```bash
 * npm create strutvane@latest acme -- --preset api --db mysql --auth email,google --yes
 * ```
 *
 * A small hand-written parser (rather than `node:util` `parseArgs`) because some flags take an
 * optional value (`--docker` / `--docker=commit`, `--tenancy` / `--tenancy=none`) and every error
 * must name the flag and the fix. Values are only *parsed* here; {@link resolveOptions} validates
 * them, so the CLI and the JavaScript API apply the same rules.
 *
 * @module
 */
import { basename, resolve } from 'node:path'
import type { RawProjectInput } from './options.ts'
import {
  AUTH_METHODS,
  DATABASES,
  DOCKER_MODES,
  EXTRAS,
  PACKAGE_MANAGERS,
  PRESETS,
} from './options.ts'

/** The parsed command line. */
export interface ParsedArgs {
  readonly input: RawProjectInput
  /** Which options were given on the command line (they are never prompted for). */
  readonly given: ReadonlySet<keyof RawProjectInput>
  readonly yes: boolean
  readonly dryRun: boolean
  readonly help: boolean
  readonly version: boolean
}

/** A command-line mistake, reported with usage help. */
export class ArgsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArgsError'
  }
}

/** `--help` text. */
export function helpText(version: string): string {
  return [
    `create-strutvane ${version}: start a new Strutvane project`,
    '',
    'Usage:',
    '  npm create strutvane@latest [folder] -- [options]',
    '  pnpm create strutvane [folder] [options]',
    '',
    'Options (anything not given is asked, or defaulted with --yes):',
    `  --preset <name>          ${PRESETS.join(' | ')} (default: full)`,
    `  --db, --database <name>  ${DATABASES.join(' | ')} (default: postgres)`,
    `  --auth <list|none>       comma-separated: ${AUTH_METHODS.join(', ')} (default: email)`,
    '  --tenancy, --no-tenancy  multi-tenancy, shared database (default: off)',
    `  --extras <list|none>     comma-separated: ${EXTRAS.join(', ')} (default: logs)`,
    '  --docker[=mode]          local (git-ignored, default) | commit | off',
    '  --no-docker              same as --docker=off',
    `  --pm <name>              ${PACKAGE_MANAGERS.join(' | ')} (default: the one you ran this with)`,
    '  --name <name>            package name (default: the folder name)',
    '  --no-git                 skip git init and the first commit',
    '  --install                install dependencies after creating the project',
    '  -y, --yes                accept defaults for everything not given (no prompts)',
    '  --dry-run                show the files and their contents; write nothing',
    '  -h, --help               show this help',
    '  -v, --version            show the version',
    '',
    'Examples:',
    '  npm create strutvane@latest acme',
    '  pnpm create strutvane acme --preset api --db mysql --auth email,google --yes',
    '  pnpm create strutvane portal --preset ui --dry-run',
  ].join('\n')
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

/** `email,google` → `['email','google']`; `none` → `[]`. */
function list(value: string): string[] {
  if (value.trim() === 'none') return []
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

const OPTIONAL_VALUE: Record<string, readonly string[]> = {
  '--docker': DOCKER_MODES,
  '--tenancy': ['shared', 'none', 'true', 'false'],
}

/** Parse `argv` (without `node` and the script path). */
export function parseArgs(argv: readonly string[], cwd: string): ParsedArgs {
  const input: Mutable<RawProjectInput> = {}
  const given = new Set<keyof RawProjectInput>()
  let yes = false
  let dryRun = false
  let help = false
  let version = false
  let folder: string | undefined

  const set = <K extends keyof RawProjectInput>(key: K, value: RawProjectInput[K]) => {
    input[key] = value
    given.add(key)
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string
    if (token === '--') continue
    if (!token.startsWith('-') || token === '-') {
      if (folder !== undefined)
        throw new ArgsError(`unexpected argument "${token}" (only one folder can be given)`)
      folder = token
      continue
    }
    const eq = token.indexOf('=')
    const flag = eq > 0 ? token.slice(0, eq) : token
    let inline = eq > 0 ? token.slice(eq + 1) : undefined

    /** The flag's value: `--flag=value` or `--flag value`. */
    const value = (): string => {
      if (inline !== undefined) return inline
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('-')) throw new ArgsError(`${flag} needs a value`)
      i++
      return next
    }
    /** Optional value: `--flag`, `--flag=value`, or `--flag value` when value is a known choice. */
    const optional = (): string | undefined => {
      if (inline !== undefined) return inline
      const next = argv[i + 1]
      if (next !== undefined && (OPTIONAL_VALUE[flag] ?? []).includes(next)) {
        i++
        inline = next
        return next
      }
      return undefined
    }
    const noValue = () => {
      if (inline !== undefined) throw new ArgsError(`${flag} does not take a value`)
    }

    switch (flag) {
      case '--preset':
        set('preset', value())
        break
      case '--db':
      case '--database':
        set('database', value())
        break
      case '--auth':
        set('auth', list(value()))
        break
      case '--no-auth':
        noValue()
        set('auth', [])
        break
      case '--tenancy': {
        const v = optional()
        if (v !== undefined && !(OPTIONAL_VALUE['--tenancy'] ?? []).includes(v)) {
          throw new ArgsError(`--tenancy must be shared or none (got "${v}")`)
        }
        set('tenancy', v === undefined || v === 'shared' || v === 'true')
        break
      }
      case '--no-tenancy':
        noValue()
        set('tenancy', false)
        break
      case '--extras':
        set('extras', list(value()))
        break
      case '--no-extras':
        noValue()
        set('extras', [])
        break
      case '--docker':
        set('docker', optional() ?? 'local')
        break
      case '--no-docker':
        noValue()
        set('docker', 'off')
        break
      case '--pm':
      case '--package-manager':
        set('packageManager', value())
        break
      case '--name':
        set('name', value())
        break
      case '--git':
        noValue()
        set('git', true)
        break
      case '--no-git':
        noValue()
        set('git', false)
        break
      case '--install':
        noValue()
        set('install', true)
        break
      case '--no-install':
        noValue()
        set('install', false)
        break
      case '-y':
      case '--yes':
        noValue()
        yes = true
        break
      case '--dry-run':
        noValue()
        dryRun = true
        break
      case '-h':
      case '--help':
        help = true
        break
      case '-v':
      case '--version':
        version = true
        break
      default:
        throw new ArgsError(`unknown option ${flag} (see --help)`)
    }
  }

  if (folder !== undefined) {
    const directory = resolve(cwd, folder)
    input.directory = directory
    given.add('directory')
    // The folder name is the package name unless --name says otherwise (`.` = current folder).
    if (input.name === undefined) set('name', basename(directory))
  }
  return { input, given, yes, dryRun, help, version }
}
