/**
 * The default role map written into a generated app's `config/auth.ts`. `@strutvane/auth`
 * enforces it (`compileRoleMap`): role grants combine with app/policies/*.policy.ts as
 * `(policy allows OR role grants) AND NOT policy denies`.
 *
 * It follows docs/07 §2.7 and §4.4 (admin = `*`, member = view/create plus update/delete of their
 * OWN records, viewer = view, `newModelDefaults: 'inherit-role-patterns'`; with tenancy, `owner` for
 * a tenant's creator), with the additions the spec's security model calls for:
 * - **Internals are never matched by wildcards.** Identity, authorization, tenancy and audit
 *   records (users, sessions, roles, memberships, audit events, …) are listed in
 *   {@link WILDCARD_EXCLUDED_RESOURCES}. A pattern like `*.update` (or admin's `*`) never covers
 *   them, so a broad grant can't hand out account takeover or audit tampering. Access to them is
 *   granted by exact name only.
 * - **Admin's exact grants** for those internals (user management and, with the audit extra,
 *   reading the audit log) carry `scope: 'global'`: users and the audit log are platform-wide, so
 *   only a platform administrator (the role held outside any tenant, like the seed admin) gets
 *   them, never a tenant's own `admin`. Audit events are never updatable or deletable through the
 *   role map (append-only, docs/12 §9).
 * - **`owner` is tenant-scoped** (`scope: 'tenant'`): `*` inside the tenant the user created.
 *   `@strutvane/auth` bounds wildcards held inside a tenant to tenant-scoped models, so a tenant
 *   owner never reaches platform data. Tenant internals (memberships, invitations, settings) are
 *   granted by exact name once they are served as tenant-scoped resources.
 *
 * The data lives here, separate from the template, so a test can pin it to the spec.
 *
 * @module
 */
import { hasExtra, type ProjectOptions } from './options.ts'

/** Where a role or permission counts (as in `@strutvane/auth`). */
export type RoleScope = 'global' | 'tenant'

/** One entry of a role's permission list: a permission pattern, or an object form. */
export type RolePermission =
  | string
  | { readonly action: string; readonly own: true }
  | { readonly action: string; readonly scope: RoleScope }

/** A role and its permissions. */
export interface RoleDefinition {
  readonly scope?: RoleScope
  readonly permissions: readonly RolePermission[]
}

/** The role names generated apps use (docs/07 §2.7), the same names `sv make:policy` writes. */
export const ROLE_NAMES = ['admin', 'member', 'viewer', 'owner'] as const

/** What new models get: the role patterns above, or admin-only (docs/07 §4.4). */
export const NEW_MODEL_DEFAULTS = 'inherit-role-patterns'

/**
 * Resources that wildcard patterns never match (model names in camelCase, matching policy
 * resource names). Taken from the auth tables in docs/07 §2.3. Always listed, even when a
 * feature is off, so the protection is already in place when it is added later (`sv add`).
 */
export const WILDCARD_EXCLUDED_RESOURCES: readonly (readonly [string, readonly string[]])[] = [
  [
    'Identity',
    ['user', 'account', 'session', 'verification', 'mfaFactor', 'passkey', 'impersonationSession'],
  ],
  ['Machine access', ['apiToken', 'serviceAccount', 'oauthClient', 'ssoConnection', 'scimToken']],
  ['Authorization', ['role', 'rolePermission', 'roleInherit', 'assignment', 'permission']],
  ['Tenancy', ['tenant', 'tenantDomain', 'membership', 'invitation', 'team', 'teamMember']],
  ['Audit', ['auditEvent']],
]

/** Every excluded resource name, flattened. */
export function excludedResources(): readonly string[] {
  return WILDCARD_EXCLUDED_RESOURCES.flatMap(([, names]) => names)
}

/** The default roles for the chosen options. */
export function defaultRoles(o: ProjectOptions): Readonly<Record<string, RoleDefinition>> {
  const platform = (action: string): RolePermission => ({ action, scope: 'global' })
  const owner: RoleDefinition = { scope: 'tenant', permissions: ['*'] }
  return {
    admin: {
      permissions: [
        '*',
        platform('user.viewAny'),
        platform('user.view'),
        platform('user.update'),
        platform('user.delete'),
        ...(hasExtra(o, 'audit')
          ? [platform('auditEvent.viewAny'), platform('auditEvent.view')]
          : []),
      ],
    },
    member: {
      permissions: [
        '*.viewAny',
        '*.view',
        '*.create',
        { action: '*.update', own: true },
        { action: '*.delete', own: true },
      ],
    },
    viewer: { permissions: ['*.viewAny', '*.view'] },
    ...(o.tenancy ? { owner } : {}),
  }
}

/** A permission as TypeScript source, in the form the spec writes it. */
export function permissionSource(p: RolePermission): string {
  if (typeof p === 'string') return `'${p}'`
  return 'own' in p
    ? `{ action: '${p.action}', own: true }`
    : `{ action: '${p.action}', scope: '${p.scope}' }`
}
