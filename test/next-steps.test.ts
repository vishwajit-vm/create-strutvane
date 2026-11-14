/**
 * The "Next steps" note: `cd` only when the project is elsewhere, install only when not done, and
 * a Corepack fallback for pnpm (the only package manager whose version the project pins).
 */
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { nextSteps } from '../src/next-steps.ts'
import type { RawProjectInput } from '../src/options.ts'
import { corepackRunner } from '../src/package-manager.ts'
import { VERSIONS } from '../src/versions.ts'
import { optionsFor } from './helpers.ts'

const cwd = resolve('/work')
const steps = (input: RawProjectInput, installed = false, from = cwd) =>
  nextSteps(optionsFor(input, cwd), from, installed).split('\n')

describe('cd', () => {
  test('a project in a sub-folder starts with cd into it', () => {
    expect(steps({ name: 'acme', directory: join(cwd, 'acme') })[0]).toBe('cd acme')
  })

  test('a project in the current folder has no cd step (never `cd .`)', () => {
    const lines = steps({ name: 'acme', directory: cwd })
    expect(lines[0]).toBe('pnpm install')
    expect(lines.some((l) => l.startsWith('cd'))).toBe(false)
  })

  test('a path with spaces is quoted; a path outside cwd is relative', () => {
    expect(steps({ name: 'acme', directory: join(cwd, 'my apps', 'acme') })[0]).toMatch(
      /^cd "my apps[\\/]acme"$/,
    )
    expect(
      steps({ name: 'acme', directory: join(cwd, 'acme') }, false, join(cwd, 'other'))[0],
    ).toMatch(/^cd \.\.[\\/]acme$/)
  })
})

describe('steps', () => {
  test('full pnpm project: the whole sequence, then the Corepack fallback', () => {
    expect(steps({ name: 'acme', directory: join(cwd, 'acme') })).toEqual([
      'cd acme',
      'pnpm install',
      'pnpm services:up',
      // sv migrate also creates auth's tables (a package migration of @strutvane/auth).
      'pnpm sv migrate',
      'pnpm sv db:seed',
      'pnpm dev',
      '',
      `pnpm not installed? use: corepack pnpm@${VERSIONS.pnpm} <command>`,
    ])
  })

  test('no separate auth:migration step: sv migrate applies the auth tables', () => {
    const at = (input: RawProjectInput) => steps({ directory: join(cwd, 'acme'), ...input })
    for (const input of [
      { name: 'acme', packageManager: 'npm' as const },
      { name: 'acme', database: 'azure-postgres' as const },
      { name: 'acme', database: 'sqlite' as const },
      { name: 'acme', database: 'mysql' as const },
      { name: 'acme', auth: [] },
      { name: 'acme', preset: 'ui' as const },
    ]) {
      expect(at(input).join('\n')).not.toContain('auth:migration')
    }
  })

  test('installed dependencies skip the install step', () => {
    expect(steps({ name: 'acme', directory: join(cwd, 'acme') }, true)).not.toContain(
      'pnpm install',
    )
  })

  test.each(['npm', 'yarn', 'bun'] as const)('%s gets no Corepack line', (pm) => {
    const text = steps({ name: 'acme', directory: join(cwd, 'acme'), packageManager: pm }).join(
      '\n',
    )
    expect(text).not.toContain('corepack')
    expect(text).not.toContain('not installed')
  })
})

describe('corepackRunner', () => {
  test('pnpm runs the version pinned in the generated packageManager field', () => {
    expect(corepackRunner('pnpm')).toBe(`corepack pnpm@${VERSIONS.pnpm}`)
    for (const pm of ['npm', 'yarn', 'bun'] as const) expect(corepackRunner(pm)).toBeUndefined()
  })
})
