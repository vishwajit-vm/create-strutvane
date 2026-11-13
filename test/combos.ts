/**
 * The option combinations every end-to-end test runs against: each preset, every database, every
 * sign-in method, tenancy on/off, every extra, every Docker mode and every package manager appear
 * at least once.
 */
import type { RawProjectInput } from '../src/options.ts'

export interface Combo {
  readonly id: string
  readonly input: RawProjectInput
}

export const COMBOS: readonly Combo[] = [
  { id: 'full-default', input: { name: 'acme' } },
  {
    id: 'api-mysql-social-tenancy-all-extras-npm-commit',
    input: {
      name: 'acme-api',
      preset: 'api',
      database: 'mysql',
      auth: ['email', 'google', 'github'],
      tenancy: true,
      extras: ['queue', 'cache', 'mail', 'audit', 'otel', 'logs'],
      packageManager: 'npm',
      docker: 'commit',
    },
  },
  { id: 'ui-yarn', input: { name: 'acme-portal', preset: 'ui', packageManager: 'yarn' } },
  {
    id: 'api-sqlite-noauth-bun',
    input: {
      name: 'tiny',
      preset: 'api',
      database: 'sqlite',
      auth: [],
      extras: [],
      packageManager: 'bun',
    },
  },
  {
    id: 'full-azure-postgres-microsoft-magic-link',
    input: {
      name: 'contoso',
      preset: 'full',
      database: 'azure-postgres',
      auth: ['magic-link', 'microsoft'],
      docker: 'off',
    },
  },
  {
    id: 'api-azure-mysql-queue-mail',
    input: { name: 'fabrikam', preset: 'api', database: 'azure-mysql', extras: ['queue', 'mail'] },
  },
  {
    id: 'full-postgres-tenancy-cache-npm',
    input: {
      name: 'northwind',
      database: 'postgres',
      tenancy: true,
      extras: ['cache', 'logs'],
      packageManager: 'npm',
    },
  },
]
