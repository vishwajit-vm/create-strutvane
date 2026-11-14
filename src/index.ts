/**
 * `create-strutvane`: start a new Strutvane project.
 *
 * Most people run the binary (`npm create strutvane@latest`). This entry point exposes the same
 * engine for tools and tests: validate choices, render the files, write them transactionally.
 *
 * ```ts
 * import { createProject, resolveOptions } from 'create-strutvane'
 *
 * const { options } = resolveOptions({ name: 'acme', preset: 'api', database: 'sqlite' }, { cwd: process.cwd() })
 * await createProject(options)
 * ```
 *
 * @packageDocumentation
 */
export { ArgsError, helpText, type ParsedArgs, parseArgs } from './args.ts'
export { buildEnvSpec, type EnvKind, type EnvSection, type EnvSpecVar } from './env-spec.ts'
export {
  type CreateProjectResult,
  type CreateProjectSettings,
  checkTarget,
  createProject,
  SECRET_PLACEHOLDER,
  TargetNotEmptyError,
} from './generate.ts'
export { DEFAULT_NAME, isCi, type MainDeps, main, type Ui } from './main.ts'
export {
  AUTH_METHODS,
  type AuthMethod,
  DATABASES,
  type Database,
  DEFAULTS,
  DOCKER_MODES,
  type DockerMode,
  EXTRAS,
  type Extra,
  OptionsError,
  PACKAGE_MANAGERS,
  type PackageManager,
  PRESETS,
  type Preset,
  type ProjectInput,
  type ProjectOptions,
  type RawProjectInput,
  resolveOptions,
} from './options.ts'
export { type CommandRunner, type GitOutcome, type PostResult, runPostSteps } from './post.ts'
export { CANCEL, CancelledError, type Choice, type Prompter } from './prompts.ts'
export { type RenderedProject, renderProject, renderTree } from './render.ts'
export { validateProjectName } from './validate-name.ts'
export { STRUTVANE_VERSION } from './versions.ts'
