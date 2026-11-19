import { migration } from '@strutvane/framework/schema'

// TEST STAND-IN for @strutvane/auth's migration of the same name (create-strutvane's tests only).
// The real one adds the sign-in columns auth needs to the app's users table; the framework
// stand-in's schema builder cannot alter tables, and the stand-in auth uses only columns the
// skeleton's users table already has, so this one changes nothing.
export default migration({
  up() {},
  down() {},
})
