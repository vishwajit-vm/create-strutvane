---
"create-strutvane": patch
---

Docker-mode apps now reach their database: the generated `.env` sets `DB_SSLMODE=disable` for the `db` container, which serves no TLS on the private compose network (before, `migrate` failed in every new Docker-mode app). The opt-in production image now starts the framework's `strutvane` command directly as PID 1, so `docker stop` shuts the app down gracefully instead of killing it after the grace period.
