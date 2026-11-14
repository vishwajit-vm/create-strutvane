/**
 * The default role map written into a generated app's `config/auth.ts`.
 *
 * It follows docs/07 §4.4 exactly (admin = `*`, member = view/create plus update/delete of their
 * OWN records, viewer = view, `newModelDefaults: 'inherit-role-patterns'`), with two additions the
 * spec's security model calls for:
 * - **Internals are never matched by wildcards.** Identity, authorization, tenancy and audit
 *   records (users, sessions, roles, memberships, audit events, …) are listed in
 *   {@link WILDCARD_EXCLUDED_RESOURCES}. A pattern like `*.update` (or admin's `*`) never covers
 *   them, so a broad grant can't hand out account takeover or audit tampering. Access to them is
 *   granted by exact name only.
 * - **Admin's exact grants** for those internals: user management and (with the audit extra)
 *   reading the audit log. Audit events are never updatable or deletable through the role map
 *   (append-only, docs/12 §9).
 *
 * The data lives here, separate from the template, so a test can pin it to the spec.
 *
 * @module
 */
import { hasExtra, type ProjectOptions } from './options.ts'

/** One entry of a role's permission list: a permission pattern, or an owner-scoped one. */
export type RolePermission = string | { readonly action: string; readonly own: true }

/** A role and its permissions. */
export interface RoleDefinition {
  readonly permissions: readonly RolePermission[]
}

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
  return {
    admin: {
      permissions: [
        '*',
        'user.viewAny',
        'user.view',
        'user.update',
        'user.delete',
        ...(hasExtra(o, 'audit') ? ['auditEvent.viewAny', 'auditEvent.view'] : []),
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
  }
}

/** A permission as TypeScript source, in the form the spec writes it. */
export function permissionSource(p: RolePermission): string {
  return typeof p === 'string' ? `'${p}'` : `{ action: '${p.action}', own: true }`
}
