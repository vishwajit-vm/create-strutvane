// TEST STAND-IN for @strutvane/framework/schema (create-strutvane's tests only): the only import a
// migration may use. `export default migration({ up(schema) {...}, down(schema) {...} })`.
export function migration(definition) {
  return definition
}
