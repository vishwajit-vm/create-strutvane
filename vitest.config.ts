import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from './vitest.shared.ts'

// Repo-specific overrides go here. Shared defaults come from strutvane-tooling.
// - Generation tests write real projects to temp folders and run git, tsc, Biome and Vitest on
//   them, so allow more time.
// - src/cli.ts only wires main() to the real process; it is tested by running it as a child
//   process (test/cli.test.ts), which coverage cannot see.
export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      testTimeout: 120_000,
      hookTimeout: 120_000,
      coverage: { exclude: ['src/cli.ts'] },
    },
  }),
)
