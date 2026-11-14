/**
 * Project-root files: `package.json`, tool configs and git hygiene files.
 *
 * Every dependency is pinned to an exact version (see `versions.ts`), so a project generated today
 * installs identically next month.
 *
 * @module
 */
import type { GeneratedFile } from '@strutvane/devkit'
import { hasExtra, hasServer, hasWeb, type ProjectOptions } from '../options.ts'
import { runScript } from '../package-manager.ts'
import { STRUTVANE_VERSION, VERSIONS } from '../versions.ts'
import { file, json, lines, sortKeys } from './util.ts'

const COMPOSE = 'docker compose --env-file .env -f docker/compose.yaml'

type Dep = keyof typeof VERSIONS

/** `[name, version]` pairs for third-party packages, using the pinned versions. */
const pinned = (...names: readonly Dep[]): [string, string][] => names.map((n) => [n, VERSIONS[n]])

/** Database driver packages per database. */
const DRIVERS: Readonly<Record<string, readonly Dep[]>> = {
  postgres: ['pg'],
  'azure-postgres': ['pg', '@azure/identity', '@azure/postgresql-auth'],
  mysql: ['mysql2'],
  'azure-mysql': ['mysql2', '@azure/identity'],
  sqlite: ['@libsql/client'],
}

/** Runtime dependencies for the chosen options. */
export function dependencies(o: ProjectOptions): Record<string, string> {
  const entries: [string, string][] = [['@strutvane/core', STRUTVANE_VERSION], ...pinned('zod')]
  if (hasServer(o)) {
    entries.push(['@strutvane/framework', STRUTVANE_VERSION])
    if (hasExtra(o, 'logs')) entries.push(['@strutvane/logs', STRUTVANE_VERSION])
    if (o.auth.length > 0) entries.push(['@strutvane/auth', STRUTVANE_VERSION])
    entries.push(...pinned(...(DRIVERS[o.database ?? ''] ?? [])))
    if (hasExtra(o, 'cache') || hasExtra(o, 'queue')) entries.push(...pinned('iovalkey'))
    if (hasExtra(o, 'queue')) entries.push(...pinned('bullmq'))
    if (hasExtra(o, 'mail')) entries.push(...pinned('nodemailer'))
    if (hasExtra(o, 'otel')) entries.push(...pinned('@opentelemetry/sdk-node'))
  }
  if (hasWeb(o)) {
    entries.push(
      ['@strutvane/ui', STRUTVANE_VERSION],
      ...pinned(
        'react',
        'react-dom',
        '@tanstack/react-query',
        '@tanstack/react-table',
        '@tanstack/react-form',
        '@tanstack/react-virtual',
      ),
    )
  }
  return sortKeys(Object.fromEntries(entries))
}

/** Development dependencies for the chosen options. */
export function devDependencies(o: ProjectOptions): Record<string, string> {
  const entries: [string, string][] = [
    ['strutvane', STRUTVANE_VERSION],
    // The launcher (`strutvane`) runs the project-local CLI; without it every command falls back to npx.
    ['@strutvane/cli', STRUTVANE_VERSION],
    ...pinned('@biomejs/biome', '@types/node', 'typescript', 'vitest'),
  ]
  if (hasWeb(o)) {
    entries.push(
      ...pinned(
        'vite',
        '@vitejs/plugin-react',
        '@types/react',
        '@types/react-dom',
        '@playwright/test',
      ),
    )
  }
  return sortKeys(Object.fromEntries(entries))
}

/**
 * package.json scripts. Server apps run through the `strutvane` launcher (which runs the CLI pinned
 * in the project); `sv` calls that project-local CLI (`strutvane-cli`) directly. The ui preset uses
 * Vite.
 */
export function scripts(o: ProjectOptions): Record<string, string> {
  const web = hasWeb(o)
  const server = hasServer(o)
  const entries: [string, string | false][] = [
    ['dev', server ? 'strutvane dev' : 'vite'],
    ['build', server ? 'strutvane build' : 'vite build'],
    ['start', server ? 'strutvane start' : 'vite preview'],
    ['test', 'vitest run'],
    ['test:e2e', web && 'playwright test'],
    ['lint', 'biome check .'],
    ['format', 'biome check --write .'],
    ['typecheck', web ? 'tsc --noEmit && tsc --noEmit -p web' : 'tsc --noEmit'],
    ['services:up', o.docker !== 'off' && `${COMPOSE} up -d --wait`],
    ['services:down', o.docker !== 'off' && `${COMPOSE} down`],
    // The project-local CLI (bin of @strutvane/cli), so `sv help` lists this project's commands.
    // The global `strutvane` launcher keeps its own help and never delegates it.
    ['sv', 'strutvane-cli'],
  ]
  return Object.fromEntries(entries.filter((e): e is [string, string] => e[1] !== false))
}

function packageJson(o: ProjectOptions): GeneratedFile {
  return file(
    'package.json',
    json({
      name: o.name,
      version: '0.1.0',
      private: true,
      type: 'module',
      engines: { node: '>=24' },
      ...(o.packageManager === 'pnpm' ? { packageManager: `pnpm@${VERSIONS.pnpm}` } : {}),
      scripts: scripts(o),
      dependencies: dependencies(o),
      devDependencies: devDependencies(o),
    }),
  )
}

function tsconfig(o: ProjectOptions): GeneratedFile {
  return file(
    'tsconfig.json',
    json({
      $schema: 'https://json.schemastore.org/tsconfig',
      compilerOptions: {
        target: 'ES2024',
        lib: ['ES2024'],
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        moduleDetection: 'force',
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        noImplicitOverride: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        isolatedModules: true,
        verbatimModuleSyntax: true,
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        forceConsistentCasingInFileNames: true,
        skipLibCheck: true,
        noEmit: true,
        types: ['node'],
      },
      include: ['**/*.ts'],
      // web/ has its own tsconfig (DOM + JSX); generated and local-only folders are never checked.
      exclude: [
        'node_modules',
        'dist',
        'coverage',
        'storage',
        'docker',
        '.strutvane',
        ...(hasWeb(o) ? ['web'] : []),
      ],
    }),
  )
}

function biome(): GeneratedFile {
  return file(
    'biome.json',
    json({
      $schema: `https://biomejs.dev/schemas/${VERSIONS['@biomejs/biome']}/schema.json`,
      vcs: { enabled: true, clientKind: 'git', useIgnoreFile: true },
      files: {
        ignoreUnknown: true,
        includes: ['**', '!**/*.md', '!database/migrations', '!.strutvane'],
      },
      formatter: {
        enabled: true,
        indentStyle: 'space',
        indentWidth: 2,
        lineWidth: 100,
        lineEnding: 'lf',
      },
      javascript: {
        formatter: { quoteStyle: 'single', semicolons: 'asNeeded', trailingCommas: 'all' },
      },
      linter: {
        enabled: true,
        rules: {
          preset: 'recommended',
          suspicious: { noExplicitAny: 'error', noFocusedTests: 'error' },
          style: {
            noNonNullAssertion: 'error',
            useImportType: 'error',
            useNodejsImportProtocol: 'error',
          },
        },
      },
      assist: { actions: { source: { organizeImports: 'on' } } },
    }),
  )
}

function vitestConfig(): GeneratedFile {
  return file(
    'vitest.config.ts',
    lines(
      "import { defineConfig } from 'vitest/config'",
      '',
      'export default defineConfig({',
      '  test: {',
      "    include: ['tests/unit/**/*.test.ts', 'tests/feature/**/*.test.ts'],",
      "    environment: 'node',",
      '  },',
      '})',
    ),
  )
}

function playwrightConfig(o: ProjectOptions): GeneratedFile {
  const port = hasServer(o) ? 3000 : 5173
  return file(
    'playwright.config.ts',
    lines(
      '/** Browser tests in tests/e2e. The dev server starts automatically. */',
      "import { defineConfig, devices } from '@playwright/test'",
      '',
      `const baseURL = 'http://localhost:${port}'`,
      '',
      'export default defineConfig({',
      "  testDir: 'tests/e2e',",
      '  forbidOnly: Boolean(process.env.CI),',
      '  retries: process.env.CI ? 2 : 0,',
      "  use: { baseURL, trace: 'on-first-retry' },",
      "  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],",
      '  webServer: {',
      `    command: '${runScript(o.packageManager, 'dev')}',`,
      '    url: baseURL,',
      '    reuseExistingServer: !process.env.CI,',
      '  },',
      '})',
    ),
  )
}

/** The generated `.gitignore`. Docker files are ignored unless `--docker=commit` (ADR-0006). */
export function gitignore(o: ProjectOptions): string {
  return lines(
    '# Dependencies',
    'node_modules/',
    '',
    '# Build and test output',
    'dist/',
    'coverage/',
    '*.tsbuildinfo',
    hasWeb(o) && 'test-results/',
    hasWeb(o) && 'playwright-report/',
    '',
    '# Environment: real values and secrets stay on this machine. .env.example IS committed.',
    '.env',
    '.env.*',
    '!.env.example',
    '',
    '# Strutvane state (ADR-0012). Generated files (registry, types) and the staging area for safe',
    '# file changes stay local; the upgrade state (lock.json, base/, templates/) is committed so',
    '# `sv upgrade` can merge template changes for everyone. Runtime files stay local too.',
    '.strutvane/*',
    '!.strutvane/README.md',
    '!.strutvane/lock.json',
    '!.strutvane/base/',
    '!.strutvane/templates/',
    '.strutvane/staging/',
    'storage/*',
    '!storage/.gitkeep',
    '*.log',
    '',
    o.docker === 'commit'
      ? '# Docker: committed on purpose (--docker=commit). Still local development only.'
      : '# Docker: local development only, never committed (ADR-0006)',
    o.docker !== 'commit' && 'docker/',
    o.docker !== 'commit' && 'compose.yaml',
    o.docker !== 'commit' && 'docker-compose*.yml',
    '',
    '# OS and editor files',
    '.DS_Store',
    'Thumbs.db',
    '.idea/',
    '.vscode/*',
    '!.vscode/extensions.json',
  )
}

function gitattributes(): GeneratedFile {
  return file(
    '.gitattributes',
    lines(
      '# Normalise line endings: LF in the repository on every OS (Windows checkouts stay consistent).',
      '* text=auto eol=lf',
      '*.png binary',
      '*.jpg binary',
      '*.ico binary',
      '*.woff2 binary',
    ),
  )
}

function editorconfig(): GeneratedFile {
  return file(
    '.editorconfig',
    lines(
      'root = true',
      '',
      '[*]',
      'charset = utf-8',
      'end_of_line = lf',
      'indent_style = space',
      'indent_size = 2',
      'insert_final_newline = true',
      'trim_trailing_whitespace = true',
      '',
      '[*.md]',
      'trim_trailing_whitespace = false',
    ),
  )
}

/**
 * `pnpm-workspace.yaml` for pnpm projects: pnpm's project settings file (there is no `packages`
 * list, so the project is not a monorepo). Verified with pnpm 12.18.0:
 *
 * - `allowBuilds: { esbuild: true }`. pnpm 12 fails `pnpm install` with ERR_PNPM_IGNORED_BUILDS
 *   when a dependency has a build script nobody approved. esbuild (pulled in by Vite and the
 *   migration tooling) has one: its postinstall sets up the platform binary. Only esbuild is
 *   approved; every other dependency's scripts stay blocked. An entry for a package that is not in
 *   the tree is ignored, so the ui preset can share the file.
 * - `minimumReleaseAgeExclude`. Strutvane pre-releases are staged and approved with 2FA
 *   (ADR-0018), so a just-published train must install at once; every third-party package keeps
 *   pnpm's "too new" protection. `@strutvane/*` does not match the unscoped `strutvane` CLI, so it
 *   is listed too.
 *
 * Other package managers need no equivalent (checked 2026-11-14): npm 11 and Yarn run dependency
 * build scripts; npm 12 skips unapproved ones with a warning only, and esbuild still works through
 * its platform package (an optional dependency); Bun trusts esbuild by default (its built-in
 * trusted-dependencies list).
 */
function pnpmWorkspace(): GeneratedFile {
  return file(
    'pnpm-workspace.yaml',
    lines(
      '# pnpm settings for this project (not a monorepo: there is no `packages` list).',
      '',
      '# esbuild (used by Vite and the migration tooling) sets up its platform binary in a',
      '# build step. pnpm runs only the build scripts listed here; all others stay blocked.',
      'allowBuilds:',
      '  esbuild: true',
      '',
      '# Strutvane pre-releases are staged and approved with 2FA (ADR-0018), so they install as',
      `# soon as they are published. Every third-party package keeps pnpm's "too new" protection.`,
      'minimumReleaseAgeExclude:',
      '  - "@strutvane/*"',
      '  - strutvane',
    ),
  )
}

/** Every root-level file. */
export function rootFiles(o: ProjectOptions): GeneratedFile[] {
  const out = [
    packageJson(o),
    tsconfig(o),
    biome(),
    vitestConfig(),
    file('.gitignore', gitignore(o)),
    gitattributes(),
    editorconfig(),
  ]
  // storage/ is ignored except this marker, so a fresh clone still has the folder.
  if (hasServer(o)) out.push(file('storage/.gitkeep', ''))
  if (hasWeb(o)) out.push(playwrightConfig(o))
  if (o.packageManager === 'pnpm') out.push(pnpmWorkspace())
  return out
}
