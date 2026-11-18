/**
 * Asking the Docker engine whether it can run the app's containers.
 *
 * Why the OS type matters: every image a Strutvane app uses (node, mysql, postgres, mailpit) is a
 * Linux image. A Docker engine that runs **Windows containers** (Docker Desktop switched to
 * "Windows containers", or Docker on Windows Server, as on GitHub's Windows runners) answers
 * `docker info` like a healthy engine, and only fails later, at `compose up`, with "no matching
 * manifest for windows/amd64". So both probes (the question 14 default and the database step) ask
 * for the OS type in the same call and treat a Windows engine as "Docker cannot be used here".
 *
 * @module
 */

/**
 * The arguments of the one `docker info` call: the engine version, then the OS its containers run.
 *
 * @example
 * spawn({ command: 'docker', args: [...DOCKER_INFO_ARGS], cwd })
 */
export const DOCKER_INFO_ARGS: readonly string[] = [
  'info',
  '--format',
  '{{.ServerVersion}} {{.OSType}}',
]

/**
 * Does this `docker info` answer (from {@link DOCKER_INFO_ARGS}) come from an engine that runs
 * Windows containers? An answer without an OS type (an older or Docker-compatible engine) is not
 * refused: only an engine that says "windows" is known to be unable to run Linux images.
 *
 * @example
 * runsWindowsContainers('29.8.2 windows\n') // true
 * runsWindowsContainers('29.8.2 linux\n') // false
 */
export function runsWindowsContainers(output: string): boolean {
  return /\swindows$/i.test(output.trim())
}
