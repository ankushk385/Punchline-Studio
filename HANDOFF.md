# Punchline Studio implementation handoff

## Repository safety

- Source repository: `/Users/jimmy/Downloads/projects/personal/Standup-Companion` — treated as read-only.
- New repository: `/Users/jimmy/Downloads/projects/personal/Punchline-Studio`.
- Active branch: `feature/modern-playbill-performance`.
- Baseline commit: `e87ac02dc70caf9479b7f962bc1b982dda33d074` (also `main`).
- Apple Command Line Tools are broken (`xcrun` cannot find `/Library/Developer/CommandLineTools`), so the standard Git CLI is unavailable. Repository metadata was created in standard Git format by a fallback writer. Current implementation changes are not yet committed.
- Node is available explicitly at `/Users/jimmy/.nvm/versions/node/v22.23.4/bin`; it is not on the sandbox shell PATH.

## Implemented

- Separate copied repository with dependencies/build/caches/logs/Supabase CLI linkage excluded; local `.env` files remain ignored.
- Unique app identity: Punchline Studio, `punchlinestudio`, `com.punchlinestudio.app` on iOS and Android.
- OAuth redirect changed locally to `punchlinestudio://auth/callback`.
- Day Show and Late Show shared tokens, System resolution, persisted legacy light/dark migration, Inter + Bebas Neue font loading.
- Shared Playbill primitives in `components/ui/Playbill.tsx`.
- Bottom navigation is exactly Home, Ideas, Material, Perform, Gigs; legacy Setlists/Recordings/Inbox remain hidden internal routes.
- Perform landing page and first-class Performance Session setup/live/review/summary routes.
- Local-first per-user performance snapshot repository and provider; writes persist locally before entering the existing per-user sync queue.
- Session markers include session/recording timestamps, joke/version, and setlist position; correction and partial-review resume are implemented.
- Recording failures preserve local session/marker state; backgrounding pauses the live flow; keep-awake is released.
- Contextual session reviews use 1–5 ratings, 0–100 laugh scores, audience, gig, setlist, segment timestamp, decision, and notes.
- Revision creation from a review and version outcome comparison with sample counts and insufficient-data language.
- Sound-paced teleprompter controller with smoothing, silence grace, room calibration, sensitivity, fixed-speed fallback, on-device metering, and microphone cleanup.
- Hinglish/English/Other script preference; text storage remains unchanged Unicode freeform.
- Settings service status for Supabase config/auth, private Storage, Gemini Edge Function, safe timestamp, pending queue, and safe retry. Health check sends no joke content.
- JSON export includes performance sessions/events/reviews.
- Additive SQL migration `20261030190000_punchline_performance_sessions.sql` with three new RLS-owned tables and indexes. It has not been applied remotely.
- Existing `ai-chat` Edge Function has a local secret-safe `action: health` path. It has not been deployed.

## Verified

- `npx tsc --noEmit`: passed.
- `npm test`: 73/73 passed.
- Tests cover theme resolution/persistence, exact navigation, Hinglish round-trip/search, sound smoothing/silence/calibration/cleanup, setup validation, marker ordering/correction/version association, recording failure preservation, partial review resume, rating ranges, version sample counts, local-first ordering, RLS, exports, and destructive confirmations.

## Important remaining work

1. Run `npm run lint`, fix every warning/error, then rerun TypeScript and tests.
2. Run `npm run expo:static:build`; then Android/iOS builds when local SDKs are available.
3. Finish the full page-by-page Playbill restyle. The coordinated tokens/primitives and new flows are present, but several copied legacy screens still use older `constants/colors.ts`, rounded legacy layouts, or do not yet use the new primitives. Prioritize login, Ideas, Joke Studio, Material detail/rating, Setlists, Recordings, Crowd Logger, Gigs, and Settings.
4. Add the Builder / Guide me segmented control at the top of Joke Studio (Bit Wizard still exists and is linked, but the requested segmented presentation is unfinished).
5. Audit and improve Material tab behavior: it currently re-exports the existing joke library modal screen.
6. Perform device acceptance flows, especially actual recording interruption/background recovery, calendar integration, noisy/quiet room calibration, signed cloud playback, offline completion/reconnect, and both themes.
7. Review SQL against the live project migration history, test on a safe/local Supabase target, then request explicit approval before applying to the shared project.
8. Deploy the updated Edge Function only after backward-compatibility review and approval.
9. Add `punchlinestudio://auth/callback` to Supabase Auth redirect URLs without removing the old StandUp Companion callback.
10. Verify Gemini/Storage health against an authenticated real account.
11. Repair/install Apple Command Line Tools, inspect standard `git status`, and commit the implementation on the feature branch. Do not push or create a remote.
12. Recheck the source repository is unchanged after all work.

## Commands

Use the explicit Node path in this environment:

```sh
export PATH=/Users/jimmy/.nvm/versions/node/v22.23.4/bin:$PATH
cd /Users/jimmy/Downloads/projects/personal/Punchline-Studio
npm run lint
npx tsc --noEmit
npm test
npm run expo:static:build
```

Do not run installs, builds, migrations, or branch-changing commands in Standup-Companion.
