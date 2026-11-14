/**
 * The generated app's `README.md` (how to run it, commands, environment reference) and `CLAUDE.md`
 * (project memory for AI assistants). Commands are written for the chosen package manager.
 *
 * @module
 */
import type { GeneratedFile } from '@strutvane/devkit'
import type { EnvSection } from '../env-spec.ts'
import { hasServer, hasWeb, type ProjectOptions } from '../options.ts'
import { installCommand, runScript, svCommand } from '../package-manager.ts'
import { file, lines } from './util.ts'

const PRESET_SUMMARY = {
  full: 'a full-stack Strutvane app: REST API, database and a generated React UI',
  api: 'a Strutvane API: database, a documented REST API and background work',
  ui: 'a Strutvane UI for an existing API (screens generated from its manifest or OpenAPI document)',
} as const

/** Escape a value for a Markdown table cell. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|')
}

/**
 * The "Environment variables" table, one row per key. "Default" is the committed `.env.example`
 * value (secrets show no value).
 */
export function envTable(sections: readonly EnvSection[]): string[] {
  const out = ['| Key | Default | What it does |', '|---|---|---|']
  for (const section of sections) {
    out.push(`| **${cell(section.title)}** | | |`)
    for (const v of section.vars) {
      // The committed default (.env.example); a different local value is noted next to it.
      const committed = v.example ?? v.value
      const shown =
        v.secret === true
          ? '_generated_'
          : committed === '' || committed === undefined
            ? '_empty_'
            : `\`${cell(committed)}\`` +
              (v.example !== undefined && v.value !== undefined && v.value !== v.example
                ? ` (local \`.env\`: \`${cell(v.value)}\`)`
                : '')
      out.push(`| \`${v.key}\` | ${shown} | ${cell(v.comment)} |`)
    }
  }
  return out
}

function quickStart(o: ProjectOptions): string[] {
  const run = (s: string) => runScript(o.packageManager, s)
  const sv = (args: string) => svCommand(o.packageManager, args)
  const steps = [installCommand(o.packageManager)]
  if (o.docker !== 'off')
    steps.push(`${run('services:up')}     # starts the local database and services (Docker)`)
  if (hasServer(o)) steps.push(`${sv('migrate')}`, `${sv('db:seed')}`)
  steps.push(`${run('dev')}`)
  return ['```bash', ...steps, '```']
}

function commands(o: ProjectOptions): string[] {
  const run = (s: string) => runScript(o.packageManager, s)
  const sv = (args: string) => svCommand(o.packageManager, args)
  const rows: [string, string][] = [
    [
      run('dev'),
      hasServer(o) ? 'Start the API (and UI) with hot reload' : 'Start the UI with hot reload',
    ],
    [run('build'), 'Production build'],
    [run('start'), hasServer(o) ? 'Run the production build' : 'Preview the production build'],
    [run('test'), 'Unit and feature tests (Vitest)'],
  ]
  if (hasWeb(o)) rows.push([run('test:e2e'), 'Browser tests (Playwright)'])
  rows.push([run('lint'), 'Lint and format check (Biome)'], [run('typecheck'), 'TypeScript check'])
  if (o.docker !== 'off') {
    rows.push(
      [run('services:up'), 'Start local Docker services'],
      [run('services:down'), 'Stop them (data is kept in volumes)'],
    )
  }
  if (hasServer(o)) {
    rows.push(
      [
        sv('make:model Invoice'),
        'Add a model: migration, CRUD API, permissions, tests and UI pages',
      ],
      [sv('migrate'), 'Generate and apply migrations from your models'],
      [sv('routes'), 'List every API route'],
    )
  }
  rows.push([sv('env:check'), 'Compare .env with .env.example'])
  return [
    '| Command | What it does |',
    '|---|---|',
    ...rows.map(([c, d]) => `| \`${cell(c)}\` | ${d} |`),
  ]
}

function layout(o: ProjectOptions): string[] {
  const rows: string[] = []
  if (hasServer(o)) {
    rows.push(
      '- `app/`: your code (models, policies, services, routes, jobs, providers)',
      '- `database/`: migrations (generated, committed), seeders and factories',
    )
  }
  rows.push('- `config/`: typed settings that read the validated environment')
  if (hasWeb(o))
    rows.push('- `web/`: the UI (pages are generated; override only what you customise)')
  rows.push(`- \`tests/\`: unit, feature${hasWeb(o) ? ' and browser (e2e)' : ''} tests`)
  rows.push('- `env.ts` / `env.schema.ts`: every environment variable, validated at startup')
  rows.push('- `strutvane.config.ts`: which Strutvane packages are active')
  if (o.docker !== 'off') {
    rows.push(
      o.docker === 'local'
        ? '- `docker/`: local services only, **git-ignored** (never deployed)'
        : '- `docker/`: local services only (committed for the team, never deployed)',
    )
  }
  rows.push(
    '- `.strutvane/`: generated files (registry, types, staging), git-ignored, except the upgrade' +
      ' state `lock.json`, `base/` and `templates/`, which are committed so `sv upgrade` works for' +
      ' the whole team',
  )
  if (hasServer(o)) rows.push('- `storage/`: runtime files (logs, uploads), git-ignored')
  return rows
}

/** The generated README. */
export function readmeFile(o: ProjectOptions, sections: readonly EnvSection[]): GeneratedFile {
  return file(
    'README.md',
    lines(
      `# ${o.name}`,
      '',
      `This is ${PRESET_SUMMARY[o.preset]}, created with [create-strutvane](https://github.com/vishwajit-vm/create-strutvane).`,
      '',
      '## Quick start',
      '',
      'You need Node.js 24 or newer' +
        (o.docker !== 'off' ? ' and Docker (for the local database and services).' : '.'),
      '',
      ...quickStart(o),
      '',
      hasServer(o)
        ? 'The API runs on http://localhost:3000 (interactive API docs at http://localhost:3000/docs).'
        : 'The UI runs on http://localhost:5173 and talks to the API set in `VITE_API_URL`.',
      '',
      '## Commands',
      '',
      ...commands(o),
      '',
      '## Project layout',
      '',
      ...layout(o),
      '',
      '## Environment variables',
      '',
      '`.env` holds your local values and secrets and is **never committed**. `.env.example` lists every key',
      'with documentation and is committed. The app checks every key at startup and stops with one clear',
      'message if something is missing or invalid.',
      '',
      ...envTable(sections),
      '',
      '## Secrets',
      '',
      '- Secrets were generated for you in `.env` when the project was created.',
      '- In staging and production, set them through your hosting platform or secret store, never in files.',
      hasServer(o) &&
        `- Rotate the app key with \`${svCommand(o.packageManager, 'key:generate')}\`.`,
    ),
  )
}

/** The generated CLAUDE.md: short project memory for AI assistants working in this app. */
export function claudeFile(o: ProjectOptions): GeneratedFile {
  const run = (s: string) => runScript(o.packageManager, s)
  const sv = (args: string) => svCommand(o.packageManager, args)
  return file(
    'CLAUDE.md',
    lines(
      `# CLAUDE.md: ${o.name}`,
      '',
      'Project memory for AI assistants. Keep it short and current.',
      '',
      '## What this is',
      '',
      `${PRESET_SUMMARY[o.preset].replace(/^a /, 'A ')} built on Strutvane (TypeScript, ESM, Node 24+).`,
      `Preset: \`${o.preset}\`` +
        (o.database ? `, database: \`${o.database}\`` : '') +
        (o.auth.length > 0 ? `, auth: ${o.auth.map((a) => `\`${a}\``).join(', ')}` : '') +
        (o.tenancy ? ', multi-tenant' : '') +
        '.',
      '',
      '## Rules',
      '',
      hasServer(o) &&
        '- Models in `app/models/` are the source of truth. Change a model, then run `' +
          sv('migrate') +
          '`; never hand-edit applied migrations.',
      hasServer(o) &&
        `- Generate code with \`${sv('make:*')}\` (model, policy, job, …) instead of writing boilerplate.`,
      '- Read settings through `config/*.ts`, never `process.env`. A new env key goes into `env.schema.ts`, `.env.example` and `.env`.',
      '- Never commit `.env`, secrets, `storage/` or generated `.strutvane/` files (only its `lock.json`, `base/` and `templates/` are committed).' +
        (o.docker === 'local' ? ' `docker/` is local-only and git-ignored.' : ''),
      hasServer(o) &&
        '- Log with the app logger, never `console.*`. Never log secrets or request bodies.',
      hasServer(o) && '- Authorization is deny-by-default: add a policy for every new model.',
      hasWeb(o) &&
        '- UI pages are generated from the API manifest. Override single pages in `web/pages/` rather than rewriting them.',
      '',
      '## Before you finish a change',
      '',
      '```bash',
      run('lint'),
      run('typecheck'),
      run('test'),
      '```',
    ),
  )
}
