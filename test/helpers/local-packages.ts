/**
 * Local stand-ins for the Strutvane packages, for the end-to-end tests. The installer copies them
 * into the project when `STRUT_LOCAL_PACKAGES` names this folder, so a real `npm install` runs
 * without the packages being on npm yet.
 *
 * - `strutvane-framework` and `strutvane-auth` come from `test/fixtures/packages` (just enough to
 *   migrate, seed, serve and build a generated app);
 * - every other core-train package gets a minimal package that only names itself.
 *
 * @module
 */
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CORE_TRAIN } from '../../src/version.ts'
import { tempFolder } from './fakes.ts'

const FIXTURES = fileURLToPath(new URL('../fixtures/packages/', import.meta.url))
const FULL = new Set(['@strutvane/framework', '@strutvane/auth'])

/**
 * A fresh folder of local package folders for the core train plus `extra` package names.
 *
 * @example
 * const env = { STRUT_LOCAL_PACKAGES: localPackages() }
 */
export function localPackages(extra: readonly string[] = []): string {
  const root = tempFolder('cs-packages-')
  for (const name of [...CORE_TRAIN, ...extra]) {
    const folder = join(root, name.replace(/^@/, '').replace('/', '-'))
    if (FULL.has(name)) {
      cpSync(join(FIXTURES, name.replace(/^@/, '').replace('/', '-')), folder, { recursive: true })
      continue
    }
    mkdirSync(folder, { recursive: true })
    writeFileSync(
      join(folder, 'package.json'),
      `${JSON.stringify({ name, version: '0.1.0-next.1', private: true, type: 'module', exports: { '.': './index.js' } }, null, 2)}\n`,
    )
    writeFileSync(
      join(folder, 'index.js'),
      `// Test stand-in for ${name} (create-strutvane's tests only).\nexport const name = ${JSON.stringify(name)}\n`,
    )
  }
  return root
}
