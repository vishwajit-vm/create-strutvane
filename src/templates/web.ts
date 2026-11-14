/**
 * The `web/` folder (full and ui presets): a small Vite + React shell around `@strutvane/ui`.
 * Pages for every model are generated automatically from the API's manifest; files here are only
 * for what you customise (docs/08, ADR-0014).
 *
 * @module
 */
import type { GeneratedFile } from '@strutvane/devkit'
import { hasServer, hasWeb, type ProjectOptions } from '../options.ts'
import { file, json, lines } from './util.ts'

/** Every file under `web/` plus `vite.config.ts`. Empty for the api preset. */
export function webFiles(o: ProjectOptions): GeneratedFile[] {
  if (!hasWeb(o)) return []
  const external = !hasServer(o)
  return [
    file(
      'vite.config.ts',
      lines(
        '/**',
        external
          ? ' * Vite dev server and build for this UI. API calls go straight to VITE_API_URL.'
          : ' * Vite config for the UI. In development `sv dev` serves the API and the UI on one port.',
        ' */',
        "import react from '@vitejs/plugin-react'",
        "import { defineConfig } from 'vite'",
        '',
        'export default defineConfig({',
        "  root: 'web',",
        "  envDir: '..',",
        '  plugins: [react()],',
        "  build: { outDir: '../dist/web', emptyOutDir: true },",
        '})',
      ),
    ),
    file(
      'web/tsconfig.json',
      json({
        compilerOptions: {
          target: 'ES2024',
          lib: ['ES2024', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          verbatimModuleSyntax: true,
          allowImportingTsExtensions: true,
          types: ['vite/client'],
          skipLibCheck: true,
          noEmit: true,
        },
        include: ['.'],
      }),
    ),
    file(
      'web/index.html',
      lines(
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        `    <title>${o.name}</title>`,
        '  </head>',
        '  <body>',
        '    <div id="root"></div>',
        '    <script type="module" src="./main.tsx"></script>',
        '  </body>',
        '</html>',
      ),
    ),
    file(
      'web/main.tsx',
      lines(
        "import { StrictMode } from 'react'",
        "import { createRoot } from 'react-dom/client'",
        "import { App } from './app.tsx'",
        "import './theme/tokens.css'",
        '',
        "const root = document.getElementById('root')",
        "if (!root) throw new Error('Missing #root element in web/index.html')",
        '',
        'createRoot(root).render(',
        '  <StrictMode>',
        '    <App />',
        '  </StrictMode>,',
        ')',
      ),
    ),
    appShell(o),
    customPages(),
    file(
      'web/theme/tokens.css',
      lines(
        '/*',
        ' * Theme: every @strutvane/ui screen is styled through --sv-* variables, with light and dark',
        ' * defaults built in. `html:root` outranks those defaults whatever order the styles load in.',
        ' * Colours: --sv-bg, --sv-surface, --sv-text, --sv-muted, --sv-border, --sv-accent,',
        ' * --sv-accent-text, --sv-danger (set them in a prefers-color-scheme: dark block too).',
        ' */',
        'html:root {',
        '  --sv-radius: 6px;',
        '  --sv-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;',
        '}',
      ),
    ),
    file(
      'web/pages/README.md',
      lines(
        '# Pages',
        '',
        'Every resource already has its pages, built from the API manifest: list (`/invoices`), create',
        '(`/invoices/new`), detail (`/invoices/:id`) and edit (`/invoices/:id/edit`).',
        '',
        'Put your own screens here and register them in `web/router.tsx`:',
        '',
        '```tsx',
        "{ path: '/reports', title: 'Reports', element: <Reports /> }",
        '```',
        '',
        'Routes with a `title` appear in the menu. A route wins over the built-in page at the same path,',
        'so `/invoices` replaces the invoice list. To change single fields, columns or messages instead,',
        'pass `overrides` (`widgets`, `fieldCells`, `messages`) to `<StrutvaneApp>` in `web/app.tsx`.',
      ),
    ),
    file(
      'web/components/ui/README.md',
      lines(
        '# UI components',
        '',
        'Your own React components: widgets and cells for `overrides` (typed with `WidgetProps` and',
        '`CellProps` from `@strutvane/ui/react`) and building blocks for the screens in `web/pages/`.',
      ),
    ),
    file(
      'web/layouts/README.md',
      lines(
        '# Layouts',
        '',
        '`<StrutvaneApp>` draws the header, the menu, the workspace switcher and the sign-in screen.',
        'Layouts for your own screens go here; restyle the built-in ones in `web/theme/tokens.css`.',
      ),
    ),
    file(
      'web/dashboard/README.md',
      lines(
        '# Dashboard',
        '',
        'The home page (`/`) shows a welcome with the menu entries. For a dashboard of your own, build',
        'it here and pass it to `<StrutvaneApp home={<Dashboard />}>` in `web/app.tsx`.',
      ),
    ),
  ]
}

/**
 * `web/app.tsx`: the whole UI is `<StrutvaneApp>` from `@strutvane/ui` (needs 0.1.0-next.1: the
 * app shell; see `versions.ts`). It brings its own router and query client, reads the manifest
 * from the API origin (a relative `VITE_API_URL` such as `/api/v1` is resolved against the page)
 * and talks to the `@strutvane/auth` session endpoints under the API URL.
 *
 * - `auth={false}` when the full preset has no `@strutvane/auth`: there are no session endpoints.
 *   The ui preset keeps sign-in on (it comes from the API it connects to).
 * - `credentials="include"` for the ui preset: the API is on another origin, so cookies must be
 *   sent cross-origin (the default is `same-origin`).
 */
export function appShell(o: ProjectOptions): GeneratedFile {
  const external = !hasServer(o)
  const noAuth = !external && o.auth.length === 0
  const props = [
    'apiUrl={import.meta.env.VITE_API_URL}',
    'appName={import.meta.env.VITE_APP_NAME}',
    'routes={routes}',
    ...(external ? ['credentials="include"'] : []),
    ...(noAuth ? ['auth={false}'] : []),
  ]
  return file(
    'web/app.tsx',
    lines(
      '/**',
      ' * The whole UI: <StrutvaneApp> reads the API manifest and renders a menu of every resource the',
      ' * user may see, with list, create, detail and edit pages for each and no code per model. Add',
      ' * screens in router.tsx, restyle in theme/tokens.css, and pass `overrides` (widgets, cells,',
      ' * messages) or `home` here to customise more.',
      !external &&
        !noAuth &&
        ' * Sign-in and the workspace switcher use the @strutvane/auth endpoints under the API URL.',
      external &&
        ' * The API runs on another origin, so cookies are sent to it (credentials="include").',
      noAuth && ' * This app has no sign-in (no @strutvane/auth), hence auth={false}.',
      ' */',
      "import { StrutvaneApp } from '@strutvane/ui/react'",
      "import { routes } from './router.tsx'",
      '',
      'export function App() {',
      '  return (',
      '    <StrutvaneApp',
      ...props.map((p) => `      ${p}`),
      '    />',
      '  )',
      '}',
    ),
  )
}

/** `web/router.tsx`: the app's own screens, as `RouteDefinition`s for `<StrutvaneApp routes>`. */
function customPages(): GeneratedFile {
  return file(
    'web/router.tsx',
    lines(
      '/**',
      ' * Your own screens: { path, element, title? }. A route wins over the built-in resource page at',
      ' * the same path, and routes with a `title` appear in the menu, e.g.',
      " * { path: '/reports', title: 'Reports', element: <Reports /> }.",
      ' */',
      "import type { RouteDefinition } from '@strutvane/ui/react'",
      '',
      'export const routes: RouteDefinition[] = []',
    ),
  )
}
