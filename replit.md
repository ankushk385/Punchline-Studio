# StandUp Companion — Comedy OS

A mobile-first, offline-first comedy toolkit for stand-up comedians. Built with Expo (React Native) + Express backend.

## Architecture

- **Frontend**: Expo Router (React Native) — `app/` directory
- **Backend**: Express + TypeScript — `server/` directory (Phase 2, not connected yet)
- **Storage**: AsyncStorage (offline-first Phase 1)
- **State**: React Context (`context/DataContext.tsx`)

## Design System

- Background: `#1C1C28` (OLED black)
- Cards: `#252535` / `#333345`
- Gold: `#FFB800` (primary actions)
- Purple: `#7C3AED` / `#9B72CF` (secondary CTAs)
- Notepad: `#FFF8E1` cream surface
- Typography: Inter (Regular/Medium/SemiBold/Bold)

## App Structure

```
app/
  _layout.tsx           # Root layout with DataProvider
  login.tsx             # Auth screen (local, Phase 1)
  (tabs)/
    _layout.tsx         # Bottom tab bar (Home/Inbox/Setlist/Record)
    index.tsx           # Home Dashboard
    inbox.tsx           # Idea Inbox (Raw/Developing/Stage Ready)
    setlist.tsx         # Setlist Builder
    record.tsx          # Performance Recorder (expo-audio)
  joke-builder.tsx      # Joke Builder (notepad UI)
  practice.tsx          # Practice Mode (timer + teleprompter)
  jokes.tsx             # All Jokes browser
  joke-rating/[id].tsx  # Post-show rating
  joke-versions/[id].tsx # Version history
context/
  DataContext.tsx       # All app state (AsyncStorage)
server/
  index.ts              # Express server (Phase 2)
  routes.ts             # API routes (Phase 2)
  .env.example          # Backend env template
```

## Features

### Phase 1 (MVP — Offline)
1. **Login/Register** — Local email+password auth (AsyncStorage)
2. **Home Dashboard** — Greeting, daily goals, weekly progress chart, quick actions
3. **Idea Inbox** — Capture ideas with status (Raw/Developing/Stage Ready), search, filter, tags
4. **Joke Builder** — Notepad-style UI with Setup/Punchline/Tag/Callback + tag chips
5. **Setlist Builder** — Create setlists, add jokes, reorder, total time badge
6. **Practice Mode** — Countdown timer + teleprompter with per-joke navigation
7. **Performance Recorder** — Record audio with expo-audio, playback, delete
8. **Joke Rating** — Rate jokes 1-10 on overall + laughs after shows
9. **Version Control** — Auto-save versions on edit, revert to any version

### Phase 2 (Cloud — Not yet connected)
- Supabase PostgreSQL + Auth
- Premise Expander (OpenAI)
- Laugh Analyzer (Whisper)
- Open Mic Finder (Maps)
- Server ready at `server/` — see `server/.env.example`

## Development

- Backend: `npm run server:dev` (port 5000)
- Frontend: `npm run expo:dev` (port 8081)

## APK Build (Android)

See `SETUP.md` for local build instructions with `eas build --platform android`.
