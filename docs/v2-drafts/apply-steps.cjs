// Steps: npm's own allowScripts list (#L5), state under .strutvane/local/ (#10), no env.json.
const fs = require('node:fs')
const path = require('node:path')
const root = process.argv[2]
const edit = (file, pairs) => {
  const f = path.join(root, file)
  let t = fs.readFileSync(f, 'utf8')
  for (const [a, b] of pairs) {
    if (!t.includes(a)) throw new Error(`${file}: missing ${a.slice(0, 80)}`)
    t = t.split(a).join(b)
  }
  fs.writeFileSync(f, t)
}
// install.ts: the allowlist is package.json "allowScripts" (npm's own field, enforced by
// strict-allow-scripts), "name@version": true.
const installPath = path.join(root, 'src/steps/install.ts')
let install = fs.readFileSync(installPath, 'utf8')
const s = install.indexOf('/**\n * The packages allowed to run install scripts')
const e = install.indexOf('/** Run the install once')
if (s < 0 || e < 0) throw new Error('install anchors')
install = `${install.slice(0, s)}/**
 * The packages allowed to run install scripts: package.json \`"allowScripts"\`, npm's own list
 * (\`"name@version": true\`; \`false\` records a refusal). The generated \`.npmrc\` sets
 * \`ignore-scripts\` and \`strict-allow-scripts\`, so nothing runs on install and only these are
 * rebuilt afterwards. Anything that is not a plain package name is ignored (it becomes an npm
 * argument).
 *
 * @example
 * rebuildAllowlist('C:/code/my-app') // ['esbuild']
 */
export function rebuildAllowlist(directory: string): string[] {
  let manifest: unknown
  try {
    manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  } catch {
    return []
  }
  if (typeof manifest !== 'object' || manifest === null) return []
  const allowed = Reflect.get(manifest, 'allowScripts')
  if (typeof allowed !== 'object' || allowed === null || Array.isArray(allowed)) return []
  const names = Object.entries(allowed)
    .filter(([, value]) => value === true)
    .map(([key]) => key.replace(/(.)@[^@/]+$/, '$1'))
    .filter((name) => /^(@[a-z0-9._-]+\\/)?[a-z0-9._-]+$/.test(name))
  return [...new Set(names)]
}

${install.slice(e)}`
fs.writeFileSync(installPath, install)
edit('src/steps/install.ts', [
  [
    `export type InstallProblem = 'network' | 'locked' | 'registry' | 'other'`,
    `export type InstallProblem = 'network' | 'locked' | 'registry' | 'npm-version' | 'other'`,
  ],
  [
    `  if (/\\b(EPERM|EBUSY)\\b/.test(output)) return 'locked'`,
    `  if (/\\b(EPERM|EBUSY)\\b/.test(output)) return 'locked'
  if (/\\bEBADDEVENGINES\\b/.test(output)) return 'npm-version'`,
  ],
  [
    `  other: 'npm install failed.',`,
    `  'npm-version':
    'This app needs npm 11.19 or newer (its supply-chain guards need it). Update npm: npm install --global npm@11',
  other: 'npm install failed.',`,
  ],
  [`A package on the "strutvane.rebuild" list could not run its install script.`, `A package on the package.json "allowScripts" list could not run its install script.`],
])
edit('src/steps/git.ts', [
  [`  '.strutvane/setup.json',`, `  '.strutvane/local/setup.json',`],
  [`  return /^(\\.strutvane|docker|storage|node_modules)\\//.test(path)`, `  return /^(\\.strutvane\\/local|docker|storage|node_modules)\\//.test(path)`],
])
edit('src/steps/sqlite-fallback.ts', [
  [
    ` * - \`.strutvane/env.json\`: mode \`host\`, so \`node strut\` stops forwarding into a container;`,
    ` * - \`strutvane.json\`: docker false, so \`node strut\` stops forwarding into a container;`,
  ],
  [`  '.strutvane/env.json',\n`, ''],
])
