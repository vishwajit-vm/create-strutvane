/**
 * The role map a new app's `config/auth.ts` starts with (hub docs/07 §2.7 and §4.4): which roles
 * exist, where each is held, and what each may do on top of the app's policies.
 *
 * Why every role states its `scope`: from @strutvane/auth 0.2.0-next.2 a role without one is a
 * PLATFORM role (held outside teams), team roles must say `scope: 'tenant'`, the person who
 * creates a team holds the reserved `owner` role there (never a platform role), and `admin` is
 * the platform administrator only (never a team role). Auth refuses a map that breaks those rules
 * at boot. Spelling every scope out keeps the file readable and means the same thing to older
 * auth releases, whose default scope was `'any'`: there, too, `admin`'s grants never reach inside
 * a team.
 *
 * - **Teams off:** every starting role is a platform role (`scope: 'global'`); there is no `owner`.
 * - **Teams on:** `admin` stays the one platform role; `owner` and the other starting roles are
 *   team roles (`scope: 'tenant'`), so a member's grants only count inside their team, and a `*`
 *   pattern there only reaches team data (models with a `tenantId` column).
 *
 * Pure: same options, same map.
 *
 * @module
 */
import type { ProjectOptions, RoleSet } from '../options.ts'

/** Where a role is held: outside teams (`global`) or inside one team (`tenant`). */
export type RoleScope = 'global' | 'tenant'

/** One permission: a `'<resource>.<action>'` pattern, or one limited to the actor's own records. */
export type RolePermission = string | { readonly action: string; readonly own: true }

/** One role of the map. */
export interface RoleEntry {
  readonly scope: RoleScope
  readonly permissions: readonly RolePermission[]
}

/** The role-map keys of `config/auth.ts`. */
export interface RoleMap {
  readonly roles: Readonly<Record<string, RoleEntry>>
  readonly wildcardExclude: readonly string[]
  readonly newModelDefaults: 'inherit-role-patterns'
  readonly defaultRoles: readonly string[]
}

/** The platform administrator: the first admin holds it; never a team role. */
export const PLATFORM_ADMIN_ROLE = 'admin'

/** The reserved role of a team's creator: always a team role, never a platform role. */
export const TEAM_OWNER_ROLE = 'owner'

/**
 * Records no `*` pattern ever reaches (hub docs/07 §4.4): identity, machine access,
 * authorization, teams and audit. They are granted by exact name only. Complete on purpose, even
 * for features that are off, so the protection is in place when they are turned on.
 */
export const WILDCARD_EXCLUDE: readonly string[] = Object.freeze([
  // Identity
  'user',
  'account',
  'session',
  'verification',
  'mfaFactor',
  'passkey',
  'impersonationSession',
  // Machine access
  'apiToken',
  'serviceAccount',
  'oauthClient',
  'ssoConnection',
  'scimToken',
  // Authorization
  'role',
  'rolePermission',
  'roleInherit',
  'assignment',
  'permission',
  // Teams (tenancy)
  'tenant',
  'tenantDomain',
  'membership',
  'invitation',
  'team',
  'teamMember',
  // Audit
  'auditEvent',
])

/**
 * What each starting role may do (hub docs/07 §2.7). `admin` gets every model and, by exact name,
 * user management; `manager` changes any record; `member` views and creates, and changes or
 * deletes only its own records (`own: true`, which never matches a model without an `ownerId`);
 * `viewer` only views. `owner` runs its team.
 */
const PERMISSIONS: Readonly<Record<string, readonly RolePermission[]>> = Object.freeze({
  admin: Object.freeze(['*', 'user.viewAny', 'user.view', 'user.update', 'user.delete']),
  owner: Object.freeze(['*']),
  manager: Object.freeze(['*.viewAny', '*.view', '*.create', '*.update', '*.delete']),
  member: Object.freeze([
    '*.viewAny',
    '*.view',
    '*.create',
    Object.freeze({ action: '*.update', own: true as const }),
    Object.freeze({ action: '*.delete', own: true as const }),
  ]),
  viewer: Object.freeze(['*.viewAny', '*.view']),
})

/** The roles each starting-role preset creates (decision #27). */
export const ROLE_PRESETS: Readonly<Record<RoleSet, readonly string[]>> = Object.freeze({
  'admin-member': Object.freeze(['admin', 'member']),
  'admin-manager-member-viewer': Object.freeze(['admin', 'manager', 'member', 'viewer']),
})

/**
 * The role map for these options: the starting roles (question 10), placed by the teams answer
 * (question 11). Fails closed on a role it has no permissions for, so a new preset can never ship
 * a role that silently grants nothing or everything.
 *
 * @example
 * authRoleMap({ ...options, roles: 'admin-member', teams: true }).roles
 * // { admin: { scope: 'global', ... }, owner: { scope: 'tenant', ... }, member: { scope: 'tenant', ... } }
 */
export function authRoleMap(options: Pick<ProjectOptions, 'roles' | 'teams'>): RoleMap {
  if (options.roles === undefined)
    throw new Error(
      'config/auth.ts needs the starting roles answer (question 10); it is only missing without sign-in, where config/auth.ts is not written.',
    )
  const teamScope: RoleScope = options.teams ? 'tenant' : 'global'
  const names = [
    PLATFORM_ADMIN_ROLE,
    ...(options.teams ? [TEAM_OWNER_ROLE] : []),
    ...ROLE_PRESETS[options.roles].filter((name) => name !== PLATFORM_ADMIN_ROLE),
  ]
  const roles: Record<string, RoleEntry> = {}
  for (const name of names) {
    const permissions = PERMISSIONS[name]
    if (permissions === undefined)
      throw new Error(
        `No permissions are defined for the starting role "${name}"; add it to PERMISSIONS in src/templates/auth-roles.ts.`,
      )
    roles[name] = {
      scope: name === PLATFORM_ADMIN_ROLE ? 'global' : teamScope,
      permissions,
    }
  }
  return {
    roles,
    wildcardExclude: WILDCARD_EXCLUDE,
    newModelDefaults: 'inherit-role-patterns',
    // Platform roles every new account gets: none, so sign-up never hands out access.
    defaultRoles: [],
  }
}
