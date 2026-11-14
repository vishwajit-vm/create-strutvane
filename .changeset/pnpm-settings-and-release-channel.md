---
"create-strutvane": patch
---

Generated pnpm projects install with pnpm 12, and printed commands match the release channel:

- pnpm projects get a `pnpm-workspace.yaml`: `allowBuilds` approves esbuild's build step (pnpm 12 stops `pnpm install` with `ERR_PNPM_IGNORED_BUILDS` otherwise), and `minimumReleaseAgeExclude` lists `@strutvane/*` and `strutvane`, whose pre-releases are staged and approved with 2FA. Every other package keeps pnpm's defaults. npm, Yarn and Bun projects need no equivalent and are unchanged.
- The "Next steps" note leaves out `cd` when the project is created in the current folder, and pnpm projects get a Corepack fallback line (`corepack pnpm@<pinned version> <command>`). The generated README shows the same fallback.
- `--help` prints the create command for the version's own dist-tag: `npm create strutvane@next` and `pnpm create strutvane@next` for pre-releases, `@latest` from 1.0. The README and package description say the same.
- The `bin` path in `package.json` no longer starts with `./`, so npm does not rewrite it when packing.
