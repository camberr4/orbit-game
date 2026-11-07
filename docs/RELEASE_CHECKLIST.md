# Release checklist

Run through this on a real phone before a build goes to testers or to production.
Each build is an Actions run: the run number is the version code.

## Every build
- [ ] The Actions run is green and has the `halo-run-release-aab` artifact.
- [ ] **Fresh install** (uninstall first): the loading screen reaches the menu, the welcome screen appears, the first run plays.
- [ ] **Update over the previous build** (do not uninstall): the old progress is still there (stardust, skills, best scores), and the game starts normally.
- [ ] **Close and reopen** during a paused run: the run can be resumed.
- [ ] Time from tapping the icon to the menu on a cold start (note it; it should stay under about 6 seconds).
- [ ] One run each in Aurora Reach and, with the full game, in Ember Rift: smooth, no long stutters.

## Money
- [ ] Unlock screen shows the price and opens the purchase sheet.
- [ ] Buying (test card) unlocks the full game; it is still unlocked after closing and reopening.
- [ ] Restore purchase on a second install of the same account brings the unlock back.

## Phone and screen
- [ ] No black bar at the top, nothing important under the camera cut-out or the gesture bar.
- [ ] Incoming call or another app taking the sound: the game pauses or ducks, and comes back correctly.
- [ ] Back button / back gesture never closes the app in the middle of a run.

## Settings
- [ ] Graphics, sound, "Reduce flashing" and "Send feedback" all work (feedback opens an email with the version and phone filled in).

## Before uploading to Play
- [ ] Release name: `Halo Run 1.0.0 (<run number>) <track> <n>`
- [ ] Release notes inside `<en-US>...</en-US>`
- [ ] Never delete `signing/upload-key.enc`; keep the password (GitHub secret `ORBIT_KEYSTORE_PASSWORD`).
