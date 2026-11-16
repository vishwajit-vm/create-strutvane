/**
 * Decisions #3, #58, #108 and #109: a question that brings a package is shown only when that
 * package is published (the core train always is); hidden questions keep a default that can be
 * installed; their flags are refused with the package's plan unless `--preview-catalogue`.
 * Also the generated config/cors.ts, executed for real (packaging finding 4).
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
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
import { tempFolder } from './helpers/fakes.ts'

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

describe('the generated config/cors.ts, run for real', () => {
  const folder = tempFolder('cs-cors-')
  const project = renderProject(resolveOptions({ name: 'acme' }, '/code'))
  const source = project.find((f) => f.path === 'config/cors.ts')?.content ?? ''
  const file = join(folder, 'cors.ts')
  writeFileSync(file, source)
  let loads = 0
  /** Import a fresh copy with these environment values. */
  const load = async (env: Record<string, string | undefined>) => {
    const before = { CORS_ORIGINS: process.env['CORS_ORIGINS'], APP_ENV: process.env['APP_ENV'] }
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    try {
      loads += 1
      return (await import(`${pathToFileURL(file).href}?v=${loads}`)) as {
        default: { origins: readonly string[]; credentials: boolean }
        parseCorsOrigins: (value: string | undefined, appEnv: string | undefined) => unknown
      }
    } finally {
      for (const [key, value] of Object.entries(before)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  }

  it('the local default from .env loads', async () => {
    const env = project.find((f) => f.path === '.env')?.content ?? ''
    expect(env).toMatch(/^CORS_ORIGINS=http:\/\/localhost:3000$/m)
    const config = await load({ CORS_ORIGINS: 'http://localhost:3000', APP_ENV: 'local' })
    expect(config.default).toEqual({ origins: ['http://localhost:3000'], credentials: true })
  })

  it('an empty or missing CORS_ORIGINS fails as a settings problem that names the key', async () => {
    await expect(load({ CORS_ORIGINS: '', APP_ENV: 'local' })).rejects.toThrow(
      /^CORS_ORIGINS is empty: list each origin/,
    )
    await expect(load({ CORS_ORIGINS: undefined, APP_ENV: 'local' })).rejects.toThrow(
      /^CORS_ORIGINS is empty/,
    )
  })

  it('refuses a wildcard, a non-origin, and http in production, every problem naming the key', async () => {
    const { parseCorsOrigins } = await load({ CORS_ORIGINS: 'http://localhost:3000' })
    expect(parseCorsOrigins('*', 'local')).toEqual({
      issues: [
        {
          key: 'CORS_ORIGINS',
          message: 'CORS_ORIGINS cannot contain * while credentials are allowed: list each origin',
        },
      ],
    })
    expect(JSON.stringify(parseCorsOrigins('https://a.example/path, nope', 'local'))).toMatch(
      /is not an origin[\s\S]*is not an origin/,
    )
    expect(JSON.stringify(parseCorsOrigins('http://a.example', 'production'))).toMatch(
      /production allows https origins only/,
    )
    expect(parseCorsOrigins(' https://a.example , https://b.example ', 'production')).toEqual({
      origins: ['https://a.example', 'https://b.example'],
    })
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
