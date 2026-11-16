/**
 * The package catalogue (blueprint §3.3): the format-2 index read through the installer's adapter
 * (untrusted input), "published and compatible" (decision #3), `--preview-catalogue` and the
 * refusal wording of decision #109, question 22 and its declarative follow-up questions.
 */
import { readFileSync } from 'node:fs'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ArgsError, parseCommandLine } from '../src/args.ts'
import {
  type Catalogue,
  CatalogueError,
  catalogueRange,
  compatibleVersion,
  findOffered,
  followUpApplies,
  followUpDefault,
  followUpProblem,
  installerCatalogue,
  offeredEntries,
  packageAvailability,
  parseCatalogue,
  plannedRelease,
  popularGroups,
  readCatalogue,
  resolveFollowUps,
} from '../src/catalogue.ts'
import { type Answers, OptionsError, resolveOptions } from '../src/options.ts'
import { askMissing } from '../src/questions.ts'
import { parseVersion, satisfiesRange } from '../src/semver-range.ts'
import { CORE_TRAIN, FRAMEWORK_VERSION } from '../src/version.ts'
import { scriptedPrompter } from './helpers/fakes.ts'

const snapshotText = readFileSync(new URL('../src/data/catalogue.json', import.meta.url), 'utf8')

/** A valid format-2 entry to vary in tests: published, compatible with framework 0.2. */
const entry = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'tags',
  name: 'Tags',
  description: 'Tag any record',
  category: 'content',
  kind: 'package',
  popular: false,
  published: true,
  status: 'available',
  phase: 4,
  package: '@strutvane/tags',
  versions: [{ version: '0.2.1', framework: '^0.2' }],
  ...overrides,
})
const index = (entries: unknown[], categories?: unknown[]): Record<string, unknown> => ({
  version: 2,
  categories: categories ?? [
    { id: 'content', name: 'Content', pickable: true },
    { id: 'money', name: 'Money', pickable: true },
    { id: 'design', name: 'Designs', pickable: false },
  ],
  entries,
})
const catalogueOf = (entries: unknown[]): Catalogue => parseCatalogue(index(entries)).catalogue
const choices = [
  { value: 'stripe', label: 'Stripe' },
  { value: 'paddle', label: 'Paddle' },
]

describe('semver ranges (fail closed)', () => {
  it.each([
    ['0.1.0', '^0.1', true],
    ['0.1.9', '^0.1', true],
    ['0.2.0', '^0.1', false],
    ['0.0.9', '^0.0.9', true],
    ['0.0.10', '^0.0.9', false],
    ['1.4.0', '^1.2', true],
    ['2.0.0', '^1.2', false],
    ['1.2.9', '~1.2', true],
    ['1.3.0', '~1.2', false],
    ['0.1.0', '>=0.2.0', false],
    ['0.2.5', '>=0.2.0 <0.3.0', true],
    ['0.3.0', '>=0.2.0 <0.3.0', false],
    ['1.0.0', '^0.1 || ^1.0', true],
    ['0.1.0', '*', true],
    ['0.1.0', '0.1.0', true],
    ['0.1.0', '0.1', false],
    ['0.1.0', 'banana', false],
    ['0.1.0', '', false],
    // A pre-release framework satisfies no catalogue range (ranges name releases only).
    ['0.1.0-rc.1', '^0.1', false],
    [FRAMEWORK_VERSION, '^0.1', false],
  ] as const)('%s in %s → %s', (version, range, expected) => {
    expect(satisfiesRange(version, range)).toBe(expected)
  })

  it('never throws on random ranges (fuzz)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (range) => {
        expect(typeof satisfiesRange('0.1.0', range)).toBe('boolean')
      }),
      { numRuns: 2000 },
    )
    expect(parseVersion('01.2.3')).toBeUndefined()
  })
})

describe('the shipped catalogue snapshot (format 2, the hub spike 21 seed)', () => {
  it('reads every entry except the two whose text follow-ups this installer cannot ask', () => {
    const { catalogue, skipped } = readCatalogue(snapshotText)
    expect(catalogue.entries.length).toBeGreaterThanOrEqual(45)
    expect(skipped).toHaveLength(2)
    expect(skipped.join('\n')).toMatch(/invoicing[\s\S]*not supported[\s\S]*translations/)
    // The reserved unscoped names are packages like any other.
    expect(catalogue.entries.map((e) => e.package)).toContain('create-strutvane')
  })

  it('offers nothing today: no package is published yet (decision #3)', () => {
    expect(offeredEntries(installerCatalogue())).toEqual([])
    expect(findOffered('log-viewer')).toBeUndefined()
  })

  it('--preview-catalogue offers the unreleased packages, never designs, core or shelved ones', () => {
    const offered = offeredEntries(installerCatalogue(), { preview: true }).map((e) => e.id)
    expect(offered).toContain('log-viewer')
    expect(offered).toContain('billing')
    for (const hidden of ['crisp', 'vivid', 'framework', 'auth', 'ui', 'create-strutvane']) {
      expect(offered).not.toContain(hidden)
    }
  })

  it('groups the popular list by the hub category order', () => {
    const catalogue = installerCatalogue()
    const groups = popularGroups(catalogue, offeredEntries(catalogue, { preview: true }))
    expect(groups.map((g) => g.category.name).slice(0, 3)).toEqual([
      'Operations',
      'Data',
      'Back office',
    ])
    expect(groups[0]?.entries.map((e) => e.id)).toContain('log-viewer')
  })

  it('names the log viewer package @strutvane/log-viewer and backups "backup" (decision #5)', () => {
    const entries = installerCatalogue().entries
    expect(entries.find((e) => e.id === 'log-viewer')?.package).toBe('@strutvane/log-viewer')
    expect(entries.some((e) => e.id === 'backup')).toBe(true)
    expect(entries.some((e) => e.package === '@strutvane/logs')).toBe(false)
  })
})

describe('package availability (decisions #3 and #109)', () => {
  it('the core train is always available: it is released with the installer', () => {
    for (const name of CORE_TRAIN) expect(packageAvailability(name).available).toBe(true)
  })

  it('an unreleased package names the release it is planned for and the preview flag', () => {
    expect(packageAvailability('@strutvane/redis')).toEqual({
      available: false,
      reason:
        "@strutvane/redis isn't available yet (planned for 0.3). Try unreleased packages with --preview-catalogue.",
    })
    expect(packageAvailability('@strutvane/files').reason).toMatch(/planned for 1\.0/)
    expect(packageAvailability('@strutvane/redis', { preview: true }).available).toBe(true)
    expect(packageAvailability('@strutvane/nope').reason).toMatch(/isn't in the package catalogue/)
  })

  it('a published package without a version for this framework says so', () => {
    const catalogue = catalogueOf([entry({ versions: [{ version: '1.0.0', framework: '^1.0' }] })])
    expect(packageAvailability('@strutvane/tags', {}, catalogue).reason).toMatch(
      /has no version for framework/,
    )
    expect(
      packageAvailability('@strutvane/tags', { frameworkVersion: '1.2.0' }, catalogue).available,
    ).toBe(true)
  })

  it('maps roadmap phases to releases', () => {
    expect([1, 2, 3, 5, undefined].map(plannedRelease)).toEqual([
      '0.2',
      '0.3',
      '1.0',
      'a release after 1.0 (roadmap phase 5)',
      'a later release',
    ])
  })

  it('picks the newest version whose framework range fits, and its caret range', () => {
    const tags = catalogueOf([
      entry({
        versions: [
          { version: '0.3.0', framework: '^0.3' },
          { version: '0.2.4', framework: '^0.2' },
        ],
      }),
    ]).entries[0]
    if (tags === undefined) throw new Error('entry missing')
    expect(compatibleVersion(tags, '0.2.7')).toBe('0.2.4')
    expect(compatibleVersion(tags, '0.1.0')).toBeUndefined()
    expect(catalogueRange(tags, { frameworkVersion: '0.3.1' })).toBe('^0.3.0')
    expect(catalogueRange(tags, { preview: true })).toBe('^0.3.0')
  })
})

describe('reading an untrusted index', () => {
  it('skips bad entries instead of trusting them (path tricks, foreign scopes, secrets, duplicates)', () => {
    const { catalogue, skipped } = parseCatalogue(
      index([
        entry(),
        entry({ id: 'evil', package: '@strutvane/../../etc' }),
        entry({ id: 'foreign', package: '@someone/tags' }),
        entry({ id: 'capital', package: '@strutvane/Tags' }),
        entry({ id: 'unknown-cat', category: 'nope' }),
        entry({ id: 'tags' }),
        entry({ id: 'twin', package: '@strutvane/tags' }),
        entry({
          id: 'stripe-keys',
          package: '@strutvane/stripe-keys',
          followUps: [
            {
              id: 'key',
              label: 'Your Stripe API key?',
              type: 'select',
              default: 'stripe',
              choices,
            },
          ],
        }),
        entry({
          id: 'sneaky',
          package: '@strutvane/sneaky',
          followUps: [{ id: 'mode', label: 'Paste the passWord', type: 'confirm', default: false }],
        }),
        entry({
          id: 'bad-default',
          package: '@strutvane/bad-default',
          followUps: [{ id: 'mode', label: 'Mode?', type: 'select', default: 'zzz', choices }],
        }),
        entry({ id: 'newline', package: '@strutvane/newline', name: 'Line\nbreak' }),
        entry({ id: 'no-versions', package: '@strutvane/no-versions', versions: [] }),
        entry({ id: 'odd-status', package: '@strutvane/odd-status', status: 'gone' }),
        'not an object',
      ]),
    )
    expect(catalogue.entries.map((e) => e.id)).toEqual(['tags'])
    expect(skipped.join('\n')).toMatch(
      /bad package name[\s\S]*bad package name[\s\S]*bad package name[\s\S]*unknown category[\s\S]*duplicate id[\s\S]*duplicate package[\s\S]*asks for a secret[\s\S]*asks for a secret[\s\S]*default is not a choice[\s\S]*name[\s\S]*versions[\s\S]*unknown status[\s\S]*not an object/,
    )
  })

  it('refuses an index with another format (spike 13 format 1 included), shape or size', () => {
    expect(() => parseCatalogue({ version: 1, categories: [], entries: [] })).toThrow(
      /format version 1; this installer reads format 2/,
    )
    expect(() => parseCatalogue({ version: 2 })).toThrow(/no categories or entries/)
    expect(() => parseCatalogue(null)).toThrow(CatalogueError)
    expect(() => readCatalogue('{')).toThrow(/not valid JSON/)
    expect(() => readCatalogue(' '.repeat(16 * 1024 * 1024 + 1))).toThrow(/larger than 16 MiB/)
    expect(() =>
      parseCatalogue(
        index(
          [],
          [
            { id: 'a', name: 'A', pickable: true },
            { id: 'a', name: 'B', pickable: true },
          ],
        ),
      ),
    ).toThrow(/malformed category/)
  })

  it('never throws anything but CatalogueError on arbitrary JSON (fuzz)', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        try {
          parseCatalogue(value)
        } catch (error) {
          expect(error).toBeInstanceOf(CatalogueError)
        }
      }),
      { numRuns: 1000 },
    )
  })

  it('never offers a mutated entry it cannot fully check (fuzz on every field)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('id', 'name', 'description', 'package', 'versions', 'followUps', 'kind'),
        fc.jsonValue(),
        (field, value) => {
          const { catalogue, skipped } = parseCatalogue(index([entry({ [field]: value })]))
          expect(catalogue.entries.length + skipped.length).toBe(1)
          for (const parsed of catalogue.entries) expect(parsed.package).toMatch(/^@strutvane\//)
        },
      ),
      { numRuns: 1000 },
    )
  })
})

describe('follow-up questions (declarative, three types, with when)', () => {
  const billing = catalogueOf([
    entry({
      id: 'billing',
      package: '@strutvane/billing',
      followUps: [
        {
          id: 'provider',
          label: 'Billing: which provider?',
          type: 'select',
          default: 'stripe',
          choices,
        },
        {
          id: 'stripe-tax',
          label: 'Billing: let Stripe calculate sales tax?',
          type: 'confirm',
          default: false,
          when: { question: 'provider', equals: 'stripe' },
        },
        {
          id: 'regions',
          label: 'Billing: regions?',
          type: 'multiselect',
          default: ['eu'],
          choices: [
            { value: 'eu', label: 'EU' },
            { value: 'us', label: 'US' },
          ],
          min: 1,
          max: 2,
        },
      ],
    }),
  ]).entries[0]
  if (billing === undefined) throw new Error('billing missing')
  const [provider, tax, regions] = billing.followUps
  if (provider === undefined || tax === undefined || regions === undefined) throw new Error('q')

  it('stores defaults in the --feature-option form', () => {
    expect([provider, tax, regions].map(followUpDefault)).toEqual(['stripe', 'no', 'eu'])
  })

  it('applies `when` only after the earlier answer', () => {
    expect(followUpApplies(tax, { provider: 'stripe' })).toBe(true)
    expect(followUpApplies(tax, { provider: 'paddle' })).toBe(false)
    expect(followUpApplies(tax, {})).toBe(false)
    expect(resolveFollowUps(billing, { 'billing.provider': 'paddle' }).values).toEqual({
      'billing.provider': 'paddle',
      'billing.regions': 'eu',
    })
  })

  it('checks every value against its question', () => {
    expect(followUpProblem(provider, 'mollie')).toMatch(/Use one of: stripe, paddle/)
    expect(followUpProblem(tax, 'maybe')).toBe('must be yes or no')
    expect(followUpProblem(regions, 'eu,us')).toBeUndefined()
    expect(followUpProblem(regions, 'none')).toMatch(/needs 1 to 2/)
    expect(followUpProblem(regions, 'eu,eu')).toMatch(/comma list/)
    expect(resolveFollowUps(billing, { 'billing.stripe-tax': 'perhaps' }).problems.join()).toMatch(
      /billing.stripe-tax=perhaps must be yes or no/,
    )
  })

  it('refuses a when that points forward or at a value that cannot happen, and text questions', () => {
    const { skipped } = parseCatalogue(
      index([
        entry({
          followUps: [
            {
              id: 'a',
              label: 'A?',
              type: 'confirm',
              default: false,
              when: { question: 'b', equals: 'x' },
            },
            { id: 'b', label: 'B?', type: 'select', default: 'stripe', choices },
          ],
        }),
        entry({
          id: 'two',
          package: '@strutvane/two',
          followUps: [
            { id: 'a', label: 'A?', type: 'select', default: 'stripe', choices },
            {
              id: 'b',
              label: 'B?',
              type: 'confirm',
              default: true,
              when: { question: 'a', equals: 'mollie' },
            },
          ],
        }),
        entry({
          id: 'three',
          package: '@strutvane/three',
          followUps: [
            { id: 'note', label: 'Note?', type: 'text', pattern: '^[a-z]+$', maxLength: 10 },
          ],
        }),
      ]),
    )
    expect(skipped.join('\n')).toMatch(/earlier question[\s\S]*names no value[\s\S]*not supported/)
  })
})

/** Every Custom question except 22, answered, so only the features flow is asked. */
const everythingElse: Answers = {
  stack: 'full',
  design: 'crisp',
  ui: 'admin',
  auth: 'email',
  security: [],
  social: [],
  apiAccess: 'tokens',
  roles: 'admin-member',
  teams: false,
  database: 'sqlite',
  docker: false,
  adminEmail: 'admin@my-app.test',
  adminPasswordMode: 'generate',
  sampleData: false,
  cache: 'database',
  storage: 'local',
  mailer: 'later',
  locale: 'en',
  timezone: 'UTC',
  currency: 'USD',
  testing: 'none',
  agents: false,
  git: false,
  securityProfile: 'standard',
  activityLog: false,
  ai: false,
  mcpServer: false,
  uiLanguages: ['en'],
  appearance: 'system',
  pwa: false,
  liveUpdates: false,
  monitoring: 'none',
  deploy: 'later',
  editor: false,
  devContainer: false,
}

describe('question 22: picking features', () => {
  const custom: Answers = { name: 'my-app', mode: 'custom', ...everythingElse }
  const context = { cwd: '/code', targetProblem: () => undefined }

  it('is not asked while nothing is published, and the log viewer default is dropped quietly', async () => {
    const { prompter, asked } = scriptedPrompter({})
    const answers = await askMissing(custom, prompter, context)
    expect(asked).toEqual([])
    expect(resolveOptions(answers, '/code').features).toEqual([])
  })

  it('in preview: popular groups, then search, then the picked packages’ follow-ups', async () => {
    const { prompter, asked } = scriptedPrompter({
      features: ['billing', 'log-viewer'],
      featuresSearch: true,
      featuresMore: ['tags'],
      'billing.provider': 'paddle',
    })
    const answers = await askMissing({ ...custom, previewCatalogue: true }, prompter, context)
    expect(asked).toEqual(['features', 'featuresSearch', 'featuresMore', 'billing.provider'])
    expect(answers.featureOptions).toEqual({ 'billing.provider': 'paddle' })
    const options = resolveOptions(answers, '/code')
    expect(options.features).toEqual(['billing', 'log-viewer', 'tags']) // catalogue order
    expect(options.previewCatalogue).toBe(true)
  })

  it('asks a when-gated follow-up only when it applies, and multiselect follow-ups too', async () => {
    const { prompter, asked } = scriptedPrompter({
      features: ['billing'],
      featuresSearch: true,
      featuresMore: ['social-login'],
      'billing.provider': 'stripe',
      'billing.stripe-tax': true,
      // A queue with one answer (the list ['google']); the first try picks none, which needs 1+.
      'social-login.providers': [[], ['google']],
    })
    const answers = await askMissing({ ...custom, previewCatalogue: true }, prompter, context)
    expect(asked).toEqual([
      'features',
      'featuresSearch',
      'featuresMore',
      'billing.provider',
      'billing.stripe-tax',
      // Asked again: picking none breaks the package's "at least 1" rule.
      'social-login.providers',
      'social-login.providers',
    ])
    expect(answers.featureOptions).toEqual({
      'billing.provider': 'stripe',
      'billing.stripe-tax': 'yes',
      'social-login.providers': 'google',
    })
  })

  it('a typed pick that is not released is refused with its plan (decision #109)', () => {
    expect(() => resolveOptions({ name: 'a', features: ['billing'] }, '/c')).toThrow(
      /--features "billing": @strutvane\/billing isn't available yet \(planned for a release after 1\.0 \(roadmap phase 6\)\)\. Try unreleased packages with --preview-catalogue/,
    )
    expect(() => resolveOptions({ name: 'a', features: ['nope'] }, '/c')).toThrow(
      /is not a package in the catalogue/,
    )
    expect(() => resolveOptions({ name: 'a', features: ['crisp'] }, '/c')).toThrow(OptionsError)
    expect(
      resolveOptions({ name: 'a', features: ['billing'], previewCatalogue: true }, '/c').features,
    ).toEqual(['billing'])
  })

  it('follow-ups by flag; defaults fill the rest; wrong values are refused', () => {
    const answers = parseCommandLine([
      'a',
      '--preview-catalogue',
      '--features',
      'billing,search',
      '--feature-option',
      'billing.provider=paddle',
    ]).answers
    const options = resolveOptions(answers, '/c')
    expect(options.featureOptions['billing.provider']).toBe('paddle')
    expect(options.featureOptions['billing.stripe-tax']).toBeUndefined()
    expect(Object.keys(options.featureOptions)).toContain('search.engine')
    expect(() =>
      resolveOptions(
        {
          name: 'a',
          previewCatalogue: true,
          features: ['billing'],
          featureOptions: { 'billing.provider': 'bitcoin' },
        },
        '/c',
      ),
    ).toThrow(/is not a choice. Use one of: stripe, paddle/)
    expect(() =>
      resolveOptions(
        {
          name: 'a',
          previewCatalogue: true,
          features: ['tags'],
          featureOptions: { 'billing.provider': 'stripe' },
        },
        '/c',
      ),
    ).toThrow(/belongs to no picked feature/)
    expect(() => parseCommandLine(['a', '--feature-option', 'billing.provider'])).toThrow(ArgsError)
  })

  it('a catalogue passed in the context is the one used (a new package appears without code changes)', async () => {
    const catalogue = catalogueOf([
      entry({
        id: 'kanban',
        name: 'Kanban',
        category: 'money',
        popular: true,
        package: '@strutvane/kanban',
      }),
    ])
    const { prompter } = scriptedPrompter({ features: ['kanban'], featuresSearch: false })
    const answers = await askMissing({ ...custom, previewCatalogue: true }, prompter, {
      ...context,
      catalogue,
    })
    expect(answers.features).toEqual(['kanban'])
    expect(resolveOptions(answers, '/code', catalogue).features).toEqual(['kanban'])
  })
})

// Regression (class: terminal escape injection from untrusted catalogue text). Names,
// descriptions and labels are printed in the question-22 picker; the index comes from the network.
describe('catalogue text that would control the terminal', () => {
  const parse = (patch: Record<string, unknown>) =>
    parseCatalogue(
      index([
        entry({
          id: 'evil',
          name: 'Evil',
          description: 'Looks harmless',
          package: '@strutvane/evil',
          ...patch,
        }),
      ]),
    )

  for (const [label, text] of [
    ['ESC (clear screen)', 'Evil\u001b[2J'],
    ['OSC 52 clipboard write', 'Evil\u001b]52;c;cm0gLXJmIH4=\u0007'],
    ['BEL', 'Evil\u0007'],
    ['C1 CSI', 'Evil\u009b2J'],
    ['right-to-left override', 'Evil‮gnp.exe'],
    ['zero-width space', 'Ev​il'],
    ['a Cyrillic look-alike letter', 'Еvil'],
  ] as const) {
    it(`skips an entry whose name contains ${label}`, () => {
      const { catalogue, skipped } = parse({ name: text })
      expect(catalogue.entries).toEqual([])
      expect(skipped.join(' ')).toMatch(/name/)
    })
  }

  it('checks descriptions, category names and follow-up labels the same way', () => {
    expect(parse({ description: 'fine\u001b[31mred' }).catalogue.entries).toEqual([])
    expect(
      parse({
        followUps: [
          { id: 'mode', label: 'Pick\u001b[1A', type: 'select', default: 'stripe', choices },
        ],
      }).catalogue.entries,
    ).toEqual([])
    expect(
      parse({
        followUps: [
          {
            id: 'mode',
            label: 'Pick',
            type: 'select',
            default: 'a',
            choices: [
              { value: 'a', label: 'A‮' },
              { value: 'b', label: 'B' },
            ],
          },
        ],
      }).catalogue.entries,
    ).toEqual([])
    expect(() =>
      parseCatalogue(index([], [{ id: 'ops', name: 'Ops\u001b[2J', pickable: true }])),
    ).toThrow(/malformed category/)
    // Ordinary non-ASCII text stays allowed.
    expect(
      parse({ name: 'Rechnungen für Kunden', description: 'Factures et reçus, 請求書' }).catalogue
        .entries,
    ).toHaveLength(1)
  })
})
