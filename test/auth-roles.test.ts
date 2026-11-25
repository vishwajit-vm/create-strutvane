/**
 * The role map in a generated `config/auth.ts`.
 *
 * Why: from @strutvane/auth 0.2.0-next.2 a role without a `scope` is a PLATFORM role, team roles
 * must say `scope: 'tenant'`, a team's creator holds the reserved `owner` role (never a platform
 * role) and `admin` is platform-only. Auth refuses a map that breaks those rules at boot, so a
 * generated map that drifts would ship apps that do not start, or that give a team role platform
 * grants. The checks below mirror auth's `compileRoleMap` / `partitionRoles` rules; the installer
 * cannot import auth (decision B8: no runtime dependency, and auth may not be published yet).
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { type Answers, type ProjectOptions, ROLE_SETS, resolveOptions } from '../src/options.ts'
import {
  authRoleMap,
  PLATFORM_ADMIN_ROLE,
  ROLE_PRESETS,
  type RoleMap,
  TEAM_OWNER_ROLE,
  WILDCARD_EXCLUDE,
} from '../src/templates/auth-roles.ts'
import { renderProject } from '../src/templates/project.ts'

const options = (answers: Answers = {}): ProjectOptions =>
  resolveOptions({ name: 'acme-portal', ...answers }, '/code')

const fileOf = (answers: Answers, path: string): string => {
  const found = renderProject(options(answers)).find((f) => f.path === path)
  if (found === undefined) throw new Error(`${path} was not generated`)
  return found.content
}

/** The data of a generated `config/auth.ts` (JSON after `export default`). */
const authConfig = (answers: Answers = {}): RoleMap & { features: Record<string, boolean> } =>
  JSON.parse(
    fileOf(answers, 'config/auth.ts').replace(/^[\s\S]*?export default /, ''),
  ) as RoleMap & {
    features: Record<string, boolean>
  }

const actionOf = (permission: string | { readonly action: string }): string =>
  typeof permission === 'string' ? permission : permission.action

/** The rules auth 0.2.0-next.2 enforces at boot, plus the ones this installer promises. */
function expectValidRoleMap(map: RoleMap, teams: boolean): void {
  const roles = Object.entries(map.roles)
  expect(map.roles[PLATFORM_ADMIN_ROLE]?.scope).toBe('global')
  if (teams) expect(map.roles[TEAM_OWNER_ROLE]).toEqual({ scope: 'tenant', permissions: ['*'] })
  else expect(map.roles).not.toHaveProperty(TEAM_OWNER_ROLE)
  for (const [name, role] of roles) {
    // Explicit everywhere: a missing scope would silently mean "platform".
    expect(['global', 'tenant'], name).toContain(role.scope)
    // With teams, admin is the ONLY platform role; without, there are no team roles.
    expect(role.scope, name).toBe(name === PLATFORM_ADMIN_ROLE || !teams ? 'global' : 'tenant')
    expect(role.permissions.length, name).toBeGreaterThan(0)
    for (const permission of role.permissions) {
      const action = actionOf(permission)
      expect(action, name).toMatch(/^(\*|(\*|[a-z][a-zA-Z0-9_-]*)\.(\*|[a-zA-Z][a-zA-Z0-9_-]*))$/)
      const [resource, verb] = action.split('.')
      // `user.*` on an excluded resource is a boot error in auth.
      if (resource !== undefined && WILDCARD_EXCLUDE.includes(resource))
        expect(verb, `${name}: ${action}`).not.toBe('*')
      // Only the platform admin manages users (exact grants; wildcards never reach them).
      if (resource === 'user') expect(name).toBe(PLATFORM_ADMIN_ROLE)
    }
  }
  expect(map.defaultRoles).toEqual([])
  expect(map.newModelDefaults).toBe('inherit-role-patterns')
}

describe('authRoleMap', () => {
  it('without teams: the starting roles are platform roles and there is no owner', () => {
    const map = authRoleMap({ roles: 'admin-member', teams: false })
    expect(Object.keys(map.roles)).toEqual(['admin', 'member'])
    expectValidRoleMap(map, false)
  })

  it('with teams: admin stays the platform role; owner and the others are team roles', () => {
    const map = authRoleMap({ roles: 'admin-manager-member-viewer', teams: true })
    expect(Object.keys(map.roles)).toEqual(['admin', 'owner', 'manager', 'member', 'viewer'])
    expectValidRoleMap(map, true)
    expect(map.roles['member']?.permissions).toEqual([
      '*.viewAny',
      '*.view',
      '*.create',
      { action: '*.update', own: true },
      { action: '*.delete', own: true },
    ])
    expect(map.roles['viewer']?.permissions).toEqual(['*.viewAny', '*.view'])
  })

  it('holds for every preset and teams answer, and creates exactly the preset roles', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ROLE_SETS), fc.boolean(), (roles, teams) => {
        const map = authRoleMap({ roles, teams })
        expectValidRoleMap(map, teams)
        expect(Object.keys(map.roles).sort()).toEqual(
          [...ROLE_PRESETS[roles], ...(teams ? [TEAM_OWNER_ROLE] : [])].sort(),
        )
      }),
    )
  })

  it('keeps every identity, access, team and audit record out of wildcards (docs/07 §4.4)', () => {
    for (const resource of ['user', 'session', 'apiToken', 'role', 'membership', 'invitation'])
      expect(WILDCARD_EXCLUDE).toContain(resource)
    expect(WILDCARD_EXCLUDE).toContain('auditEvent')
    expect(new Set(WILDCARD_EXCLUDE).size).toBe(WILDCARD_EXCLUDE.length)
  })

  it('fails closed without the starting roles answer', () => {
    expect(() => authRoleMap({ roles: undefined, teams: true })).toThrow(/question 10/)
  })
})

describe('config/auth.ts', () => {
  it('holds the role map for the answers, next to the features', () => {
    for (const teams of [false, true])
      for (const roles of ROLE_SETS) {
        const config = authConfig({ teams, roles })
        expect(config.features['teams']).toBe(teams)
        expect({
          roles: config.roles,
          wildcardExclude: config.wildcardExclude,
          newModelDefaults: config.newModelDefaults,
          defaultRoles: config.defaultRoles,
        }).toEqual(authRoleMap({ roles, teams }))
        expectValidRoleMap(config, teams)
      }
  })

  it('the Recommended app keeps teams and public registration off, with platform roles only', () => {
    const config = authConfig()
    expect(config.features['teams']).toBe(false)
    expect(config.features['registration']).toBe(false)
    expect(Object.keys(config.roles)).toEqual(['admin', 'member'])
    expectValidRoleMap(config, false)
    expect(fileOf({}, 'config/tenancy.ts')).toContain('"enabled": false')
  })

  it('explains scopes, the platform-only admin and the owner role to the reader', () => {
    const off = fileOf({}, 'config/auth.ts')
    expect(off).toMatch(/scope "tenant": a team role/)
    expect(off).toMatch(/"admin".*is never a team role/s)
    expect(off).toContain('"owner": { "scope": "tenant", "permissions": ["*"] }')
    const on = fileOf({ teams: true }, 'config/auth.ts')
    expect(on).toMatch(/"admin" is the one platform role/)
    expect(on).toMatch(/reserved\n\/\/ "owner" role/)
    // The magic-link note stays a comment line before the role map comment.
    expect(fileOf({ auth: 'magic-link' }, 'config/auth.ts')).toMatch(
      /Email link only[^\n]*\n\/\/\n\/\/ Roles:/,
    )
  })

  it('config/permissions.ts records the answer and points at the role map in config/auth.ts', () => {
    const text = fileOf({ roles: 'admin-manager-member-viewer' }, 'config/permissions.ts')
    expect(text).toContain('role map in config/auth.ts')
    expect(text).toContain('"preset": "admin-manager-member-viewer"')
  })

  it('no sign-in: no config/auth.ts and no role map anywhere', () => {
    const project = renderProject(options({ auth: 'none' }))
    expect(project.some((f) => f.path === 'config/auth.ts')).toBe(false)
    expect(project.some((f) => f.path === 'config/permissions.ts')).toBe(false)
  })
})
