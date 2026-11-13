/**
 * Project name rules. The name becomes the folder name AND the `name` in package.json, so it must
 * be valid for npm and safe as a folder on Windows, macOS and Linux.
 *
 * @module
 */

/** Names Windows refuses as file or folder names, regardless of extension. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i

/** Names npm refuses. */
const NPM_BLOCKED = new Set(['node_modules', 'favicon.ico'])

/**
 * Validate a project name. Returns human-readable problems (empty array = valid).
 *
 * @example
 * validateProjectName('acme-portal') // []
 * validateProjectName('My App')      // ['…lowercase…', '…spaces…']
 */
export function validateProjectName(name: string): string[] {
  const problems: string[] = []
  if (name.length === 0) return ['a project name is required (e.g. "acme-portal")']
  if (name.length > 214) problems.push('the project name must be 214 characters or fewer')
  if (name !== name.toLowerCase()) problems.push('the project name must be lowercase')
  if (/\s/.test(name)) problems.push('the project name cannot contain spaces (use "-")')
  if (/^[._]/.test(name)) problems.push('the project name cannot start with "." or "_"')
  if (name.startsWith('-')) problems.push('the project name cannot start with "-"')
  if (/[/\\]/.test(name))
    problems.push(
      'the project name cannot contain "/" or "\\" (scoped names are not supported here)',
    )
  if (!/^[a-z0-9._~-]*$/i.test(name.replace(/\s/g, '').replace(/[/\\]/g, ''))) {
    problems.push('the project name may only contain letters, digits, "-", ".", "_" and "~"')
  }
  if (name.endsWith('.')) problems.push('the project name cannot end with "." (Windows drops it)')
  if (NPM_BLOCKED.has(name.toLowerCase()))
    problems.push(`"${name}" is not allowed as a package name`)
  if (WINDOWS_RESERVED.test(name)) problems.push(`"${name}" is a reserved name on Windows`)
  return problems
}
