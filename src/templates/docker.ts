/**
 * `docker/compose.yaml`: the local development services (ADR-0006, D16).
 *
 * - Generated for `--docker=local` (git-ignored, the default) and `--docker=commit` (opt-in).
 * - Credentials are never written into the file: Compose reads them from `.env`
 *   (`docker compose --env-file .env …`), and `${VAR:?…}` makes a missing value a clear error.
 * - Every port binds to 127.0.0.1 only, so the services are not reachable from the network.
 * - Every service has a health check, so `up --wait` returns only when they are ready.
 *
 * @module
 */
import type { GeneratedFile } from '@strutvane/devkit'
import { dockerServices, type ProjectOptions } from '../options.ts'
import { file, lines } from './util.ts'

/** Images: one major line each, so local services get patch updates but never surprise upgrades. */
export const IMAGES = {
  postgres: 'postgres:18-alpine',
  mysql: 'mysql:8.4',
  valkey: 'valkey/valkey:9-alpine',
  mailpit: 'axllent/mailpit:v1.33',
} as const

const required = (key: string) => `\${${key}:?set ${key} in .env}`

function postgres(): string[] {
  return [
    '  postgres:',
    `    image: ${IMAGES.postgres}`,
    '    environment:',
    `      POSTGRES_DB: ${required('DB_DATABASE')}`,
    `      POSTGRES_USER: ${required('DB_USERNAME')}`,
    `      POSTGRES_PASSWORD: ${required('DB_PASSWORD')}`,
    '    ports:',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Compose interpolation, not JS
    '      - "127.0.0.1:${DB_PORT:-5432}:5432"',
    '    volumes:',
    '      - postgres-data:/var/lib/postgresql',
    '    healthcheck:',
    '      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]',
    '      interval: 2s',
    '      timeout: 5s',
    '      retries: 30',
  ]
}

function mysql(): string[] {
  return [
    '  mysql:',
    `    image: ${IMAGES.mysql}`,
    '    environment:',
    `      MYSQL_DATABASE: ${required('DB_DATABASE')}`,
    `      MYSQL_USER: ${required('DB_USERNAME')}`,
    `      MYSQL_PASSWORD: ${required('DB_PASSWORD')}`,
    '      MYSQL_RANDOM_ROOT_PASSWORD: "yes"',
    '    ports:',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Compose interpolation, not JS
    '      - "127.0.0.1:${DB_PORT:-3306}:3306"',
    '    volumes:',
    '      - mysql-data:/var/lib/mysql',
    '    healthcheck:',
    '      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 --silent"]',
    '      interval: 2s',
    '      timeout: 5s',
    '      retries: 60',
  ]
}

function valkey(): string[] {
  return [
    '  valkey:',
    `    image: ${IMAGES.valkey}`,
    '    ports:',
    '      - "127.0.0.1:6379:6379"',
    '    volumes:',
    '      - valkey-data:/data',
    '    healthcheck:',
    '      test: ["CMD", "valkey-cli", "ping"]',
    '      interval: 2s',
    '      timeout: 5s',
    '      retries: 30',
  ]
}

function mailpit(): string[] {
  return [
    '  mailpit:',
    `    image: ${IMAGES.mailpit}`,
    '    ports:',
    '      - "127.0.0.1:1025:1025" # SMTP',
    '      - "127.0.0.1:8025:8025" # inbox UI: http://localhost:8025',
    '    healthcheck:',
    '      test: ["CMD", "/mailpit", "readyz"]',
    '      interval: 2s',
    '      timeout: 5s',
    '      retries: 30',
  ]
}

/** `docker/compose.yaml`, or nothing when Docker is off or there is nothing to run. */
export function dockerFiles(o: ProjectOptions): GeneratedFile[] {
  const services = dockerServices(o)
  if (o.docker === 'off' || services.length === 0) return []
  const blocks: Record<(typeof services)[number], () => string[]> = {
    postgres,
    mysql,
    valkey,
    mailpit,
  }
  const volumes = services.filter((s) => s !== 'mailpit').map((s) => `  ${s}-data:`)
  return [
    file(
      'docker/compose.yaml',
      lines(
        `# Local development services for ${o.name}.`,
        o.docker === 'local'
          ? '# LOCAL ONLY: this folder is git-ignored (ADR-0006). Production is deployed differently.'
          : '# Committed on purpose (--docker=commit). Still for local development only.',
        '#',
        '# Start:  docker compose --env-file .env -f docker/compose.yaml up -d --wait',
        '# Stop:   docker compose --env-file .env -f docker/compose.yaml down',
        '# Values (passwords, ports) come from .env: nothing secret is written in this file.',
        `name: ${o.name.replace(/[^a-z0-9_-]/g, '-')}`,
        '',
        'services:',
        ...services.flatMap((s, i) => [...(i > 0 ? [''] : []), ...blocks[s]()]),
        volumes.length > 0 && '',
        volumes.length > 0 && 'volumes:',
        ...volumes,
      ),
    ),
  ]
}
