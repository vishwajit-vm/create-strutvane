/**
 * The package catalogue (blueprint §3.3): one index of every official package, so the installer
 * never hard-codes an add-on. A new package appears in question 22 (and in the questions that
 * bring a package, such as Redis or social login) once the hub publishes it in the index, with no
 * installer change.
 *
 * **Format.** The index is the hub's `catalogue.json`, format 2 (the format of the hub's spike 21
 * package catalogue). This module is the installer's **internal adapter** for it: it reads the
 * fields the installer needs into the small model below and ignores the rest (installs, tags,
 * compatibility table, …), so a richer index never breaks an older installer.
 *
 * **Snapshot.** The installer ships a snapshot of the index (`src/data/catalogue.json`, bundled into
 * the build); the hub-built index replaces it in a later release. A snapshot also means `npm create`
 * works offline and the answers of one installer version never change under it.
 *
 * **Untrusted input.** The index comes from outside the installer, so every entry is checked again
 * here and a bad entry is skipped (never offered), with the reason kept in `skipped`. Display text
 * must be one safe line (no control or invisible characters, no look-alike letters), package names
 * must be `@strutvane/<name>` or `strutvane-<name>` (they become folders and dependency keys), and a
 * follow-up question that mentions a key, secret, token or password is refused together with its
 * package (credentials belong in `.env`, never in an answer). Follow-up questions are declarative
 * data: nothing from a package runs before it is installed.
 *
 * **What is offered** (decisions #3 and #109): only packages that are published, not deprecated or
 * shelved, and have a version whose framework range includes the framework being installed. The
 * `--preview-catalogue` developer flag lifts the "published and compatible" rule, so unreleased
 * packages can be tried; it never lifts the safety checks.
 *
 * @module
 */
import snapshot from './data/catalogue.json' with { type: 'json' }
import { findSecretWord } from './catalogue/secret-words.ts'
import { displayTextProblem } from './catalogue/text.ts'
import { satisfiesRange } from './semver-range.ts'
import { CORE_TRAIN, FRAMEWORK_VERSION } from './version.ts'

/** The index format this adapter reads. Any other version is refused as a whole. */
export const CATALOGUE_FORMAT = 2

/** The largest index the installer reads (the hub's own reader uses the same limit). */
export const MAX_CATALOGUE_BYTES: number = 16 * 1024 * 1024

/** One choice of a follow-up question. */
export interface FollowUpChoice {
  readonly value: string
  readonly label: string
}

/**
 * Ask a follow-up only when an earlier follow-up of the same package has a value (`equals`) or
 * a multi-choice answer contains one (`includes`).
 */
export interface FollowUpCondition {
  readonly question: string
  readonly equals?: string
  readonly includes?: string
}

/** What every follow-up question has. */
interface FollowUpCommon {
  readonly id: string
  readonly label: string
  readonly when?: FollowUpCondition
}

/** One choice out of a list. The answer is the choice's value. */
export interface SelectFollowUp extends FollowUpCommon {
  readonly type: 'select'
  readonly choices: readonly FollowUpChoice[]
  readonly default: string
}

/** Yes or no. The answer is `yes` or `no` (what `--feature-option x.y=yes` takes). */
export interface ConfirmFollowUp extends FollowUpCommon {
  readonly type: 'confirm'
  readonly default: boolean
}

/** Several choices. The answer is a comma list of values, or `none`. */
export interface MultiselectFollowUp extends FollowUpCommon {
  readonly type: 'multiselect'
  readonly choices: readonly FollowUpChoice[]
  readonly default: readonly string[]
  readonly min: number
  readonly max: number
}

/** A package's own question, asked after it is picked (billing: Stripe or Paddle?). */
export type FollowUpQuestion = SelectFollowUp | ConfirmFollowUp | MultiselectFollowUp

/** A group of packages in the picker ("Operations", "Money", …), in display order. */
export interface CatalogueCategory {
  readonly id: string
  readonly name: string
  /** Question 22 lists packages of pickable categories only (designs and core have their own). */
  readonly pickable: boolean
}

/** Where a package stands (hub-curated lifecycle). */
export type LifecycleStatus = 'available' | 'preview' | 'in-development' | 'planned' | 'shelved'

/** One listed version of a package and the framework versions it works with. */
export interface PackageVersion {
  readonly version: string
  /** A semver range of `@strutvane/framework` versions, such as `^0.2`. */
  readonly framework: string
}

/** One package, as far as the installer needs it. */
export interface CatalogueEntry {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: string
  readonly kind: 'package' | 'design'
  /** Shown in the short "popular" list; everything else is reached by typing to search. */
  readonly popular: boolean
  /** Released on npm. Unpublished packages are offered only with `--preview-catalogue`. */
  readonly published: boolean
  readonly status: LifecycleStatus
  /** The roadmap phase it is planned for (blueprint §10), when the hub records one. */
  readonly phase: number | undefined
  /** The npm package a pick installs. */
  readonly package: string
  /** Newest first, each with its own framework range. */
  readonly versions: readonly PackageVersion[]
  readonly deprecated: boolean
  readonly followUps: readonly FollowUpQuestion[]
}

/** The whole index. */
export interface Catalogue {
  readonly categories: readonly CatalogueCategory[]
  readonly entries: readonly CatalogueEntry[]
}

/** The index as a whole is unusable (wrong format, not the expected shape, too large). */
export class CatalogueError extends Error {
  /** @param message - what is wrong, in words */
  constructor(message: string) {
    super(message)
    this.name = 'CatalogueError'
  }
}

const ID = /^[a-z][a-z0-9-]{0,39}$/
/**
 * First-party `@strutvane/<name>` or community `strutvane-<name>` (blueprint §3.3). The strict
 * shape matters: the name becomes a folder and a package.json key, so `..`, slashes, capitals or
 * a foreign scope must never get through.
 */
const PACKAGE = /^(@strutvane\/[a-z0-9]+(-[a-z0-9]+)*|strutvane-[a-z0-9]+(-[a-z0-9]+)*)$/
const VERSION = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/
const STATUSES: readonly LifecycleStatus[] = [
  'available',
  'preview',
  'in-development',
  'planned',
  'shelved',
]

/** Display-text limits: a picker line fits 74 columns in an 80-column terminal. */
const MAX_NAME = 30
const MAX_DESCRIPTION = 60
const MAX_LABEL = 74
/** At most this many follow-up questions per package (the hub's manifest rule). */
const MAX_FOLLOW_UPS = 6

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A display string, or why it cannot be shown. */
function text(value: unknown, max: number, what: string): string | { problem: string } {
  if (typeof value !== 'string') return { problem: `${what} is missing` }
  const problem = displayTextProblem(value, max)
  return problem === undefined ? value : { problem: `${what} ${problem}` }
}

/**
 * Read the index text. Throws {@link CatalogueError} only when the file as a whole is unusable; a
 * single bad entry is skipped and its reason reported in `skipped`.
 *
 * @example
 * const { catalogue, skipped } = readCatalogue(await response.text())
 */
export function readCatalogue(textValue: string): {
  readonly catalogue: Catalogue
  readonly skipped: readonly string[]
} {
  if (Buffer.byteLength(textValue, 'utf8') > MAX_CATALOGUE_BYTES) {
    throw new CatalogueError('The catalogue index is larger than 16 MiB, so it was not read.')
  }
  let raw: unknown
  try {
    raw = JSON.parse(textValue)
  } catch {
    throw new CatalogueError('The catalogue index is not valid JSON.')
  }
  return parseCatalogue(raw)
}

/**
 * Check parsed JSON and keep every valid entry (see {@link readCatalogue}).
 *
 * @example
 * const { catalogue } = parseCatalogue(JSON.parse(text))
 */
export function parseCatalogue(raw: unknown): {
  readonly catalogue: Catalogue
  readonly skipped: readonly string[]
} {
  if (!isRecord(raw)) throw new CatalogueError('The catalogue index is not a JSON object.')
  if (raw['version'] !== CATALOGUE_FORMAT) {
    throw new CatalogueError(
      `The catalogue index has format version ${JSON.stringify(raw['version'])}; this installer reads format ${CATALOGUE_FORMAT}. Update create-strutvane.`,
    )
  }
  const rawCategories = raw['categories']
  const rawEntries = raw['entries']
  if (!Array.isArray(rawCategories) || !Array.isArray(rawEntries)) {
    throw new CatalogueError('The catalogue index has no categories or entries list.')
  }
  const categories: CatalogueCategory[] = []
  for (const category of rawCategories) {
    const name = isRecord(category) ? text(category['name'], MAX_NAME, 'name') : undefined
    if (
      !isRecord(category) ||
      typeof category['id'] !== 'string' ||
      !ID.test(category['id']) ||
      typeof name !== 'string' ||
      typeof category['pickable'] !== 'boolean' ||
      categories.some((known) => known.id === category['id'])
    ) {
      throw new CatalogueError('The catalogue index has a malformed category.')
    }
    categories.push({ id: category['id'], name, pickable: category['pickable'] })
  }
  const known = new Set(categories.map((c) => c.id))
  const seenIds = new Set<string>()
  const seenPackages = new Set<string>()
  const entries: CatalogueEntry[] = []
  const skipped: string[] = []
  rawEntries.forEach((rawEntry, index) => {
    const result = parseEntry(rawEntry, known)
    if (typeof result === 'string') skipped.push(`entry ${index}: ${result}`)
    else if (seenIds.has(result.id)) skipped.push(`entry ${index}: duplicate id "${result.id}"`)
    else if (seenPackages.has(result.package)) {
      skipped.push(`entry ${index}: duplicate package "${result.package}"`)
    } else {
      seenIds.add(result.id)
      seenPackages.add(result.package)
      entries.push(result)
    }
  })
  return { catalogue: { categories, entries }, skipped }
}

/** One entry, or the reason it cannot be used. */
function parseEntry(raw: unknown, categories: ReadonlySet<string>): CatalogueEntry | string {
  if (!isRecord(raw)) return 'not an object'
  const id = raw['id']
  if (typeof id !== 'string' || !ID.test(id)) return 'bad id'
  const name = text(raw['name'], MAX_NAME, 'name')
  if (typeof name !== 'string') return `${id}: ${name.problem}`
  const description = text(raw['description'], MAX_DESCRIPTION, 'description')
  if (typeof description !== 'string') return `${id}: ${description.problem}`
  const category = raw['category']
  if (typeof category !== 'string' || !categories.has(category)) return `${id}: unknown category`
  const kind = raw['kind']
  if (kind !== 'package' && kind !== 'design') return `${id}: kind must be package or design`
  const { popular, published } = { popular: raw['popular'], published: raw['published'] }
  if (typeof popular !== 'boolean' || typeof published !== 'boolean') {
    return `${id}: popular/published must be true or false`
  }
  const packageName = raw['package']
  if (typeof packageName !== 'string' || !PACKAGE.test(packageName) || packageName.length > 64) {
    return `${id}: bad package name`
  }
  const status = STATUSES.find((s) => s === raw['status'])
  if (status === undefined) return `${id}: unknown status`
  const phase = raw['phase']
  if (phase !== undefined && (!Number.isInteger(phase) || Number(phase) < 1 || Number(phase) > 99)) {
    return `${id}: bad phase`
  }
  const versions = parseVersions(raw['versions'])
  if (typeof versions === 'string') return `${id}: ${versions}`
  const deprecated = raw['deprecated'] !== undefined && raw['deprecated'] !== null
  const followUps = parseFollowUps(raw['followUps'])
  if (typeof followUps === 'string') return `${id}: ${followUps}`
  return {
    id,
    name,
    description,
    category,
    kind,
    popular,
    published,
    status,
    phase: typeof phase === 'number' ? phase : undefined,
    package: packageName,
    versions,
    deprecated,
    followUps,
  }
}

/** The listed versions, newest first, each with a framework range. */
function parseVersions(raw: unknown): PackageVersion[] | string {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) {
    return 'versions must list 1 to 200 versions'
  }
  const versions: PackageVersion[] = []
  for (const item of raw) {
    if (
      !isRecord(item) ||
      typeof item['version'] !== 'string' ||
      !VERSION.test(item['version']) ||
      typeof item['framework'] !== 'string' ||
      item['framework'].length > 100
    ) {
      return 'a listed version is malformed'
    }
    versions.push({ version: item['version'], framework: item['framework'] })
  }
  return versions
}

/** Declarative follow-up questions (select, confirm, multiselect, each with an optional `when`). */
function parseFollowUps(raw: unknown): FollowUpQuestion[] | string {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > MAX_FOLLOW_UPS) {
    return `followUps must be a list of at most ${MAX_FOLLOW_UPS} questions`
  }
  const questions: FollowUpQuestion[] = []
  for (const question of raw) {
    const parsed = parseFollowUp(question, questions)
    if (typeof parsed === 'string') return parsed
    questions.push(parsed)
  }
  return questions
}

/** One follow-up, or why the package cannot be offered. */
function parseFollowUp(
  raw: unknown,
  earlier: readonly FollowUpQuestion[],
): FollowUpQuestion | string {
  if (!isRecord(raw) || typeof raw['id'] !== 'string' || !ID.test(raw['id'])) {
    return 'follow-up with a bad id'
  }
  const id = raw['id']
  if (earlier.some((question) => question.id === id)) return `follow-up ${id}: duplicate id`
  const label = text(raw['label'], MAX_LABEL, 'label')
  if (typeof label !== 'string') return `follow-up ${id}: ${label.problem}`
  // The installer never asks for a credential: an answer ends up in shell history
  // (--feature-option), CI logs and the committed strutvane.json. A package that tries is skipped
  // as a whole; its keys belong in .env.
  const secret = findSecretWord(id) ?? findSecretWord(label)
  if (secret !== undefined) return `follow-up ${id}: asks for a secret ("${secret}")`
  const when = parseCondition(raw['when'], earlier)
  if (typeof when === 'string') return `follow-up ${id}: ${when}`
  const common = when === undefined ? { id, label } : { id, label, when }
  const type = raw['type']
  if (type === 'confirm') {
    if (typeof raw['default'] !== 'boolean') return `follow-up ${id}: default must be true or false`
    return { ...common, type, default: raw['default'] }
  }
  if (type !== 'select' && type !== 'multiselect') {
    // `text` questions (and anything newer) need the hub's safe-pattern matcher: refused, so the
    // package is not offered by this installer rather than offered with a question it cannot ask.
    return `follow-up ${id}: question type ${JSON.stringify(type)} is not supported by this installer`
  }
  const choices = parseChoices(raw['choices'])
  if (typeof choices === 'string') return `follow-up ${id}: ${choices}`
  const isChoice = (value: unknown): value is string =>
    typeof value === 'string' && choices.some((choice) => choice.value === value)
  if (type === 'select') {
    if (!isChoice(raw['default'])) return `follow-up ${id}: default is not a choice`
    return { ...common, type, choices, default: raw['default'] }
  }
  const fallback = raw['default'] ?? []
  if (!Array.isArray(fallback) || !fallback.every(isChoice)) {
    return `follow-up ${id}: default must list choices`
  }
  const min = raw['min'] ?? 0
  const max = raw['max'] ?? choices.length
  if (
    typeof min !== 'number' ||
    typeof max !== 'number' ||
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    min < 0 ||
    max < Math.max(min, 1) ||
    max > choices.length ||
    fallback.length < min ||
    fallback.length > max
  ) {
    return `follow-up ${id}: min/max do not fit the choices and the default`
  }
  return { ...common, type, choices, default: [...new Set(fallback)], min, max }
}

/** 2 to 20 choices with unique, id-shaped values and safe labels. */
function parseChoices(raw: unknown): FollowUpChoice[] | string {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 20) return 'needs 2 to 20 choices'
  const choices: FollowUpChoice[] = []
  for (const choice of raw) {
    const label = isRecord(choice) ? text(choice['label'], MAX_LABEL, 'label') : undefined
    if (
      !isRecord(choice) ||
      typeof choice['value'] !== 'string' ||
      !ID.test(choice['value']) ||
      typeof label !== 'string' ||
      choices.some((known) => known.value === choice['value'])
    ) {
      return 'bad choice'
    }
    if (findSecretWord(label) !== undefined) return 'a choice asks for a secret'
    choices.push({ value: choice['value'], label })
  }
  return choices
}

/** A `when` that points at an EARLIER question and a value it can have. */
function parseCondition(
  raw: unknown,
  earlier: readonly FollowUpQuestion[],
): FollowUpCondition | undefined | string {
  if (raw === undefined) return undefined
  if (!isRecord(raw) || typeof raw['question'] !== 'string') return 'bad when'
  const target = earlier.find((question) => question.id === raw['question'])
  if (target === undefined) return 'when must point to an earlier question'
  const { equals, includes } = { equals: raw['equals'], includes: raw['includes'] }
  const values =
    target.type === 'confirm' ? ['yes', 'no'] : target.choices.map((choice) => choice.value)
  if (equals !== undefined && includes === undefined && target.type !== 'multiselect') {
    // A confirm answer is stored as yes/no; the index may write it as a boolean.
    const value = typeof equals === 'boolean' ? (equals ? 'yes' : 'no') : equals
    return typeof value === 'string' && values.includes(value)
      ? { question: target.id, equals: value }
      : 'when names no value'
  }
  if (typeof includes === 'string' && equals === undefined && target.type === 'multiselect') {
    return values.includes(includes) ? { question: target.id, includes } : 'when names no value'
  }
  return 'when needs equals (select, confirm) or includes (multiselect)'
}

/** Who reads the index: which framework is installed, and whether unreleased packages count. */
export interface OfferSettings {
  /** The framework version being installed (default: this installer's). */
  readonly frameworkVersion?: string
  /** `--preview-catalogue`: offer unpublished and not-yet-compatible packages too. */
  readonly preview?: boolean
}

/**
 * The newest listed version whose framework range includes `frameworkVersion`, or `undefined`.
 *
 * @example
 * compatibleVersion(entry, '0.2.0') // '0.1.0' when that version declares ^0.2
 */
export function compatibleVersion(
  entry: CatalogueEntry,
  frameworkVersion: string = FRAMEWORK_VERSION,
): string | undefined {
  return entry.versions.find((listed) => satisfiesRange(frameworkVersion, listed.framework))
    ?.version
}

/** Released, alive and compatible (or any non-shelved package in preview). */
function usable(entry: CatalogueEntry, settings: OfferSettings): boolean {
  if (entry.deprecated || entry.status === 'shelved') return false
  if (settings.preview === true) return true
  return entry.published && compatibleVersion(entry, settings.frameworkVersion) !== undefined
}

/**
 * The entries question 22 may offer: packages (not designs) of pickable categories that are
 * published and compatible (see {@link OfferSettings}). Order is kept from the index.
 *
 * @example
 * offeredEntries(catalogue).some((e) => !e.published) // false
 */
export function offeredEntries(
  catalogue: Catalogue,
  settings: OfferSettings = {},
): CatalogueEntry[] {
  const pickable = new Set(catalogue.categories.filter((c) => c.pickable).map((c) => c.id))
  return catalogue.entries.filter(
    (entry) => entry.kind === 'package' && pickable.has(entry.category) && usable(entry, settings),
  )
}

/**
 * The popular entries, grouped by category in the index's category order (empty groups left out).
 *
 * @example
 * popularGroups(catalogue, offered)[0]?.category.name // 'Operations'
 */
export function popularGroups(
  catalogue: Catalogue,
  offered: readonly CatalogueEntry[],
): { readonly category: CatalogueCategory; readonly entries: readonly CatalogueEntry[] }[] {
  return catalogue.categories
    .map((category) => ({
      category,
      entries: offered.filter((e) => e.popular && e.category === category.id),
    }))
    .filter((group) => group.entries.length > 0)
}

/**
 * Find an offered entry by id.
 *
 * @example
 * findOffered('billing', catalogue, { preview: true })?.package // '@strutvane/billing'
 */
export function findOffered(
  id: string,
  catalogue: Catalogue = installerCatalogue(),
  settings: OfferSettings = {},
): CatalogueEntry | undefined {
  return offeredEntries(catalogue, settings).find((entry) => entry.id === id)
}

/**
 * The release a roadmap phase ships in (blueprint §10), for "planned for …" messages.
 *
 * @example
 * plannedRelease(2) // '0.3'
 */
export function plannedRelease(phase: number | undefined): string {
  if (phase === 1) return '0.2'
  if (phase === 2) return '0.3'
  if (phase === 3) return '1.0'
  return phase === undefined ? 'a later release' : `a release after 1.0 (roadmap phase ${phase})`
}

/** Whether a package can be installed now, and if not, why (one sentence). */
export interface PackageAvailability {
  readonly available: boolean
  readonly reason: string | undefined
}

/**
 * Can the installer add this package? The core train (framework, auth, ui, the designs) always
 * can: it is released together with the installer. Any other package must be usable in the
 * catalogue (decision #3); otherwise the reason is the sentence decision #109 asks for.
 *
 * @example
 * packageAvailability('@strutvane/redis').reason
 * // '@strutvane/redis isn't available yet (planned for 0.3). Try unreleased packages with --preview-catalogue.'
 */
export function packageAvailability(
  packageName: string,
  settings: OfferSettings = {},
  catalogue: Catalogue = installerCatalogue(),
): PackageAvailability {
  if (CORE_TRAIN.includes(packageName)) return { available: true, reason: undefined }
  const entry = catalogue.entries.find((candidate) => candidate.package === packageName)
  if (entry !== undefined && usable(entry, settings)) return { available: true, reason: undefined }
  const preview = settings.preview === true ? '' : ' Try unreleased packages with --preview-catalogue.'
  if (entry === undefined || entry.deprecated || entry.status === 'shelved') {
    return { available: false, reason: `${packageName} isn't in the package catalogue.` }
  }
  if (entry.published) {
    return {
      available: false,
      reason: `${packageName} has no version for framework ${settings.frameworkVersion ?? FRAMEWORK_VERSION} yet.${preview}`,
    }
  }
  return {
    available: false,
    reason: `${packageName} isn't available yet (planned for ${plannedRelease(entry.phase)}).${preview}`,
  }
}

/**
 * The version range a generated app uses for a catalogue package: the newest compatible version
 * (`^x.y.z`), or in preview the newest listed one.
 *
 * @example
 * catalogueRange(entry, { preview: true }) // '^0.1.0'
 */
export function catalogueRange(entry: CatalogueEntry, settings: OfferSettings = {}): string {
  const version =
    compatibleVersion(entry, settings.frameworkVersion) ?? entry.versions[0]?.version ?? '0.0.0'
  return `^${version}`
}

let bundled: Catalogue | undefined

/**
 * The catalogue the installer uses: the bundled snapshot, read and checked once.
 *
 * @example
 * installerCatalogue().entries.length // 49
 */
export function installerCatalogue(): Catalogue {
  bundled ??= parseCatalogue(snapshot).catalogue
  return bundled
}
