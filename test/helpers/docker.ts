/**
 * Whether the real-Docker tests can run here: Docker answers AND its engine runs Linux
 * containers. GitHub's Windows runners have Docker in Windows-containers mode, where every image
 * these tests use fails with "no matching manifest for windows/amd64"; that is "Docker is not
 * usable here", not a failure of the installer (which refuses such an engine itself).
 *
 * @module
 */
import { spawnSync } from 'node:child_process'
import { DOCKER_INFO_ARGS, runsWindowsContainers } from '../../src/docker-info.ts'

/**
 * Probe once per test file, with the same `docker info` call and rule the installer uses.
 *
 * @example
 * describe.runIf(linuxDockerWorks())('real Docker mode', () => {})
 */
export function linuxDockerWorks(): boolean {
  const result = spawnSync('docker', [...DOCKER_INFO_ARGS], { encoding: 'utf8', timeout: 20_000 })
  return result.status === 0 && !runsWindowsContainers(result.stdout)
}
