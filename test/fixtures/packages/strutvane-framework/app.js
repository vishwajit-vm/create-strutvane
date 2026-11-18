// TEST STAND-IN for the application surface of @strutvane/framework 0.2 (create-strutvane's tests
// only): just the shapes the strutvane-skeleton app uses, so a generated app boots, serves its
// routes and runs its own Vitest tests against this stand-in. The real package replaces it.
//
// - Application.configure({ basePath }).withConfig().withProviders().withRouting().
//   withMiddleware().withExceptions().create(): an app with boot(), handle(Request) -> Response
//   and shutdown();
// - defineConfig((env) => ...) and config('file.key'), read from process.env;
// - defineRoutes([...]) or defineRoutes((router) => [...]) with Route.get(path, Controller), where
//   a controller is a class with __invoke(ctx) and ctx has json() and html();
// - ServiceProvider, APP_ENVIRONMENTS.

/** The APP_ENV values the framework accepts. */
export const APP_ENVIRONMENTS = Object.freeze(['local', 'testing', 'staging', 'production'])

/** A config file: `export default defineConfig((env) => ({ ... }))`. */
export function defineConfig(build) {
  return { build }
}

/** Typed readers over process.env (no validation in the stand-in). */
function envReader() {
  const raw = (key) => {
    const value = process.env[key]
    return value === undefined || value === '' ? undefined : value
  }
  return {
    string: (key, fallback = '') => raw(key) ?? fallback,
    oneOf: (key, _values, fallback) => raw(key) ?? fallback,
    boolean: (key, fallback = false) => (raw(key) === undefined ? fallback : raw(key) === 'true'),
    integer: (key, fallback = 0) => (raw(key) === undefined ? fallback : Number(raw(key))),
    url: (key, fallback = '') => raw(key) ?? fallback,
    optional: (key) => raw(key),
  }
}

let configFiles = {}

/** `config('app.name')`: one value of a config file, read now. */
export function config(path) {
  const [file, ...keys] = path.split('.')
  const entry = configFiles[file]
  let value = entry === undefined ? undefined : entry.build(envReader())
  for (const key of keys) value = value?.[key]
  return value
}

/** Your providers extend this (Laravel's ServiceProvider). */
export class ServiceProvider {
  register() {}
  boot() {}
}

/** One route: `Route.get('/health', HealthController).name('api.health')`. */
class RouteDefinition {
  constructor(method, path, controller) {
    this.method = method
    this.path = path
    this.controller = controller
    this.routeName = undefined
  }
  name(routeName) {
    this.routeName = routeName
    return this
  }
}

/** The route builder; the callback form of defineRoutes gets the same object. */
export const Route = {
  get: (path, controller) => new RouteDefinition('GET', path, controller),
}

/** A route file: a list of routes, or a function that returns one. */
export function defineRoutes(definition) {
  return definition
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Laravel 11's fluent bootstrap. */
export const Application = {
  configure() {
    let routing = {}
    let providers = []
    const builder = {
      withConfig(files) {
        configFiles = files
        return builder
      },
      withProviders(list) {
        providers = list
        return builder
      },
      withRouting(settings) {
        routing = settings
        return builder
      },
      withMiddleware(configure) {
        configure?.({})
        return builder
      },
      withExceptions(configure) {
        configure?.({})
        return builder
      },
      create() {
        return createApplication(routing, providers)
      },
    }
    return builder
  },
}

function routesOf(definition) {
  if (definition === undefined) return []
  return typeof definition === 'function' ? definition(Route) : definition
}

function createApplication(routing, providers) {
  const table = new Map()
  const add = (prefix, route) => {
    const path = route.path === '/' && prefix !== '' ? prefix : `${prefix}${route.path}`
    table.set(`${route.method} ${path}`, route.controller)
  }
  for (const route of routesOf(routing.web)) add('', route)
  for (const route of routesOf(routing.api)) add('/api', route)
  const instances = providers.map((Provider) => new Provider())
  let booted = false
  const app = {
    async boot() {
      if (booted) return
      for (const provider of instances) provider.register(app)
      for (const provider of instances) provider.boot(app)
      booted = true
    },
    /** A web Request in, a web Response out (HEAD is answered like GET, without a body). */
    async handle(request) {
      await app.boot()
      const { pathname } = new URL(request.url)
      const method = request.method === 'HEAD' ? 'GET' : request.method
      // The built-in health route (decision #45): JSON for GET and HEAD.
      if (routing.health !== undefined && method === 'GET' && pathname === routing.health)
        return json({ status: 'ok' })
      const Controller = table.get(`${method} ${pathname}`)
      if (Controller === undefined)
        return new Response(JSON.stringify({ title: 'Not Found', status: 404 }), {
          status: 404,
          headers: { 'content-type': 'application/problem+json' },
        })
      const ctx = {
        request,
        json,
        html: (text, status = 200) =>
          new Response(text, { status, headers: { 'content-type': 'text/html; charset=utf-8' } }),
      }
      return new Controller().__invoke(ctx)
    },
    async shutdown() {},
  }
  return app
}
