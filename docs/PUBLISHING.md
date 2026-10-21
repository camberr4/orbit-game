# Publishing Orbit Dodger to Google Play

Everything in this repo is ready to ship. The steps below are the parts only you can do (they need your Google account).

## 1. One-time setup
1. Create a Google Play developer account (one-time US$25): https://play.google.com/console
2. Install JDK 21 and the Android SDK (platform 36, build-tools 36.0.0), or just use the GitHub Actions workflow (step 4).
3. Decide your final package name. It is `com.camberr4.orbitdodger` today. To change it, edit `appId` in `capacitor.config.json`, `namespace`/`applicationId` in `android/app/build.gradle`, move the Java package folder and `MainActivity.java`, then run `npx cap sync android`. **It cannot be changed after the first upload.**

## 2. Create your upload key (keep it safe, never commit it)
```bash
keytool -genkeypair -v -storetype PKCS12 -keystore orbit-upload.jks -alias orbit \
  -keyalg RSA -keysize 2048 -validity 10000
```
Create `android/keystore.properties` (it is git-ignored):
```
storeFile=/absolute/path/to/orbit-upload.jks
storePassword=...
keyAlias=orbit
keyPassword=...
```
Back the `.jks` file and passwords up somewhere private. Play App Signing holds the real signing key; this is only your upload key.

## 3. Build the release bundle
```bash
npm ci
npm run aab          # -> android/app/build/outputs/bundle/release/app-release.aab
```

## 4. Or build in GitHub Actions
Add these repository secrets: `ORBIT_KEYSTORE_BASE64` (`base64 -w0 orbit-upload.jks`), `ORBIT_KEYSTORE_PASSWORD`, `ORBIT_KEY_ALIAS`, `ORBIT_KEY_PASSWORD`. Run the **Android build** workflow; it uploads the signed `.aab` (and a debug `.apk`) as artifacts.

## 5. Create the app in Play Console
1. **Create app** -> App, **Game**, **Paid**? **No: choose Free.** The game is free to download with 5 free runs; the full version is an in-app product. (A free app cannot be switched to paid later, and this is what makes the free demo work.)
2. **Store listing**: copy text from `docs/STORE_LISTING.md`. Upload `store/icon-512.png`, `store/feature-graphic-1024x500.png`, and the phone screenshots in `store/screenshots/`.
3. **Privacy policy**: host `docs/privacy-policy.md` (GitHub Pages works) and paste the URL.
4. **App content**: Data safety = *no data collected, no data shared*. Ads = *No ads*. Content rating questionnaire = no violence beyond abstract arcade action (expect PEGI 3 / Everyone). Target audience 13+ (or all ages; there is no user-generated content).
5. **Monetize -> Products -> In-app products -> Create product**
   * Product ID: `orbit_full_unlock` (must match exactly)
   * Type: managed (one-time) product
   * Price: **US$1.99** (set local prices as you like)
   * Status: Active
6. **Testing**: upload the `.aab` to **Internal testing**, add yourself under *License testers* (Settings -> License testing), install from the opt-in link and test the purchase and *Restore purchase* flow. License testers are never charged.
7. When happy, promote to **Production** and submit for review.

## 6. Updating
Bump `versionCode` (and `versionName`) in `android/app/build.gradle`, rebuild the bundle and upload it as a new release.

## Notes
* Purchases use `cordova-plugin-purchase` with Google Play Billing 9. The entitlement is cached on-device so the game works offline; Play re-confirms it at launch. For a US$2 game this is deliberately lightweight. If you later want server-side receipt validation, hook it into `OD.shop` (`www/js/store.js`).
* The debug APK cannot complete real purchases (Play only serves products to builds uploaded to a Play track). Use Internal testing for that.
* Saves live in WebView storage and are included in Android Auto Backup, so progress follows players to a new phone.
