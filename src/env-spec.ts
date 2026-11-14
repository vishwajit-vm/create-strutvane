/**
 * The generated app's environment variables: ONE description that drives four outputs, so they
 * can never disagree:
 * - `.env` (local values, generated secrets) and `.env.example` (documented, no secrets), written
 *   through devkit's env editor,
 * - `env.schema.ts` (the Zod schema that validates every key at boot),
 * - the "Environment variables" table in the generated README.
 *
 * Keys follow docs/05 §3.2 and RFC-0004 §7. Only keys relevant to the chosen options are included.
 *
 * @module
 */
import type { EnvVar } from '@strutvane/contracts'
import { hasExtra, hasServer, hasWeb, type ProjectOptions } from './options.ts'

/** How a value is validated in the generated `env.schema.ts`. */
export type EnvKind =
  | 'string'
  | 'url'
  | 'email'
  | 'port'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'size'
  | 'list'
  | 'rate'
  | 'secret'

/** One variable. Extends the contracts' `EnvVar` (what the env editor writes). */
export interface EnvSpecVar extends EnvVar {
  readonly kind: EnvKind
  /** Allowed values for `enum`. */
  readonly options?: readonly string[]
  /** An empty value means "not set" (e.g. an OAuth secret you add later). */
  readonly optional?: boolean
  /** One-line explanation, written above the key in both files and shown in the README. */
  readonly comment: string
  /**
   * The value committed in `.env.example` when it should differ from the local `.env` value:
   * the safe default for any environment (e.g. `APP_DEBUG=false`), while `.env` keeps the
   * convenient local one. Never used for secrets (those are always empty in `.env.example`).
   */
  readonly example?: string
}

/** A titled group of variables (one block in `.env` / `.env.example`). */
export interface EnvSection {
  readonly title: string
  readonly vars: readonly EnvSpecVar[]
}

/** `acme-portal` → `acme_portal` (safe as a database or user name everywhere). */
export function sqlIdentifier(name: string): string {
  const id = name
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
  return /^[a-z]/.test(id) ? id : `app_${id}`
}

const str = (key: string, value: string, comment: string): EnvSpecVar => ({
  key,
  value,
  comment,
  kind: 'string',
})
const choice = (
  key: string,
  value: string,
  options: readonly string[],
  comment: string,
): EnvSpecVar => ({
  key,
  value,
  options,
  comment: `${comment} (${options.join(' | ')})`,
  kind: 'enum',
})
const flag = (key: string, value: boolean, comment: string): EnvSpecVar => ({
  key,
  value: String(value),
  comment,
  kind: 'boolean',
})
const optionalSecret = (key: string, comment: string): EnvSpecVar => ({
  key,
  value: '',
  comment,
  kind: 'string',
  optional: true,
})

function application(o: ProjectOptions): EnvSection {
  const server = hasServer(o)
  const port = server ? 3000 : 5173
  const vars: EnvSpecVar[] = [
    str('APP_NAME', o.name, 'Shown in the UI, emails and logs'),
    choice(
      'APP_ENV',
      'local',
      ['local', 'test', 'staging', 'production'],
      'Where this copy of the app runs',
    ),
  ]
  if (server) {
    vars.push({
      key: 'APP_KEY',
      secret: true,
      kind: 'secret',
      comment: 'Encryption key (32 random bytes). Rotate with: sv key:generate',
    })
  }
  vars.push(
    {
      key: 'APP_URL',
      value: `http://localhost:${port}`,
      kind: 'url',
      comment: 'Public URL of this app',
    },
    {
      key: 'APP_PORT',
      value: String(port),
      kind: 'port',
      comment: 'Port the dev server listens on',
    },
  )
  if (server) {
    vars.push(
      {
        key: 'TRUST_PROXY',
        value: '0',
        kind: 'integer',
        comment:
          'Reverse proxies in front of the app whose X-Forwarded-For/-Proto headers are trusted: 0 = none (direct connections), 1 = one load balancer or ingress you run. Set it only behind a proxy you control: otherwise clients could fake their IP address (rate limits) and protocol',
      },
      {
        ...flag('APP_DEBUG', true, 'Detailed error pages. Only allowed with APP_ENV=local'),
        example: 'false',
      },
      str('APP_TIMEZONE', 'UTC', 'Timezone for dates and schedules'),
      str('APP_LOCALE', 'en', 'Default language for messages'),
    )
  }
  return { title: 'Application', vars }
}

function logging(o: ProjectOptions): EnvSection {
  const vars: EnvSpecVar[] = [
    choice(
      'LOG_LEVEL',
      'info',
      ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
      'Lowest level that gets logged',
    ),
    choice(
      'LOG_FORMAT',
      'pretty',
      ['pretty', 'json'],
      'pretty for development, json for production',
    ),
  ]
  if (hasExtra(o, 'logs')) {
    vars.push(
      flag('LOGS_ENABLED', true, '@strutvane/logs: file logs, request logging and the log viewer'),
      choice(
        'LOGS_DRIVER',
        'file',
        ['file', 'database', 'stdout'],
        'Where logs are stored. Use database with several servers',
      ),
      str('LOGS_PATH', 'storage/logs', 'Folder for log files (git-ignored)'),
      {
        key: 'LOGS_RETENTION_DAYS',
        value: '60',
        kind: 'integer',
        comment: 'Delete log files older than this many days',
      },
      {
        key: 'LOGS_MAX_DAILY_SIZE',
        value: '30MB',
        kind: 'size',
        comment: 'Size cap per daily file before a new part starts',
      },
      flag(
        'LOGS_REQUEST_BODIES',
        false,
        'Log request bodies (off by default: they may contain personal data)',
      ),
      flag('LOGS_VIEWER', true, 'Built-in log viewer'),
      str('LOGS_VIEWER_PATH', '/_strutvane/logs', 'Where the log viewer is served'),
      optionalSecret(
        'LOGS_VIEWER_TOKEN',
        'Viewer access token for production when auth is not installed (leave empty otherwise)',
      ),
    )
  }
  if (hasExtra(o, 'otel')) {
    vars.push(
      flag(
        'OTEL_ENABLED',
        false,
        'Send traces/metrics/logs to an OpenTelemetry collector (set true when one runs)',
      ),
      str('OTEL_SERVICE_NAME', `${o.name}-api`, 'Service name shown in your observability tool'),
      {
        key: 'OTEL_EXPORTER_OTLP_ENDPOINT',
        value: 'http://localhost:4318',
        kind: 'url',
        comment: 'OTLP/HTTP collector endpoint',
      },
    )
  }
  return { title: 'Logging & Observability', vars }
}

function database(o: ProjectOptions): EnvSection | undefined {
  const db = o.database
  if (db === undefined) return undefined
  const connection = choice(
    'DB_CONNECTION',
    db,
    ['postgres', 'mysql', 'sqlite', 'azure-postgres', 'azure-mysql'],
    'Database driver',
  )
  if (db === 'sqlite') {
    return {
      title: 'Database',
      vars: [
        connection,
        str('DB_DATABASE', 'storage/database.sqlite', 'SQLite file (inside git-ignored storage/)'),
      ],
    }
  }
  const mysql = db === 'mysql' || db === 'azure-mysql'
  const azure = db === 'azure-postgres' || db === 'azure-mysql'
  const id = sqlIdentifier(o.name)
  const vars: EnvSpecVar[] = [
    connection,
    str(
      'DB_HOST',
      azure ? `your-server.${mysql ? 'mysql' : 'postgres'}.database.azure.com` : '127.0.0.1',
      azure ? 'Your Azure Database server name' : 'Database host',
    ),
    { key: 'DB_PORT', value: mysql ? '3306' : '5432', kind: 'port', comment: 'Database port' },
    str('DB_DATABASE', id, 'Database name'),
    str(
      'DB_USERNAME',
      id,
      azure ? 'Database user (an Entra ID principal when DB_AUTH=entra)' : 'Database user',
    ),
  ]
  if (azure) {
    vars.push(
      choice(
        'DB_AUTH',
        'entra',
        ['password', 'entra'],
        'Sign in with a password or passwordless via Entra ID',
      ),
      optionalSecret('DB_PASSWORD', 'Only when DB_AUTH=password'),
      optionalSecret('AZURE_CLIENT_ID', 'User-assigned managed identity client id (optional)'),
    )
  } else {
    vars.push({
      key: 'DB_PASSWORD',
      secret: true,
      kind: 'secret',
      comment: 'Generated for the local database',
    })
  }
  vars.push(
    flag('DB_SSL', azure, 'Use TLS (always true for cloud databases)'),
    { key: 'DB_POOL_MIN', value: '0', kind: 'integer', comment: 'Minimum pooled connections' },
    { key: 'DB_POOL_MAX', value: '10', kind: 'integer', comment: 'Maximum pooled connections' },
  )
  return { title: 'Database', vars }
}

function cacheQueue(o: ProjectOptions): EnvSection | undefined {
  const cache = hasExtra(o, 'cache')
  const queue = hasExtra(o, 'queue')
  if (!cache && !queue) return undefined
  const valkey = o.docker !== 'off'
  const vars: EnvSpecVar[] = []
  if (cache)
    vars.push(
      choice(
        'CACHE_DRIVER',
        valkey ? 'valkey' : 'memory',
        ['memory', 'valkey', 'database'],
        'Cache store',
      ),
    )
  if (queue)
    vars.push(
      choice(
        'QUEUE_DRIVER',
        valkey ? 'valkey' : 'sync',
        ['sync', 'valkey', 'database'],
        'Queue backend (sync runs jobs immediately)',
      ),
    )
  vars.push({
    key: 'VALKEY_URL',
    value: 'redis://127.0.0.1:6379',
    kind: 'url',
    comment: 'Valkey/Redis connection (local Docker service)',
  })
  return { title: 'Cache / Queue', vars }
}

function mail(o: ProjectOptions): EnvSection | undefined {
  if (!hasExtra(o, 'mail')) return undefined
  const local = o.docker !== 'off'
  return {
    title: 'Mail',
    vars: [
      choice(
        'MAIL_DRIVER',
        local ? 'smtp' : 'log',
        ['smtp', 'ses', 'resend', 'postmark', 'log'],
        'How emails are sent (log writes them to the log)',
      ),
      str('MAIL_HOST', '127.0.0.1', 'SMTP host'),
      {
        key: 'MAIL_PORT',
        value: '1025',
        kind: 'port',
        comment: 'SMTP port. Local Mailpit inbox: http://localhost:8025',
      },
      {
        key: 'MAIL_FROM_ADDRESS',
        value: `no-reply@${o.name}.test`,
        kind: 'email',
        comment: 'Sender address',
      },
      str('MAIL_FROM_NAME', o.name, 'Sender name'),
    ],
  }
}

function auth(o: ProjectOptions): EnvSection | undefined {
  if (o.auth.length === 0) return undefined
  const vars: EnvSpecVar[] = [
    {
      key: 'AUTH_SECRET',
      secret: true,
      kind: 'secret',
      comment: 'Signs sessions and tokens. Rotate with: sv auth:secret:rotate',
    },
    choice(
      'AUTH_SESSION_DRIVER',
      'database',
      ['database', 'valkey', 'jwt'],
      'Where sessions are stored',
    ),
    {
      key: 'AUTH_SESSION_LIFETIME',
      value: '120',
      kind: 'integer',
      comment: 'Minutes of inactivity before sign-out',
    },
    {
      key: 'AUTH_JWT_TTL',
      value: '900',
      kind: 'integer',
      comment: 'Seconds an API access token is valid',
    },
    flag(
      'AUTH_ALLOW_REGISTRATION',
      false,
      'Let anyone create an account (public sign-up). Off: only accounts you create can sign in',
    ),
    choice('AUTH_MFA', 'optional', ['off', 'optional', 'required'], 'Two-factor authentication'),
  ]
  if (o.auth.includes('google')) {
    vars.push(
      optionalSecret('AUTH_GOOGLE_CLIENT_ID', 'Google sign-in: OAuth client id'),
      optionalSecret('AUTH_GOOGLE_CLIENT_SECRET', 'Google sign-in: OAuth client secret'),
    )
  }
  if (o.auth.includes('microsoft')) {
    vars.push(
      optionalSecret(
        'AUTH_MICROSOFT_TENANT_ID',
        'Microsoft (Entra ID) sign-in: directory (tenant) id',
      ),
      optionalSecret(
        'AUTH_MICROSOFT_CLIENT_ID',
        'Microsoft (Entra ID) sign-in: application (client) id',
      ),
      optionalSecret('AUTH_MICROSOFT_CLIENT_SECRET', 'Microsoft (Entra ID) sign-in: client secret'),
    )
  }
  if (o.auth.includes('github')) {
    vars.push(
      optionalSecret('AUTH_GITHUB_CLIENT_ID', 'GitHub sign-in: OAuth app client id'),
      optionalSecret('AUTH_GITHUB_CLIENT_SECRET', 'GitHub sign-in: OAuth app client secret'),
    )
  }
  vars.push(
    {
      key: 'SEED_ADMIN_EMAIL',
      value: `admin@${o.name}.test`,
      kind: 'email',
      comment: 'First admin user, created by the seeder',
    },
    {
      key: 'SEED_ADMIN_PASSWORD',
      secret: true,
      kind: 'secret',
      comment: 'Generated when the project was created and printed once',
    },
  )
  if (hasExtra(o, 'audit'))
    vars.push(flag('AUDIT_ENABLED', true, 'Record who changed what (audit log)'))
  return { title: 'Auth', vars }
}

function tenancy(o: ProjectOptions): EnvSection | undefined {
  if (!o.tenancy) return undefined
  return {
    title: 'Tenancy',
    vars: [
      flag('TENANCY_ENABLED', true, 'Multi-tenant mode (each company only sees its own data)'),
      choice(
        'TENANCY_STRATEGY',
        'shared',
        ['shared', 'schema', 'database'],
        'How tenant data is separated',
      ),
      {
        key: 'TENANCY_RESOLVE',
        value: 'subdomain,header,session',
        kind: 'list',
        comment: 'How the current tenant is found, in order',
      },
    ],
  }
}

function http(o: ProjectOptions): EnvSection | undefined {
  if (!hasServer(o)) return undefined
  return {
    title: 'HTTP / API',
    vars: [
      str('API_PREFIX', '/api', 'Path prefix for the API'),
      str('API_VERSION', 'v1', 'Current API version'),
      {
        ...flag(
          'API_DOCS',
          true,
          'Serve interactive API docs at /docs and the spec at /openapi.json',
        ),
        example: 'false',
      },
      {
        key: 'CORS_ORIGINS',
        value: 'http://localhost:3000',
        kind: 'list',
        comment:
          'Browser origins allowed to call the API (comma separated; no *; https:// in production)',
      },
      { key: 'RATE_LIMIT', value: '120/min', kind: 'rate', comment: 'Requests allowed per client' },
    ],
  }
}

function ui(o: ProjectOptions): EnvSection | undefined {
  if (!hasWeb(o)) return undefined
  const external = !hasServer(o)
  const vars: EnvSpecVar[] = [
    str('VITE_APP_NAME', o.name, 'App name shown in the browser (VITE_ keys are public)'),
    str(
      'VITE_API_URL',
      external ? 'http://localhost:3000/api/v1' : '/api/v1',
      'API base URL used by the UI',
    ),
  ]
  if (external) {
    vars.push({
      key: 'API_OPENAPI_URL',
      value: 'http://localhost:3000/openapi.json',
      kind: 'url',
      comment: 'OpenAPI document of the API this UI connects to',
    })
  }
  return { title: 'UI', vars }
}

/** Build every env section for the chosen options, in documented order. */
export function buildEnvSpec(options: ProjectOptions): readonly EnvSection[] {
  return [
    application(options),
    ...(hasServer(options) ? [logging(options)] : []),
    database(options),
    cacheQueue(options),
    mail(options),
    auth(options),
    tenancy(options),
    http(options),
    ui(options),
  ].filter((s): s is EnvSection => s !== undefined)
}

/**
 * Apply each variable's {@link EnvSpecVar.example} to `.env.example` text (replacing the value the
 * env editor wrote, which is the local `.env` value). Other lines are left untouched.
 */
export function applyExampleValues(text: string, sections: readonly EnvSection[]): string {
  const overrides = new Map(
    allEnvVars(sections).flatMap((v) =>
      v.example !== undefined && v.secret !== true ? [[v.key, v.example] as const] : [],
    ),
  )
  return text.replace(/^([A-Z][A-Z0-9_]*)=.*$/gm, (line, key: string) => {
    const value = overrides.get(key)
    return value === undefined ? line : `${key}=${value}`
  })
}

/** Every variable, flattened, in order. */
export function allEnvVars(sections: readonly EnvSection[]): readonly EnvSpecVar[] {
  return sections.flatMap((s) => s.vars)
}
