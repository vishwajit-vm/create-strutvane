/**
 * Decisions #3, #58, #108 and #109: a question that brings a package is shown only when that
 * package is published (the core train always is); hidden questions keep a default that can be
 * installed; their flags are refused with the package's plan unless `--preview-catalogue`.
 */
import { describe, expect, it } from 'vitest'
import { helpText, parseCommandLine } from '../src/args.ts'
import { type Answers, resolveOptions } from '../src/options.ts'
import {
  availabilityProblems,
  isOfferedFeature,
  QUESTIONS,
  settleAnswers,
  unavailableReason,
} from '../src/question-registry.ts'
import { renderProject } from '../src/templates/project.ts'

/** Answers under which every question applies (sign-in, teams, a UI, AI on, git on). */
const everythingApplies: Answers = { name: 'acme', teams: true, ai: true, git: true }
/** The questions shown, after hidden defaults settled (as the installer does). */
const visibleIds = (given: Answers) => {
  const answers = settleAnswers(given)
  return QUESTIONS.filter((q) => q.when(answers) && q.visible(answers)).map((q) => q.id)
}

describe('questions about unreleased packages (0.2)', () => {
  it('hides exactly the questions whose packages are not published (#3)', () => {
    const shown = visibleIds(everythingApplies)
    for (const hidden of [
      'social',
      'sso',
      'cache',
      'storage',
      'features',
      'agents',
      'activityLog',
      'ai',
      'aiProvider',
      'mcpServer',
      'liveUpdates',
      'monitoring',
    ]) {
      expect(shown, hidden).not.toContain(hidden)
    }
    // Core-train questions and the ones that still offer a real choice stay.
    for (const kept of ['stack', 'design', 'ui', 'auth', 'apiAccess', 'testing', 'pwa', 'deploy']) {
      expect(shown, kept).toContain(kept)
    }
  })

  it('Recommended asks 6 questions in 0.2 (#58), and 7 with the preview', () => {
    const starred = (answers: Answers) =>
      QUESTIONS.filter(
        (q) => q.recommended && q.id !== 'name' && q.id !== 'mode' && q.visible(answers),
      ).length
    expect(starred({})).toBe(6)
    expect(starred({ previewCatalogue: true })).toBe(7)
  })

  it('the remaining choices drop what needs an unreleased package (#108: vitest or none)', () => {
    expect(() => parseCommandLine(['acme', '--testing', 'vitest-playwright'])).toThrow(
      /--testing vitest-playwright: @strutvane\/browser-testing isn't available yet/,
    )
    expect(() => parseCommandLine(['acme', '--api', 'oauth'])).toThrow(/oauth-server/)
    expect(parseCommandLine(['acme', '--testing', 'none']).answers.testing).toBe('none')
  })

  it('names boolean flags without a value in the refusal', () => {
    expect(availabilityProblems({ sso: true })).toEqual([
      expect.stringMatching(/^--sso: @strutvane\/sso isn't available yet/),
    ])
    expect(availabilityProblems({ features: ['billing', 'nope'] })).toEqual([
      expect.stringMatching(/^--features billing,nope: @strutvane\/billing isn't available yet/),
    ])
    expect(availabilityProblems({ sso: true, previewCatalogue: true })).toEqual([])
  })

  it('a hidden question still takes a flag that needs no unreleased package', () => {
    expect(parseCommandLine(['acme', '--no-agents']).answers.agents).toBe(false)
    expect(parseCommandLine(['acme', '--cache-store', 'database']).answers.cache).toBe('database')
    expect(parseCommandLine(['acme', '--no-sso']).answers.sso).toBe(false)
  })

  it('settles hidden defaults onto installable choices; AI assistants keep AGENTS.md', () => {
    const settled = settleAnswers({ name: 'acme', teams: true })
    expect(settled.activityLog).toBe(false) // the default is "yes with teams", but not released
    const options = resolveOptions(settled, '/code')
    expect(options.activityLog).toBe(false)
    expect(options.agents).toBe(true)
    const paths = renderProject(options).map((f) => f.path)
    expect(paths).toContain('AGENTS.md')
    expect(
      JSON.parse(renderProject(options).find((f) => f.path === 'package.json')?.content ?? '{}')
        .dependencies,
    ).not.toHaveProperty('@strutvane/agent-tools')
    // A preview keeps the defaults (and their packages).
    expect(
      settleAnswers({ name: 'acme', teams: true, previewCatalogue: true }).activityLog,
    ).toBeUndefined()
    // A list keeps only what can be installed.
    expect(settleAnswers({ social: ['google'] }).social).toEqual([])
  })

  it('reports why packages are unavailable, and checks catalogue ids', () => {
    expect(unavailableReason(['@strutvane/framework', '@strutvane/ui'], {})).toBeUndefined()
    expect(unavailableReason(['@strutvane/realtime'], {})).toMatch(/realtime isn't available yet/)
    expect(isOfferedFeature('billing')).toBe(false)
    expect(isOfferedFeature('billing', { previewCatalogue: true })).toBe(true)
  })
})

describe('CORS is not generated (skeleton INSTALLER.md §4)', () => {
  // CORS is off by default (blueprint §5.2) and v2 configures it in bootstrap/app.ts middleware,
  // so the old process.env-reading config/cors.ts and its CORS_ORIGINS key are gone.
  it('writes no config/cors.ts and no CORS_ORIGINS key', () => {
    const project = renderProject(resolveOptions({ name: 'acme' }, '/code'))
    expect(project.map((f) => f.path)).not.toContain('config/cors.ts')
    for (const name of ['.env', '.env.example'])
      expect(project.find((f) => f.path === name)?.content).not.toMatch(/CORS_ORIGINS/)
  })
})

describe('--help and unreleased packages', () => {
  it('shows only released choices in each flag, and lists the waiting flags apart', () => {
    const help = helpText('0.0.0')
    expect(help).toMatch(/--testing vitest\|none /)
    expect(help).toMatch(
      /Not released yet \(refused with their plan; try them with --preview-catalogue\):/,
    )
    const waiting = help.slice(help.indexOf('Not released yet'))
    for (const flag of [
      '--testing vitest-playwright',
      '--cache-store redis',
      '--sso',
      '--features <id>',
    ]) {
      expect(waiting).toContain(flag)
    }
  })
})
