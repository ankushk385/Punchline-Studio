# StandUp Companion Commands

Run commands from the project root unless a section says otherwise.

```bash
cd /Users/jimmy/Downloads/projects/personal/Standup-Companion
```

## 1. First-time setup

Requires Node.js, JDK 17, and the Android SDK.

```bash
npm ci
```

macOS Android environment used by this project:

```bash
export JAVA_HOME="/Users/jimmy/Downloads/projects/personal/.android-jdk"
export ANDROID_HOME="/Users/jimmy/Downloads/projects/personal/.android-sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
```

Verify the tools:

```bash
node --version
java -version
adb version
```

## 2. Run the app for development

Start Expo and scan the QR code with Expo Go:

```bash
npm start
```

Start with a cleared Metro cache if changes are not appearing:

```bash
npx expo start --clear
```

Build and open the native Android development app on a connected device or emulator:

```bash
npm run android
```

Run the web version:

```bash
npx expo start --web
```

## 3. Validate the project

```bash
npm run lint
npx expo-doctor
```

Automatically fix supported lint problems:

```bash
npm run lint:fix
```

## 4. Sync native Android files

Run this after changing `app.json`, Expo config plugins, or native dependencies. It is not needed for normal JavaScript/TypeScript changes.

```bash
npx expo prebuild --platform android
```

Do not routinely add `--clean`; it regenerates the native project and can overwrite manual native changes.

## 5. Where Android files and build outputs are located

The generated native Android project is inside:

```text
/Users/jimmy/Downloads/projects/personal/Standup-Companion/android
```

Important Android locations:

| Item | Location relative to the project root |
|---|---|
| Android native project | `android/` |
| Android app module | `android/app/` |
| Release APK | `android/app/build/outputs/apk/release/app-release.apk` |
| Debug APK | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Local Play Store AAB | `android/app/build/outputs/bundle/release/app-release.aab` |
| Android build reports | `android/build/reports/` |

The full path of the release APK produced on this computer is:

```text
/Users/jimmy/Downloads/projects/personal/Standup-Companion/android/app/build/outputs/apk/release/app-release.apk
```

### Which Android file is the finished application?

For direct installation, the finished application is **only** this file:

```text
android/app/build/outputs/apk/release/app-release.apk
```

It is a real standalone StandUp Companion application, not a dummy or temporary launcher. The release build embeds the compiled React Native/Expo runtime, the production JavaScript bundle, fonts, images, and other app assets. This is why a React Native APK can be tens of megabytes even when the JavaScript source is relatively small.

Do not distribute files from directories such as `intermediates/`, `generated/`, `.cxx/`, or `reports/`. They are build inputs, caches, and diagnostics—not installable applications.

The currently generated 38 MB APK has these verified properties:

- App name: `StandUp Companion`
- Android package: `com.standupcompanion`
- App version: `1.0.0` (`versionCode` 1)
- Minimum Android version: Android 7.0 / API 24
- CPU architecture: `arm64-v8a`
- Contains the standalone production JavaScript bundle at `assets/index.android.bundle`
- Signed with the local Android debug certificate

This APK is final for direct testing on modern ARM64 Android phones. It will not install on a 32-bit-only phone or an x86/x86_64 emulator. For a directly downloadable APK with broader CPU compatibility, use the universal local build or the EAS `preview` build described below. For Google Play, use the EAS `production` AAB so Google Play generates optimized APKs for each supported device.

Check whether the APK exists and see its size:

```bash
ls -lh android/app/build/outputs/apk/release/app-release.apk
```

EAS cloud builds are not automatically placed inside the project. EAS prints an Expo download URL when the build finishes. Download the APK/AAB from that URL or retrieve the link with `build:list`.

The `android/` project is generated and ignored by Git in this repository. Do not store source code inside its `build/` directories because Gradle can delete and recreate them.

## 6. Build a local APK for an Android phone

Recommended ARM64 build for modern physical Android phones:

```bash
cd android
NODE_ENV=production ./gradlew :app:assembleRelease \
  -PreactNativeArchitectures=arm64-v8a \
  --no-daemon
cd ..
```

APK output:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Build a universal APK for ARM phones and x86/x86_64 emulators. This takes considerably longer:

```bash
cd android
NODE_ENV=production ./gradlew :app:assembleRelease --no-daemon
cd ..
```

Build a local ARM64 Android App Bundle for Google Play:

```bash
cd android
NODE_ENV=production ./gradlew :app:bundleRelease \
  -PreactNativeArchitectures=arm64-v8a \
  --no-daemon
cd ..
```

The local AAB will be written to `android/app/build/outputs/bundle/release/app-release.aab`.

Avoid running `./gradlew clean assembleRelease` in this project because stale React Native CMake/codegen state can make the `clean` task fail.

## 7. Install the local APK

Enable USB debugging on the phone, connect it, and check the connection:

```bash
adb devices
```

Install or update the APK while preserving app data:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

If Android reports a signing conflict, uninstalling the old app will fix it, but it also deletes locally stored app data:

```bash
adb uninstall com.standupcompanion
adb install android/app/build/outputs/apk/release/app-release.apk
```

## 8. Fix the stale CMake/codegen error

Use this only when the build reports missing `generated/source/codegen/jni` directories or `externalNativeBuildCleanRelease` errors. These commands remove generated build caches, not source files.

```bash
rm -rf android/app/.cxx android/app/build android/build
cd android
NODE_ENV=production ./gradlew :app:assembleRelease \
  -PreactNativeArchitectures=arm64-v8a \
  --no-daemon
cd ..
```

## 9. Configure EAS cloud builds

Log in and configure the Expo project once:

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure
```

Ensure `eas.json` contains these build profiles:

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

## 10. Build an APK with EAS

This is the command that uploads the project to the EAS build servers, creates an installable APK, waits for completion, and prints a shareable build/download link:

```bash
npx eas-cli@latest build --platform android --profile preview --wait
```

When it finishes, open the printed Expo build-page URL and select **Download**. You can send that same page URL to testers so they can download the APK on their phones.

EAS Build is the APK-building and file-sharing service; this command does not deploy a backend server or publish the app to Google Play.

Force a completely fresh EAS build if its cloud cache is stale:

```bash
npx eas-cli@latest build --platform android --profile preview --clear-cache
```

View recent Android builds and their download links:

```bash
npx eas-cli@latest build:list \
  --platform android \
  --status finished \
  --distribution internal \
  --limit 5
```

Copy a build ID from that list and view its build page/download URL again:

```bash
npx eas-cli@latest build:view BUILD_ID
```

Download a completed APK from EAS to this computer:

```bash
npx eas-cli@latest build:download --build-id BUILD_ID
```

Print the EAS builds dashboard URL without automatically opening a browser:

```bash
npx eas-cli@latest browse builds --no-browser
```

## 11. Build for Google Play

Creates an Android App Bundle (`.aab`) for Play Console upload:

```bash
npx eas-cli@latest build --platform android --profile production
```

Use an APK for direct phone installation and an AAB for Google Play. Before publishing, configure a permanent production signing key and increment the Android `versionCode` for every release.

## 12. Configure Supabase and Google login

The full dashboard instructions, SQL migration, recording-storage details, and
test checklist are in [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).

Create the local environment file and fill in the project URL and publishable
key from the Supabase **Connect** dialog:

```bash
cp .env.example .env
```

Add the same public values to the EAS preview environment:

```bash
npx eas-cli@latest env:set --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR_PROJECT_REF.supabase.co --visibility plaintext
npx eas-cli@latest env:set --environment preview --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value YOUR_PUBLISHABLE_KEY --visibility plaintext
```

After changing native plugins or permissions, regenerate Android before a local
native build:

```bash
npx expo prebuild --platform android
```

## 13. Optional backend commands

Start the backend in development:

```bash
npm run server:dev
```

Build and run the production backend:

```bash
npm run server:build
npm run server:prod
```

Push the Drizzle database schema:

```bash
npm run db:push
```

## Quick reference

```bash
# Develop
npm start

# Check quality
npm run lint
npx expo-doctor

# Build a local ARM64 APK
cd android
NODE_ENV=production ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
cd ..

# Upload to EAS, build an APK, and receive a shareable download link
npx eas-cli@latest build --platform android --profile preview --wait

# Build a Google Play AAB
npx eas-cli@latest build --platform android --profile production
```
