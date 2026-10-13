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

## 3. Auth.js v5, although it is still labelled beta

- **Date:** 14 Oct 2026
- **Decision:** Use `next-auth@5.0.0-beta.32` (Credentials provider, JWT
  session in an encrypted HTTP-only cookie) for sign-in.
- **Reason:** Authentication is security-sensitive and is not the business
  problem, so a maintained library handles cookie encryption, CSRF protection
  and session expiry. v5 is the line built for the App Router, declares support
  for Next.js 16, and was last released in July 2026. The stable v4 predates
  the Server Component and Server Action patterns this application uses.
  Application code only depends on three helpers (`getCurrentUser`,
  `requireUser`, `requireAdmin`), and services take the acting user as a
  parameter, so the library can be replaced by changing two files.
- **Alternative considered:** A hand-written signed session cookie using
  `jose`. Kept as the fallback had Auth.js not worked within a two-hour
  timebox; not needed. Rejected as the first choice because hand-rolled
  session handling is easy to get subtly wrong.
