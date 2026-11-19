/**
 * The install step's pure parts: what an npm failure means (and the hint the user gets), and the
 * list of packages whose install scripts may be rebuilt (npm's own `allowScripts`).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifyInstallFailure, installArgs, rebuildAllowlist } from '../src/steps/install.ts'
import { appAllowScripts } from '../src/templates/project.ts'
import { REFUSED_INSTALL_SCRIPTS } from '../src/version.ts'
import { tempFolder } from './helpers/fakes.ts'

describe('npm failures in plain words', () => {
  it.each([
    ['npm error code ECONNRESET', 'network'],
    ['npm error code EAI_AGAIN registry.npmjs.org', 'network'],
    ['npm error code EPERM operation not permitted', 'locked'],
    ['npm error code EBADDEVENGINES The developer of this package has specified', 'npm-version'],
    ['npm error code ETARGET No matching version found for @strutvane/auth', 'missing'],
    ['npm error code E404 Not Found - GET https://registry.npmjs.org/x', 'missing'],
    ['npm error code E401 Unable to authenticate', 'registry'],
    ['npm error code SELF_SIGNED_CERT_IN_CHAIN', 'registry'],
    ['npm error something else entirely', 'other'],
  ] as const)('%s → %s', (output, kind) => {
    expect(classifyInstallFailure(output)).toBe(kind)
  })

  it('installs from the lockfile once there is one, never with scripts', () => {
    expect(installArgs(true)).toEqual(['ci', '--ignore-scripts', '--no-audit', '--no-fund'])
    expect(installArgs(false)).toEqual(['install', '--ignore-scripts', '--no-audit', '--no-fund'])
  })
})

describe('the rebuild allowlist is package.json "allowScripts"', () => {
  const project = (manifest: unknown): string => {
    const folder = tempFolder('cs-allow-')
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'package.json'), JSON.stringify(manifest))
    return folder
  }

  it('takes the approved names (name@version: true), never refusals or odd keys', () => {
    expect(
      rebuildAllowlist(
        project({
          allowScripts: {
            'esbuild@0.25.12': true,
            '@scope/native@1.2.3': true,
            'fsevents@2.3.3': false,
            'file:../local': true,
            'evil; rm -rf /@1.0.0': true,
            'esbuild@0.25.13': true,
          },
        }),
      ),
    ).toEqual(['esbuild', '@scope/native'])
  })

  it('is empty without a list, with a malformed one, or without a package.json', () => {
    expect(rebuildAllowlist(project({}))).toEqual([])
    expect(rebuildAllowlist(project({ allowScripts: ['esbuild'] }))).toEqual([])
    expect(rebuildAllowlist(project('not an object'))).toEqual([])
    expect(rebuildAllowlist(tempFolder('cs-empty-'))).toEqual([])
  })
})

// Regression (class: a dependency's install script that strict-allow-scripts does not cover fails
// every rebuild with scripts on). fsevents on macOS CI: refused name-only in every generated app.
describe('generated apps refuse known install scripts (allowScripts)', () => {
  it('adds the name-only refusals, and the skeleton keeps the last word for its own keys', () => {
    expect(REFUSED_INSTALL_SCRIPTS).toEqual({ fsevents: false })
    expect(appAllowScripts({})).toEqual({ fsevents: false })
    expect(appAllowScripts(undefined)).toEqual({ fsevents: false })
    expect(appAllowScripts({ 'esbuild@0.25.0': true })).toEqual({
      fsevents: false,
      'esbuild@0.25.0': true,
    })
    expect(appAllowScripts({ fsevents: true })).toEqual({ fsevents: true })
  })

  it('drops what npm would reject instead of failing the install', () => {
    expect(appAllowScripts(['esbuild'])).toEqual({ fsevents: false })
    expect(appAllowScripts({ esbuild: 'yes', sharp: 1 })).toEqual({ fsevents: false })
  })

  it('a refusal is never rebuilt', () => {
    const folder = tempFolder('cs-refused-')
    writeFileSync(
      join(folder, 'package.json'),
      JSON.stringify({ allowScripts: appAllowScripts({}) }),
    )
    expect(rebuildAllowlist(folder)).toEqual([])
  })
})
