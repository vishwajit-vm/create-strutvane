/**
 * The npm dist-tag this build of create-strutvane is published under, so every command we print
 * (help text, examples) installs a version that actually has the `create-strutvane` binary.
 *
 * Why not always `@latest`: before 1.0 every version is a pre-release (`0.1.0-next.0`) published
 * under the `next` dist-tag (Changesets pre mode), while `latest` points at a name-reservation
 * placeholder with no binary, so `npm create strutvane@latest` fails with "could not determine
 * executable to run". Deriving the tag from our own version keeps the text right after 1.0, when a
 * stable version is published to `latest`.
 *
 * @module
 */

/** `1.2.3-next.4+build.5` → `next.4`; `undefined` for a stable version or anything unparseable. */
const PRERELEASE = /^\d+\.\d+\.\d+-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)(?:\+[0-9A-Za-z.-]+)?$/

/** A dist-tag must not look like a version or range; a leading letter is always safe. */
const TAG = /^[A-Za-z][0-9A-Za-z-]*$/

/** Tag used for a pre-release whose identifier is not a usable tag (e.g. `1.0.0-0`). */
const DEFAULT_PRERELEASE_TAG = 'next'

/**
 * The dist-tag a version is published under: the first pre-release identifier for a pre-release
 * (`0.1.0-next.0` → `next`, `1.0.0-rc.1` → `rc`), otherwise `latest`.
 *
 * A numeric-only pre-release (`1.0.0-0`) has no tag in its name, so it maps to `next`, the tag our
 * release pipeline uses for every pre-release.
 */
export function releaseTag(version: string): string {
  const match = PRERELEASE.exec(version.trim())
  if (match === null) return 'latest'
  const [first = ''] = (match[1] ?? '').split('.')
  return TAG.test(first) ? first : DEFAULT_PRERELEASE_TAG
}

/**
 * The create command for this release channel, e.g. `npm create strutvane@next` before 1.0 and
 * `npm create strutvane@latest` after. `pnpm create strutvane@next` resolves to
 * `create-strutvane@next` the same way.
 */
export function createCommand(version: string, pm: 'npm' | 'pnpm' = 'npm'): string {
  return `${pm} create strutvane@${releaseTag(version)}`
}
