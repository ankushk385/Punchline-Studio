# StandUp Companion — Local Setup & APK Build Guide

## Prerequisites

Install the following on your local machine:
- **Node.js** v18+ — https://nodejs.org
- **Git** — https://git-scm.com
- **Android Studio** — https://developer.android.com/studio (for Android SDK / device debugging)
- **Java JDK 17+** — https://adoptium.net (required for Android builds)

## 1. Download the Project

### Option A: Download from Replit
1. In Replit, click the three-dot menu (⋯) at the top
2. Click **Download as zip**
3. Unzip the folder — it will be called `standup-companion` (or similar)
4. Open a terminal and navigate to the folder:
   ```bash
   cd standup-companion
   ```

### Option B: Via Git (if you have a repo)
```bash
git clone <your-repo-url>
cd standup-companion
```

## 2. Install Dependencies

```bash
npm install
```

## 3. Run in Development (Expo Go)

```bash
npx expo start
```

- Scan the QR code with **Expo Go** on your Android phone
- The app runs fully **offline** — no backend connection needed
- Download Expo Go from Play Store: https://expo.dev/go

## 4. Build an APK (Android)

### Step 4a: Install EAS CLI

```bash
npm install -g eas-cli
```

### Step 4b: Create a free Expo account

```bash
eas login
```

Go to https://expo.dev → Sign up free → Log in via CLI.

### Step 4c: Configure EAS Build

Create `eas.json` in the project root:

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

### Step 4d: Build the APK

```bash
eas build --platform android --profile preview
```

- This uploads your code to Expo's cloud build servers (free tier available)
- Build takes 5–15 minutes
- You'll get a **download link** to your `.apk` file when done

### Step 4e: Install the APK on your phone

1. Download the APK from the link provided
2. Transfer to your Android phone (via USB or email)
3. On your phone: **Settings → Security → Install unknown apps** → Enable for your file manager
4. Open the APK file and install

## 5. Local APK Build (Without Expo Cloud)

If you prefer to build locally without uploading to Expo:

### Step 5a: Install Expo Dev Client

```bash
npx expo install expo-dev-client
```

### Step 5b: Generate Android project files

```bash
npx expo prebuild --platform android
```

### Step 5c: Build with Gradle

```bash
cd android
./gradlew assembleRelease
```

The APK will be at: `android/app/build/outputs/apk/release/app-release.apk`

## 6. Backend Setup (Phase 2 — Not Required Now)

The backend is ready but not connected (app is fully offline).
When you're ready for Phase 2 cloud features:

1. Copy `server/.env.example` to `server/.env`
2. Fill in your Supabase and OpenAI credentials
3. Start the backend: `npm run server:dev`

## 7. Troubleshooting

### "Metro bundler can't find module"
```bash
npx expo start --clear
```

### "SDK version mismatch"
```bash
npx expo install --fix
```

### Android build fails
- Make sure JAVA_HOME is set to JDK 17+
- Run `npx expo doctor` to check environment

### Expo Go shows QR code but app won't load
- Make sure phone and computer are on the same WiFi network
- Try: `npx expo start --tunnel`

## 8. App Features Summary

| Feature | Status |
|---------|--------|
| Login / Register | Offline (local) |
| Idea Inbox | Full CRUD + Status + Tags |
| Joke Builder | Notepad UI + 4 fields + Tags |
| Setlist Builder | Reorder + Duration + Total time |
| Practice Mode | Timer + Teleprompter |
| Performance Recorder | Audio record + Playback |
| Joke Rating | 1-10 score + Laugh score + Notes |
| Version History | Auto-save + Revert |
| Progress Tracker | Daily goals + Weekly chart |

All data stored locally on device. No internet required.
