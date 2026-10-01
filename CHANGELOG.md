# Changelog

## v1.6.0

- Remove the one-time legacy framework/AOT migration engine, manifests and
  post-fs-data hook. No code reads or writes Android framework/cache files.
- Require completed v1.5.0 migration for existing installs; clean stock
  first installs remain supported. No direct upgrade from patched versions.
- Remove old FSI, SystemUI XML, notification-settings and repatch restoration.
- Retain only the tiny original GMS/PowerKeeper settings record required to
  restore current controls and uninstall cleanly; discard obsolete records.
- Keep GMS/FCM behavior unchanged. No whitelist backup or extra daemon.
- Keep the uninstall settings record on GMS or PowerKeeper restore failure.
- Remove device, exact firmware and SDK locks. Detect Android-based HyperOS
  and installed GMS; skip unsupported AppOps and unavailable OEM controls.
- Default PowerKeeper boot handling to on for China and off elsewhere, while
  retaining the user's explicit preference.
- Combine status, PowerKeeper, appearance/language and about into one scrolling
  page; remove bottom navigation, tab logic and translations.

## v1.5.0

- Remove framework JAR patching, repatching, framework mounts and dex2oat.
- Keep GMS background AppOps, Doze exemption, Greezer thaw/unmonitor,
  boot reconnect request and optional PowerKeeper GMS firewall handling.
- Upgrade stages only checksummed records of legacy cache artifacts. At the
  next boot, remove matching module-created files from /data/dalvik-cache;
  leave unrelated/changed files and ART-managed cache untouched.
- Preserve original settings backups and the PowerKeeper boot preference.
- Remove the ineffective wake whitelist/app list and repatch WebUI. Keep
  Home, PowerKeeper and Settings with English/Vietnamese and system theme.
- Status reads are non-mutating. PowerKeeper mutations require a saved backup.
- Reboot is mandatory when upgrading from a patched release. Notifications
  depend on network/app settings; this version does not bypass stock wake rules.

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
