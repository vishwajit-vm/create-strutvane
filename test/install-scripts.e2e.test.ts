/**
 * The generated app's install-script policy against real npm (>= 11.19) and the real fsevents,
 * on every OS. fsevents is macOS-only, so npm is told to resolve for macOS (`--os=darwin
 * --cpu=arm64`): that is how the macOS CI failure (ESTRICTALLOWSCRIPTS on fsevents' install
 * script) is reproduced on Windows and Linux too. Needs the npm registry, like the other e2e tests.
 *
 * Scripts are switched on for the run (`--ignore-scripts=false`), as the installer's
 * `npm rebuild <allowlist>` and a developer's approved rebuild do; with them off, strict-allow-scripts
 * never looks.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveNpmCli } from '../src/npm-cli.ts'
import { resolveOptions } from '../src/options.ts'
import { appAllowScripts, renderProject } from '../src/templates/project.ts'
import { tempFolder } from './helpers/fakes.ts'

const NPM = resolveNpmCli(process.env, process.execPath)
/** The version Vite and Vitest resolved when the macOS CI failed (2026-11-19). */
const FSEVENTS = '2.3.3'

/** No npm_* variables from the test runner: only the project's own .npmrc counts. */
function cleanEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^npm_/i.test(key)),
  ) as NodeJS.ProcessEnv
}

/** A project with the generated app's .npmrc, fsevents (optional, as Vite has it) and this policy. */
function installForMac(allowScripts: Record<string, boolean>) {
  const folder = tempFolder('cs-fsevents-')
  const npmrc = renderProject(resolveOptions({ name: 'mac-app' }, folder)).find(
    (file) => file.path === '.npmrc',
  )
  writeFileSync(join(folder, '.npmrc'), npmrc?.content ?? '')
  writeFileSync(
    join(folder, 'package.json'),
    JSON.stringify({
      name: 'mac-app',
      version: '0.1.0',
      private: true,
      optionalDependencies: { fsevents: FSEVENTS },
      allowScripts,
    }),
  )
  const result = spawnSync(
    process.execPath,
    [
      NPM,
      'install',
      '--os=darwin',
      '--cpu=arm64',
      '--ignore-scripts=false',
      '--no-audit',
      '--no-fund',
    ],
    { cwd: folder, env: cleanEnvironment(), encoding: 'utf8', timeout: 240_000, windowsHide: true },
  )
  return { code: result.status ?? -1, output: `${result.stdout}${result.stderr}`, folder }
}

describe("the generated app's allowScripts on macOS (real npm, real fsevents)", () => {
  it('control: without the refusal, strict-allow-scripts stops on fsevents (the macOS CI failure)', () => {
    const result = installForMac({})
    expect(result.code, result.output).not.toBe(0)
    expect(result.output).toMatch(/ESTRICTALLOWSCRIPTS/)
    expect(result.output).toMatch(/fsevents@/)
  })

  it('control: a refusal pinned to another version does not cover it (why the entry is name-only)', () => {
    const result = installForMac({ 'fsevents@2.3.2': false })
    expect(result.code, result.output).not.toBe(0)
    expect(result.output).toMatch(/ESTRICTALLOWSCRIPTS/)
  })

  it("the app's own allowScripts installs fsevents without running its script", () => {
    const result = installForMac(appAllowScripts({}))
    expect(result.code, result.output).toBe(0)
    expect(existsSync(join(result.folder, 'node_modules', 'fsevents', 'package.json'))).toBe(true)
    // node-gyp rebuild never ran: no build folder next to the shipped prebuilt binary.
    expect(existsSync(join(result.folder, 'node_modules', 'fsevents', 'build'))).toBe(false)
  })
})
