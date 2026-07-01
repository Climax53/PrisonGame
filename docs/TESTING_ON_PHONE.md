# Testing on your phone (no computer required)

Warden's Keep is a web build wrapped for native stores, so you can playtest the
**real game** on a phone without a Mac, Xcode, or Android Studio. Those native
tools are only needed at the very end, for **store submission** — not for
playing or iterating.

Here are three ways to test, easiest first.

---

## 1. Play in your phone browser (fastest — iOS *and* Android) ✅ recommended

The repo deploys itself to a public URL via GitHub Pages. One-time setup:

1. On GitHub, open the repo → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. That's it. Every push builds and publishes automatically. (You can also go to
   the **Actions** tab → *Deploy web build to GitHub Pages* → **Run workflow**.)

Your game will be live at:

```
https://climax53.github.io/PrisonGame/
```

Open that on your phone and play. Add it to your home screen (Share → *Add to
Home Screen*) and it launches fullscreen, exactly like an installed app — this
is a genuine test of the real game and UI on your device.

> Because the work is on a branch, either merge it to `main` or keep pushing to
> the work branch — the deploy workflow is configured to publish from both.

---

## 2. Install a real Android app on your Samsung (native feel) 📱

The repo can build an installable `.apk` in the cloud that you download straight
to your phone:

1. GitHub → **Actions** tab → **Android debug APK** → **Run workflow**.
2. When it finishes (a few minutes), open the run and download the
   **`wardens-keep-debug-apk`** artifact.
3. On your Samsung, tap the downloaded `app-debug.apk` to install. The first
   time, Android will ask you to allow **"Install unknown apps"** for your
   browser or Files app — approve it, then install.

This runs the same build as a true native app on your device. (It's an
unsigned *debug* build — perfect for testing, not for the Play Store.)

---

## 3. iPhone native testing 🍏

iOS requires a signed build, which needs Apple's toolchain. Without a Mac the
practical options are:

- **Use method #1** (browser + Add to Home Screen) — covers ~everything you need
  to test gameplay and feel on iPhone.
- Later, for TestFlight distribution: build/sign on a Mac (`npx cap open ios`
  → Xcode) or a cloud-Mac CI service (e.g. Codemagic, Xcode Cloud). This belongs
  in the Phase 3–4 store-submission stage, not now.

---

## Which should you use right now?

**Method #1.** Flip the Pages setting once, open the URL on your phone, and
you're playtesting the real game in under two minutes. Keep developing in
parallel — every push updates the live URL automatically, so testing and
development don't block each other.
