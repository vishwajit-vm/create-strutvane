/**
 * The generated app's source files, in the Laravel-style MVC layout of the v2 blueprint (§3.1):
 * `app/http/controllers`, `app/models`, `app/policies`, `bootstrap/app.ts`, `routes/`, `config/`,
 * `database/{migrations,seeders,factories}`, `resources/ui`, `tests/`.
 *
 * File names follow decision #34: models stay plain (`app/models/user.ts`), every other kind of
 * file takes a dot suffix (`user.policy.ts`, `user.factory.ts`, `database.seeder.ts`,
 * `health.controller.ts`). The code follows the framework's documented shapes: the fluent
 * `Application.configure()` bootstrap (#46), `Model('users', { fillable })` (#59),
 * `defineSeeder` (#88) with the `strut:seeders` markers (#104), `defineFactory` (#89), route files
 * that export a `(router) => {}` callback, and Vitest tests (#76).
 *
 * @module
 */
import {
  DESIGN_NAMES,
  designInfo,
  otherDesign,
  type ProjectOptions,
  type RoleSet,
} from '../options.ts'

/** A generated file: POSIX path relative to the project root, and its text. */
export interface GeneratedFile {
  readonly path: string
  readonly content: string
}

/** The roles each starting-role preset creates (decision #27). */
export const ROLE_PRESETS: Readonly<Record<RoleSet, readonly string[]>> = Object.freeze({
  'admin-member': Object.freeze(['admin', 'member']),
  'admin-manager-member-viewer': Object.freeze(['admin', 'manager', 'member', 'viewer']),
})

/** The table the migrator records applied migrations in (decision #36, Laravel's name). */
export const MIGRATIONS_TABLE = 'migrations'

/** The SQLite database file (decision #96, Laravel's place). */
export const SQLITE_FILE = 'database/database.sqlite'

/**
 * Every app source file for these options.
 *
 * @example
 * appFiles(options).map((f) => f.path) // ['bootstrap/app.ts', 'routes/web.ts', ...]
 */
export function appFiles(options: ProjectOptions): GeneratedFile[] {
  const signIn = options.auth !== 'none'
  const files: GeneratedFile[] = [
    { path: 'bootstrap/app.ts', content: BOOTSTRAP },
    { path: 'routes/web.ts', content: webRoutes(options) },
    { path: 'routes/api.ts', content: API_ROUTES },
    { path: 'app/http/controllers/health.controller.ts', content: HEALTH_CONTROLLER },
    { path: 'config/app.ts', content: configApp(options) },
    { path: 'config/database.ts', content: CONFIG_DATABASE },
    { path: 'config/cors.ts', content: CONFIG_CORS },
    { path: 'config/tenancy.ts', content: tenancyConfig(options) },
    ...answerConfigFiles(options),
    ...migrations(options),
    ...seeders(options),
  ]
  // Email-link sign-in has users too; only "no sign-in" has none (and no auth package, #107).
  if (signIn) {
    files.push(
      { path: 'app/models/user.ts', content: USER_MODEL },
      { path: 'app/policies/user.policy.ts', content: USER_POLICY },
      { path: 'config/auth.ts', content: configAuth(options) },
      { path: 'database/factories/user.factory.ts', content: USER_FACTORY },
    )
  }
  if (options.ui !== undefined) files.push(...uiFiles(options))
  if (options.testing !== 'none')
    files.push({ path: 'tests/feature/health.test.ts', content: HEALTH_TEST })
  if (options.testing === 'vitest-playwright') {
    files.push({ path: 'tests/browser/home.spec.ts', content: BROWSER_TEST })
  }
  return files
}

const BOOTSTRAP = `// Builds the application (Laravel's bootstrap/app.php): routes, middleware and error handling
// are registered here. \`node strut dev\` and the production server both start from this file.
// The health route /up is built in: it answers {"status":"ok"} to GET and HEAD, also during
// maintenance, so hosts, load balancers and the Dockerfile's HEALTHCHECK can call it.
import { join } from 'node:path'
import { Application } from '@strutvane/framework'
import api from '../routes/api.ts'
import web from '../routes/web.ts'

export default Application.configure({ basePath: join(import.meta.dirname, '..') })
  .withRouting({ web, api, health: '/up' })
  .withMiddleware(() => {})
  .withExceptions(() => {})
  .create()
`

function webRoutes(options: ProjectOptions): string {
  const page =
    options.ui === undefined
      ? `'<h1>${options.name}</h1><p>API only. Try <a href="/api/health">/api/health</a>.</p>'`
      : `'<h1>${options.name}</h1><p>The React UI (resources/ui) is served here by Vite in development.</p>'`
  return `// Browser routes. The React UI is mounted here in development (Vite middleware) and production.
import type { Router } from '@strutvane/framework'

export default (router: Router): void => {
  router.get('/', () => ${page})
}
`
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
 * The config files that record installer answers (the packages they name read them). One small
 * file per concern, like Laravel's config folder.
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
      'config/cache.ts',
      '// Cache, queue and sessions. "database" needs no extra service; "redis" needs REDIS_URL in .env.',
      { store: options.cache, queue: options.cache, sessions: options.cache },
    ),
    dataConfig(
      'config/filesystems.ts',
      '// Where uploaded files go. "s3" reads its bucket and keys from .env (never from this file).',
      { default: options.storage },
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

const API_ROUTES = `// API routes, served under /api (versioning such as /api/v1 is opt-in with Route.prefix).
// The CRUD routes for your models are registered in routes/resources.gen.ts by node strut migrate.
import type { Router } from '@strutvane/framework'
import { HealthController } from '../app/http/controllers/health.controller.ts'

export default (router: Router): void => {
  router.get('/health', HealthController.show)
}
`

const HEALTH_CONTROLLER = `// A tiny controller: GET /api/health answers whether the API is up. (GET /up, the built-in
// health route, is what hosts and load balancers call.)
export const HealthController = {
  show(): { status: string } {
    return { status: 'ok' }
  },
}
`

/** Application settings: per-machine values from .env, the regional defaults from the installer. */
function configApp(options: ProjectOptions): string {
  return `// Application settings. Per-machine values come from .env; change the regional defaults here.
export default {
  name: process.env['APP_NAME'] ?? 'app',
  env: process.env['APP_ENV'] ?? 'production',
  url: process.env['APP_URL'] ?? 'http://localhost:3000',
  debug: process.env['APP_DEBUG'] === 'true',
  locale: ${JSON.stringify(options.locale)},
  timezone: ${JSON.stringify(options.timezone)},
  currency: ${JSON.stringify(options.currency)},
}
`
}

const CONFIG_DATABASE = `// Database settings, read from .env. DB_CONNECTION is mysql, mariadb, pgsql or sqlite
// (postgres is accepted as pgsql). DB_URL, when set, wins over the separate keys.
const connection = process.env['DB_CONNECTION'] === 'postgres' ? 'pgsql' : process.env['DB_CONNECTION']

export default {
  connection: connection ?? 'sqlite',
  url: process.env['DB_URL'] ?? '',
  host: process.env['DB_HOST'] ?? '127.0.0.1',
  port: Number(process.env['DB_PORT'] ?? 0) || undefined,
  database: process.env['DB_DATABASE'] ?? '${SQLITE_FILE}',
  username: process.env['DB_USERNAME'] ?? '',
  password: process.env['DB_PASSWORD'] ?? '',
  socket: process.env['DB_SOCKET'] ?? '',
  sslMode: process.env['DB_SSLMODE'] ?? 'prefer',
  sslCa: process.env['DB_SSL_CA'] ?? '',
  // Applied migrations are recorded here (Laravel's name).
  migrations: { table: '${MIGRATIONS_TABLE}' },
}
`

/**
 * CORS: which other sites may call the API with cookies. Checked when the config loads, and every
 * problem names the key, so a bad .env reads as a normal settings error, never a crash (packaging
 * finding 4: an empty CORS_ORIGINS used to fail with an unrelated message).
 */
const CONFIG_CORS = `// CORS: the other sites (origins) that may call this app's API with cookies, from CORS_ORIGINS
// in .env as a comma list, e.g. https://admin.example.com,https://app.example.com.
// Credentials are allowed, so a wildcard is never accepted, and production needs https.
export interface CorsIssue {
  readonly key: 'CORS_ORIGINS'
  readonly message: string
}

/** Parse CORS_ORIGINS. Returns the origins, or every problem (each names the key). */
export function parseCorsOrigins(
  value: string | undefined,
  appEnv: string | undefined,
): { readonly origins: readonly string[] } | { readonly issues: readonly CorsIssue[] } {
  const issue = (message: string): CorsIssue => ({ key: 'CORS_ORIGINS', message: \`CORS_ORIGINS \${message}\` })
  const list = (value ?? '').split(',').map((part) => part.trim()).filter((part) => part !== '')
  if (list.length === 0) {
    return { issues: [issue('is empty: list each origin that may call the API, e.g. http://localhost:3000')] }
  }
  const issues: CorsIssue[] = []
  for (const origin of list) {
    if (origin.includes('*')) {
      issues.push(issue('cannot contain * while credentials are allowed: list each origin'))
      continue
    }
    let url: URL | undefined
    try {
      url = new URL(origin)
    } catch {
      url = undefined
    }
    if (url === undefined || !['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      issues.push(issue(\`has "\${origin}", which is not an origin (scheme://host[:port], no path)\`))
    } else if (appEnv === 'production' && url.protocol !== 'https:') {
      issues.push(issue(\`has "\${origin}": production allows https origins only\`))
    }
  }
  return issues.length > 0 ? { issues } : { origins: list }
}

const parsed = parseCorsOrigins(process.env['CORS_ORIGINS'], process.env['APP_ENV'])
if ('issues' in parsed) throw new Error(parsed.issues.map((problem) => problem.message).join('\\n'))

export default {
  origins: parsed.origins,
  credentials: true,
}
`

/**
 * Sign-in settings (decision #26): the features live here, written from the installer's answers,
 * never in \`AUTH_*\` keys. The names are the one list of decisions #25 and #107; the library
 * defaults every optional feature to off, so this file states each one explicitly (#28).
 */
function configAuth(options: ProjectOptions): string {
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
  return `// Sign-in features, chosen in the installer. Change them here (not in .env). APP_KEY in .env is
// the one root secret: every signing and encryption key is derived from it.
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

/** Teams (decision #90): \`{ enabled, column }\`; off unless the teams answer was yes. */
function tenancyConfig(options: ProjectOptions): string {
  const how = !options.teams
    ? 'Teams are off. Turn them on later with node strut install:teams.'
    : options.database === 'postgres'
      ? 'Isolation: the ORM tenant scope, plus PostgreSQL row-level security as a second lock.'
      : 'Isolation: the ORM tenant scope (PostgreSQL would add row-level security as a second lock).'
  const data: Record<string, unknown> = { enabled: options.teams, column: 'tenant_id' }
  if (options.tenantResolver !== undefined) data['resolver'] = options.tenantResolver
  return `// Teams: each customer company sees only its own data. ${how}
// "resolver": how a request picks its team (the in-app team switcher, or the subdomain).
export default ${JSON.stringify(data, null, 2)}
`
}

const USER_MODEL = `// The User model. Columns come from the users migration (database/migrations).
import { Model } from '@strutvane/framework'

export class User extends Model('users', {
  fillable: ['name', 'email'],
  hidden: ['password', 'two_factor_secret'],
}) {}
`

const USER_POLICY = `// Who may do what with users. Deny by default: anything not allowed here is refused.
// Found by name: the User model uses app/policies/user.policy.ts.
import type { User } from '../models/user.ts'

export default class UserPolicy {
  view(actor: User, user: User): boolean {
    return actor.id === user.id
  }
}
`

const USER_FACTORY = `// Fake users for tests and seeders: User.factory().count(10).create()
import { defineFactory } from '@strutvane/framework'
import { User } from '../../app/models/user.ts'

export default defineFactory(User, ({ faker, sequence }) => ({
  name: faker.person.fullName(),
  email: sequence((n) => \`user\${n}@example.test\`),
}))
`

/** Migrations, named like Laravel's (\`0001_01_01_000000_create_users_table\`). */
function migrations(options: ProjectOptions): GeneratedFile[] {
  const files: GeneratedFile[] = []
  const add = (index: number, table: string, body: string) =>
    files.push({
      path: `database/migrations/0001_01_01_00000${index}_create_${table}_table.ts`,
      content: `import { migration } from '@strutvane/framework'

export default migration({
  up(schema) {
${body}
  },
  down(schema) {
    schema.dropIfExists('${table}')
  },
})
`,
    })
  if (options.auth !== 'none') {
    const twoFactor = options.security.includes('2fa')
      ? "\n      t.text('two_factor_secret').nullable()"
      : ''
    // Email-link sign-in has no passwords; the column stays (nullable) so switching later is one setting.
    const passwordColumn =
      options.auth === 'magic-link' ? "t.string('password').nullable()" : "t.string('password')"
    add(
      0,
      'users',
      `    schema.create('users', (t) => {
      t.id()
      t.string('name')
      t.string('email').unique()
      t.timestamp('email_verified_at').nullable()
      ${passwordColumn}
      t.boolean('must_change_password').default(false)${twoFactor}
      t.timestamps()
    })`,
    )
    add(
      1,
      'sessions',
      `    schema.create('sessions', (t) => {
      t.string('id', 128).primary()
      t.foreignId('user_id').nullable().constrained('users').cascadeOnDelete()
      t.string('ip_address', 45).nullable()
      t.timestamp('last_activity').nullable()
    })`,
    )
  }
  add(
    2,
    'cache',
    `    schema.create('cache', (t) => {
      t.string('cache_key').primary() // "key" is a reserved word in MySQL
      t.text('value')
      t.integer('expiration')
    })`,
  )
  if (options.teams) {
    add(
      3,
      'teams',
      `    schema.create('teams', (t) => {
      t.id()
      t.string('name')
      t.timestamps()
    })
    schema.create('team_user', (t) => {
      t.foreignId('team_id').constrained('teams').cascadeOnDelete()
      t.foreignId('user_id').constrained('users').cascadeOnDelete()
      t.string('role', 50)
    })`,
    )
  }
  return files
}

/** One seeder of the app: its file, its class-like name and its source. */
interface SeederFile {
  readonly file: string
  readonly name: string
  readonly content: string
}

/**
 * The seeders: \`database.seeder.ts\` runs the others in dependency order from the list between
 * the \`strut:seeders\` markers (decision #104; \`make:migration --seeder\` keeps that list), plus
 * the first admin (with sign-in) and the sample data (when chosen).
 */
function seeders(options: ProjectOptions): GeneratedFile[] {
  const list: SeederFile[] = []
  if (options.auth !== 'none') list.push({ file: 'admin', name: 'AdminSeeder', content: ADMIN_SEEDER })
  if (options.sampleData)
    list.push({ file: 'sample-data', name: 'SampleDataSeeder', content: SAMPLE_DATA_SEEDER })
  const imports = list.map((seeder) => `import ${seeder.name} from './${seeder.file}.seeder.ts'\n`)
  const call = list.length === 0 ? '[]' : `[${list.map((seeder) => seeder.name).join(', ')}]`
  return [
    {
      path: 'database/seeders/database.seeder.ts',
      content: `// Seeds the database: \`node strut db:seed\` (and \`node strut migrate --seed\`) run this file.
// The list between the markers is kept in dependency order by node strut make:migration --seeder;
// everything outside the markers is yours.
import { defineSeeder } from '@strutvane/framework'
${imports.join('')}
export default defineSeeder({
  async run({ call }) {
    // strut:seeders:start
    await call(${call})
    // strut:seeders:end
  },
})
`,
    },
    ...list.map((seeder) => ({
      path: `database/seeders/${seeder.file}.seeder.ts`,
      content: seeder.content,
    })),
  ]
}

const ADMIN_SEEDER = `// The first admin (SEED_ADMIN_EMAIL in .env), created once. Development only: seeding refuses to
// run with APP_ENV=production or staging. The password is never stored in .env: setup passes a
// one-time password to this seeder and shows it once; it must be changed at the first sign-in.
// Lost it? Run: node strut user:password <email>
import { firstAdmin } from '@strutvane/auth'
import { defineSeeder } from '@strutvane/framework'

export default defineSeeder({
  async run({ db, env }) {
    await firstAdmin(db).createOnce({ name: 'Admin', email: env['SEED_ADMIN_EMAIL'] ?? '' })
  },
})
`

const SAMPLE_DATA_SEEDER = `// Sample records so the generated screens are not empty on day one (chosen in the installer).
// Add a factory call per model as you create models: await factory(Post).count(20).create()
import { defineSeeder } from '@strutvane/framework'

export default defineSeeder({
  after: ['admin'],
  async run() {},
})
`

