# Changelog

## v1.8.0

- Restore the v1.4.0 framework engine: both services.jar and miui-services.jar,
  the original patcher, AOT verification/cache and wake-policy configuration.
- Single-page WebUI with no bottom navigation. Retain system/light/dark themes
  and English/Vietnamese.
- Bring back the native-style app picker: full label, icon, package, search,
  optional system apps, cancel and explicit save. Read manager metadata first;
  fall back to the existing package list if the manager API is unavailable.
- Keep v1.4 configuration semantics (ALL/WHITELIST/BLACKLIST, bare packages);
  do not import v1.7 user-prefixed policies into the old engine.
- This release is firmware-locked to pandora OS3.0.319.0.WBLCNXM / SDK 36.
  Disable v1.7.x and reboot to restore stock framework before installing.
  Reboot again after the new module finishes installing.

## v1.2.3

- Hide visual scrollbars while preserving touch scrolling throughout WebUI.

## v1.2.2

- Remove the VoIP FullScreen Intent feature and its per-app configuration path.
- Simplify the app list by removing preset, import, export, select-all and clear actions.

## v1.2.1

- Add a one-tap action to restore the OneOne Lite whitelist and core FCM settings.

## v1.2.0

- Add the Lite profile: retain FCM delivery, GMS, PowerKeeper and Greezer handling.
- Remove boot-time lockscreen/AOD changes and global notification-channel forcing.
- Default fresh installs to a limited messaging, mail and banking app allowlist.

## v1.1.4

- Fix upgrades when the active module's framework overlay is still mounted by
  reusing its verified stock framework stash before re-patching.

## v1.1.3

- Simplify the public project title and release asset name to OneOne FCM.

## v1.1.2

- Move the canonical project URL to oneone404/oneone-fcm.
- Point the online update manifest to the canonical repository.

## v1.1.1

- Refined WebUI Material 3 surfaces, controls and bottom navigation.
- Smaller, consistent type and icon scale.
- Added standard online-update metadata for ReSukiSU / KernelSU-compatible managers.

## v1.1.0

- Initial standalone release for Xiaomi 17 Pro (pandora).
- ReSukiSU / KernelSU-compatible module metadata and online update manifest.
- WebUI includes system-following light and dark themes.
