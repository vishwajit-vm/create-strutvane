/**
 * Where this package is installed, so the static template files (`templates/strut.js`) are found
 * the same way from the TypeScript sources (tests, `node src/cli.ts`) and from the bundled `dist/`.
 *
 * Why walk up instead of a fixed `../`: the sources sit one folder deeper than the bundle, and a
 * bundler may move chunks; the package's own package.json is the one stable landmark.
 *
 * @module
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

let cached: string | undefined

/**
 * The folder that holds create-strutvane's package.json.
 *
 * @example
 * join(packageRoot(), 'templates', 'strut.js')
 */
export function packageRoot(): string {
  if (cached !== undefined) return cached
  let folder = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const manifest = join(folder, 'package.json')
    if (existsSync(manifest) && isThisPackage(manifest)) {
      cached = folder
      return folder
    }
    const parent = dirname(folder)
    // Unreachable in a real install (the package always has its package.json); fail loudly.
    if (parent === folder) throw new Error('create-strutvane could not find its own package.json')
    folder = parent
  }
}

/** Is this package.json create-strutvane's own? */
function isThisPackage(path: string): boolean {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      Reflect.get(parsed, 'name') === 'create-strutvane'
    )
  } catch {
    return false
  }
}
