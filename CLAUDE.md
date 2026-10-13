# CLAUDE.md

## Project

Resource Reservation Management System: an internship assessment for PrimeWave Lab (deadline Thu 15 Oct 2026, 23:59 UTC+05:30). One organization shares rooms, equipment and vehicles; members browse availability and book time slots, admins manage resources and oversee reservations. The core of the product is that two confirmed reservations of the same resource can never overlap, guaranteed by PostgreSQL itself. Scope is deliberately small; reliability and maintainability beat features.

Read these instead of guessing. They are the source of truth; do not copy them here.

- [docs/project-scope.md](docs/project-scope.md): what is built and why. Stories (M1-M11, S1-S5, C1-C4), business rules (BR1-BR26), edge cases, out of scope.
- [docs/project-plan.md](docs/project-plan.md): how and in what order. Stack, architecture, data model, transactions, error mapping, tests, phases.
- `docs/decisions.md`: decision log (create it with the first entry).

## Stack

Next.js (App Router) + TypeScript strict, PostgreSQL 17 (Docker Compose, host port 5433), Drizzle ORM + drizzle-kit + `pg`, Auth.js v5 (Credentials, JWT session), bcryptjs, Zod, Tailwind + shadcn/ui + sonner, date-fns + date-fns-tz, Vitest, tsx, ESLint + Prettier. Reasons and rejected alternatives: plan section 1.

## Commands

Scripts are added in Phases 0-1. If one is missing from `package.json`, say so; do not improvise a substitute.

| Task | Command |
|---|---|
| Start database | `docker compose up -d` (or `npm run db:up`) |
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Format | `npm run format` |
| Test (all / unit / integration) | `npm test` / `npm run test:unit` / `npm run test:integration` |
| Generate migration | `npm run db:generate` |
| Apply migrations | `npm run db:migrate` |
| Seed | `npm run db:seed` |
| Drop, migrate, seed | `npm run db:reset` |
| Migrate + seed (fresh clone) | `npm run setup` |

Never run `drizzle-kit push`. Integration tests need the database container running and use `reservations_test`, never the dev database.

## Folder structure

```
docs/                 scope, plan, decisions, schema.dbml
drizzle/              SQL migrations (generated + hand-written)
docker/               init-test-db.sql
scripts/seed.ts
src/
  app/                pages and layouts (Server Components); (app)/ = signed-in area, admin/ inside it
  actions/            "use server" files, one per domain; action-state.ts = shared result type
  server/
    db/               client.ts, schema.ts
    auth/             config.ts, session.ts (getCurrentUser, requireUser, requireAdmin)
    services/         ALL business logic and transactions
    errors.ts         DomainError, mapDbError
  domain/             pure rules, no I/O: config.ts, time.ts, reservation-rules.ts
  validation/         Zod schemas for action inputs
  components/         ui/ (shadcn) + feature components
tests/unit/  tests/integration/
```

Dependencies point downwards only: `app`/`actions` -> `server/services` -> `domain` and `server/db`. `domain/` imports nothing from Next.js, Drizzle or Auth.js. Full tree: plan 2.2.

## Code conventions

- **TypeScript strict. No `any`**, no `@ts-ignore`, no non-null `!` to silence errors. Use `unknown` and narrow.
- **Zod at every server boundary**: action inputs, URL `searchParams`/`params`, environment variables. Infer types from schemas; do not hand-write duplicates.
- **Business logic only in `server/services/`** (pure rules in `domain/`). Pages and actions contain no queries and no rules.
- **Server actions are thin adapters**: get current user, parse with Zod, call one service function, `revalidatePath`, return a result.
- **Actions return a typed result, never throw to the client**: `{ ok: true, data }` or `{ ok: false, error }`, where `error` carries the form message, per-field errors and the submitted values (so input survives a failed submit). One shared type in `actions/action-state.ts`.
- **Services** take the actor explicitly (`createReservation(actor, input, now)`), never read cookies or sessions, take `now` as a parameter, and throw `DomainError` with a code. Every service re-checks role and ownership.
- **Auth**: every page calls `requireUser()` or `requireAdmin()` itself; call them before any `try` block (`redirect`/`notFound` throw). No middleware.
- **Errors**: map database errors by SQLSTATE and constraint name in `mapDbError`, never by message text. Never send raw errors or stack traces to the browser.
- **Time**: all conversion and formatting goes through `domain/time.ts` with the timezone passed explicitly. No timezone-dependent `Date` methods, no hardcoded `+05:30`.
- **Config**: timezone, operating hours, slot size, limits live in `domain/config.ts`. No scattered literals.
- **No secrets in code.** Secrets come from `.env` (gitignored); `.env.example` lists every variable with local-only values.
- **Naming**: files `kebab-case.ts`; components `PascalCase`; functions and variables `camelCase`; constants `UPPER_SNAKE_CASE`; actions end in `Action`; DB tables and columns `snake_case`; constraints and indexes named explicitly (`reservations_no_overlap`).
- Server Components by default; Client Components only as interactive leaves. No dead code, no leftover scaffolding.

## Database rules

- **Every schema change goes through a migration** in `drizzle/`. No manual changes to a database, no `push`.
- **Never edit an applied migration.** Fix forward with a new one.
- **`timestamptz` only.** Never `timestamp` without time zone, never dates or times stored as text.
- **Never remove or weaken `reservations_no_overlap`** (the exclusion constraint) or the `btree_gist` extension it needs. This includes its `WHERE (status = 'confirmed')` clause and the `'[)'` range bounds. If a generated migration tries to drop or alter it, stop and tell me.
- Nothing is hard-deleted: resources are deactivated, reservations are cancelled. Foreign keys are `ON DELETE RESTRICT`.
- Lock order is always resource row, then reservation row.

## Review-first workflow (MANDATORY, every code change)

1. **Plan, then stop.** Before touching any file, present a short plan: which files you will create, modify or delete, what changes in each, and why. Then STOP and wait for me to reply "go" (or give changes).
2. **Small steps.** One file, or one small logical unit, per edit. Never batch a whole feature into one big change.
3. **Explain before each edit.** In 1-3 sentences, say what the code does and why, so I can understand it and explain it in an interview.
4. **Ask before running anything that modifies the project**: installing packages, migrations, seeding, deleting files, git commit/push. Explain what the command does first.
5. **If I reject an edit, ask me what to change.** Do not retry a variation on your own.
6. **After a set of edits**, summarize what changed, then run typecheck, lint and tests and show me the results.
7. **Never commit.** Suggest a conventional commit message and let me commit myself.

## Other workflow rules

- Work **one phase** of `docs/project-plan.md` at a time. Restate the phase's tasks before starting.
- After each phase, tick its checkboxes in `project-plan.md` (with my approval, like any other edit).
- **Ask before adding any new dependency**, including dev dependencies and shadcn components not listed in the plan.
- **Do not build anything outside `project-scope.md`.** Suggest it instead and let me decide.
- For a non-obvious technical choice, add a short entry to `docs/decisions.md`: decision, reason, alternative considered.
- If the installed version of a library behaves differently from the plan, follow the installed version's docs and tell me.
- If the plan and this file disagree, ask.

## Definition of done (per feature)

- Every acceptance criterion of the story in `project-scope.md` is met.
- Every relevant business rule is enforced on the server, in the service layer, and cannot be bypassed from the browser.
- Authorization is checked in the page, the action and the service.
- Input is validated with Zod; failures show a readable message and preserve form input.
- Loading, empty and error states exist; destructive actions ask for confirmation.
- Tests are added or updated: unit tests for pure rules, integration tests against real PostgreSQL for service and constraint behaviour.
- `npm run typecheck`, `npm run lint` and `npm test` all pass, and I have seen the output.
- No `any`, no dead code, no secrets, no stray `console.log`.
- Any schema change has a migration, and `docs/schema.dbml` still matches.
- I can explain the change. A conventional commit message has been suggested; I commit.
