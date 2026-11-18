/**
 * Integration with the REAL framework (not the stand-in): a generated SQLite API app installs a
 * packed `@strutvane/framework` tarball and runs `node strut migrate`.
 *
 * Opt-in, because CI never sees a sibling checkout (committed code depends on published versions
 * only): set `STRUT_FRAMEWORK_TARBALL` to a tarball made with `npm pack` in a framework worktree.
 * Until the framework is on npm this is the only check that the skeleton's files match the
 * framework they will run on.
 *
 * Known blocker (2026-11-18): framework 0.2.0-next.0 still declares `strutvane.compat: ^0.1`, so
 * its own CLI refuses its commands package (exit 7, "incompatible"); it is being fixed on the
 * framework's fix/release-0.2 branch. The test detects exactly that refusal and skips with the
 * reason instead of failing; any other failure fails.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { generateSecret, setEnvValue } from '../src/env-file.ts'
import { resolveNpmCli } from '../src/npm-cli.ts'
import { resolveOptions } from '../src/options.ts'
import { renderProject } from '../src/templates/project.ts'
import { writeProjectFiles } from '../src/write-files.ts'
import { tempFolder } from './helpers/fakes.ts'

const TARBALL = process.env['STRUT_FRAMEWORK_TARBALL']
const NPM = resolveNpmCli(process.env, process.execPath)

/** The framework's own "this package does not fit this CLI" refusal (exit code 7). */
const INCOMPATIBLE = 7

describe.skipIf(TARBALL === undefined || !existsSync(TARBALL))(
  'a generated SQLite API app on the real framework tarball (STRUT_FRAMEWORK_TARBALL)',
  () => {
    it('installs the tarball and runs node strut migrate: the users table exists', async (context) => {
      const parent = tempFolder('cs-framework-')
      const options = resolveOptions(
        {
          name: 'acme-real',
          stack: 'api',
          auth: 'none',
          database: 'sqlite',
          docker: false,
          testing: 'none',
          git: false,
        },
        parent,
      )
      const directory = join(parent, 'acme-real')
      const files = renderProject(options).map((file) =>
        file.path === '.env'
          ? { ...file, content: setEnvValue(file.content, 'APP_KEY', generateSecret()) }
          : file,
      )
      await writeProjectFiles(directory, files)
      writeFileSync(join(directory, 'database', 'database.sqlite'), '')

      const install = spawnSync(
        process.execPath,
        [NPM, 'install', '--no-save', '--ignore-scripts', '--omit=dev', resolve(TARBALL ?? '')],
        { cwd: directory, encoding: 'utf8', timeout: 600_000 },
      )
      expect(install.status, `${install.stdout}${install.stderr}`).toBe(0)

      const migrate = spawnSync(process.execPath, ['strut.js', 'migrate'], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 300_000,
      })
      const output = `${migrate.stdout}${migrate.stderr}`
      if (migrate.status !== 0) {
        // The CLI drops a commands package whose compat range excludes it, then says the command
        // is missing; `doctor` names the range. Skip on exactly that, fail on anything else.
        const doctor = spawnSync(process.execPath, ['strut.js', 'doctor'], {
          cwd: directory,
          encoding: 'utf8',
          timeout: 120_000,
        })
        const report = `${doctor.stdout}${doctor.stderr}`
        const refused = /@strutvane\/framework@\S+ requires Strutvane \^0\.1/.exec(report)
        if (refused !== null || migrate.status === INCOMPATIBLE) {
          context.skip(
            `Blocked by the framework, not the installer: ${refused?.[0] ?? 'exit 7'} (its strutvane.compat still says ^0.1; fixed on framework fix/release-0.2). migrate said: ${output.trim().slice(0, 200)}`,
          )
        }
      }
      expect(migrate.status, output).toBe(0)
      const db = new DatabaseSync(join(directory, 'database', 'database.sqlite'))
      try {
        const tables = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
          .map((row) => row['name'])
        expect(tables).toEqual(expect.arrayContaining(['users', 'migrations']))
      } finally {
        db.close()
      }
    }, 900_000)
  },
)
