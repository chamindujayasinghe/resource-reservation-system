# Project Plan: Resource Reservation Management System

Companion to [project-scope.md](./project-scope.md). The scope says *what* is built and why; this document says *how* and *in what order*. Story IDs (M1, S1, ...) and rule IDs (BR1, ...) refer to the scope.

| | |
|---|---|
| **Deadline** | Thursday 15 Oct 2026, 11:59 PM (UTC+05:30) |
| **Plan date** | Tuesday 13 Oct 2026 |
| **Planned effort** | 20.5 hours of tasks inside an assumed 22 to 23 hour budget |
| **Target submission** | Thursday 21:00, three hours before the form closes |

---

## 0. Decisions flagged for you

These are the places where I was not sure, or where the choice depends on something only you know. Each has a recommendation so the plan is usable as written, but please confirm or overrule before Phase 0.

| # | Decision | My recommendation | Why it is flagged |
|---|---|---|---|
| F1 | **ORM: Drizzle or Prisma** | Drizzle | The brief says you must be able to explain your implementation. If you know Prisma well and have never used Drizzle, Prisma is the safer choice for *you*, even though Drizzle fits this schema better (section 1). |
| F2 | **Auth library** | Auth.js (NextAuth v5), Credentials provider, JWT sessions | I could not verify its current release and maintenance status from here. Check when installing. The plan timeboxes auth to 2 hours with a defined fallback (section 9, R1). |
| F3 | **Next.js version** | Whatever `create-next-app@latest` installs | Recent majors changed things this plan touches: `params` and `searchParams` are Promises, and Next 16 renamed `middleware.ts` to `proxy.ts`. The plan avoids middleware entirely so the rename does not matter, but follow the installed version's docs over this document. |
| F4 | **Working hours available** | Tue about 5 h, Wed about 9 h, Thu about 9 h | You said "about 2.5 days". I converted that into hours myself. If Tuesday is already mostly gone, apply the cut list in section 7 immediately rather than on Thursday. |
| F5 | **Is Docker Desktop installed and working?** | Use it | The local setup assumes it. If not, install it tonight or use a local PostgreSQL install; do not discover this on Wednesday. |
| F6 | **Commit `docs/assessment-brief.pdf` to the repo?** | No, add it to `.gitignore` | It is PrimeWave's document and the repo will probably be public. Your call. |
| F7 | **Public or private GitHub repo** | Public | The brief only says the review team must be able to access it. Public is the simplest way to guarantee that. |
| F8 | **Schedule UI** | Hand-built list of 30-minute rows for one day | A calendar library (FullCalendar and similar) looks better but costs hours of styling and timezone configuration. Flagged because it is the most visible screen in the demo. |

---

## 1. Tech stack

Fixed by the brief: **Next.js (App Router), TypeScript, PostgreSQL, Git and GitHub.**

| Concern | Choice | Why | Main alternative rejected |
|---|---|---|---|
| ORM | **Drizzle ORM** with `drizzle-kit` and the `pg` driver | Migrations are plain SQL files, so the exclusion constraint sits in a hand-written migration without fighting the tool, and PostgreSQL error codes are reachable for mapping to UI messages. | **Prisma**: better known, but it cannot declare exclusion constraints either, needs `Unsupported` types or raw SQL around them, and hides raw database error codes behind its own error classes. |
| Auth | **Auth.js (NextAuth v5)**, Credentials provider, JWT session cookie | Matches the confirmed decision (email and password, seeded users) and needs no extra tables, so the ER diagram stays at three entities. | **Better Auth**: good email and password support, but adds session, account and verification tables that do nothing for this problem. |
| Password hashing | **bcryptjs** | Pure JavaScript, so no native build step on Windows or on the reviewer's machine. | **argon2**: stronger, but a native module is an avoidable setup risk. |
| UI | **Tailwind CSS + shadcn/ui** (with `sonner` for toasts) | Accessible components (dialog, select, table, form fields) copied into the repo as plain code you own and can explain. | **MUI / Mantine**: heavier runtime libraries with their own styling systems and more client-side JavaScript. |
| Forms | **Native `<form>` + Server Actions + `useActionState`** | Works with the framework, very little client code, and server validation is the single source of truth. | **React Hook Form**: excellent, but duplicates validation on the client for forms that have five fields. |
| Validation | **Zod** | One schema validates the action input and produces the TypeScript type; field errors map directly onto the form. | **Valibot**: smaller bundle, but less familiar and no practical gain here. |
| Dates and timezone | **date-fns + date-fns-tz** | Explicit conversion between "wall-clock time in Asia/Colombo" and UTC instants, independent of server or browser timezone. | **Luxon**: equally capable; date-fns is the smaller, more common dependency. Hardcoding `+05:30` was also rejected. |
| Testing | **Vitest**, integration tests against a real PostgreSQL test database | Fast, TypeScript-native, and the thing being tested (the constraint) only exists in real PostgreSQL. | **Jest** (more configuration for ESM and TypeScript) and **mocked DB tests** (cannot prove the overlap guarantee at all). |
| End-to-end tests | **None** (manual checklist instead) | Not enough time to do them well. | **Playwright**: listed in "what I would do next". |
| Script runner | **tsx** | Runs the TypeScript seed script directly. | `ts-node`: slower and more configuration. |
| Lint and format | **ESLint** (Next.js config) + **Prettier** | Scope criterion 8.5. | Biome: fine, but the Next.js default is ESLint. |
| Database runtime | **PostgreSQL 17 in Docker Compose** | Same database for every developer with one command. | Hosted PostgreSQL (Neon, Supabase): the reviewer would need an account or your credentials. |

---

## 2. Architecture

### 2.1 Layers

```
Browser
  │  forms / links
  ▼
app/  (pages, layouts)            ← Server Components: read data, render
actions/                          ← Server Actions: thin adapters for mutations
  │  call with (actor, input)
  ▼
server/services/                  ← ALL business logic and transactions
  │  uses                │ uses
  ▼                      ▼
domain/ (pure rules)   server/db/ (Drizzle schema + client)
                         │
                         ▼
                      PostgreSQL (constraints = last line of defence)
```

Dependencies only point downwards. `domain/` imports nothing from Next.js, Drizzle or Auth.js, which is what makes it unit-testable without a database.

### 2.2 Folder structure

```
resource-reservation-system/
├─ docs/
│  ├─ project-scope.md
│  ├─ project-plan.md
│  └─ schema.dbml                  # source for the ER diagram
├─ drizzle/                        # generated + hand-written SQL migrations
├─ docker/
│  └─ init-test-db.sql             # creates the test database on first start
├─ scripts/
│  └─ seed.ts
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx                # root layout, toaster
│  │  ├─ page.tsx                  # redirects to /resources
│  │  ├─ error.tsx  not-found.tsx
│  │  ├─ login/page.tsx
│  │  ├─ (app)/                    # signed-in area, shared nav shell
│  │  │  ├─ layout.tsx
│  │  │  ├─ resources/page.tsx
│  │  │  ├─ resources/[id]/page.tsx
│  │  │  ├─ reservations/page.tsx
│  │  │  ├─ reservations/[id]/edit/page.tsx
│  │  │  └─ admin/
│  │  │     ├─ resources/page.tsx
│  │  │     ├─ resources/new/page.tsx
│  │  │     ├─ resources/[id]/edit/page.tsx
│  │  │     └─ reservations/page.tsx
│  │  └─ api/auth/[...nextauth]/route.ts
│  ├─ actions/                     # "use server" files, one per domain
│  │  ├─ auth.ts
│  │  ├─ reservations.ts
│  │  ├─ resources.ts
│  │  └─ action-state.ts           # shared ActionState type + error-to-state helper
│  ├─ server/                      # server-only code
│  │  ├─ db/client.ts  db/schema.ts
│  │  ├─ auth/config.ts            # Auth.js setup
│  │  ├─ auth/session.ts           # getCurrentUser, requireUser, requireAdmin
│  │  ├─ services/reservations.ts
│  │  ├─ services/resources.ts
│  │  └─ errors.ts                 # DomainError, PostgreSQL error mapping
│  ├─ domain/                      # pure, no I/O
│  │  ├─ config.ts                 # timezone, hours, slot size, limits
│  │  ├─ time.ts                   # Colombo wall time <-> UTC, slot helpers
│  │  └─ reservation-rules.ts      # BR1-BR7, BR16, BR20
│  ├─ validation/                  # Zod schemas for action inputs
│  └─ components/
│     ├─ ui/                       # shadcn components
│     └─ ...                       # feature components (forms, schedule, dialogs)
├─ tests/
│  ├─ unit/
│  └─ integration/
├─ docker-compose.yml
├─ .env.example
└─ README.md
```

### 2.3 Server Components, Server Actions, Route Handlers

| Mechanism | Used for | Rule |
|---|---|---|
| **Server Components** (default) | Every page and every read. Pages call service query functions directly. Filters, search and the selected date live in the URL (`searchParams`), so views are linkable and the back button works. | Never fetch your own API from a Server Component. No data fetching in Client Components. |
| **Client Components** | Only where interactivity needs it: forms using `useActionState`, confirmation dialogs, the date picker, toasts. | Keep them as leaves; pass data in as props. |
| **Server Actions** | Every mutation: sign in, sign out, create, edit, cancel, deactivate, reactivate. | An action does exactly five things: get the current user, parse input with Zod, call one service function, revalidate the affected paths, return an `ActionState`. No queries and no business rules. |
| **Route Handlers** | Only `api/auth/[...nextauth]`, which Auth.js requires. | No REST API is built, because there is no client other than this app. Stated in the README as a deliberate omission. |
| **Middleware / proxy** | Not used. | Authorization is checked where data is accessed, not at the edge (2.5). |

### 2.4 Service layer

All business logic lives in `server/services/`. The conventions:

- **Every function takes the acting user explicitly**: `createReservation(actor, input, now)`. Services never read cookies or sessions. This keeps authorization next to the logic it protects and lets tests call services directly without mocking Auth.js.
- **`now` is a parameter** (defaulting to the server clock). Rules about "the past" and "not yet started" are then testable with fixed times.
- **Services throw a typed `DomainError`** with a code (`SLOT_TAKEN`, `RESOURCE_INACTIVE`, `FORBIDDEN`, `NOT_FOUND`, `ALREADY_CANCELLED`, `ALREADY_STARTED`, `VALIDATION`), a user-facing message and an optional field name. Throwing inside a transaction rolls it back automatically.
- **Create and edit share one validation function** in `domain/reservation-rules.ts`, so each rule is written once (scope criterion 8.4).
- **Read functions** (list resources, day schedule, my reservations, all reservations) also live in services and also take the actor, so "members cannot see inactive resources" is enforced in one place.

### 2.5 Authentication and authorization

- `server/auth/session.ts` exposes `getCurrentUser()`, `requireUser()` (redirects to `/login`) and `requireAdmin()` (returns the not-found page for members, so admin URLs are not confirmed to exist).
- **Every page** calls `requireUser()` or `requireAdmin()` itself. Layout-only checks are not sufficient because layouts do not re-run on client-side navigation.
- **Every action** calls `requireUser()` and passes the user to the service; **every service** checks role and ownership again. A server action is a public HTTP endpoint, so hiding a button is never the protection.
- The session carries `id`, `name` and `role`. Roles cannot change in this app, so a stale role in the token is not a concern.

### 2.6 Time handling

- The database stores `timestamptz` (UTC instants). Nothing else stores or compares times.
- Forms submit a date (`YYYY-MM-DD`) and start and end as `HH:mm`, chosen from dropdowns of valid 30-minute slots. The server interprets them as Asia/Colombo wall-clock time and converts to UTC in `domain/time.ts`.
- All display formatting passes the organization timezone explicitly. Nothing calls timezone-dependent `Date` methods, so the result is the same on any server and any browser, and there are no hydration mismatches.
- Timezone, operating hours, slot size, duration limits and the advance window are named constants in `domain/config.ts`.

### 2.7 Caching

All signed-in pages read the session cookie, so they render per request. After each mutation the action calls `revalidatePath` for the affected routes. No additional caching is added; correctness matters more than speed at this scale.

---

## 3. Data model

### 3.1 Entities

Three tables. All primary keys are UUIDs generated by PostgreSQL (`gen_random_uuid()`), so IDs in URLs are not guessable sequences. All times are `timestamptz`.

**users**

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default `gen_random_uuid()` |
| name | text | not null |
| email | text | not null, unique, stored lowercase (check `email = lower(email)`) |
| password_hash | text | not null |
| role | `user_role` enum: `admin`, `member` | not null, default `member` |
| created_at | timestamptz | not null, default `now()` |

**resources**

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| name | text | not null, 1 to 100 characters, unique on `lower(name)` (BR13) |
| type | `resource_type` enum: `room`, `equipment`, `vehicle`, `other` | not null |
| location | text | not null |
| capacity | integer | nullable, check `capacity > 0` (BR14) |
| description | text | nullable |
| is_active | boolean | not null, default `true` |
| created_at, updated_at | timestamptz | not null, default `now()` |

**reservations**

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| resource_id | uuid | not null, FK to `resources.id`, on delete **restrict** (BR17) |
| user_id | uuid | not null, FK to `users.id`, on delete **restrict** (BR19) |
| title | text | not null, check length 3 to 100 (BR20) |
| attendee_count | integer | nullable, check `> 0` (S2) |
| start_at | timestamptz | not null |
| end_at | timestamptz | not null, check `end_at > start_at` (BR1) |
| status | `reservation_status` enum: `confirmed`, `cancelled` | not null, default `confirmed` |
| cancelled_at | timestamptz | nullable |
| cancelled_by | uuid | nullable, FK to `users.id`, on delete restrict |
| cancellation_reason | text | nullable |
| created_at, updated_at | timestamptz | not null, default `now()` |

Additional constraints on `reservations`:

- **Cancellation consistency (check):** `cancelled_at` and `cancelled_by` are both set when status is `cancelled` and both null when it is `confirmed` (BR26).
- **No overlap (exclusion constraint), BR8 to BR10:** described in 3.3.

### 3.2 Relationships and indexes

- A user **has many** reservations (as owner). A user **has many** reservations they cancelled (`cancelled_by`).
- A resource **has many** reservations.
- A reservation **belongs to** exactly one resource and exactly one owner.

| Index | Serves |
|---|---|
| `users(email)` unique | Sign in |
| `resources(lower(name))` unique | BR13, name search |
| GiST index created by the exclusion constraint (partial: confirmed only) | The overlap guarantee, and "what is booked on this resource in this range" queries |
| `reservations(resource_id, start_at)` | Day schedule and admin filter by resource, including cancelled rows |
| `reservations(user_id, start_at)` | My reservations |
| `reservations(start_at)` | Admin list filtered by date range |

### 3.3 Preventing overlaps in the database

The migration enables the `btree_gist` extension and adds this constraint:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (status = 'confirmed');
```

Read it as: *no two rows may exist where the resource is equal **and** the time ranges overlap, counting only confirmed rows.*

- `tstzrange(start_at, end_at, '[)')` builds a range that includes the start and excludes the end, so 09:00 to 10:00 and 10:00 to 11:00 do not overlap (BR9).
- `&&` is the range "overlaps" operator. It catches every kind of overlap: partial, containing, contained and identical.
- `WHERE (status = 'confirmed')` makes cancelled reservations invisible to the rule, so cancelling frees the slot (BR10).
- `btree_gist` is needed because a GiST index does not know how to compare a plain `uuid` for equality on its own; the extension adds that.
- `start_at` and `end_at` stay ordinary columns. The range exists only inside the constraint, so the ORM never has to understand a range type.

**Why the database and not just an application check.** The obvious application approach is "query for overlapping reservations; if none, insert". Under concurrency that is a race: two requests both run the query before either has committed, both see no conflict, and both insert. Neither can see the other's uncommitted row, so no amount of care in the query fixes it. The alternatives all depend on every code path remembering to do something: taking a lock, or using serializable transactions with retry logic. The exclusion constraint is different in kind: PostgreSQL itself refuses the second row, for every writer, including the seed script, a future feature, or someone using `psql`. An ordinary unique index cannot do this because it only compares equal values, not overlapping ranges.

**The application still checks first, for the user's benefit.** Inside a transaction the service locks the resource row (`SELECT ... FOR UPDATE`), confirms it is active, and looks for a conflicting reservation so it can say *"This overlaps an existing reservation from 10:00 to 11:00"*. The lock makes bookings for one resource queue up briefly, so in normal operation the friendly check catches conflicts. The constraint is the guarantee underneath: if the lock is ever forgotten or bypassed, the data is still correct. Both layers are tested separately (section 6).

**What deliberately stays out of the database.** Operating hours, 30-minute alignment, duration limits and the 60-day window (BR3 to BR7) are configuration. Putting them in check constraints would mean a migration every time the organization changes its hours, and would make historic rows invalid. "Not in the past" (BR2) cannot be a check constraint at all, because it would fail on later updates such as cancelling.

### 3.4 Transaction design

| Operation | Steps inside one transaction |
|---|---|
| **Create reservation** | Validate pure rules → lock resource row → check active → check attendee count against capacity → look for conflict (friendly message) → insert. Constraint violation is caught *outside* the transaction and mapped. |
| **Edit reservation** | Read reservation to get its resource → lock resource row → lock reservation row → check owner, confirmed, not started → validate new values → conflict check excluding itself → update. A failed edit rolls back, leaving the original untouched. |
| **Cancel reservation** | One conditional update: set cancelled *where* id matches, status is confirmed and start is in the future. If no row was updated, read it to explain why (already cancelled, already started, not found). Idempotent under double submission. |
| **Deactivate resource** | Lock resource row → set inactive → cancel all confirmed reservations starting in the future with reason "Resource deactivated" → return the number cancelled. |

Lock order is always **resource, then reservation**, so two operations can never wait on each other in a cycle. Because booking and deactivation both lock the resource row, a booking can never land on a resource that is being deactivated (scope section 7).

### 3.5 DBML for the ER diagram

Paste into [dbdiagram.io](https://dbdiagram.io). Also save it as `docs/schema.dbml`. DBML cannot express exclusion or check constraints, so they are recorded as notes, which dbdiagram shows on hover.

```dbml
Project resource_reservation_system {
  database_type: 'PostgreSQL'
  Note: 'Resource Reservation Management System. All timestamps are timestamptz (stored in UTC, displayed in Asia/Colombo).'
}

Enum user_role {
  admin
  member
}

Enum resource_type {
  room
  equipment
  vehicle
  other
}

Enum reservation_status {
  confirmed
  cancelled
}

Table users {
  id uuid [pk, default: `gen_random_uuid()`]
  name text [not null]
  email text [not null, unique, note: 'Stored lowercase. CHECK (email = lower(email))']
  password_hash text [not null, note: 'bcrypt hash, never plain text']
  role user_role [not null, default: 'member']
  created_at timestamptz [not null, default: `now()`]

  Note: 'Seeded accounts only. No self-registration.'
}

Table resources {
  id uuid [pk, default: `gen_random_uuid()`]
  name text [not null, note: 'Unique ignoring case']
  type resource_type [not null]
  location text [not null]
  capacity integer [note: 'Optional. CHECK (capacity > 0). Descriptive only: one reservation always holds the whole resource']
  description text
  is_active boolean [not null, default: true, note: 'Inactive resources are hidden from members and cannot be booked']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (`lower(name)`) [unique, name: 'resources_name_unique']
  }

  Note: 'Never hard-deleted, only deactivated, so reservation history is preserved.'
}

Table reservations {
  id uuid [pk, default: `gen_random_uuid()`]
  resource_id uuid [not null]
  user_id uuid [not null, note: 'Owner: the user who created the reservation']
  title text [not null, note: 'CHECK (char_length(title) BETWEEN 3 AND 100)']
  attendee_count integer [note: 'Optional. CHECK (attendee_count > 0)']
  start_at timestamptz [not null]
  end_at timestamptz [not null, note: 'CHECK (end_at > start_at)']
  status reservation_status [not null, default: 'confirmed']
  cancelled_at timestamptz
  cancelled_by uuid
  cancellation_reason text
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (resource_id, start_at) [name: 'reservations_resource_start_idx']
    (user_id, start_at) [name: 'reservations_user_start_idx']
    start_at [name: 'reservations_start_idx']
  }

  Note: '''
  NO DOUBLE BOOKING (exclusion constraint, requires btree_gist):
  EXCLUDE USING gist (resource_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
  WHERE (status = 'confirmed')

  Two confirmed reservations for the same resource can never overlap.
  Ranges are half-open, so back-to-back reservations are allowed.
  Cancelled reservations do not block a slot.

  CHECK: cancelled_at and cancelled_by are set if and only if status = 'cancelled'.
  Reservations are never deleted, only cancelled.
  '''
}

Ref reservations_resource_fk: reservations.resource_id > resources.id [delete: restrict]
Ref reservations_owner_fk: reservations.user_id > users.id [delete: restrict]
Ref reservations_cancelled_by_fk: reservations.cancelled_by > users.id [delete: restrict]
```

---

## 4. Pages, routes and server actions

### 4.1 Pages

| Route | Access | Purpose | Stories |
|---|---|---|---|
| `/login` | Public (signed-in users are redirected to `/resources`) | Email and password form | M1 |
| `/` | Signed in | Redirects to `/resources` | |
| `/resources` | Member, Admin | Active resources as cards; `?type=` filter and `?q=` name search | M5 |
| `/resources/[id]` | Member, Admin | Resource details, day schedule (`?date=YYYY-MM-DD`, default today) with previous and next day, and the booking form. Members get not-found for an inactive resource; admins see it with an "inactive" banner and no booking form. | M5, M6, M7 |
| `/reservations` | Member, Admin | Own reservations in three groups: upcoming, past, cancelled. Edit and cancel buttons on upcoming ones. | M8, M9 |
| `/reservations/[id]/edit` | Owner only (others get not-found) | Edit date, time, title, attendee count | S1 |
| `/admin/resources` | Admin | Table of all resources including inactive, with upcoming-reservation counts; deactivate and reactivate | M3, M4 |
| `/admin/resources/new` | Admin | Create resource | M3 |
| `/admin/resources/[id]/edit` | Admin | Edit resource | M3 |
| `/admin/reservations` | Admin | All reservations; filters for resource, status and date range; cancel with reason | M10 |
| `/api/auth/[...nextauth]` | Public | Auth.js route handler | M1 |

Navigation: *Resources* and *My reservations* for everyone; an *Admin* group (Resources, All reservations) for admins only. The header shows the signed-in user's name and role and a sign-out button.

### 4.2 Server actions (mutations)

| Action | Access | Service call | Notes |
|---|---|---|---|
| `signInAction` | Public | Auth.js `signIn` | One generic error for any failure |
| `signOutAction` | Signed in | Auth.js `signOut` | |
| `createReservationAction` | Member, Admin | `createReservation` | Owner is always the signed-in user, never taken from the form |
| `updateReservationAction` | Owner | `updateReservation` | S1. Resource cannot be changed |
| `cancelReservationAction` | Owner, or Admin for any | `cancelReservation` | Reason required when an admin cancels someone else's (BR23) |
| `createResourceAction` | Admin | `createResource` | |
| `updateResourceAction` | Admin | `updateResource` | Does not change active state |
| `deactivateResourceAction` | Admin | `deactivateResource` | Returns how many reservations were cancelled, shown in the toast |
| `reactivateResourceAction` | Admin | `reactivateResource` | |

### 4.3 Service queries (reads, called from Server Components)

| Function | Access | Returns |
|---|---|---|
| `listResources(actor, { type, q, includeInactive })` | All; `includeInactive` honoured for admins only | Resources |
| `getResource(actor, id)` | All; inactive visible to admins only | One resource or not-found |
| `getDaySchedule(actor, resourceId, date)` | All | Confirmed reservations for that Colombo calendar day with owner name and title |
| `listMyReservations(actor)` | All | Own reservations with resource name |
| `getReservationForEdit(actor, id)` | Owner | Reservation or not-found |
| `listAllReservations(actor, filters)` | Admin | Reservations with resource and owner, limited to 100 rows per query with a date-range default of the next 30 days |
| `countUpcomingReservations(actor, resourceId)` | Admin | Number shown in the deactivation dialog |

---

## 5. Validation and error handling

### 5.1 Five layers, each with one job

| Layer | Where | Job | Trusted? |
|---|---|---|---|
| 1. Browser | `required`, `min`, dropdowns that only offer valid slots | Convenience and speed | No |
| 2. Shape | Zod schema in the action | Types, formats, lengths; produces field errors | Yes |
| 3. Business rules | `domain/reservation-rules.ts`, called by the service | BR1 to BR7, BR16, BR20 against server time | Yes |
| 4. State | Service, inside the transaction | Resource active, ownership, still confirmed, not started, conflict lookup | Yes |
| 5. Database | Constraints | Guarantees that hold even if layers 2 to 4 have a bug or a race | Final authority |

### 5.2 One result shape for every action

Every action returns the same `ActionState`: a status (`idle`, `success`, `error`), an optional form-level message, optional per-field errors, and the submitted values. The form component renders field errors under inputs and the form-level message in an alert above the submit button; success triggers a toast.

Two details that are easy to get wrong:

- **Preserving input.** React resets uncontrolled form fields after an action runs. To meet the "input is preserved" criterion (M6), the action returns the submitted values and the form uses them as default values.
- **Redirects inside try/catch.** `redirect()` and `notFound()` work by throwing. Auth checks run *before* the `try` block, and the catch re-throws anything that is not a `DomainError` or a recognized database error.

### 5.3 From database error to friendly message

One function, `mapDbError` in `server/errors.ts`, translates PostgreSQL errors into `DomainError`s. It identifies errors by **SQLSTATE code and constraint name**, never by matching message text. The ORM may wrap the driver error, so the function walks the error's `cause` chain to find the PostgreSQL error (to be verified with a test in Phase 1).

| PostgreSQL error | Constraint | Becomes | Shown to the user |
|---|---|---|---|
| `23P01` exclusion violation | `reservations_no_overlap` | `SLOT_TAKEN` | Form alert: "That time slot was just taken by someone else. Please choose another time." The schedule behind it is revalidated. |
| `23505` unique violation | `resources_name_unique` | `VALIDATION` on field `name` | Under the name field: "A resource with this name already exists." |
| `40P01` deadlock, `40001` serialization failure | (any) | Retried once; if it fails again, `SLOT_TAKEN` on reservation writes | Same slot-taken message |
| `23514` check, `23503` foreign key, `23502` not null | (any) | Not mapped | These mean an application bug, since earlier layers should have caught them. Logged in full on the server; user sees the generic message. |
| Anything else | | Not mapped | Generic: "Something went wrong. Please try again." Full error logged on the server, never sent to the browser. |

### 5.4 Other failures

| Situation | Behaviour |
|---|---|
| Not signed in (page or action) | Redirect to `/login` |
| Signed in but not allowed (member on an admin route, non-owner on an edit page) | Not-found page |
| Not allowed inside an action (forged request) | `FORBIDDEN` error state; nothing changes |
| Resource or reservation does not exist | Not-found page |
| Unexpected error while rendering a page | `error.tsx` with a retry button; no stack trace |
| Invalid `?date=` or filter values in the URL | Fall back to defaults (today, no filter) rather than erroring |

---

## 6. Testing strategy

Effort goes where a bug would be most damaging: reservation rules and conflicts. UI components are not unit tested.

### 6.1 Unit tests (no database, milliseconds)

Target: `domain/reservation-rules.ts` and `domain/time.ts`, with `now` injected.

| Rule | Cases |
|---|---|
| BR1 | End before start; end equal to start |
| BR2 | Start one minute in the past (reject); start exactly now (accept); start in the future (accept) |
| BR3 | 09:15 start (reject); 09:30 (accept); end off-boundary (reject) |
| BR4, BR5 | 30 minutes (accept); 8 hours (accept); 8.5 hours (reject) |
| BR6 | Starts 06:30 (reject); 07:00 (accept); ends 20:00 (accept); ends 20:30 (reject) |
| BR7 | 60 days ahead (accept); 61 days (reject) |
| BR16 | Attendees above capacity (reject); equal (accept); resource without capacity (accept) |
| BR20 | Title of 2 and 101 characters (reject); whitespace-only (reject) |
| Time conversion | 09:00 on a Colombo date becomes 03:30 UTC; 07:00 Colombo lands on the *same* Colombo calendar day even though the UTC date is the same or earlier; results do not change when the process timezone is set to something else |

### 6.2 Integration tests (real PostgreSQL test database)

**A. The constraint on its own** (raw inserts, bypassing all application code). This proves the database guarantee independently of the service.

- Identical range, same resource: rejected with `23P01`
- Partial overlap, containing range, contained range: rejected
- Back-to-back (end equals next start): accepted
- Same range, different resource: accepted
- Overlapping a **cancelled** reservation: accepted
- Updating a reservation's time into a conflict: rejected, row unchanged
- Cancelling then rebooking the same range: accepted
- **Concurrent:** two separate connections each open a transaction and insert the same range at the same time. Exactly one commits; the other fails with `23P01` (or `40P01`). One confirmed row exists afterwards.

**B. The service under concurrency** (the test named in M7)

- Fire 10 `createReservation` calls for the same resource and slot in parallel, from 10 different users, on a pool with at least 10 connections.
- Assert exactly **1** fulfilled, **9** rejected with `SLOT_TAKEN`, and exactly **1** confirmed row in the table.
- Repeat with 10 partly overlapping ranges; assert that no two confirmed rows overlap.
- Run the test several times in a loop to catch timing-dependent failures.

**C. Service behaviour**

| Area | Cases |
|---|---|
| Create | Happy path; inactive resource refused; unknown resource; owner is the actor regardless of input |
| Edit (S1) | Move into conflict refused and original unchanged; shift within own range allowed; non-owner refused; cancelled or started reservation refused |
| Cancel | Owner cancels and the slot becomes bookable; second cancel returns `ALREADY_CANCELLED` and keeps first details; started reservation refused; member cancelling another's refused; admin without reason refused; admin with reason records who, when, why |
| Deactivate | Upcoming reservations cancelled with reason; past and in-progress untouched; returns correct count; later booking refused; reactivation allows booking and restores nothing |
| Deactivate vs. book race | Run both in parallel many times; afterwards there is never a confirmed future reservation on an inactive resource |
| Authorization | Member calling each admin service function gets `FORBIDDEN` |
| Error mapping | A real `23P01` and a real `23505` from the database map to the expected `DomainError` |

### 6.3 Test infrastructure

- A separate database, `reservations_test`, in the same Docker container, created by an init SQL script. Tests can never touch development data.
- Global setup runs migrations against the test database once. Each test truncates the tables it uses.
- Integration test files run serially (they share one database); unit tests run in parallel.
- Scripts: `test` (everything), `test:unit`, `test:integration`.

### 6.4 Manual checklist before recording

Run on a freshly seeded database: sign in as each role; wrong password; member opens an admin URL; book, see it in schedule and My reservations; book the same slot from a second browser (private window) as another member; edit; cancel; admin cancels with reason and the member sees it; deactivate a resource with bookings; reactivate; resource name duplicate; every empty state; phone-width layout.

---

## 7. Implementation phases

Every phase ends with the app running, tests passing and a commit pushed. Estimates total **20.5 hours**. Tags: **[CUT-n]** marks tasks to drop if behind, in order (drop CUT-1 first). Untagged tasks are not optional.

**Checkpoints.** If a phase overruns by more than 30 minutes, cut the next CUT item straight away instead of hoping to catch up.

| When | Should be finished |
|---|---|
| End of Tuesday 13 Oct | Phases 0 and 1 (and Phase 2 started) |
| Wednesday 14 Oct, lunch | Phase 3 |
| End of Wednesday 14 Oct | Phase 5. Every Must-have feature works. |
| Thursday 15 Oct, 14:00 | **Feature freeze.** Phase 6 done or cut. Only fixes, docs and video after this. |
| Thursday 15 Oct, 21:00 | Submitted |

### Phase 0: Project skeleton (1.5 h)

- [ ] Confirm the flagged decisions in section 0
- [ ] `git init`, `.gitignore` (including `.env` and, per F6, the brief PDF), first commit containing the two docs
- [ ] Create the GitHub repository and push
- [ ] Scaffold Next.js with TypeScript, App Router, Tailwind, ESLint, `src/` directory; enable TypeScript strict mode
- [ ] Add Prettier; add `lint`, `typecheck` and `format` scripts
- [ ] Initialize shadcn/ui; add button, input, label, select, card, table, dialog, badge, alert, sonner
- [ ] `docker-compose.yml`, `docker/init-test-db.sql`, `.env.example`, local `.env`
- [ ] Install Drizzle, `pg`, `drizzle-kit`, `tsx`; create the DB client
- [ ] Home page shows "Database connected" from a trivial query
- [ ] **Done when:** `docker compose up -d` and `npm run dev` show the connected page. Commit: *chore: project skeleton with database connection*

### Phase 1: Schema, constraint, seed (2 h)

This phase de-risks the most important thing in the project first.

- [ ] Write the Drizzle schema for the three tables and enums, with check constraints and indexes
- [ ] Generate the first migration; add a hand-written migration for `btree_gist` and `reservations_no_overlap`
- [ ] `db:migrate` and `db:reset` scripts
- [ ] Install Vitest; test database setup (migrate once, truncate per test)
- [ ] Integration tests, group A (constraint on its own), including the two-connection concurrent test
- [ ] `server/errors.ts`: `DomainError`, `mapDbError`; test that real `23P01` and `23505` errors are recognized through the ORM
- [ ] Seed script (section 8.4)
- [ ] Paste the DBML into dbdiagram.io and check it matches the migration [CUT-6: can move to Phase 7]
- [ ] **Done when:** `npm test` is green and the seeded data is visible in the database. Commit: *feat: schema with database-level overlap prevention and seed data*

### Phase 2: Authentication and roles (2 h, hard timebox)

- [ ] Auth.js configuration: Credentials provider, bcrypt comparison, JWT session with `id` and `role`
- [ ] `getCurrentUser`, `requireUser`, `requireAdmin`
- [ ] Login page and `signInAction` with one generic error; `signOutAction`
- [ ] `(app)` layout: header, role-aware navigation, user name, sign out
- [ ] `/` redirect; signed-in users redirected away from `/login`
- [ ] Placeholder admin page proving that a member gets not-found
- [ ] **Done when:** both seeded roles can sign in and out, and a member cannot open the admin page. Commit: *feat: credentials sign-in with role-based access*
- [ ] **If not working after 2 h:** switch to the fallback in R1

### Phase 3: Resources (2.5 h)

- [ ] Zod schemas for resource input
- [ ] Resource service: `listResources`, `getResource`, `createResource`, `updateResource` with admin checks and name-uniqueness mapping
- [ ] `/resources`: cards, type filter, name search, empty state
- [ ] `/admin/resources`: table including inactive, status badge
- [ ] `/admin/resources/new` and `/admin/resources/[id]/edit` sharing one form component with field errors
- [ ] `action-state.ts`: shared `ActionState` type and error-to-state helper
- [ ] Integration tests: admin-only enforcement, duplicate name
- [ ] **Done when:** an admin can create and edit resources and a member can browse and filter them. Commit: *feat: resource catalogue and admin management*

### Phase 4: Reservations core (4 h)

The heart of the product. Do not start polish before this phase is committed.

- [ ] `domain/config.ts`, `domain/time.ts`, `domain/reservation-rules.ts`
- [ ] Unit tests for all rules (section 6.1)
- [ ] `createReservation` service with the transaction in 3.4 and error mapping
- [ ] Integration tests, group B (10 parallel requests) and create cases from group C
- [ ] `getDaySchedule`; `/resources/[id]` with 30-minute rows, booked blocks showing owner and title, date navigation
- [ ] Booking form: date, start and end dropdowns, title; field errors; preserved input; success toast; schedule refreshes
- [ ] `listMyReservations`; `/reservations` with upcoming, past and cancelled groups
- [ ] `cancelReservation` service (owner path) with confirmation dialog
- [ ] Integration tests: cancel cases
- [ ] Manual check: two browsers, two members, same slot
- [ ] **Done when:** a member can book, see and cancel reservations, and the concurrency test passes. Commit in two or three steps, ending with *feat: reservations with conflict prevention*

### Phase 5: Admin operations (2 h)

- [ ] `listAllReservations` with resource, status and date filters; `/admin/reservations`
- [ ] Admin cancel with required reason; reason shown in the member's list
- [ ] `deactivateResource` (cascade cancel) and `reactivateResource`
- [ ] Deactivation dialog showing the upcoming-reservation count and consequences
- [ ] Inactive handling on `/resources/[id]` (not-found for members, banner for admins)
- [ ] Integration tests: deactivation cases and the deactivate-versus-book race
- [ ] **Done when:** every Must-have story (M1 to M10) passes its acceptance criteria. Commit: *feat: admin reservation oversight and resource deactivation*

### Phase 6: Should-haves and polish (3.5 h)

- [ ] Loading states on submit buttons; toasts on every mutation (S5)
- [ ] `error.tsx`, `not-found.tsx`, and every empty state
- [ ] Phone-width pass on all pages
- [ ] Run the manual checklist (6.4) and fix what it finds
- [ ] Remove dead code and scaffolding; lint, typecheck and tests clean
- [ ] Edit reservation: service, page, tests (S1, 1.5 h) **[CUT-3]**
- [ ] Attendee count field and capacity check (S2, 0.5 h; the column already exists) **[CUT-2]**
- [ ] Any Could-have item (C1 to C4) **[CUT-1: assume none will be built]**
- [ ] Past-day styling and "today" shortcut in the schedule **[CUT-4]**
- [ ] Polish of the admin reservations filters beyond resource and status **[CUT-5]**
- [ ] **Done when:** the app is in the state you will record. Commit: *feat: reservation editing and UX polish*

### Phase 7: Documentation and delivery (3 h)

- [ ] README (section 10.1), about 1 h
- [ ] ER diagram on dbdiagram.io; copy the share link; export an image into `docs/` for the README
- [ ] **Fresh-clone test:** clone into a new folder and follow only the README from zero to a seeded, running app. Fix the README, not your memory.
- [ ] Rehearse the video once with a timer; record; check audio and length (3 to 5 minutes), about 1 h including a retake
- [ ] Upload the video; open the video, repository and ER links in a private window to confirm they are accessible without your login
- [ ] Final commit and push; confirm the default branch on GitHub shows the latest commit
- [ ] Submit the form using the same email address as your internship application (required by the brief)
- [ ] **Done when:** the form confirmation is on screen.

### Cut order summary

| Order | Cut | Saves | Consequence |
|---|---|---|---|
| 1 | All Could-haves | 0 h planned | None; already assumed out |
| 2 | S2 attendee count | 0.5 h | Capacity is display-only; column stays, unused |
| 3 | S1 edit reservation | 1.5 h | Users cancel and rebook; say so in the README |
| 4 | Schedule extras | 0.25 h | Cosmetic |
| 5 | Extra admin filters | 0.25 h | Resource and status filters remain |
| 6 | Early ER diagram check | 0 h | Moved to Phase 7 |

**Never cut:** the exclusion constraint, the concurrency test, server-side authorization, the README, the fresh-clone test.

---

## 8. Local setup

### 8.1 Docker Compose

One service, PostgreSQL 17, with a named volume so data survives restarts and a health check so scripts can wait for it. The host port is **5433**, not 5432, to avoid colliding with a PostgreSQL install already on the developer's machine.

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: reservations
      POSTGRES_PASSWORD: reservations
      POSTGRES_DB: reservations
    ports:
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U reservations -d reservations"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
```

`docker/init-test-db.sql` contains one statement that creates the `reservations_test` database. It is a `.sql` file rather than a shell script so Windows line endings cannot break it. It only runs when the volume is first created.

These credentials are for local development only and are safe to commit; the README says so.

### 8.2 `.env.example`

```dotenv
# PostgreSQL (matches docker-compose.yml)
DATABASE_URL=postgresql://reservations:reservations@localhost:5433/reservations
DATABASE_URL_TEST=postgresql://reservations:reservations@localhost:5433/reservations_test

# Auth.js session secret. Generate one with: npx auth secret
AUTH_SECRET=replace-with-a-long-random-string
```

Environment variables are validated with Zod at startup, so a missing variable fails immediately with a clear message instead of a confusing error later. Business configuration (timezone, hours, limits) is in `src/domain/config.ts`, not in the environment, because it is part of the application's behaviour rather than a deployment secret.

### 8.3 Migrations

- Schema changes go through generated SQL migrations committed to `drizzle/`. The exclusion constraint and extension are in a hand-written migration alongside them.
- `drizzle-kit push` is **never** used: it bypasses migration files and could leave a database without the constraint.
- Scripts: `db:up` (start the container), `db:generate`, `db:migrate`, `db:seed`, `db:reset` (drop everything, migrate, seed), and `setup` (migrate and seed in one step).

**Setup from a fresh clone, as the README will state it:**

1. `cp .env.example .env` and set `AUTH_SECRET`
2. `npm install`
3. `docker compose up -d`
4. `npm run setup`
5. `npm run dev`, then open `http://localhost:3000`

Without Docker: create two empty databases in any PostgreSQL 14 or newer, point the two URLs at them, and continue from step 4. The database user must be allowed to create the `btree_gist` extension (allowed for database owners on PostgreSQL 13 and newer).

### 8.4 Seed data

The seed clears the tables and re-inserts, so it can be run repeatedly. All dates are **relative to the day it runs**, so the demo never looks stale. It refuses to run when `NODE_ENV` is `production`.

**Users** (one shared demo password, printed by the seed and listed in the README)

| Name | Email | Role |
|---|---|---|
| Nimal Perera | admin@example.com | Admin |
| Sanduni Fernando | sanduni@example.com | Member |
| Kasun Silva | kasun@example.com | Member |
| Fathima Rizvi | fathima@example.com | Member |
| Dinesh Kumar | dinesh@example.com | Member |

**Resources**

| Name | Type | Location | Capacity | Active |
|---|---|---|---|---|
| Boardroom | Room | Level 3 | 14 | Yes |
| Meeting Room A | Room | Level 2 | 6 | Yes |
| Meeting Room B | Room | Level 2 | 4 | Yes |
| Training Hall | Room | Ground floor | 40 | Yes |
| Meeting Room C | Room | Level 1 | 8 | **No** (under renovation) |
| Epson Projector 1 | Equipment | IT store, Level 1 | none | Yes |
| Conference Camera Kit | Equipment | IT store, Level 1 | none | Yes |
| Toyota HiAce Van | Vehicle | Basement car park | 10 | Yes |
| Company Car (Toyota Axio) | Vehicle | Basement car park | 4 | Yes |

**Reservations** (about 25)

- **Past week:** a spread of completed reservations, so history and the admin list are not empty.
- **Today:** several on Meeting Room A and the Boardroom, including a **back-to-back pair** (09:00 to 10:00 and 10:00 to 11:00) that shows BR9 at a glance.
- **Next seven days:** realistic titles (Sprint planning, Client demo: Acme, Interview panel, New joiner induction, Site visit to Kandy).
- **Cancelled:** one cancelled by its owner and one cancelled by the admin with a reason, so the reason display is visible immediately.
- **Meeting Room C:** two reservations already cancelled with "Resource deactivated", matching its inactive state.
- One upcoming resource with several reservations left intact, ready for the deactivation demo.

The seed inserts rows directly rather than through the service, because the service correctly refuses reservations in the past. The rows still pass every database constraint, which is itself a small demonstration that the guarantee does not depend on the application.

---

## 9. Risks and mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Auth setup consumes far more than its 2 hours (version or documentation mismatch) | Medium | High | Hard timebox. **Fallback:** a minimal signed, HTTP-only session cookie (using `jose`) with the same `requireUser` and `requireAdmin` helpers. Because services take the actor as a parameter, nothing else changes. |
| R2 | Running out of time with Must-haves incomplete | Medium | High | Phases ordered by importance; every phase ends committable; predefined cut list; feature freeze at Thursday 14:00; checkpoints in section 7. |
| R3 | The ORM's migration tooling does not carry the exclusion constraint, or a later generate tries to remove it | Low | High | Constraint is in a hand-written SQL migration; `push` is banned; group A tests fail loudly if the constraint is ever missing. |
| R4 | The ORM wraps the driver error and the SQLSTATE code is not where expected | Medium | Medium | `mapDbError` walks the `cause` chain; a Phase 1 test asserts mapping against real errors before any feature depends on it. |
| R5 | Timezone bugs (off by 5.5 hours, wrong calendar day near midnight) | Medium | High | All conversion in one module with unit tests; timezone always passed explicitly; tests run with a different process timezone. |
| R6 | Framework behaviour differs from this plan (async `params`, caching defaults, middleware rename) | Medium | Low | Follow the installed version's documentation; the plan uses no middleware and no custom caching. |
| R7 | Deadlocks or lock waits under concurrent writes | Low | Medium | Fixed lock order (resource, then reservation); retry once on `40P01`; the parallel tests run in a loop to expose it. |
| R8 | The concurrency test is flaky | Medium | Medium | Assert on invariants (exactly one confirmed row, no overlapping pairs) rather than on which request wins; adequate pool size; serial integration files. |
| R9 | The reviewer cannot run the project | Low | High | Fresh-clone test in Phase 7; non-Docker path documented; non-default port; no native modules; environment validated at startup. |
| R10 | Docker or port problems on your own Windows machine | Low | Medium | Verify Docker tonight (F5); host port 5433; `.sql` init file instead of a shell script. |
| R11 | Video recording takes much longer than planned | Medium | Medium | Script in section 10.2; one rehearsal; one hour budgeted including a retake; record before the final evening hours. |
| R12 | Being unable to explain AI-assisted code in a follow-up interview | Medium | High | Read and understand every file before committing it; keep the "Key decisions" section of the README in your own words; be able to draw the transaction flow in 3.4 from memory. |
| R13 | Polish expanding to fill Thursday | High | Medium | Feature freeze; polish tasks are an explicit list, not open-ended. |
| R14 | Secrets committed to a public repository | Low | Medium | `.env` ignored from the first commit; only `.env.example` with local-only values is committed. |
| R15 | Late submission due to upload or form problems | Low | Critical | Target 21:00; the form closes at midnight exactly and late submissions are not accepted. |

---

## 10. Outlines

### 10.1 README

1. **Title and one-paragraph summary**: what it is and the problem it solves, in the words of the scope's problem statement
2. **Screenshots**: resource schedule, booking conflict message, admin reservations (two or three images)
3. **Features**: short list grouped by role
4. **Tech stack**: table with one-line reasons
5. **Getting started**
   - Prerequisites (Node version, Docker)
   - The five setup steps from 8.3
   - Setup without Docker
   - **Demo accounts** table (email, password, role)
6. **Scripts**: dev, build, lint, typecheck, test, database scripts
7. **How double booking is prevented**: the constraint, the race it closes, why an application check is not enough, and how it is tested. This is the most important section; keep it to about 150 words plus the SQL.
8. **Architecture**: the layer diagram, folder overview, where business logic lives and why
9. **Data model**: ER diagram image, link to dbdiagram.io, key constraints
10. **Key decisions and trade-offs**: instant confirmation, exclusive booking, seeded users, deactivate instead of delete, single timezone, no REST API. One or two lines each.
11. **Business rules**: short table, link to `docs/project-scope.md` for the full list
12. **Testing**: what is covered, how to run it
13. **Known limitations**: from the scope, stated plainly
14. **What I would do next**: notifications, approval workflow, recurring reservations, per-resource hours, end-to-end tests, deployment
15. **Use of AI tools**: one honest sentence. The brief permits them and asks you to be able to explain your decisions.
16. **Links**: scope and plan documents

### 10.2 Demo video (target 4:30, hard limit 5:00)

Prepare beforehand: fresh `db:reset`; two browser windows side by side (normal window signed in as Sanduni, private window as Kasun); a terminal ready to run the tests; the ER diagram open in a tab; notifications off; font size increased.

| Time | Show | Say |
|---|---|---|
| 0:00 to 0:25 | Title slide or README top | The problem in two sentences: shared resources, informal booking, double bookings, nobody knows what is free. The goal: one place, and the system guarantees no clashes. |
| 0:25 to 1:25 | Member flow: resource list, filter by type, open Meeting Room A, day schedule, book a free slot, My reservations | Availability is visible *before* booking. Point out the back-to-back pair. Mention the rules briefly: operating hours, 30-minute slots, no bookings in the past. |
| 1:25 to 2:15 | **The conflict.** Both windows on the same resource with the same slot filled in. Submit in one, then the other. | One succeeds; the other gets a clear message and keeps its input. Then run the concurrency test in the terminal: ten simultaneous requests, exactly one reservation. |
| 2:15 to 3:05 | Admin flow: all reservations with filters, cancel one with a reason; switch to the member window and show the reason. Deactivate a resource that has upcoming bookings: dialog shows the count, confirm, resource disappears for the member. | Admins resolve conflicts and take resources out of service without leaving orphaned bookings. Nothing is ever deleted; history is kept. |
| 3:05 to 4:10 | ER diagram, then the constraint in the migration file, then the service file briefly | Three decisions: (1) overlap prevention is an exclusion constraint in PostgreSQL, because check-then-insert is a race; (2) business logic is in a service layer, with thin server actions, so rules are written once and tested without the UI; (3) times are stored as UTC `timestamptz` and shown in one organization timezone. |
| 4:10 to 4:30 | README limitations section | What was deliberately left out and why (approvals, recurring bookings, notifications), and what comes next. Close. |

If the recording runs long, shorten the member flow, not the conflict demonstration or the technical decisions; those two segments carry most of the evaluation criteria.
