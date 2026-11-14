/**
 * `config/*.ts`: typed, documented settings that read the validated env (docs/05 §3.3).
 * Each file uses `@strutvane/core`'s `defineConfig` (deep-frozen, typed paths), except
 * `config/auth.ts`, which uses `@strutvane/auth`'s `defineAuthConfig` (the same, plus a typed shape
 * that rejects unknown keys). Only files relevant to the chosen options are generated.
 *
 * @module
 */
import type { GeneratedFile } from '@strutvane/devkit'
import {
  defaultRoles,
  NEW_MODEL_DEFAULTS,
  permissionSource,
  WILDCARD_EXCLUDED_RESOURCES,
} from '../auth-roles.ts'
import { hasExtra, hasServer, hasWeb, type ProjectOptions } from '../options.ts'
import { file, LINE_WIDTH, lines } from './util.ts'

/**
 * The `roles` block of `config/auth.ts` (docs/07 §4.4), plus the resources wildcards never match
 * and what new models get. The data comes from `auth-roles.ts`, which a test pins to the spec.
 */
function roleMap(o: ProjectOptions): string[] {
  const roles = Object.entries(defaultRoles(o)).flatMap(([name, role]) => {
    const scope = role.scope ? `scope: '${role.scope}', ` : ''
    const inline = `    ${name}: { ${scope}permissions: [${role.permissions.map(permissionSource).join(', ')}] },`
    // Exactly what Biome prints: one line when it fits, otherwise one permission per line.
    return inline.length <= LINE_WIDTH
      ? [inline]
      : [
          `    ${name}: {`,
          ...(role.scope ? [`      scope: '${role.scope}',`] : []),
          '      permissions: [',
          ...role.permissions.map((p) => `        ${permissionSource(p)},`),
          '      ],',
          '    },',
        ]
  })
  const excluded = WILDCARD_EXCLUDED_RESOURCES.flatMap(([group, names]) => [
    `    // ${group}`,
    ...names.map((n) => `    '${n}',`),
  ])
  return [
    '  /**',
    '   * Roles (enforced by @strutvane/auth together with app/policies/*.policy.ts: a policy',
    '   * `deny` always wins). Every model gets permissions like `invoice.viewAny`, `invoice.create`,',
    '   * …; `*` patterns match every model. `own: true` limits a permission to records whose',
    '   * `ownerId` is the signed-in user; a model without an `ownerId` field never matches it.',
    "   * `scope: 'global'` counts only outside tenants (platform administrators, like the seed admin),",
    "   * `scope: 'tenant'` only inside the user's active tenant, where `*` patterns reach only",
    '   * tenant-scoped models. Policies use the same role names.',
    '   */',
    '  roles: {',
    ...roles,
    '  },',
    '  /**',
    '   * Identity, authorization, tenancy and audit records: no wildcard (not even admin `*`) ever',
    '   * matches them. Grant access by exact name, e.g. `user.view`.',
    '   */',
    '  wildcardExclude: [',
    ...excluded,
    '  ],',
    '  /** What a new model gets: the role patterns above, or `admin-only` for stricter orgs. */',
    `  newModelDefaults: '${NEW_MODEL_DEFAULTS}' as const,`,
    '  /** Roles a self-registered user gets (none: an admin grants them). */',
    '  defaultRoles: [] as string[],',
  ]
}

const header = (what: string, define = "import { defineConfig } from '@strutvane/core'") => [
  '/**',
  ` * ${what}`,
  ' * Values come from the validated environment (env.ts); defaults live in .env.example.',
  ' */',
  define,
  "import { env } from '../env.ts'",
  '',
]

function appConfig(o: ProjectOptions): GeneratedFile {
  const server = hasServer(o)
  return file(
    'config/app.ts',
    lines(
      ...header('Application settings.'),
      'export default defineConfig({',
      '  name: env.APP_NAME,',
      '  env: env.APP_ENV,',
      '  url: env.APP_URL,',
      '  port: env.APP_PORT,',
      server && '  /** The public origin behind any proxy (links, cookies, origin checks). */',
      server && '  publicUrl: env.APP_URL,',
      server && '  /** Reverse-proxy hops whose X-Forwarded-* headers are trusted (0 = none). */',
      server && '  trustProxy: env.TRUST_PROXY,',
      server && '  debug: env.APP_DEBUG,',
      server && '  timezone: env.APP_TIMEZONE,',
      server && '  locale: env.APP_LOCALE,',
      '})',
    ),
  )
}

function databaseConfig(o: ProjectOptions): GeneratedFile | undefined {
  const db = o.database
  if (db === undefined) return undefined
  const migrations = [
    "  migrations: { directory: 'database/migrations', table: 'strutvane_migrations' },",
    "  seeders: { directory: 'database/seeders' },",
  ]
  if (db === 'sqlite') {
    return file(
      'config/database.ts',
      lines(
        ...header('Database connection (SQLite: zero setup, ideal for development and tests).'),
        'export default defineConfig({',
        '  default: env.DB_CONNECTION,',
        '  connection: { filename: env.DB_DATABASE },',
        ...migrations,
        '})',
      ),
    )
  }
  const azure = db === 'azure-postgres' || db === 'azure-mysql'
  return file(
    'config/database.ts',
    lines(
      ...header(
        azure
          ? 'Database connection. With DB_AUTH=entra the app signs in passwordless with its Entra ID identity.'
          : 'Database connection.',
      ),
      'export default defineConfig({',
      '  default: env.DB_CONNECTION,',
      '  connection: {',
      '    host: env.DB_HOST,',
      '    port: env.DB_PORT,',
      '    database: env.DB_DATABASE,',
      '    user: env.DB_USERNAME,',
      azure
        ? "    auth:\n      env.DB_AUTH === 'entra'\n        ? { type: 'entra' as const, clientId: env.AZURE_CLIENT_ID }\n        : { type: 'password' as const, password: env.DB_PASSWORD },"
        : '    password: env.DB_PASSWORD,',
      azure ? '    ssl: { rejectUnauthorized: true },' : '    ssl: env.DB_SSL,',
      '    pool: { min: env.DB_POOL_MIN, max: env.DB_POOL_MAX },',
      '  },',
      ...migrations,
      '})',
    ),
  )
}

function authConfig(o: ProjectOptions): GeneratedFile | undefined {
  if (o.auth.length === 0) return undefined
  const social: string[] = []
  if (o.auth.includes('google')) {
    social.push(
      '    google: { clientId: env.AUTH_GOOGLE_CLIENT_ID, clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET },',
    )
  }
  if (o.auth.includes('microsoft')) {
    social.push(
      '    microsoft: {',
      '      tenantId: env.AUTH_MICROSOFT_TENANT_ID,',
      '      clientId: env.AUTH_MICROSOFT_CLIENT_ID,',
      '      clientSecret: env.AUTH_MICROSOFT_CLIENT_SECRET,',
      '    },',
    )
  }
  if (o.auth.includes('github')) {
    social.push(
      '    github: { clientId: env.AUTH_GITHUB_CLIENT_ID, clientSecret: env.AUTH_GITHUB_CLIENT_SECRET },',
    )
  }
  return file(
    'config/auth.ts',
    lines(
      ...header(
        'Authentication and authorization (@strutvane/auth).',
        "import { defineAuthConfig } from '@strutvane/auth'",
      ),
      // Typed by @strutvane/auth: a misspelt key is a compile error instead of being ignored.
      'export default defineAuthConfig({',
      `  methods: [${o.auth.map((m) => `'${m}'`).join(', ')}],`,
      '  secret: env.AUTH_SECRET,',
      '  session: { driver: env.AUTH_SESSION_DRIVER, idleMinutes: env.AUTH_SESSION_LIFETIME },',
      '  tokens: { accessTokenSeconds: env.AUTH_JWT_TTL },',
      '  registration: env.AUTH_ALLOW_REGISTRATION,',
      '  mfa: env.AUTH_MFA,',
      social.length > 0 && '  social: {',
      ...social,
      social.length > 0 && '  },',
      ...roleMap(o),
      "  seedAdmin: { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD, role: 'admin' },",
      '  /**',
      '   * Origins allowed to call the sign-in, sign-up and other state-changing auth endpoints.',
      '   * Add the origin of a UI served from another domain.',
      '   */',
      '  trustedOrigins: [env.APP_URL],',
      '  /**',
      '   * Proxy addresses or CIDRs whose X-Forwarded-For auth may use for rate limiting. Leave empty',
      '   * in a Strutvane app: TRUST_PROXY (config/app.ts) already resolves the client address.',
      '   */',
      '  trustedProxies: [] as string[],',
      hasExtra(o, 'audit') && '  audit: { enabled: env.AUDIT_ENABLED },',
      '})',
    ),
  )
}

function tenancyConfig(o: ProjectOptions): GeneratedFile | undefined {
  if (!o.tenancy) return undefined
  return file(
    'config/tenancy.ts',
    lines(
      ...header(
        'Multi-tenancy: each customer company (tenant) only ever sees its own rows. On PostgreSQL this is enforced by the database itself (row-level security, ADR-0007).',
      ),
      'export default defineConfig({',
      '  enabled: env.TENANCY_ENABLED,',
      '  strategy: env.TENANCY_STRATEGY,',
      '  resolve: env.TENANCY_RESOLVE,',
      '})',
    ),
  )
}

function serverConfigs(o: ProjectOptions): GeneratedFile[] {
  if (!hasServer(o)) return []
  const out: GeneratedFile[] = [
    file(
      'config/api.ts',
      lines(
        ...header('The automatic REST API: every model gets CRUD endpoints under this prefix.'),
        'export default defineConfig({',
        '  prefix: env.API_PREFIX,',
        '  version: env.API_VERSION,',
        '  docs: env.API_DOCS,',
        '  rateLimit: env.RATE_LIMIT,',
        '  pagination: { defaultPageSize: 25, maxPageSize: 100 },',
        '})',
      ),
    ),
    file(
      'config/cors.ts',
      lines(
        ...header('Which browser origins may call the API.'),
        'export default defineConfig({',
        '  origins: env.CORS_ORIGINS,',
        '  credentials: true,',
        '})',
      ),
    ),
    file(
      'config/logging.ts',
      lines(
        ...header(
          hasExtra(o, 'logs')
            ? 'Logging (@strutvane/logs): files with retention, request logging, and the viewer.'
            : 'Logging (structured logs to stdout from @strutvane/core).',
        ),
        'export default defineConfig({',
        '  level: env.LOG_LEVEL,',
        '  format: env.LOG_FORMAT,',
        ...(hasExtra(o, 'logs')
          ? [
              '  enabled: env.LOGS_ENABLED,',
              '  driver: env.LOGS_DRIVER,',
              '  path: env.LOGS_PATH,',
              '  retentionDays: env.LOGS_RETENTION_DAYS,',
              '  maxDailySize: env.LOGS_MAX_DAILY_SIZE,',
              '  requestBodies: env.LOGS_REQUEST_BODIES,',
              '  /** Extra keys or patterns to redact, on top of the built-in rules. */',
              '  redact: { keys: [] as string[] },',
              "  requests: { ignore: ['/health', '/ready'], slowThresholdMs: 1000 },",
              '  viewer: { enabled: env.LOGS_VIEWER, path: env.LOGS_VIEWER_PATH, token: env.LOGS_VIEWER_TOKEN },',
            ]
          : []),
        '})',
      ),
    ),
  ]
  if (hasExtra(o, 'cache')) {
    out.push(
      file(
        'config/cache.ts',
        lines(
          ...header('Cache store.'),
          'export default defineConfig({',
          '  driver: env.CACHE_DRIVER,',
          '  url: env.VALKEY_URL,',
          '  prefix: env.APP_NAME,',
          '})',
        ),
      ),
    )
  }
  if (hasExtra(o, 'queue')) {
    out.push(
      file(
        'config/queue.ts',
        lines(
          ...header('Background jobs.'),
          'export default defineConfig({',
          '  driver: env.QUEUE_DRIVER,',
          '  url: env.VALKEY_URL,',
          "  retry: { attempts: 5, backoff: 'exponential' as const },",
          '})',
        ),
      ),
    )
  }
  if (hasExtra(o, 'mail')) {
    out.push(
      file(
        'config/mail.ts',
        lines(
          ...header('Outgoing email.'),
          'export default defineConfig({',
          '  driver: env.MAIL_DRIVER,',
          '  smtp: { host: env.MAIL_HOST, port: env.MAIL_PORT },',
          '  from: { address: env.MAIL_FROM_ADDRESS, name: env.MAIL_FROM_NAME },',
          '})',
        ),
      ),
    )
  }
  if (hasExtra(o, 'otel')) {
    out.push(
      file(
        'config/observability.ts',
        lines(
          ...header('OpenTelemetry traces, metrics and logs.'),
          'export default defineConfig({',
          '  enabled: env.OTEL_ENABLED,',
          '  serviceName: env.OTEL_SERVICE_NAME,',
          '  endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,',
          '})',
        ),
      ),
    )
  }
  return out
}

function uiConfig(o: ProjectOptions): GeneratedFile[] {
  if (!hasWeb(o)) return []
  const out = [
    file(
      'config/ui.ts',
      lines(
        ...header('The generated UI (@strutvane/ui).'),
        'export default defineConfig({',
        '  appName: env.VITE_APP_NAME,',
        '  apiUrl: env.VITE_API_URL,',
        "  theme: { defaultMode: 'system' as const },",
        '})',
      ),
    ),
  ]
  if (!hasServer(o)) {
    out.push(
      file(
        'config/api-client.ts',
        lines(
          ...header(
            'The existing API this UI connects to. The UI reads its Strutvane manifest (/.well-known/strutvane.json on the API origin); building screens from any OpenAPI 3.x document is planned in @strutvane/ui.',
          ),
          'export default defineConfig({',
          '  baseUrl: env.VITE_API_URL,',
          '  openApiUrl: env.API_OPENAPI_URL,',
          '})',
        ),
      ),
    )
  }
  return out
}

/** Every config file for the chosen options. */
export function configFiles(o: ProjectOptions): GeneratedFile[] {
  return [
    appConfig(o),
    databaseConfig(o),
    authConfig(o),
    tenancyConfig(o),
    ...serverConfigs(o),
    ...uiConfig(o),
  ].filter((f): f is GeneratedFile => f !== undefined)
}
