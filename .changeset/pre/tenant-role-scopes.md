---
"create-strutvane": patch
---

Generated apps get a role map in `config/auth.ts` that matches `@strutvane/auth` 0.2.0-next.2: every role states its `scope`, `admin` stays a platform role (`scope: 'global'`), and with teams on the team creator's reserved `owner` role and the other starting roles are team roles (`scope: 'tenant'`). Without teams every starting role is a platform role and there is no `owner`. The map also lists the records no wildcard may reach (`wildcardExclude`, hub docs/07 §4.4), `newModelDefaults` and an empty `defaultRoles`. Generated apps now depend on `@strutvane/auth` `^0.2.0-next.2`; `config/permissions.ts` only records the starting-roles answer and points to the role map.
