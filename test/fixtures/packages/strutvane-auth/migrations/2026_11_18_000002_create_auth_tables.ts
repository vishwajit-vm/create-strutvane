import { migration } from '@strutvane/framework/schema'

// TEST STAND-IN for @strutvane/auth's migration of the same name (create-strutvane's tests only):
// the one table createFirstAdmin() writes, global roles per account.
export default migration({
  up(schema) {
    schema.create('user_roles', (t) => {
      t.id()
      t.foreignId('user_id').constrained('users').cascadeOnDelete()
      t.string('role', 64)
    })
  },
  down(schema) {
    schema.dropIfExists('user_roles')
  },
})
