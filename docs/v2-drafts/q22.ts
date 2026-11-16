// ── Question 22: extra features from the catalogue, and their follow-up questions ────────────

const catalogueOf = (context: QuestionContext): Catalogue =>
  context.catalogue ?? installerCatalogue()

/** What question 22 may offer for these answers (unreleased packages only in preview). */
const offeredFor = (answers: Answers, catalogue: Catalogue = installerCatalogue()): CatalogueEntry[] =>
  offeredEntries(catalogue, { preview: previewOf(answers) })

/** The picked entries (or the defaults), keeping only what the catalogue offers. */
function pickedEntries(answers: Answers, catalogue: Catalogue = installerCatalogue()): CatalogueEntry[] {
  const ids = answers.features ?? DEFAULTS.features
  return offeredFor(answers, catalogue).filter((entry) => ids.includes(entry.id))
}

const toChoice = (entry: CatalogueEntry): Choice<string> => ({
  value: entry.id,
  label: entry.name,
  hint: entry.description,
})

/** The same rule the catalogue applies to an id (letters, digits and dashes). */
const FEATURE_ID = /^[a-z][a-z0-9-]{0,39}$/

const featuresQuestion: Question = {
  id: 'features',
  row: 22,
  group: 'Features',
  title: 'Extra features',
  recommended: false,
  alwaysAsk: false,
  flag: {
    name: 'features',
    type: 'string',
    usage: '--features <ids>|none',
    help: 'Extra packages by catalogue id (node strut add lists them)',
    defaultLabel: DEFAULTS.features.join(','),
  },
  secretEnv: undefined,
  when: always,
  // Shown only when the catalogue offers something (nothing is published yet in 0.2; #3).
  visible: (answers) => offeredFor(answers).length > 0,
  answered: (answers) => answers.features !== undefined,
  async ask(prompter, answers, context) {
    const catalogue = catalogueOf(context)
    const offered = offeredFor(answers, catalogue)
    const current = answers.features ?? DEFAULTS.features
    // Step 1: the short popular list, grouped by category (never all 100+ packages at once).
    const groups = new Map(
      popularGroups(catalogue, offered).map((group) => [
        group.category.name,
        group.entries.map(toChoice),
      ]),
    )
    const popular =
      groups.size === 0
        ? []
        : answerOrThrow(
            await prompter.groupMultiselect({
              id: 'features',
              message: 'Extra features? (popular first; space to toggle, enter to confirm)',
              groups,
              initialValues: current.filter((id) => offered.some((e) => e.id === id && e.popular)),
            }),
          )
    // Step 2 (optional): type to search everything else in the catalogue.
    const rest = offered.filter((entry) => !entry.popular)
    let more: string[] = []
    if (rest.length > 0) {
      const search = answerOrThrow(
        await prompter.confirm({
          id: 'featuresSearch',
          message: `Search the full catalogue for more? (${rest.length} more packages)`,
          initialValue: false,
        }),
      )
      more = search
        ? answerOrThrow(
            await prompter.search({
              id: 'featuresMore',
              message: 'Type to search, space to pick, enter when done',
              placeholder: 'for example: tags',
              options: rest.map(toChoice),
              initialValues: current.filter((id) => rest.some((e) => e.id === id)),
            }),
          )
        : current.filter((id) => rest.some((e) => e.id === id))
    }
    // A new pick means new follow-up questions: drop follow-up answers of packages no longer picked.
    return featureOptionsQuestion.tidy({ ...answers, features: [...popular, ...more] })
  },
  describe: (answers) => {
    const entries = pickedEntries(answers)
    return entries.length === 0 ? 'none' : entries.map((e) => e.name).join(', ')
  },
  read(raw, problems) {
    const items =
      typeof raw === 'string'
        ? raw.trim() === 'none'
          ? []
          : raw.split(',').map((p) => p.trim())
        : raw
    if (
      !Array.isArray(items) ||
      !items.every((item): item is string => typeof item === 'string' && FEATURE_ID.test(item))
    ) {
      problems.push(
        '--features needs a comma list of package ids (for example billing,search), or none',
      )
      return {}
    }
    // Whether each id is offered is checked by resolveOptions, against the same catalogue.
    return { features: [...new Set(items)] }
  },
  flagWords: (answers) => [
    '--features',
    pickedEntries(answers)
      .map((e) => e.id)
      .join(',') || 'none',
  ],
  packages: (answers) => pickedEntries(answers).map((e) => e.package),
  tidy: (answers) => answers,
  // Typed ids are checked (with the #109 wording) by resolveOptions; nothing else to settle.
  availabilityProblem: () => undefined,
  settle: (answers) => answers,
}

/** The follow-up keys (`<id>.<question>`) of the picked features that apply now. */
function followUpKeys(answers: Answers, catalogue?: Catalogue): string[] {
  return pickedEntries(answers, catalogue).flatMap((entry) =>
    Object.keys(resolveFollowUps(entry, answers.featureOptions ?? {}).values),
  )
}

/** A follow-up value as `--feature-option` takes it: an id, yes/no, a comma list or none. */
const FOLLOW_UP_VALUE = /^[a-z][a-z0-9-]{0,39}(,[a-z][a-z0-9-]{0,39}){0,19}$/
/** `<package id>.<question id>`. */
const FOLLOW_UP_KEY = /^[a-z][a-z0-9-]{0,39}\.[a-z][a-z0-9-]{0,39}$/

/** Ask one follow-up question of a package (one choice, yes/no, or several choices). */
async function askFollowUp(
  prompter: Prompter,
  key: string,
  question: FollowUpQuestion,
): Promise<string> {
  if (question.type === 'confirm') {
    const yes = answerOrThrow(
      await prompter.confirm({ id: key, message: question.label, initialValue: question.default }),
    )
    return yes ? 'yes' : 'no'
  }
  if (question.type === 'select') {
    return answerOrThrow(
      await prompter.select({
        id: key,
        message: question.label,
        options: question.choices,
        initialValue: question.default,
      }),
    )
  }
  for (;;) {
    const picked = answerOrThrow(
      await prompter.multiselect({
        id: key,
        message: question.label,
        options: question.choices,
        initialValues: question.default,
      }),
    )
    const value = picked.length === 0 ? 'none' : picked.join(',')
    const problem = followUpProblem(question, value)
    if (problem === undefined) return value
    prompter.info(`This answer ${problem}.`)
  }
}

const featureOptionsQuestion: Question = {
  id: 'featureOptions',
  row: 22,
  group: 'Features',
  title: 'Feature options',
  recommended: false,
  // Asked whenever a picked package declares questions, in either mode: the pick was the user's.
  alwaysAsk: true,
  flag: {
    name: 'feature-option',
    type: 'string',
    multiple: true,
    usage: '--feature-option <id>.<question>=<value>',
    help: "A picked package's own question, e.g. billing.provider=paddle",
    defaultLabel: "package's default",
  },
  secretEnv: undefined,
  when: (answers) => followUpKeys(answers).length > 0,
  visible: (answers) => followUpKeys(answers).length > 0,
  answered: (answers) =>
    followUpKeys(answers).every((key) => answers.featureOptions?.[key] !== undefined),
  async ask(prompter, answers, context) {
    const options: Record<string, string> = { ...answers.featureOptions }
    for (const entry of pickedEntries(answers, catalogueOf(context))) {
      // Question by question, so a `when` sees the answers given just before it.
      const earlier: Record<string, string> = {}
      for (const question of entry.followUps) {
        const key = `${entry.id}.${question.id}`
        if (!followUpApplies(question, earlier)) {
          delete options[key]
          continue
        }
        const value = options[key] ?? (await askFollowUp(prompter, key, question))
        options[key] = value
        earlier[question.id] = value
      }
    }
    return { ...answers, featureOptions: options }
  },
  describe: (answers) => {
    const lines = pickedEntries(answers).flatMap((entry) =>
      Object.entries(resolveFollowUps(entry, answers.featureOptions ?? {}).values).map(
        ([key, value]) => `${key}=${value}`,
      ),
    )
    return lines.length === 0 ? 'none' : lines.join(', ')
  },
  read(raw, problems) {
    // From flags: ['billing.provider=paddle', ...]; from strutvane.json: { 'billing.provider': 'paddle' }.
    const pairs: [string, unknown][] = Array.isArray(raw)
      ? raw.map((item: unknown) => {
          const textItem = String(item)
          const at = textItem.indexOf('=')
          return at < 0 ? [textItem, undefined] : [textItem.slice(0, at), textItem.slice(at + 1)]
        })
      : typeof raw === 'object' && raw !== null
        ? Object.entries(raw)
        : []
    const options: Record<string, string> = {}
    for (const [key, value] of pairs) {
      if (!FOLLOW_UP_KEY.test(key) || typeof value !== 'string' || !FOLLOW_UP_VALUE.test(value)) {
        problems.push(
          `--feature-option "${key}${typeof value === 'string' ? `=${value}` : ''}" must look like <id>.<question>=<value>, e.g. billing.provider=paddle`,
        )
      } else {
        options[key] = value
      }
    }
    return { featureOptions: options }
  },
  flagWords: (answers) =>
    pickedEntries(answers).flatMap((entry) =>
      Object.entries(resolveFollowUps(entry, answers.featureOptions ?? {}).values).flatMap(
        ([key, value]) => ['--feature-option', `${key}=${value}`],
      ),
    ),
  packages: () => [],
  tidy(answers) {
    if (answers.featureOptions === undefined) return answers
    const keep = new Set(followUpKeys(answers))
    return {
      ...answers,
      featureOptions: Object.fromEntries(
        Object.entries(answers.featureOptions).filter(([key]) => keep.has(key)),
      ),
    }
  },
  availabilityProblem: () => undefined,
  settle: (answers) => answers,
}

// ── The project name ──────────────────────────────────────────────────────────────────────────

const nameQuestion: Question = {
  id: 'name',
  row: 1,
  group: 'Project',
  title: 'Name',
  recommended: true,
  alwaysAsk: false,
  flag: {
    name: 'name',
    type: 'string',
    usage: '--name <name>',
    help: 'Project name (or give it first: my-app)',
    defaultLabel: '',
  },
  secretEnv: undefined,
  when: always,
  visible: always,
  answered: (answers) => answers.name !== undefined,
  async ask(prompter, answers, context) {
    const value = await prompter.text({
      id: 'name',
      message: 'What is the name of your project?',
      placeholder: 'my-app',
      validate: (raw) => validateProjectName(raw.trim())[0] ?? context.targetProblem(raw.trim()),
    })
    return { ...answers, name: answerOrThrow(value).trim() }
  },
  describe: (answers) => answers.name ?? '',
  read: (raw, problems) => {
    if (typeof raw === 'string') return { name: raw }
    problems.push('--name needs a value')
    return {}
  },
  // The name is the positional argument of the command, not a flag.
  flagWords: () => [],
  packages: () => [],
  tidy: (answers) => answers,
  availabilityProblem: () => undefined,
  settle: (answers) => answers,
}

