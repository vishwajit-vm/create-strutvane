/**
 * The app files the installer still writes itself, on top of the vendored strutvane-skeleton
 * (skeleton INSTALLER.md §4). The skeleton owns the app layout (bootstrap, routes, controllers,
 * the typed `defineConfig` files, the users table, model, policy, factory and seeders, the UI
 * entry); this module only has what depends on installer answers the skeleton does not know:
 *
 * - the two `answers`-mode files the skeleton names: `config/auth.ts` ({@link configAuth}) and
 *   `config/tenancy.ts` ({@link tenancyConfig});
 * - the answer-only configs (`config/api.ts`, `mail.ts`, `security.ts`, `monitoring.ts`,
 *   `permissions.ts`, `ai.ts`): plain data for packages that are not built yet;
 * - the first-admin seeder (until `node strut install:auth` writes it) and its place in
 *   `database.seeder.ts`;
 * - the answers of `config/ui.ts` that the skeleton's template does not take yet;
 * - the browser test of the "Vitest + Playwright" answer.
 *
 * Every function is pure: same options, same text.
 *
 * @module
 */
import type { ProjectOptions, RoleSet } from '../options.ts'

/** A generated file: POSIX path relative to the project root, and its text. */
export interface GeneratedFile {
  readonly path: string
  readonly content: string
  /** Written with mode 0o755 on macOS and Linux (`strut.js`). */
  readonly executable?: boolean
}

/** The roles each starting-role preset creates (decision #27). */
export const ROLE_PRESETS: Readonly<Record<RoleSet, readonly string[]>> = Object.freeze({
  'admin-member': Object.freeze(['admin', 'member']),
  'admin-manager-member-viewer': Object.freeze(['admin', 'manager', 'member', 'viewer']),
})

/**
 * The installer-only app files for these options (the skeleton's files come separately).
 *
 * @example
 * installerAppFiles(options).map((f) => f.path) // ['config/api.ts', 'config/mail.ts', ...]
 */
export function installerAppFiles(options: ProjectOptions): GeneratedFile[] {
  const files: GeneratedFile[] = [...answerConfigFiles(options)]
  if (options.auth !== 'none')
    files.push({ path: 'database/seeders/admin.seeder.ts', content: ADMIN_SEEDER })
  if (options.testing === 'vitest-playwright')
    files.push({ path: 'tests/browser/home.spec.ts', content: BROWSER_TEST })
  return files
}

/**
 * A config file whose values are plain data. JSON is valid TypeScript, and every value was
 * checked by resolveOptions, so nothing typed by the user can break out of the literal.
 */
function dataConfig(
  path: string,
  comment: string,
  data: Readonly<Record<string, unknown>>,
): GeneratedFile {
  return { path, content: `${comment.trim()}\nexport default ${JSON.stringify(data, null, 2)}\n` }
}

/**
 * The config files that record installer answers for packages that are not built yet (the
 * packages read them when they arrive). Plain data, like `config/auth.ts` and
 * `config/tenancy.ts`: they are not `defineConfig` files and not in `config/index.ts`, so they
 * never read `process.env` and never take part in the boot-time validation.
 *
 * Cache, sessions and file storage are not here (INSTALLER.md §5, bug 7): the skeleton's typed
 * `config/cache.ts`, `session.ts` and `filesystems.ts` read `CACHE_STORE`, `SESSION_DRIVER` and
 * `FILESYSTEM_DISK` from `.env` (see `templates/env.ts`).
 */
function answerConfigFiles(options: ProjectOptions): GeneratedFile[] {
  const files = [
    dataConfig(
      'config/api.ts',
      `// The API (/api). Deny by default: without sign-in every request needs an API token
// (create one with: node strut token:create); a route opts out only explicitly, one by one.`,
      {
        prefix: '/api',
        requireToken: options.auth === 'none',
        access: options.apiAccess,
        publicRoutes: ['/api/health'],
      },
    ),
    dataConfig(
      'config/mail.ts',
      '// Mail. Development always uses Mailpit (Docker) or the log; this is the production mailer.',
      { production: options.mailer },
    ),
    dataConfig(
      'config/security.ts',
      `// Security profile. "strict": 2FA required for admins, breached-password check, 8-hour sessions,
// strict Content-Security-Policy and HSTS preload. "standard" keeps the safe defaults.`,
      { profile: options.securityProfile, activityHistory: options.activityLog },
    ),
    dataConfig(
      'config/monitoring.ts',
      '// Monitoring. "otel" exports traces and metrics with OpenTelemetry (endpoint from .env).',
      { exporter: options.monitoring, healthPage: options.monitoring === 'otel' },
    ),
  ]
  if (options.roles !== undefined) {
    files.push(
      dataConfig(
        'config/permissions.ts',
        '// The roles new apps start with. Change them here; policies decide what each role may do.',
        { preset: options.roles, roles: ROLE_PRESETS[options.roles] },
      ),
    )
  }
  if (options.aiProvider !== undefined) {
    files.push(
      dataConfig(
        'config/ai.ts',
        `// AI features. The provider's API key lives only in .env (the installer never asks for it).
// MCP: lets AI agents use the app under your policies and teams.`,
        { provider: options.aiProvider, mcpServer: options.mcpServer },
      ),
    )
  } else if (options.mcpServer) {
    files.push(
      dataConfig(
        'config/ai.ts',
        '// MCP: lets AI agents use the app under your policies and teams.',
        { mcpServer: true },
      ),
    )
  }
  return files
}

/**
 * `config/auth.ts` (the skeleton's `configAuth` generator). Sign-in settings (decision #26): the
 * features live here, written from the installer's answers, never in `AUTH_*` keys. The names
 * are the one list of decisions #25 and #107; every optional feature is stated explicitly (#28).
 * Plain data, so the file loads without the auth package.
 *
 * @example
 * configAuth(options) // "// Sign-in features ...\nexport default { features: { password: true, ..."
 */
export function configAuth(options: ProjectOptions): string {
  const has = (feature: string): boolean => options.security.some((picked) => picked === feature)
  const password = options.auth === 'email'
  const features = {
    password,
    emailLink: options.auth === 'magic-link',
    registration: has('registration'),
    emailVerification: has('verification'),
    // Always on with passwords (Fortify's model): nobody can be locked out for good.
    passwordReset: password,
    passwordConfirmation: password,
    twoFactor: has('2fa'),
    passkeys: has('passkeys'),
    apiTokens: options.apiAccess === 'tokens',
    teams: options.teams,
    impersonation: false,
  }
  const mode =
    options.auth === 'magic-link'
      ? '// Email link only: single-use links, valid 15 minutes, bound to the browser that asked.\n'
      : ''
  return `// Sign-in features, read by @strutvane/auth and chosen in the installer. Change them here, not in
// .env: APP_KEY is the one root secret, and every signing and encryption key is derived from it.
// Plain data on purpose, so the file loads without the auth package.
${mode}export default ${JSON.stringify(
    {
      features,
      // Client ids and secrets for these come from .env, never from this file.
      social: options.social,
      enterpriseSso: options.sso,
    },
    null,
    2,
  )}
`
}

/**
 * `config/tenancy.ts` (the skeleton's `tenancyConfig` generator). Teams (decision #90):
 * `{ enabled, column }`, off unless the teams answer was yes, plus how a request picks its team.
 *
 * @example
 * tenancyConfig(options) // "// Teams: ...\nexport default { enabled: false, column: 'tenant_id' }"
 */
export function tenancyConfig(options: ProjectOptions): string {
  const how = !options.teams
    ? 'Teams are off. Turn them on later with node strut install:teams.'
    : options.database === 'postgres'
      ? 'Isolation: the ORM tenant scope, plus PostgreSQL row-level security as a second lock.'
      : 'Isolation: the ORM tenant scope (PostgreSQL would add row-level security as a second lock).'
  const data: Record<string, unknown> = { enabled: options.teams, column: 'tenant_id' }
  if (options.tenantResolver !== undefined) data['resolver'] = options.tenantResolver
  return `// Teams: each customer company sees only its own data. ${how}
// \`node strut migrate\` and \`db:seed\` read this file directly, so keep it plain data.
// "resolver": how a request picks its team (the in-app team switcher, or the subdomain).
export default ${JSON.stringify(data, null, 2)}
`
}

/** One entry of `database.seeder.ts`'s call list: the class name and its file (no extension). */
interface SeederEntry {
  readonly name: string
  readonly file: string
}

const SEEDERS_START = '    // strut:seeders:start'
const SEEDERS_END = '    // strut:seeders:end'

/**
 * `database.seeder.ts` with the call list between the `strut:seeders` markers set for these
 * options (decision #104; `node strut make:migration --seeder` keeps that list later): the first
 * admin (with sign-in), then the skeleton's sample users (when sample data was chosen). The
 * imports follow the list, so the app type-checks with `noUnusedLocals`.
 *
 * Fails closed when the skeleton's file no longer has the markers or the import it starts from:
 * the vendoring check pins the file, so this only happens with a newer skeleton.
 *
 * @example
 * databaseSeeder(skeletonText, options)
 */
export function databaseSeeder(skeleton: string, options: ProjectOptions): string {
  const list: SeederEntry[] = []
  if (options.auth !== 'none') list.push({ name: 'AdminSeeder', file: 'admin' })
  if (options.sampleData) list.push({ name: 'UserSeeder', file: 'user' })
  const lines = skeleton.split('\n')
  const start = lines.indexOf(SEEDERS_START)
  const end = lines.indexOf(SEEDERS_END)
  const importAt = lines.findIndex((line) => line.startsWith('import UserSeeder from '))
  if (start === -1 || end !== start + 2 || importAt === -1) {
    throw new Error(
      'The skeleton database/seeders/database.seeder.ts no longer has the strut:seeders markers this installer edits. Vendor a matching skeleton or update the installer.',
    )
  }
  const imports = list.map((entry) => `import ${entry.name} from './${entry.file}.seeder.ts'`)
  const call = `    await call([${list.map((entry) => entry.name).join(', ')}])`
  return [
    ...lines.slice(0, importAt),
    ...imports,
    ...lines.slice(importAt + 1, start + 1),
    call,
    ...lines.slice(end),
  ].join('\n')
}

/**
 * The first admin (INSTALLER.md §5, bugs 1 and 6): seeders come from
 * `@strutvane/framework/database`, and `SeedContext.env` is the `APP_ENV` string, so the address
 * is read from the process environment (falling back to `.env`), never from `env[...]`. It calls
 * the driver-neutral `createFirstAdmin()` that @strutvane/auth is adding (decided 2026-11-18),
 * behind a guard: until the installed auth has it, seeding skips the admin and says what to do.
 */
const ADMIN_SEEDER = `// The first admin (SEED_ADMIN_EMAIL in .env), created once. Development only: seeding stops for
// APP_ENV=production or staging. The password is never stored in .env: setup passes a one-time
// password to this seeder and shows it once; it must be changed at the first sign-in.
// Lost it? Run: node strut user:password <email>
//
// createFirstAdmin() is the driver-neutral helper @strutvane/auth is adding. Until the installed
// version has it, this seeder creates nothing and says how to finish, instead of failing setup.
import { existsSync } from 'node:fs'
import * as auth from '@strutvane/auth'
import { defineSeeder } from '@strutvane/framework/database'

/** The planned @strutvane/auth helper: creates the account once, never changes an existing one. */
type CreateFirstAdmin = (
  db: unknown,
  admin: { readonly name: string; readonly email: string },
) => Promise<void>

/** SEED_ADMIN_EMAIL from the environment, else from .env (seeders run in the project root). */
function adminEmail(): string {
  if (process.env['SEED_ADMIN_EMAIL'] === undefined && existsSync('.env')) process.loadEnvFile('.env')
  return process.env['SEED_ADMIN_EMAIL'] ?? ''
}

export default defineSeeder({
  async run({ db, env }) {
    // \`env\` is APP_ENV (local, testing, staging or production), not the environment variables.
    if (env === 'production' || env === 'staging') return
    const createFirstAdmin: unknown = Reflect.get(auth, 'createFirstAdmin')
    if (typeof createFirstAdmin !== 'function') {
      process.stderr.write(
        'No first admin was created: the installed @strutvane/auth has no createFirstAdmin() yet.\\n' +
          'Update it (npm install @strutvane/auth@next), then run: node strut db:seed --class AdminSeeder\\n',
      )
      return
    }
    await (createFirstAdmin as CreateFirstAdmin)(db, { name: 'Admin', email: adminEmail() })
  },
})
`

const BROWSER_TEST = `// Browser test (Playwright). Browsers download on the first: npm run test:e2e
export const homePage = '/'
`

/**
 * `config/ui.ts` with the answers the skeleton's template does not take yet (appearance, UI
 * languages, installable app, live updates). The template holds the defaults; a line changes
 * only when the answer differs, and a missing line stops the run (never a silently lost answer).
 *
 * @example
 * uiConfig(skeletonText, options)
 */
export function uiConfig(skeleton: string, options: ProjectOptions): string {
  const replace = (text: string, from: string, to: string): string => {
    if (!text.includes(from)) {
      throw new Error(
        `The skeleton config/ui.ts no longer has "${from.trim()}". Vendor a matching skeleton or update the installer.`,
      )
    }
    return text.replace(from, to)
  }
  const literal = (value: unknown): string =>
    JSON.stringify(value).replaceAll('"', "'").replaceAll(',', ', ')
  let text = replace(
    skeleton,
    "  appearance: 'system',\n",
    `  appearance: ${literal(options.appearance ?? 'system')},\n`,
  )
  text = replace(
    text,
    "  languages: ['en'],\n",
    `  languages: ${literal(options.uiLanguages ?? ['en'])},\n`,
  )
  const extra: string[] = []
  if (options.pwa === true)
    extra.push(
      '  /** Installable app (PWA): home-screen icon and an offline page. */',
      '  pwa: true,',
    )
  if (options.liveUpdates === true)
    extra.push(
      '  /** Live updates: tables refresh when someone else changes the data. */',
      '  liveUpdates: true,',
    )
  return extra.length === 0 ? text : replace(text, '\n}\n', `\n${extra.join('\n')}\n}\n`)
}
