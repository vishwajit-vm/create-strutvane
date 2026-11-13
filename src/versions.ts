/**
 * Every dependency version written into generated projects, in one place.
 *
 * Exact versions on purpose: a generated app must install identically today and next month.
 * Strutvane packages are pinned to the current pre-release train (ADR-0016). Bump these together
 * with each release of create-strutvane.
 *
 * @module
 */

/** Version of every `@strutvane/*` package and the `strutvane` CLI on the current train. */
export const STRUTVANE_VERSION = '0.1.0-next.0'

/** Third-party versions (re-verified 2026-11-14). */
export const VERSIONS = {
  zod: '4.6.7',
  typescript: '6.0.3',
  '@types/node': '24.19.2',
  '@biomejs/biome': '2.6.7',
  vitest: '5.1.0',
  vite: '8.3.8',
  '@vitejs/plugin-react': '6.3.0',
  '@playwright/test': '1.65.0',
  react: '19.3.1',
  'react-dom': '19.3.1',
  '@types/react': '19.3.0',
  '@types/react-dom': '19.3.0',
  '@tanstack/react-query': '5.107.1',
  '@tanstack/react-table': '9.3.1',
  '@tanstack/react-form': '1.33.5',
  '@tanstack/react-virtual': '3.14.26',
  pg: '8.23.1',
  mysql2: '3.24.6',
  '@libsql/client': '0.18.0',
  '@azure/identity': '4.14.1',
  '@azure/postgresql-auth': '1.0.0',
  iovalkey: '0.4.0',
  bullmq: '6.7.6',
  nodemailer: '10.5.0',
  '@opentelemetry/sdk-node': '0.301.2',
  pnpm: '12.18.0',
} as const

/** GitHub Actions used by the generated CI workflow, pinned to commit SHAs (tag in the comment). */
export const ACTIONS = {
  checkout: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
  setupNode: 'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0',
  setupPnpm: 'pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115 # v6.1.1',
  setupBun: 'oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0',
} as const
