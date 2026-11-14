/**
 * Secure defaults of a generated app, each pinned by a regression test:
 * - the role map in `config/auth.ts` matches docs/07 §4.4 (owner-scoped update/delete, internals
 *   never matched by wildcards, `newModelDefaults`), and public sign-up is off by default;
 * - `.env.example` commits safe defaults (`APP_DEBUG=false`, `API_DOCS=false`);
 * - the generated `env.schema.ts` refuses debug mode outside `local`, wildcard CORS origins and
 *   non-https origins in production (executed with the real Zod, not only string-matched);
 * - `.gitignore`, `.strutvane/README.md` and the generated docs agree on what in `.strutvane/` is
 *   committed (ADR-0012).
 */
import { existsSync, readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  defaultRoles,
  excludedResources,
  NEW_MODEL_DEFAULTS,
  permissionSource,
  ROLE_NAMES,
} from '../src/auth-roles.ts'
import { applyExampleValues, buildEnvSpec } from '../src/env-spec.ts'
import type { RawProjectInput } from '../src/options.ts'
import { renderProject } from '../src/render.ts'
import { envRefinements } from '../src/templates/env.ts'
import { gitignore } from '../src/templates/root.ts'
import { generate, linkNodeModules, optionsFor, PKG_ROOT, removeDir, tempDir } from './helpers.ts'

const at = (input: RawProjectInput) => optionsFor(input, resolve('/work'))
const contentOf = (input: RawProjectInput, path: string) =>
  renderProject(at(input)).files.find((f) => f.path === path)?.content ?? ''

/**
 * The `roles: { … }` object literal from a config/auth.ts source, with line comments, whitespace
 * and trailing commas removed, so two sources compare equal exactly when their grants are equal.
 */
const rolesBlock = (source: string): string => {
  const start = source.indexOf('roles: {')
  if (start < 0) return ''
  let depth = 0
  let end = start
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) {
      end = i + 1
      break
    }
  }
  return source
    .slice(start, end)
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, '')
    .replace(/,([}\]])/g, '$1')
}

/** docs/07 §4.4, copied verbatim (the spec is the source of truth; change both together). */
const SPEC_ROLES = {
  admin: ["'*'"],
  member: [
    "'*.viewAny'",
    "'*.view'",
    "'*.create'",
    "{ action: '*.update', own: true }",
    "{ action: '*.delete', own: true }",
  ],
  viewer: ["'*.viewAny'", "'*.view'"],
} as const

const sourceOf = (role: keyof typeof SPEC_ROLES, input: RawProjectInput = { name: 'a' }) =>
  (defaultRoles(at(input))[role]?.permissions ?? []).map(permissionSource)

describe('role map (docs/07 §4.4)', () => {
  test('member and viewer are exactly the spec; admin starts with the spec', () => {
    expect(sourceOf('member')).toEqual(SPEC_ROLES.member)
    expect(sourceOf('viewer')).toEqual(SPEC_ROLES.viewer)
    expect(sourceOf('admin').slice(0, 1)).toEqual(SPEC_ROLES.admin)
    expect(Object.keys(defaultRoles(at({ name: 'a' })))).toEqual(['admin', 'member', 'viewer'])
    expect(NEW_MODEL_DEFAULTS).toBe('inherit-role-patterns')
  })

  test('no wildcard grants update or delete without own: true', () => {
    for (const role of ['member', 'viewer'] as const) {
      for (const p of defaultRoles(at({ name: 'a' }))[role]?.permissions ?? []) {
        if (typeof p === 'string') expect(p, role).not.toMatch(/^\*\.(update|delete|forceDelete)$/)
        else expect('own' in p && p.own, role).toBe(true)
      }
    }
  })

  test("admin's exact grants are only for user management and audit reading, platform-wide only", () => {
    expect(sourceOf('admin').slice(1)).toEqual([
      "{ action: 'user.viewAny', scope: 'global' }",
      "{ action: 'user.view', scope: 'global' }",
      "{ action: 'user.update', scope: 'global' }",
      "{ action: 'user.delete', scope: 'global' }",
    ])
    expect(sourceOf('admin', { name: 'a', extras: ['audit'] }).slice(5)).toEqual([
      "{ action: 'auditEvent.viewAny', scope: 'global' }",
      "{ action: 'auditEvent.view', scope: 'global' }",
    ])
  })

  test('with tenancy, a tenant creator gets owner: * inside that tenant only (docs/07 §2.7)', () => {
    const roles = defaultRoles(at({ name: 'a', tenancy: true }))
    expect(Object.keys(roles)).toEqual([...ROLE_NAMES])
    expect(roles['owner']).toEqual({ scope: 'tenant', permissions: ['*'] })
    expect(contentOf({ name: 'a', tenancy: true }, 'config/auth.ts')).toContain(
      "    owner: { scope: 'tenant', permissions: ['*'] },",
    )
    expect(contentOf({ name: 'a' }, 'config/auth.ts')).not.toContain('owner:')
  })

  test('identity, authorization, tenancy and audit internals are excluded from wildcards', () => {
    const excluded = excludedResources()
    for (const r of ['user', 'session', 'account', 'role', 'assignment', 'tenant', 'membership'])
      expect(excluded).toContain(r)
    expect(excluded).toContain('auditEvent')
    expect(new Set(excluded).size).toBe(excluded.length)
  })

  // Drift check against the hub spec itself, when the local workspace layout has it.
  const spec = join(PKG_ROOT, '..', '..', 'docs', '07-package-auth.md')
  test.skipIf(!existsSync(spec))('matches the excerpt in the hub spec', () => {
    const text = readFileSync(spec, 'utf8')
    const excerpt = text.slice(text.indexOf('// config/auth.ts (excerpt)'))
    // Compare the whole `roles: { … }` block, ignoring comments and layout, so the spec can stay
    // readable (multi-line, annotated) while any change to an actual grant is still caught. The
    // spec excerpt shows tenancy on and audit off.
    const generated = contentOf({ name: 'a', tenancy: true }, 'config/auth.ts')
    expect(rolesBlock(excerpt)).toBe(rolesBlock(generated))
    expect(excerpt).toContain(`newModelDefaults: '${NEW_MODEL_DEFAULTS}'`)
  })

  test('config/auth.ts renders the map, the exclusions and the defaults', () => {
    const auth = contentOf({ name: 'a', extras: ['audit'] }, 'config/auth.ts')
    expect(auth).toContain(
      "    admin: {\n      permissions: [\n        '*',\n        { action: 'user.viewAny', scope: 'global' },",
    )
    expect(auth).toContain(
      "    member: {\n      permissions: [\n        '*.viewAny',\n        '*.view',\n        '*.create',\n" +
        "        { action: '*.update', own: true },\n        { action: '*.delete', own: true },\n",
    )
    expect(auth).toContain("    viewer: { permissions: ['*.viewAny', '*.view'] },")
    expect(auth).not.toMatch(/'\*\.update'(?!, own)/)
    for (const r of excludedResources()) expect(auth).toContain(`    '${r}',`)
    expect(auth).toContain("  newModelDefaults: 'inherit-role-patterns' as const,")
    expect(auth).toContain('  defaultRoles: [] as string[],')
    expect(auth).toContain("role: 'admin' }")
    expect(auth).toContain('  registration: env.AUTH_ALLOW_REGISTRATION,')
  })

  test('config/auth.ts is typed by defineAuthConfig and sets the request-hardening options', () => {
    const auth = contentOf({ name: 'a' }, 'config/auth.ts')
    expect(auth).toContain("import { defineAuthConfig } from '@strutvane/auth'")
    expect(auth).toContain('export default defineAuthConfig({')
    expect(auth).not.toContain('defineConfig(')
    expect(auth).toContain('  trustedOrigins: [env.APP_URL],')
    expect(auth).toContain('  trustedProxies: [] as string[],')
  })

  test('public sign-up is off by default', () => {
    const vars = buildEnvSpec(at({ name: 'a' })).flatMap((s) => s.vars)
    expect(vars.find((v) => v.key === 'AUTH_ALLOW_REGISTRATION')?.value).toBe('false')
  })
})

describe('.env.example safe defaults', () => {
  test('applyExampleValues replaces only keys with an example value', () => {
    const sections = buildEnvSpec(at({ name: 'a' }))
    const text = 'APP_ENV=local\nAPP_DEBUG=true\nAPI_DOCS=true\n# APP_DEBUG=true\n'
    expect(applyExampleValues(text, sections)).toBe(
      'APP_ENV=local\nAPP_DEBUG=false\nAPI_DOCS=false\n# APP_DEBUG=true\n',
    )
    expect(applyExampleValues('A=1\n', [])).toBe('A=1\n')
  })

  test('never applies an example value to a secret', () => {
    const secret = { key: 'S', secret: true, kind: 'secret', comment: 'c', example: 'x' } as const
    expect(applyExampleValues('S=\n', [{ title: 'T', vars: [secret] }])).toBe('S=\n')
  })

  let root: string
  let dir: string
  beforeAll(async () => {
    const generated = await generate({ name: 'acme', preset: 'api', database: 'sqlite' })
    root = generated.root
    dir = generated.options.directory
  })
  afterAll(async () => {
    await removeDir(root)
  })

  test('the written files: .env keeps local values, .env.example gets the safe ones', async () => {
    const env = await readFile(join(dir, '.env'), 'utf8')
    const example = await readFile(join(dir, '.env.example'), 'utf8')
    expect(env).toMatch(/^APP_DEBUG=true$/m)
    expect(env).toMatch(/^API_DOCS=true$/m)
    expect(example).toMatch(/^APP_DEBUG=false$/m)
    expect(example).toMatch(/^API_DOCS=false$/m)
    expect(example).toMatch(/^AUTH_ALLOW_REGISTRATION=false$/m)
    expect(env).toMatch(/^AUTH_ALLOW_REGISTRATION=false$/m)
  })

  test('the README table shows the committed default and the local value', () => {
    const readme = contentOf({ name: 'a' }, 'README.md')
    expect(readme).toContain('| `APP_DEBUG` | `false` (local `.env`: `true`) |')
    expect(readme).toContain('| `AUTH_ALLOW_REGISTRATION` | `false` |')
  })
})

describe('reverse proxies are not trusted by default', () => {
  test('config/app.ts reads publicUrl from APP_URL and trustProxy from TRUST_PROXY', () => {
    const app = contentOf({ name: 'a' }, 'config/app.ts')
    expect(app).toContain('  publicUrl: env.APP_URL,')
    expect(app).toContain('  trustProxy: env.TRUST_PROXY,')
    // The ui preset has no server, so no proxy settings.
    expect(contentOf({ name: 'a', preset: 'ui' }, 'config/app.ts')).not.toContain('trustProxy')
  })

  test('TRUST_PROXY defaults to 0 (no proxy) and its comment says when to change it', () => {
    const v = buildEnvSpec(at({ name: 'a' }))
      .flatMap((s) => s.vars)
      .find((x) => x.key === 'TRUST_PROXY')
    expect(v).toMatchObject({ value: '0', kind: 'integer' })
    expect(v?.example).toBeUndefined()
    expect(v?.comment).toContain('only behind a proxy you control')
    expect(contentOf({ name: 'a' }, 'env.schema.ts')).toContain(
      'TRUST_PROXY: z.coerce.number().int().min(0),',
    )
    expect(
      buildEnvSpec(at({ name: 'a', preset: 'ui' }))
        .flatMap((s) => s.vars)
        .some((x) => x.key === 'TRUST_PROXY'),
    ).toBe(false)
  })
})

describe('env.schema.ts refusals (executed with the real Zod)', () => {
  type Schema = { safeParse(v: unknown): { success: boolean } }
  let schema: Schema
  let dir: string
  const valid: Record<string, string> = {}

  beforeAll(async () => {
    dir = await tempDir()
    await linkNodeModules(dir)
    const { files } = renderProject(at({ name: 'acme', preset: 'api', database: 'sqlite' }))
    const source = files.find((f) => f.path === 'env.schema.ts')?.content ?? ''
    await writeFile(join(dir, 'env.schema.ts'), source)
    schema = (
      (await import(pathToFileURL(join(dir, 'env.schema.ts')).href)) as { envSchema: Schema }
    ).envSchema
    for (const v of buildEnvSpec(at({ name: 'acme', preset: 'api', database: 'sqlite' })).flatMap(
      (s) => s.vars,
    ))
      valid[v.key] = v.kind === 'secret' ? 'x'.repeat(48) : (v.value ?? '')
  })
  afterAll(async () => {
    await removeDir(dir)
  })

  const ok = (overrides: Record<string, string>) =>
    schema.safeParse({ ...valid, ...overrides }).success

  test('the local defaults are valid', () => {
    expect(ok({})).toBe(true)
  })

  test('TRUST_PROXY must be a non-negative whole number of hops', () => {
    expect(ok({ TRUST_PROXY: '1' })).toBe(true)
    expect(ok({ TRUST_PROXY: '-1' })).toBe(false)
    expect(ok({ TRUST_PROXY: 'yes' })).toBe(false)
    expect(ok({ TRUST_PROXY: '1.5' })).toBe(false)
  })

  test.each(['test', 'staging', 'production'])('refuses APP_DEBUG=true with APP_ENV=%s', (env) => {
    expect(ok({ APP_ENV: env, APP_DEBUG: 'true' })).toBe(false)
    expect(ok({ APP_ENV: env, APP_DEBUG: 'false', CORS_ORIGINS: 'https://app.example.com' })).toBe(
      true,
    )
  })

  test.each(['*', 'https://*.example.com', 'http://localhost:3000,*'])(
    'refuses the CORS origin list %s (credentials are allowed)',
    (origins) => {
      expect(ok({ CORS_ORIGINS: origins })).toBe(false)
    },
  )

  test('requires https:// CORS origins in production only', () => {
    const production = { APP_ENV: 'production', APP_DEBUG: 'false' }
    expect(ok({ ...production, CORS_ORIGINS: 'http://app.example.com' })).toBe(false)
    expect(ok({ ...production, CORS_ORIGINS: 'https://a.example.com,http://b.example.com' })).toBe(
      false,
    )
    expect(ok({ ...production, CORS_ORIGINS: 'https://app.example.com' })).toBe(true)
    expect(
      ok({ APP_ENV: 'staging', APP_DEBUG: 'false', CORS_ORIGINS: 'http://staging.example.com' }),
    ).toBe(true)
  })

  test('each check is emitted only when its keys exist', () => {
    expect(envRefinements(new Set())).toEqual([])
    expect(envRefinements(new Set(['APP_DEBUG'])).join('\n')).toBe('')
    const cors = envRefinements(new Set(['CORS_ORIGINS'])).join('\n')
    expect(cors).toContain("origin.includes('*')")
    expect(cors).not.toContain('production')
    const all = envRefinements(new Set(['APP_ENV', 'APP_DEBUG', 'CORS_ORIGINS'])).join('\n')
    expect(all).toContain("env.APP_ENV !== 'local' && env.APP_DEBUG")
    expect(all).toContain("env.APP_ENV === 'production' && insecure")
  })
})

describe('.strutvane/ commit policy (ADR-0012)', () => {
  const ignore = gitignore(at({ name: 'a' }))

  test('.gitignore ignores generated state and staging, keeps the upgrade state', () => {
    const rules = ignore
      .split('\n')
      .filter((l) => l.startsWith('.strutvane') || l.startsWith('!.strutvane'))
    expect(rules).toEqual([
      '.strutvane/*',
      '!.strutvane/README.md',
      '!.strutvane/lock.json',
      '!.strutvane/base/',
      '!.strutvane/templates/',
      '.strutvane/staging/',
    ])
  })

  test('.strutvane/README.md and the generated docs say the same', () => {
    const state = contentOf({ name: 'a' }, '.strutvane/README.md')
    const readme = contentOf({ name: 'a' }, 'README.md')
    const claude = contentOf({ name: 'a' }, 'CLAUDE.md')
    for (const doc of [state, readme, claude]) {
      for (const shared of ['lock.json', 'base/', 'templates/'])
        expect(doc).toContain(`\`${shared}\``)
    }
    expect(state).toContain('`staging/`')
    expect(state).toContain('`registry.gen.ts`')
    expect(readme).toContain('git-ignored, except the upgrade state')
  })

  test("Biome skips .strutvane (committed lock and base files aren't the app's code)", () => {
    expect(contentOf({ name: 'a' }, 'biome.json')).toContain('"!.strutvane"')
  })
})
