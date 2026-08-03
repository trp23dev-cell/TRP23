# Android Release Pipeline (TrapMadeIt)

This guide documents the full path from this repo to a distributable Android APK and play store release.

## 1) Prerequisit

- Android SDK + build tools installed locally or via Android Studio.
- Java Development Kit (JDK) 11+ (Android Gradle requires this).
- A keystore file (`.jks`) for signing release APKs.
  - Generate once, reuse forever for all future releases.
- Public HTTPS backend API URL (phone builds cannot use localhost).
- Google Play Developer account (optional, for Play Store distribution; costs 25 USD one-time).

## 2) Project Setup (already scaffolded in this repo)

- Capacitor config: `capacitor.config.ts`
- Android helper scripts in `package.json`:
  - `npm run android:prepare`
  - `npm run android:sync`
  - `npm run android:open`
- Android env example: `.env.android.example`

## 3) Generate Keystore (one-time)

If you don't have a keystore yet:

```bash
keytool -genkey -v -keystore ~/trapmadeit-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias trapmadeit
```

Answer the prompts:
- Enter keystore password (save it).
- Enter key password (can be same as keystore).
- Fill in name, org, location details.

Save the file path and passwords securely; you'll need them for all future releases.

## 4) Configure Production API

1. Copy `.env.android.example` to `.env.production`.
2. Set your hosted API origin (no `/api` suffix), for example:

```env
VITE_API_ORIGIN=https://api.trapmadeit.com
```

3. Build web assets:

```bash
npm run build
```

## 5) Create/Sync Android Project

Install dependencies and sync Capacitor assets:

```bash
npm install
npm run android:sync
```

If Android platform is not yet added:

```bash
npx cap add android
npm run android:sync
```

## 6) Build Release APK (local or via Gradle)

Option A: Using Android Studio:

1. Open Android project:

```bash
npm run android:open
```

2. In Android Studio:
   - Select `app` module.
   - `Build` → `Generate Signed Bundle/APK`.
   - Select `APK`.
   - Choose your keystore file, provide password.
   - Select `Release` build variant.
   - Click `Create`.
   - APK is generated in `android/app/release/`.

Option B: Using Gradle command line:

```bash
cd android
./gradlew assembleRelease \
  -Pandroid.injected.signing.store.file=~/trapmadeit-release.jks \
  -Pandroid.injected.signing.store.password=YOUR_KEYSTORE_PASSWORD \
  -Pandroid.injected.signing.key.alias=trapmadeit \
  -Pandroid.injected.signing.key.password=YOUR_KEY_PASSWORD
cd ..
```

APK is generated at: `android/app/release/app-release.apk`

## 7) Distribution Options

### Local Testing (direct install)

Share APK file directly:

```bash
# From project root, APK is at:
android/app/release/app-release.apk
```

Recipient can:
1. Download APK to their Android phone.
2. Enable "Unknown Sources" in Settings → Security.
3. Open file manager, tap APK to install.

### Google Play Store

1. In Google Play Console, create an app listing.
2. Upload signed APK to internal testing → production.
3. Google reviews (usually 1-4 hours), then live to all.

## 8) Release Checklist

- API endpoint is HTTPS and reachable from mobile networks.
- Auth/session flows tested on real Android device.
- Gameplay, purchases, and profile sync tested on device.
- Build version and version code incremented in `android/app/build.gradle`.
- Keystore password stored safely (not in git).
- TestFlight equivalent: Google Play's "internal testing" track for team distribution before public release.

## 9) GitHub Actions Pipeline (included)

This repo includes an on-demand workflow at `.github/workflows/android-release.yml`.

Trigger path:

1. GitHub → Actions → `Android Release`.
2. Click `Run workflow`.
3. Enter:
   - `version_name` (for example `1.0.1`)
   - `version_code` (for example `101`)

Required repository secrets:

- `VITE_API_ORIGIN`: Hosted HTTPS API origin (without `/api`).
- `ANDROID_KEYSTORE_BASE64`: Base64-encoded `.jks` keystore file.
- `ANDROID_KEYSTORE_PASSWORD`: Password for the keystore.
- `ANDROID_KEY_ALIAS`: Alias used when creating the keystore (e.g., `trapmadeit`).
- `ANDROID_KEY_PASSWORD`: Password for the key inside the keystore.

Base64 example:

```bash
base64 -i ~/trapmadeit-release.jks | pbcopy
```

After successful build:

1. GitHub Actions generates `app-release.apk` as an artifact.
2. Download APK from Actions workflow run.
3. Share directly with team or upload to Google Play Console.

## 10) Next Steps

- Enroll in Google Play Developer Program (25 USD) if distributing via Play Store.
- Set up Play Store app listing and privacy policy.
- Use internal testing track for team distribution before public release.
