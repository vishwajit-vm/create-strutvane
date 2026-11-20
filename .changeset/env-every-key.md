---
'create-strutvane': minor
---

Every key the framework reads in a new app's `.env` and `.env.example` (decision #132): app, database (with the extra `DB_MYSQL_*`, `DB_PGSQL_*` and `DB_SQLITE_*` connections), logging, cache, session, queue, mail, files/S3, broadcast, and `REDIS_*` (commented: needs `@strutvane/redis`), grouped with a comment each, server-free values filled in (`REDIS_HOST=127.0.0.1`, `REDIS_PORT=6379`), secrets empty in the example and generated only into `.env`. The vendored skeleton is refreshed for this. The SQLite fallback and "use my own server" recovery no longer comment out keys the framework reads: they get the new mode's neutral value (`DB_HOST=127.0.0.1`, an empty `DB_PASSWORD`, `MAIL_HOST=127.0.0.1`); only Docker-only keys are commented out.
