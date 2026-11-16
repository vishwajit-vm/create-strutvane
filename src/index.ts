/**
 * `create-strutvane`: start a new Strutvane app.
 *
 * Most people run the binary: `npm create strutvane@latest my-app`. This entry exposes the same
 * installer for tools that drive it programmatically (with their own prompter, programs and
 * folder), plus the exit codes and the version.
 *
 * @example
 * import { EXIT, main } from 'create-strutvane'
 * const code = await main(environment) // EXIT.ok when the app is ready
 *
 * @module
 */
export { EXIT, type ExitCode } from './exit-codes.ts'
export { checkNodeVersion, type InstallerEnvironment, MINIMUM_NODE, main } from './main.ts'
export { VERSION } from './version.ts'
