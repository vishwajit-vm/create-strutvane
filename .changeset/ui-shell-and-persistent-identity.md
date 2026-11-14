---
"create-strutvane": patch
---

The generated UI and auth wiring match the published packages:

- `web/app.tsx` uses the `@strutvane/ui` 0.1.0-next.0 API. It builds the API client with `createHttpClient`, loads the manifest with `fetchManifest` (resolving a relative `VITE_API_URL` against the page's origin), and renders `<StrutvaneProvider api manifest queryClient>` with a menu of resources that switches between `<ResourceList>` and `<ResourceForm>`. The previous `apiUrl` and `routes` props do not exist in `@strutvane/ui`.
- `web/router.tsx` exports a plain `pages` list of your own screens (`{ title, element }`), shown in the same menu. `@strutvane/ui` has no `RouteDefinition` type or router.
- PostgreSQL and Azure Database for PostgreSQL apps with auth depend on `better-auth` 1.7.23, the optional peer `@strutvane/auth` uses to keep accounts and sessions in the app's database when `AUTH_SESSION_DRIVER=database`.
