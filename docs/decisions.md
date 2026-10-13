# Decisions

Short log of non-obvious technical choices. Newest last.

## 1. Cache Components turned off

- **Date:** 13 Oct 2026
- **Decision:** Remove `cacheComponents: true` and `partialPrefetching: true`
  from `next.config.ts`, which `create-next-app` 16.4 enables by default.
- **Reason:** With Cache Components on, every page is prerendered and any
  per-request data (a database query, the session cookie) must be wrapped in
  `<Suspense>` or explicitly cached, or the build fails. Every signed-in page
  in this app reads the session and the database, and correctness matters more
  than speed at this scale (plan 2.7). Per-request rendering is simpler and
  cannot show stale availability.
- **Alternative considered:** Keep it on and wrap each page's data access in
  `<Suspense>`. Rejected: more structure on every page for a performance gain
  the app does not need.

## 2. Tests reach the test database through `DATABASE_URL`

- **Date:** 13 Oct 2026
- **Decision:** `vitest.config.mts` sets `DATABASE_URL` to the value of
  `DATABASE_URL_TEST` for test code, so the one shared client in
  `src/server/db/client.ts` connects to `reservations_test`. As a second
  safeguard, the test helper that truncates tables first checks that the
  connected database's name ends in `_test`.
- **Reason:** Application code needs no knowledge of tests, and integration
  tests exercise the exact client and migrations the app uses.
- **Alternative considered:** Pass a database handle into every service
  function. Rejected: extra plumbing through every call for no gain at this
  size.
