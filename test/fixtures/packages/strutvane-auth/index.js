// TEST STAND-IN for @strutvane/auth 0.2.0-next.1 (create-strutvane's tests only). Same exported
// names and contracts the generated app uses: createFirstAdmin() + FirstAdminError (codes
// first_admin_exists, email_taken, validation_failed, auth_tables_missing), and the migrations an
// app copies with copyAuthMigrations() / `node strut auth:migration`. The work runs on the
// framework stand-in's seeding database (db.exec / db.column).
import { randomBytes, scryptSync } from 'node:crypto'
import { constants, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sqlValue } from '@strutvane/framework'

/** A refusal of createFirstAdmin(): nothing was written. Match on `code`. */
export class FirstAdminError extends Error {
  name = 'FirstAdminError'
  constructor(code, message, options) {
    super(`${message} (${code})`, options)
    this.code = code
  }
}

/** scrypt hash with a random salt (the real package owns the format). */
function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url')
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString('base64url')}`
}

/** The first admin, once: refuses when an account already has the role. */
export async function createFirstAdmin(db, input) {
  const email = String(input.email ?? '')
    .trim()
    .toLowerCase()
  const name = input.name ?? 'Admin'
  const role = input.role ?? 'admin'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new FirstAdminError('validation_failed', `"${email}" is not an email address`)
  if (input.password !== undefined && input.password.length < 12)
    throw new FirstAdminError('validation_failed', 'The password needs at least 12 characters')
  let admins
  try {
    admins = await db.column(`SELECT user_id FROM user_roles WHERE role = ${sqlValue(role)}`)
  } catch (error) {
    throw new FirstAdminError(
      'auth_tables_missing',
      "Auth's tables are missing: run node strut auth:migration, then node strut migrate",
      { cause: error },
    )
  }
  if (admins.length > 0)
    throw new FirstAdminError(
      'first_admin_exists',
      `An account with the ${role} role already exists; nothing was changed`,
    )
  if ((await db.column(`SELECT COUNT(*) FROM users WHERE email = ${sqlValue(email)}`))[0] !== '0')
    throw new FirstAdminError('email_taken', `An account with ${email} already exists`)
  const oneTimePassword =
    input.password === undefined ? randomBytes(18).toString('base64url') : undefined
  const password = input.password ?? oneTimePassword
  await db.exec(
    `INSERT INTO users (name, email, password) VALUES (${sqlValue(name)}, ${sqlValue(email)}, ${sqlValue(hashPassword(password))})`,
  )
  const [userId] = await db.column(`SELECT id FROM users WHERE email = ${sqlValue(email)}`)
  await db.exec(
    `INSERT INTO user_roles (user_id, role) VALUES (${sqlValue(Number(userId))}, ${sqlValue(role)})`,
  )
  return Object.freeze({
    userId: String(userId),
    email,
    role,
    ...(oneTimePassword === undefined ? {} : { oneTimePassword }),
  })
}

/** The migration files auth ships, in the order they run (the real package's names). */
export const AUTH_MIGRATIONS = Object.freeze([
  '2026_11_18_000001_add_auth_columns_to_users_table.ts',
  '2026_11_18_000002_create_auth_tables.ts',
])

/** The folder holding auth's migrations inside the installed package. */
export function authMigrationsDirectory() {
  return fileURLToPath(new URL('./migrations/', import.meta.url))
}

/** Copy auth's migrations into an app's migrations folder; files already there are left alone. */
export function copyAuthMigrations(targetDirectory, sourceDirectory = authMigrationsDirectory()) {
  const copied = []
  const present = []
  mkdirSync(targetDirectory, { recursive: true })
  for (const file of AUTH_MIGRATIONS) {
    const target = join(targetDirectory, file)
    if (existsSync(target)) {
      present.push(file)
      continue
    }
    copyFileSync(join(sourceDirectory, file), target, constants.COPYFILE_EXCL)
    copied.push(file)
  }
  return { copied, present }
}
