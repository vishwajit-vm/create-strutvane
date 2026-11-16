// env.ts: no AUTH_* keys and no AUTH_SECRET (#26), no TENANCY_ENABLED (#90), CORS_ORIGINS added
// (packaging finding 4); secrets.ts: APP_KEY is the one app secret.
const fs = require('node:fs')
const path = require('node:path')
const root = process.argv[2]
const edit = (file, pairs) => {
  const f = path.join(root, file)
  let t = fs.readFileSync(f, 'utf8')
  for (const [a, b] of pairs) {
    if (!t.includes(a)) throw new Error(`${file}: missing ${a.slice(0, 80)}`)
    t = t.replace(a, b)
  }
  fs.writeFileSync(f, t)
}
const env = fs.readFileSync(path.join(root, 'src/templates/env.ts'), 'utf8')
const authStart = env.indexOf('function auth(options: ProjectOptions)')
const authEnd = env.indexOf('/**', authStart)
const teamsStart = env.indexOf('function teams(options: ProjectOptions)')
const teamsEnd = env.indexOf('/**', teamsStart)
if (authStart < 0 || teamsStart < 0) throw new Error('env.ts anchors')
const newAuth = `/**
 * The first admin's address (sign-in only). Its password is never stored here (security review
 * F-18), and the sign-in features are not env keys: they live in config/auth.ts (decision #26).
 */
function auth(options: ProjectOptions): EnvSection | undefined {
  if (options.auth === 'none') return undefined
  return {
    title: 'First admin',
    vars: [{ key: 'SEED_ADMIN_EMAIL', value: options.adminEmail ?? \`admin@\${options.name}.test\` }],
  }
}

`
let t = env.slice(0, authStart) + newAuth + env.slice(authEnd)
const ts = t.indexOf('function teams(options: ProjectOptions)')
const te = t.indexOf('/**', ts)
// The jsdoc before teams() (if any) stays harmless; drop the function itself.
t = t.slice(0, ts) + t.slice(te)
fs.writeFileSync(path.join(root, 'src/templates/env.ts'), t)
edit('src/templates/env.ts', [
  [
    `    auth(options),
    teams(options),
    ai(options),`,
    `    auth(options),
    ai(options),`,
  ],
  [
    `      { key: 'APP_PORT', value: String(DEFAULT_PORTS.app) },`,
    `      { key: 'APP_PORT', value: String(DEFAULT_PORTS.app) },
      // The sites that may call the API with cookies (config/cors.ts checks it and names this key
      // when it is empty or wrong). The example is a placeholder to replace, https as production needs.
      {
        key: 'CORS_ORIGINS',
        value: \`http://localhost:\${DEFAULT_PORTS.app}\`,
        example: 'https://app.example.com',
      },`,
  ],
  [`secretKeys(options) // ['APP_KEY', 'DB_PASSWORD', 'DB_ROOT_PASSWORD', 'AUTH_SECRET']`, `secretKeys(options) // ['APP_KEY', 'DB_PASSWORD', 'DB_ROOT_PASSWORD']`],
])
edit('src/steps/secrets.ts', [
  [`const APP_KEYS: ReadonlySet<string> = new Set(['APP_KEY', 'AUTH_SECRET'])`, `const APP_KEYS: ReadonlySet<string> = new Set(['APP_KEY'])`],
])
