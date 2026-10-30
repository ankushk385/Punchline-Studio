# Supabase setup — StandUp Companion

This app uses Supabase Auth, the `standup_recordings` table, and the private
`standup-recordings` Storage bucket. Jokes and the other existing app data
remain in the app's per-user offline cache.

## 1. Create the shared free project

1. Open the Supabase dashboard and create one Free Plan project.
2. Open **Connect** (or **Project Settings > API**).
3. Copy only:
   - **Project URL**
   - **Publishable key** (the legacy anon key also works, but publishable is preferred)
4. Never copy the service-role key, secret key, database password, or Google
   client secret into this app.

Copy `.env.example` to `.env` and replace both placeholder values:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Restart Expo after changing `.env`.

## 2. Create the database and private bucket

In **Supabase Dashboard > SQL Editor > New query**, paste and run:

`supabase/migrations/20261027090000_standup_recordings.sql`

The migration creates the table, indexes, RLS policies, private bucket, a
100 MB per-file limit, and owner-only Storage policies. The bucket must remain
private.

## 3. Configure authentication

Email/password is enabled by default. If email confirmation remains enabled,
new users must confirm the email before their first login.

For Google:

1. In Google Cloud Console, create an OAuth 2.0 **Web application** client.
2. Add this authorized redirect URI:
   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. In **Supabase Dashboard > Authentication > Providers > Google**, enable
   Google and enter the Google client ID and client secret.
4. In **Authentication > URL Configuration > Redirect URLs**, add:
   `standupcompanion://**`

The Google client secret stays only in Supabase. It does not belong in `.env`.

## 4. Configure the EAS preview environment

Run from this project directory after replacing the values:

```bash
npx eas-cli@latest env:set --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR_PROJECT_REF.supabase.co --visibility plaintext
npx eas-cli@latest env:set --environment preview --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value YOUR_PUBLISHABLE_KEY --visibility plaintext
```

These are deliberately public client values. RLS protects the data.

Build the downloadable Android APK:

```bash
npx eas-cli@latest build --platform android --profile preview
```

## Recording storage behavior

- Android/iOS recordings use AAC in M4A, mono, 32 kHz, 64 kbps.
- Expected size is about 0.48 MB/minute (about 14–15 MB for 30 minutes).
- Uploads use 6 MB resumable TUS chunks.
- Failed uploads keep the local recording and show a retry button.
- Playback of cloud-only recordings uses a one-hour signed URL.
- Deleting a synced recording removes both the private object and metadata.

## Google Calendar behavior

Gig sync uses the writable Google calendar already connected to the Android
device. It does not store a Google access token in Supabase. On the device,
grant Calendar permission and ensure a Google account is visible in the system
Calendar app. Creating, editing, or deleting a synced gig updates that calendar
event.

## Verification checklist

- Register by email, confirm if required, log out, and log back in.
- Complete Google login and confirm it returns to the app.
- Record at least one minute; verify local playback and cloud upload.
- Disable internet during an upload; verify the local recording remains, then retry.
- Delete a recording and verify its table row and Storage object disappear.
- Create/edit/delete a synced gig and verify Google Calendar follows.
- Use two accounts and verify neither can read, update, or delete the other's rows or files.
- Let a session expire/force sign-out and verify protected screens return to login.

