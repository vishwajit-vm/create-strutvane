const fs = require('node:fs')
const path = require('node:path')
const f = path.join(process.argv[2], 'test/questions.test.ts')
let t = fs.readFileSync(f, 'utf8')
const rep = (a, b) => {
  if (!t.includes(a)) throw new Error(`missing ${a.slice(0, 80)}`)
  t = t.replace(a, b)
}
rep(
  `  it('asks only the 7 starred questions after the name and the opener', async () => {
    const { prompter, asked } = scriptedPrompter({ ...RECOMMENDED_ANSWERS, name: 'my-app' })
    const answers = await askMissing({}, prompter, context)
    expect(asked).toEqual([
      'name',
      'mode',
      'stack',
      'design',
      'auth',
      'teams',
      'database',
      'docker',
      'agents',
    ])
    expect(answers).toEqual({ ...RECOMMENDED_ANSWERS, name: 'my-app', docker: true })
  })`,
  `  it('asks the 6 starred questions of 0.2 after the name and the opener (#58)', async () => {
    const { prompter, asked } = scriptedPrompter({ ...RECOMMENDED_ANSWERS, name: 'my-app' })
    const answers = await askMissing({}, prompter, context)
    // "AI assistants" (★) appears once @strutvane/agent-tools is published (decision #3).
    expect(asked).toEqual(['name', 'mode', 'stack', 'design', 'auth', 'teams', 'database', 'docker'])
    const { agents: _agents, ...rest } = RECOMMENDED_ANSWERS
    expect(answers).toEqual({ ...rest, name: 'my-app', docker: true })
  })

  it('with --preview-catalogue the 7th starred question (AI assistants) is asked too', async () => {
    const { prompter, asked } = scriptedPrompter({ ...RECOMMENDED_ANSWERS, name: 'my-app' })
    await askMissing({ previewCatalogue: true }, prompter, context)
    expect(asked.at(-1)).toBe('agents')
    expect(asked).toHaveLength(9)
  })`,
)
rep(
  `      'dbUser',
      'dbPassword',
      'agents',
    ])`,
  `      'dbUser',
      'dbPassword',
    ])`,
)
rep(
  `    expect(asked).toEqual(['name', 'mode', 'stack', 'auth', 'database', 'docker', 'agents'])`,
  `    expect(asked).toEqual(['name', 'mode', 'stack', 'auth', 'database', 'docker'])`,
)
rep(
  `  it('asks every question in blueprint order, with group headers', async () => {
    const { prompter, asked, infos } = scriptedPrompter(CUSTOM_ANSWERS)
    await askMissing({}, prompter, context)
    expect(asked).toEqual([`,
  `  it('asks every question of 0.2 in blueprint order; the unreleased ones are hidden (#3, #108)', async () => {
    const { prompter, asked, infos } = scriptedPrompter(CUSTOM_ANSWERS)
    await askMissing({}, prompter, context)
    expect(asked).toEqual([
      'name',
      'mode',
      'stack',
      'design',
      'ui',
      'auth',
      'security',
      'apiAccess',
      'roles',
      'teams',
      'database',
      'docker',
      'adminEmail',
      'adminPasswordMode',
      'sampleData',
      'mailer',
      'locale',
      'timezone',
      'currency',
      'testing',
      'git',
      'ci',
      'securityProfile',
      'uiLanguages',
      'appearance',
      'pwa',
      'deploy',
      'editor',
      'devContainer',
    ])
    expect(infos).toContain('── Sign-in ──')
    expect(infos).not.toContain('── AI ──')
  })

  it('with --preview-catalogue asks every question in blueprint order, with group headers', async () => {
    const { prompter, asked, infos } = scriptedPrompter(CUSTOM_ANSWERS)
    await askMissing({ previewCatalogue: true }, prompter, context)
    expect(asked).toEqual([`,
)
rep(
  `      database: 'postgres',
    })
    const answers = await askMissing({}, prompter, context)
    expect(asked.indexOf('sso')).toBeGreaterThan(asked.indexOf('teams'))`,
  `      database: 'postgres',
    })
    const answers = await askMissing({ previewCatalogue: true }, prompter, context)
    expect(asked.indexOf('sso')).toBeGreaterThan(asked.indexOf('teams'))`,
)
rep(
  `      aiProvider: 'openai',
    })
    const answers = await askMissing({}, prompter, context)`,
  `      aiProvider: 'openai',
    })
    const answers = await askMissing({ previewCatalogue: true }, prompter, context)`,
)
rep(
  `    const text = reviewLines({ name: 'my-app', teams: true, database: 'mysql' }, '/code').join('\\n')
    expect(text).toMatch(/^Folder\\s+/)
    for (const line of [
      /^Database\\s+MySQL$/m,
      /^Docker\\s+yes/m,
      /^Design\\s+crisp \\(@strutvane\\/design-crisp\\)$/m,
      /^Sign-in security\\s+2FA, email verification$/m,
      /^Extra features\\s+Log viewer$/m,`,
  `    const answers = { name: 'my-app', teams: true, database: 'mysql', previewCatalogue: true }
    const text = reviewLines(answers, '/code').join('\\n')
    expect(text).toMatch(/^Folder\\s+/)
    for (const line of [
      /^Database\\s+MySQL$/m,
      /^Docker\\s+yes/m,
      /^Design\\s+crisp \\(@strutvane\\/design-crisp\\)$/m,
      /^Sign-in security\\s+2FA, email verification$/m,
      /^Extra features\\s+Log viewer$/m,`,
)
rep(
  `    expect(text).toMatch(/Teams on MySQL/)
  })`,
  `    expect(text).toMatch(/Teams on MySQL/)
    // Without the preview, questions about unreleased packages are not in the review at all.
    const released = reviewLines({ ...answers, previewCatalogue: false }, '/code').join('\\n')
    expect(released).not.toMatch(/^Extra features/m)
    expect(released).not.toMatch(/^Activity history/m)
  })`,
)
fs.writeFileSync(f, t)
