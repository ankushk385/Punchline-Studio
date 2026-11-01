# Punchline Studio — handoff

Last updated: 2026-11-01

## TL;DR

Punchline Studio is implemented, pushed, deployed, and tested. The database
migration and the `ai-chat` Edge Function are live on the shared Supabase
project, the app builds for web, all automated checks pass, and a 21-check
browser walkthrough of the real app passed against the live backend.

The only meaningful work left is **device-only acceptance testing** (audio
recording, background recovery, teleprompter pacing, calendar, native themes)
and a final **visual QA / Playbill restyle audit** of a few legacy screens.
Everything else listed below is either an environment constraint or an
optional follow-up.

---

## Repository

- Local path: `/Users/jimmy/Downloads/projects/personal/Punchline-Studio`
- Remote: `https://github.com/ankushk385/Punchline-Studio.git`
- Default branch: `main`
- Working branch: `feature/modern-playbill-performance`
- Both branches point at the same commit: `9c2270f`
- The source repo `../Standup-Companion` was treated as read-only and is not
  part of this work.

Commit history on `main`:

| Commit | Summary |
| --- | --- |
| `ab6c9e4` | Baseline: copy StandUp Companion application |
| `b86acb7` | Complete Punchline Studio implementation |
| `d25cf3f` | Complete visual polish and cleanup |
| `26076ee` | Ignore local e2e env and Supabase temp state |
| `2000c1e` | Drop unused `Platform` import in crowd logger |
| `9c2270f` | Reject missing ai-chat auth; harden web audio/keep-awake |

> **Important:** repository history was rewritten so GitHub would accept the
> trees (the original fallback writer produced unsorted trees). File contents
> are byte-identical, but the old SHAs no longer exist remotely. Any other
> clone must be re-cloned or run `git reset --hard origin/main`.

`.gitignore` covers `.env*` (except examples), `.env.e2e`, `supabase/.temp/`,
build output, caches, and local logs.

---

## Live Supabase state

Project ref: `apazvdtceletxhgavwqr` (`my-apps-backend`, region `ap-southeast-1`).

### Database

- Migration `supabase/migrations/20261030190000_punchline_performance_sessions.sql`
  is **applied**.
- Created: `standup_performance_sessions`, `standup_session_joke_events`,
  `standup_session_joke_reviews`.
- Row level security is enabled on all three; each has owner read/insert/
  update/delete policies plus supporting indexes and unique constraints.
- Constraints verified live: duplicate review per joke+event → `409`,
  out-of-range laugh score → `400`, invalid session status → `400`.

### Edge Function

- `ai-chat` version **12** is deployed and `ACTIVE`.
- `verify_jwt` is `false` at the platform level, but the function now enforces
  its own session check (see fixes below), so unauthenticated calls return
  `401`.
- Provider: Gemini. Reads `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) and
  `GEMINI_MODEL` (default `gemini-flash-lite-latest`).
- `action: "health"` returns `{ ok, provider, checkedAt }` without calling
  Gemini.
- There is no `supabase/config.toml` in the repo; deploy with explicit flags:

  ```sh
  npx supabase functions deploy ai-chat \
    --project-ref apazvdtceletxhgavwqr --no-verify-jwt
  ```

### Auth

- Redirect allow list:
  `punchlinestudio://auth/callback,standupcompanion://auth/callback`
  (the legacy callback is intentionally preserved).

### Storage

- Bucket `standup-recordings` is private.
- Object access is scoped to the owner's folder (`storage.foldername(name)`).
- Verified live: list, upload, signed URL, download through the signed URL,
  and delete.

---

## Fixes made in this session

1. **`ai-chat` missing-auth bug** (`supabase/functions/ai-chat/index.ts`)
   A request with no `Authorization` header threw inside `userClient()` and
   the catch-all converted it to `500 internal_error`. The function now checks
   for the header up front and returns
   `401 {"code":"unauthorized","message":"A valid user session is required."}`.
   Deployed as version 12 and verified.

2. **Web interface sounds** (`lib/interface-sounds.ts`)
   `player.play()` on expo-audio produced an uncaught
   `The play() request was interrupted by a call to pause()` page error on web.
   Web now uses a short-lived `HTMLAudioElement` and catches the play promise.
   Native keeps the existing expo-audio path.

3. **Web keep-awake noise** (`app/performance-session/live.tsx`)
   `deactivateKeepAwake()` rejects on web when no wake lock is active, which
   surfaced as uncaught page errors. Activation/deactivation now swallow those
   expected web rejections.

4. **Lint** — removed an unused `Platform` import in `app/crowd-logger.tsx`.

---

## Verified (2026-11-01)

### Automated checks

| Check | Result |
| --- | --- |
| `npm test` | **73/73 pass** |
| `node --test tests/supabase-integration.test.mjs` | **8/8 pass** |
| `node --import tsx --test tests/sync-merge.test.mjs tests/sync-queue.test.mjs` | **38/38 pass** |
| `npx tsc --noEmit` | clean |
| `npx expo lint` | clean |
| `npx expo export --platform web` | succeeds (web bundle in `dist/`) |

`npm run expo:static:build` cannot run outside Replit: `scripts/build.js`
requires `REPLIT_INTERNAL_APP_DOMAIN`, `REPLIT_DEV_DOMAIN`, or
`EXPO_PUBLIC_DOMAIN`. That is an environment requirement, not a code failure.

### Live backend against a real account

22 checks, all passing, using the account supplied in chat:

- email/password sign-in and session identity
- `ai-chat` health, real Gemini completion, bad-token `401`, no-token `401`,
  empty/oversized prompt `400`
- private Storage list/upload/signed URL/download/delete
- create performance session, marker, contextual review; mark complete
- read back own rows; cascade delete
- duplicate review `409`, out-of-range score `400`, invalid status `400`
- RLS: cannot write for another user (`403`), cannot read another user's rows,
  anonymous reads blocked

All test rows and storage objects were removed afterwards. The account was
left with its original content only: 4 jokes, 2 ideas, 2 recording rows, and
its soft-deleted `Friday open mic` setlist.

### Browser end-to-end (web build)

A Playwright harness drove the exported web build (system Chrome,
430×932 viewport) through 21 checks — **21/21 passed**:

- login screen; email/password sign-in; Ideas, Material, and Perform tabs
- create a setlist through the UI (`New` → name → `Create setlist` → open →
  `Add joke` → `Add to setlist`)
- performance setup: Gig / Setlist / Record steps, audience choices
- start a live session, state shows `LIVE`, first marker auto-created on start
- marking a joke increments the marker count (`1 → 2`)
- finish safely → post-show review → star rating + `Keep` →
  `Save & view summary` → complete Session Summary
- Settings: open, switch Day Show / Late Show, run the safe health check
  (`storage reachable`, `Gemini connected`), sign out
- no uncaught page errors and no failed network requests

The harness itself was scratch tooling kept outside the repository for this
session. Reproducing it needs Playwright (installed as `@playwright/test`),
system Chrome, a served `dist/`, and credentials supplied locally. If this
should become permanent, the next step is to commit it under
`tests/e2e/` with `E2E_EMAIL` / `E2E_PASSWORD` environment variables.

---

## Remaining work

### Must do on a device / simulator

These cannot be proven in a browser:

1. Audio recording: permission prompts, actual file capture, interruption
   handling, and the local recording being preserved when upload fails.
2. Background recovery: pause on backgrounding, resume, and app-kill recovery
   of session + markers.
3. Teleprompter: manual, fixed-speed, and on-device sound-paced modes; silence
   grace, sensitivity, and room calibration in a noisy/quiet room.
4. Native keep-awake behavior during a live session.
5. Calendar integration and gig sync.
6. Signed recording playback inside the app.
7. Day Show / Late Show rendering and contrast on real screens.

### Visual QA / polish

8. Do a page-by-page pass against the Playbill brief. Confirm login, Ideas,
   Joke Studio, Material detail/rating, Setlists, Recordings, Crowd Logger,
   Gigs, and Settings no longer mix legacy tokens or rounded layouts where the
   new primitives are expected.
9. Material tab currently re-exports the joke library screen
   (`app/(tabs)/material.tsx`). Decide whether that is the intended product
   behavior or whether it needs its own layout.

### Environment / tooling

10. `npm run expo:static:build` needs Replit's domain variables; use
    `npx expo export --platform web` locally.
11. Optional: commit the browser E2E harness and wire it into CI.
12. Optional: add a `supabase/config.toml` so function deploys do not need
    explicit `--no-verify-jwt` flags.

### Security follow-up

13. Rotate the GitHub PAT and Supabase PAT that were pasted into chat. Neither
    is stored in git; `.env` is ignored and the git remote is stored as a clean
    HTTPS URL. Do this before sharing the repository further.

---

## Commands

Node is not on the default PATH in this environment:

```sh
export PATH=/Users/jimmy/.nvm/versions/node/v22.23.4/bin:$PATH
cd /Users/jimmy/Downloads/projects/personal/Punchline-Studio

npm test
node --test tests/supabase-integration.test.mjs
node --import tsx --test tests/sync-merge.test.mjs tests/sync-queue.test.mjs
npx tsc --noEmit
npx expo lint
npx expo export --platform web
```

Local web preview:

```sh
cd dist && python3 -m http.server 4173 --bind 127.0.0.1
```

Supabase CLI:

```sh
npx supabase functions deploy ai-chat \
  --project-ref apazvdtceletxhgavwqr --no-verify-jwt
```

Use `SUPABASE_ACCESS_TOKEN` in the environment; never commit it.

Do not run installs, builds, migrations, or branch-changing commands in
`../Standup-Companion`.
