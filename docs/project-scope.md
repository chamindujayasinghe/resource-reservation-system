# Project Scope: Resource Reservation Management System

| | |
|---|---|
| **Assessment** | PrimeWave Lab software engineering internship |
| **Stack** | Next.js (App Router), TypeScript, PostgreSQL |
| **Deadline** | Thursday 15 Oct 2026, 11:59 PM (UTC+05:30) |
| **Working time** | About 2.5 days |
| **Document date** | 13 Oct 2026 |

The brief asks for a focused solution and says it values "thoughtful prioritization, reliability, and maintainability over unnecessary complexity". This scope is deliberately small: a few features, each one enforced properly, with the no-double-booking guarantee treated as the core of the product.

---

## 1. Problem statement

An organization shares rooms, equipment and other facilities between many people and teams, and currently books them through chat messages and manual records. This causes double bookings and nobody can easily tell whether something is free. They need one place where resources are listed, anyone can see what is available and reserve it, and the system itself guarantees that two reservations never clash.

---

## 2. Users and roles

There are two roles. Every user has exactly one.

| Capability | Member | Admin |
|---|:---:|:---:|
| Sign in and sign out | Yes | Yes |
| Browse active resources and see their schedule | Yes | Yes |
| See who has booked a slot (name and purpose) | Yes | Yes |
| Create a reservation for themselves | Yes | Yes |
| Edit or cancel their own upcoming reservations | Yes | Yes |
| View their own reservation history | Yes | Yes |
| View all reservations across all users | No | Yes |
| Cancel any user's upcoming reservation (with a reason) | No | Yes |
| Create and edit resources | No | Yes |
| Deactivate and reactivate resources | No | Yes |
| See inactive resources | No | Yes |

**Member** is any employee who needs to use a shared resource. **Admin** is the person responsible for the facilities (office or operations staff).

Unauthenticated visitors can see only the sign-in page.

---

## 3. Assumptions

The brief gives a scenario, not a specification. Each assumption below is a decision made to fill a gap. Items marked **(confirmed)** were decided explicitly by the author; the rest are reasoned defaults.

### Organization and users

1. The system serves **one organization**. There is no multi-tenancy.
2. **(confirmed)** There are two roles, Admin and Member.
3. **(confirmed)** Users sign in with email and password. Accounts are **seeded**; there is no self-registration, password reset or email verification. In a real deployment accounts would come from the company directory (SSO), so building sign-up would be effort spent on something that would be replaced.
4. "Teams" in the brief are not modelled as an entity. A reservation belongs to the person who made it; the team or purpose is written in the reservation title.
5. The number of users and resources is small (tens of resources, hundreds of users). "Remain reliable as activities grow" is interpreted as *correctness under concurrent use* and sensible indexing, not high-scale infrastructure.

### Resources

6. A resource is anything bookable by time: meeting room, equipment, vehicle, or other. The type is a simple category used for filtering, with no type-specific behaviour.
7. **(confirmed)** Booking is **exclusive**: one reservation holds the whole resource for its time slot.
8. Capacity is a descriptive attribute (for example seats in a room). It is optional, because it is meaningless for a projector. It never allows overlapping reservations.
9. Every resource is a single unit. Ten identical laptops are ten resources, not one resource with quantity ten.
10. All resources share the same organization-wide operating hours. Per-resource hours are out of scope.
11. Resources are never hard-deleted, only deactivated, so reservation history always stays intact.

### Reservations

12. **(confirmed)** Reservations are **confirmed instantly** on a first-come, first-served basis. There is no approval step.
13. A reservation has two stored states: *confirmed* and *cancelled*. "Upcoming", "in progress" and "completed" are derived from the current time, not stored.
14. Reservations are for a single continuous time range on a single day. There are no recurring or multi-day reservations.
15. Schedules are transparent: every signed-in user can see who booked a slot and why. This is what replaces the "informal communication" the brief describes.
16. A member may hold overlapping reservations on *different* resources (for example a room and a projector, or booking on behalf of two teams).
17. There is no limit on how many reservations one user can hold.
18. There is no check-in step and no automatic release of no-shows.

### Time

19. The organization operates in **one timezone, Asia/Colombo (UTC+05:30)**. All times are shown in that timezone regardless of the viewer's device settings. Timestamps are stored in UTC.
20. Operating hours are **07:00 to 20:00, every day of the week**. There is no holiday calendar.
21. Operating hours and duration limits are application configuration, not editable in the UI.
22. The server clock is the source of truth for "now". The client clock is never trusted.

### Delivery

23. The application only needs to run locally. Hosted deployment is not required by the brief.
24. There are no email or push notifications. Users find out about changes (such as an admin cancelling their booking) from the status and reason shown in "My reservations".
25. The interface is in English only and designed for desktop first, while remaining usable on a phone.

---

## 4. In-scope features

Priorities follow MoSCoW. **Must** items define a submittable product. **Should** items are planned and expected to fit. **Could** items are attempted only if everything above them is finished and tested.

### Must have

**M1. Sign in and sign out**
*As a user, I want to sign in with my email and password so that the system knows who I am and what I am allowed to do.*
- Valid credentials start a session and land on the resource list.
- Invalid credentials show one generic error that does not reveal whether the email exists.
- Every page except sign-in redirects unauthenticated visitors to sign-in.
- Passwords are stored hashed, never in plain text.
- Signing out ends the session.

**M2. Role-based access**
*As the organization, I want admin functions restricted to admins so that members cannot change resources or other people's bookings.*
- Admin pages and actions are refused for members **on the server**, not just hidden in the UI.
- A member attempting to edit or cancel someone else's reservation is refused on the server.
- Navigation shows only what the current role can use.

**M3. Manage resources (admin)**
*As an admin, I want to create and edit resources so that the catalogue reflects what the organization actually has.*
- A resource has a name, type, location, optional capacity and optional description.
- Name is required and unique (case-insensitive). Capacity, if given, is a positive whole number.
- Validation errors appear next to the relevant field and no partial data is saved.
- New resources are active by default.

**M4. Deactivate and reactivate a resource (admin)**
*As an admin, I want to take a resource out of service so that nobody books something that is broken or unavailable.*
- An inactive resource is hidden from members and cannot be booked.
- If the resource has upcoming reservations, the admin sees how many and must explicitly confirm.
- On confirmation those upcoming reservations are cancelled with the reason "Resource deactivated", in the same operation as the deactivation.
- Past reservations are untouched.
- Reactivating makes the resource bookable again. Previously cancelled reservations are not restored.

**M5. Browse resources and availability**
*As a member, I want to see the resources and when they are free so that I can pick a slot without asking anyone.*
- The list shows all active resources with type, location and capacity.
- The list can be filtered by type and searched by name.
- Each resource has a day schedule showing booked and free time within operating hours, with a date picker and previous/next day controls.
- Booked slots show the booker's name and the reservation title.
- Empty states are explicit ("No resources match", "No reservations on this day").

**M6. Create a reservation**
*As a member, I want to reserve a resource for a time range so that I am guaranteed to have it.*
- The form takes resource, date, start time, end time and a title (purpose).
- All business rules in section 6 are enforced on the server.
- On success the reservation is confirmed immediately and appears in the schedule and in "My reservations".
- On failure the user sees a specific message (for example "This overlaps an existing reservation from 10:00 to 11:00") and their input is preserved.

**M7. Guaranteed no double booking**
*As the organization, I want it to be impossible for two confirmed reservations of the same resource to overlap, so that the core problem is actually solved.*
- The rule is enforced by the **database itself**, not only by application checks.
- When two requests for the same slot arrive at the same moment, exactly one succeeds and the other receives a clear "this slot was just taken" message.
- Back-to-back reservations (one ending at 10:00, the next starting at 10:00) are allowed.
- Cancelled reservations do not block a slot.
- This is covered by an automated test.

**M8. My reservations**
*As a member, I want to see my reservations so that I know what I have booked.*
- Upcoming reservations are listed soonest first; past and cancelled ones are shown separately.
- Each entry shows resource, date, time, title and status. Cancelled entries show the cancellation reason when there is one.

**M9. Cancel a reservation**
*As a member, I want to cancel a reservation I no longer need so that the slot is freed for others.*
- The owner can cancel any of their reservations that have not yet started.
- A confirmation step prevents accidental cancellation.
- The slot becomes bookable immediately.
- The reservation is kept as a cancelled record, not deleted.

**M10. View and cancel any reservation (admin)**
*As an admin, I want to see all reservations and cancel any of them so that I can resolve conflicts and handle operational changes.*
- A list of all reservations can be filtered by resource, status and date range.
- An admin can cancel any upcoming reservation and must give a reason.
- The owner sees the cancelled status and the reason in "My reservations".

**M11. Submission deliverables**
- README covering purpose, setup, how to run, seeded accounts, key decisions and known limitations.
- Database migrations and a seed script producing demo users, resources and reservations.
- ER diagram, available through a shareable link.
- Demo video of 3 to 5 minutes.

### Should have

**S1. Edit a reservation**
*As a member, I want to change the time or title of an upcoming reservation so that I do not have to cancel and rebook.*
- The owner can change date, start, end and title of a reservation that has not started. The resource cannot be changed (cancel and rebook instead).
- The edit is checked against every business rule; the reservation does not conflict with itself.
- If the new time conflicts, the edit is refused and the original reservation is left exactly as it was.

**S2. Attendee count checked against capacity**
*As a member, I want to be warned if my group does not fit so that I do not book a room that is too small.*
- The reservation form has an optional attendee count.
- If the resource has a capacity and the count exceeds it, the reservation is refused with a clear message.

**S3. Automated tests for the booking rules**
- Unit tests cover the validation rules in section 6 (past times, duration, operating hours, alignment).
- An integration test against a real PostgreSQL database proves the concurrent double-booking case.

**S4. One-command local setup**
- A database can be started with a single command (container-based), with a documented alternative for an existing PostgreSQL install.
- An example environment file lists every required variable.

**S5. Feedback and loading states**
- Every create, edit and cancel action gives visible success or failure feedback.
- Submit buttons are disabled while a request is in flight.

### Could have

**C1. Usage summary (admin)**: reservations and booked hours per resource over a date range.
**C2. Week view** of a resource schedule in addition to the day view.
**C3. Admin books on behalf of a member.**
**C4. "Find a free resource"**: search by date, time and type for anything available.

### If time runs short

Cut in this order: all Could items, then S2, then S1. S3 and S4 are not cut, because they directly support the reliability and "another developer can run it" criteria. No Must item is cut.

---

## 5. Out of scope

| Item | Reason |
|---|---|
| Approval workflow | Confirmed decision: instant confirmation. Approval adds states and screens without making the core guarantee stronger. |
| Shared-capacity booking (several bookings per slot) | Confirmed decision: exclusive booking. Safe concurrent enforcement is much harder and not needed to solve the stated problem. |
| Recurring reservations | Conflict handling across a series is a project in itself. |
| Multi-day or overnight reservations | Operating hours make every reservation fit within one day. |
| Self-registration, password reset, email verification | Accounts would come from a company directory in real use; seeded users are enough to demonstrate roles. |
| OAuth or SSO login | Reviewers would need to configure external credentials just to run the app. |
| User management UI (create users, change roles) | Roles are set by the seed script; not part of the reservation problem. |
| Teams or departments as entities | The title field carries this information at far lower cost. |
| Email, SMS or in-app notifications | Needs external services and delivery handling; status and reason in the UI cover the need. |
| Waitlists | Depends on notifications to be useful. |
| Check-in and no-show auto-release | Needs background jobs and a policy the brief does not describe. |
| Per-resource operating hours, holidays, maintenance windows | Organization-wide hours cover the scenario; deactivation covers out-of-service resources. |
| Per-user booking quotas | No evidence in the brief that hoarding is a problem. |
| Payments or cost tracking | Unrelated to the scenario. |
| Calendar integration (Google, Outlook) | External dependency with significant setup cost. |
| Multiple timezones | Single-site organization assumed. |
| Hard deletion of resources or reservations | Destroys history; deactivation and cancellation serve the same purpose safely. |
| Full audit log | Cancellation reason and timestamps give the essential traceability. |
| Real-time schedule updates (live push) | The database guarantee makes stale views safe; a refresh on action is enough. |
| Hosted deployment | The brief only requires running locally. |
| Internationalization | Single-language organization assumed. |

---

## 6. Business rules

Rules are enforced on the server for every create and edit. Rules marked **DB** are additionally guaranteed by the database, so they hold even if application code has a bug or two requests race.

### Time and duration

| # | Rule |
|---|---|
| BR1 | End time must be after start time. **DB** |
| BR2 | A reservation cannot start in the past. Start must be at or after the current server time. |
| BR3 | Start and end must fall on 30-minute boundaries (for example 09:00, 09:30). |
| BR4 | Minimum duration is 30 minutes. |
| BR5 | Maximum duration is 8 hours. |
| BR6 | The whole reservation must fall within operating hours, 07:00 to 20:00 Asia/Colombo, on a single calendar day. |
| BR7 | A reservation can be made at most 60 days in advance. |

### Conflicts

| # | Rule |
|---|---|
| BR8 | Two confirmed reservations for the same resource may not overlap. **DB** |
| BR9 | Time ranges include the start and exclude the end, so a reservation ending at 10:00 does not conflict with one starting at 10:00. |
| BR10 | Cancelled reservations are ignored when checking for conflicts. |
| BR11 | The same user may hold overlapping reservations on different resources. |

### Resources and capacity

| # | Rule |
|---|---|
| BR12 | Only active resources can be booked. This is re-checked at the moment of booking, not just when the form was opened. |
| BR13 | Resource names are unique, ignoring case. **DB** |
| BR14 | Capacity is optional. If present it must be a positive whole number. **DB** |
| BR15 | One reservation occupies the whole resource regardless of capacity. |
| BR16 | If a resource has a capacity and the reservation states an attendee count, the count must not exceed the capacity. (Should-have S2.) |
| BR17 | Resources cannot be deleted, only deactivated. |
| BR18 | Deactivating a resource cancels its upcoming reservations with the reason "Resource deactivated", after explicit admin confirmation. Reservations already in progress are left to finish. |

### Ownership, editing and cancellation

| # | Rule |
|---|---|
| BR19 | A reservation always has exactly one owner, the user who created it. **DB** |
| BR20 | A title of 3 to 100 characters is required. |
| BR21 | Only the owner can edit a reservation. Admins cancel rather than edit, so the owner is never silently moved. |
| BR22 | A reservation can be edited or cancelled only while it is confirmed and has not yet started. |
| BR23 | The owner can cancel without giving a reason. An admin cancelling someone else's reservation must give a reason. |
| BR24 | An edited reservation must satisfy every rule above as if newly created, ignoring itself for BR8. |
| BR25 | Cancellation is final. A cancelled reservation cannot be restored; the user books again. |
| BR26 | Reservations are never deleted. Cancellation records who cancelled, when, and why. |

---

## 7. Edge cases and operational challenges

### Concurrency

| Situation | Handling |
|---|---|
| Two users submit the same slot at the same moment | The database overlap constraint (BR8) lets exactly one succeed. The other gets "This slot was just taken" and sees the refreshed schedule. An application-level check alone cannot guarantee this, because both requests can pass the check before either saves. |
| Two requests for partly overlapping slots (09:00 to 10:00 and 09:30 to 10:30) | Same guarantee; the constraint compares ranges, not exact slot matches. |
| A user double-clicks submit or retries after a slow response | The button is disabled while submitting. If a duplicate still arrives, the constraint rejects it as a conflict with the first. |
| A user's schedule view is stale and the slot was taken since the page loaded | The server rejects the booking with the conflict message. The view is never the authority. |
| An admin deactivates a resource while a member is booking it | The booking re-checks that the resource is active as part of the same atomic operation, and deactivation cancels upcoming reservations atomically, so no confirmed reservation can be left on an inactive resource. |
| A reservation is cancelled twice (owner and admin at once, or two tabs) | Cancelling only acts on a confirmed reservation. The second attempt is told it is already cancelled; the first cancellation's details are kept. |
| An owner edits while an admin cancels | The edit only applies if the reservation is still confirmed; otherwise it is refused with an explanation. |

### Time

| Situation | Handling |
|---|---|
| Viewer's device is in a different timezone | All times are displayed and entered in Asia/Colombo and labelled as such. Stored values are UTC, so they are unambiguous. |
| Server runs in a different timezone from the organization | Operating-hours and "same day" checks are computed explicitly in Asia/Colombo, never in the server's local time. |
| Daylight saving | Sri Lanka does not observe it, so no day has missing or repeated hours. Recorded as a limitation if the timezone setting is ever changed. |
| Booking a slot that begins "now" or a few minutes ago | Refused by BR2. With 30-minute slots, the slot currently in progress cannot be booked. |
| The form is opened before a slot starts and submitted after | Server time at submission decides; the request is refused as being in the past. |
| A reservation is in progress | It cannot be edited or cancelled (BR22). Ending early is out of scope. |
| Booking up to closing time | Allowed: a reservation may end exactly at 20:00. |

### Editing

| Situation | Handling |
|---|---|
| Editing a reservation into a conflict with another | Refused by the same database constraint. The change is all-or-nothing, so the original time is kept. |
| Shortening or shifting within its own current time range | Allowed; a reservation never conflicts with itself. |
| Editing so that the new start is in the past | Refused by BR2. |
| A member edits someone else's reservation by changing the ID in a request | Refused on the server by the ownership check (M2). |

### Resource lifecycle

| Situation | Handling |
|---|---|
| Deactivating a resource with upcoming reservations | Admin is shown the count and must confirm; those reservations are cancelled with a reason (BR18). Affected owners see this in "My reservations". |
| Deactivating a resource with a reservation in progress | The in-progress reservation is left to finish; only later ones are cancelled. |
| Reactivating a resource | It becomes bookable again. Reservations cancelled by the deactivation stay cancelled. |
| Wanting to delete a resource created by mistake | Not possible (BR17). It is deactivated and can be renamed to free the name. |
| Reducing capacity below the attendee count of an existing reservation | Existing reservations are kept. The capacity rule applies to new and edited reservations only. |
| Renaming a resource | History shows the current name; the reservations still point at the same resource. |
| Operating hours configuration is changed later | Existing reservations are not re-validated or cancelled; the new hours apply to new and edited reservations. |

### Access and input

| Situation | Handling |
|---|---|
| A member calls an admin action directly | Refused on the server (M2). |
| Session expires while a form is open | The submission is refused and the user is sent to sign in. |
| Malformed or missing input sent directly to the server | All input is validated on the server regardless of client-side validation. |
| Large amounts of data over time | Reservation lists are filtered by date and paginated or limited, and lookups by resource and time are indexed. |

### Known limitations (to state openly in the README)

- Members are not notified when an admin cancels their reservation; they see it on their next visit.
- Schedule views do not update live; another user's booking appears after a refresh or on the next action.
- No-shows keep their slot.
- Single timezone and organization-wide operating hours only.

---

## 8. Success criteria

Mapped to the seven evaluation areas in section 8 of the brief.

### 8.1 Understanding and interpretation of the business problem
- Each pain point in the brief has a direct answer: overlapping reservations (M7), uncertainty about availability (M5), manual records (M6, M8, M10), organizing resources (M3, M4).
- This document exists in the repository, with assumptions and out-of-scope items stated and justified.
- The demo video opens by restating the problem in one or two sentences before showing any feature.

### 8.2 Problem-solving and engineering judgement
- Double booking is prevented at the database level, and the README explains why an application-only check is not sufficient.
- Scope decisions (instant confirmation, exclusive booking, seeded users, deactivate instead of delete) are documented with the trade-off behind each.
- The README has a "what I would do next" section drawn from sections 4 (Could) and 5.

### 8.3 Functional completeness and reliability
- Every Must-have story meets all of its acceptance criteria.
- Every business rule in section 6 is enforced on the server and cannot be bypassed from the browser.
- An automated test demonstrates that simultaneous bookings of the same slot produce exactly one confirmed reservation.
- No action leaves the user on a raw error page; every failure produces a readable message.
- A fresh clone, following only the README, reaches a working seeded application.

### 8.4 Application architecture and database design
- Business rules live in one layer, separate from page and form code, so each rule is defined once and used by both create and edit.
- The schema is normalized (users, resources, reservations) with foreign keys, uniqueness and check constraints, the overlap constraint, and indexes for the common queries.
- Timestamps are stored in UTC with timezone awareness.
- Schema changes are captured in versioned migrations.
- The ER diagram matches the actual schema and is reachable via a shareable link.

### 8.5 Code quality and maintainability
- TypeScript strict mode, with no untyped escape hatches in business logic.
- Linting and formatting pass with no errors.
- Operating hours, duration limits, slot size and timezone are named configuration values in one place, not scattered literals.
- Consistent folder structure and naming; no dead code or leftover scaffolding.
- Commit history is incremental with descriptive messages, not a single final commit.
- The booking rules have unit tests.

### 8.6 User experience and practical usability
- A member can go from sign-in to a confirmed reservation in under a minute without instructions.
- Availability is visible before booking, not discovered through a failed submission.
- Error messages say what went wrong and what to do; form input survives a failed submission.
- Destructive actions (cancel, deactivate) require confirmation and state their consequences.
- Loading, empty and error states exist on every list and form.
- Usable on a laptop and on a phone-width screen.

### 8.7 Technical understanding and communication
- The README lets another developer understand, set up and run the project, and lists the seeded accounts.
- The demo video is 3 to 5 minutes and covers: the problem, a member booking flow, a live demonstration of a rejected conflict, the admin flow including deactivation, and two or three key technical decisions.
- The author can explain, without notes, how the overlap guarantee works, why times are stored in UTC, and why each out-of-scope item was excluded.
