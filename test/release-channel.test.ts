/**
 * The create command follows our own release channel: pre-releases live under their dist-tag
 * (`next` before 1.0), because `latest` has no binary until 1.0.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { createCommand, releaseTag } from '../src/release-channel.ts'
import { PKG_ROOT } from './helpers.ts'

describe('releaseTag', () => {
  test.each([
    ['0.1.0-next.0', 'next'],
    ['0.1.0-next.12', 'next'],
    ['1.0.0-rc.1', 'rc'],
    ['2.0.0-beta', 'beta'],
    ['1.0.0-next.3+build.7', 'next'],
    [' 0.2.0-next.1 ', 'next'],
  ])('pre-release %s → %s', (version, tag) => {
    expect(releaseTag(version)).toBe(tag)
  })

  test.each([
    ['1.0.0', 'latest'],
    ['12.3.4+build.1', 'latest'],
    ['not-a-version', 'latest'],
    ['', 'latest'],
  ])('stable or unparseable %j → latest', (version, tag) => {
    expect(releaseTag(version)).toBe(tag)
  })

  test('a pre-release without a usable tag name falls back to next', () => {
    expect(releaseTag('1.0.0-0')).toBe('next')
    expect(releaseTag('1.0.0-0.next')).toBe('next')
  })
})

describe('createCommand', () => {
  test('npm (default) and pnpm', () => {
    expect(createCommand('0.1.0-next.0')).toBe('npm create strutvane@next')
    expect(createCommand('0.1.0-next.0', 'pnpm')).toBe('pnpm create strutvane@next')
    expect(createCommand('1.0.0')).toBe('npm create strutvane@latest')
  })

  test('our own version maps to the dist-tag Changesets publishes it under', () => {
    const read = (path: string): unknown => JSON.parse(readFileSync(join(PKG_ROOT, path), 'utf8'))
    const { version } = read('package.json') as { version: string }
    // In pre mode Changesets publishes under `pre.json`'s tag; otherwise under `latest`.
    const pre = existsSync(join(PKG_ROOT, '.changeset', 'pre.json'))
      ? (read('.changeset/pre.json') as { mode: string; tag: string })
      : undefined
    const expected = pre?.mode === 'pre' ? pre.tag : 'latest'
    expect(releaseTag(version)).toBe(expected)
    expect(createCommand(version)).toBe(`npm create strutvane@${expected}`)
  })
})
