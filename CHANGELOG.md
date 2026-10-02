# Changelog

## v1.7.2 — GMS PowerKeeper policy and Android Save Log

- When PowerKeeper disarm is enabled, set primary-user GMS bgControl to
  noRestrict, insert its row if absent, and verify the result. Preserve recorded
  stock values; disabling disarm/uninstall restores them or removes a new row.
- Share this policy between the WebUI and bounded boot retries. Leave Play Store
  on miuiAuto; no sys-whitelist addition, services.jar patch or new background daemon.
- Fix Android Toybox mktemp compatibility: trailing X template, .log export with
  noclobber, cleanup of the empty reservation, and visible errors on failure.
  Include the current GMS PowerKeeper row in local diagnostics.
- Framework patcher/profile unchanged: valid artifacts remain reusable. PC/CI
  tests are not physical-device notification-delivery or battery certification.

## v1.7.1 — manager app picker and local Save Log

- Prefer the manager's listPackages/getPackagesInfo WebUI APIs and ksu://icon
  handler for installed app names and icons. Do not invoke the Java catalog helper.
- Fall back to primary-user PackageManager shell inventory if native APIs are
  absent, malformed, empty or fail. Metadata/icon errors retain selectable rows.
- Exclude explicitly secondary-user UIDs, validate package names and render
  labels as text. Failed icons use a local placeholder, not an external image.
- Framework patcher/profile/revision unchanged: no JAR preparation is required
  solely for this update. Real-device manager API testing is still required.
- Add Save Log to primary-user Download: module/device/Core/Framework snapshot,
  full patch preparation log, policy and retained WebUI responses/errors.
  WebUI history is session-only, bounded to 24000 characters with explicit loss
  markers. No redaction within retained module logs; review before sharing.
- No GitHub issue submission, upload button, token, network diagnostics collector
  or Android-wide logcat. Each export creates a new file without overwriting.

## v1.7.0 — experimental Framework engine

- PC tests passed; physical-device boot/delivery has not been verified.
  Framework is off by default. Verify recovery/module-disable access before activation.
- One module/ZIP/WebUI with independent Core and optional Framework engines.
- Add a searchable app picker with actual PackageManager labels, PNG icons and
  full package names. English/Vietnamese and system/light/dark remain.
- Keep primary-user selections in an atomic root-owned/system-readable policy.
  No root grants, permanent keep-alive, all-app mode or stopped-package flags.
- Add a source-built narrow miui-services.jar patch: selected GMS push autostart
  and freezer-thaw exceptions; retain stock policy for every other event.
- Only the experimental Pandora OS3.0.319 input profile is admitted. Require
  exact pristine hashes, structural/linkage checks and on-device ART verification.
- Keep verified artifacts outside the replaceable module directory. UI/catalog
  updates do not repatch; changed patcher/profile/runtime keys prevent reuse.
- No automatic post-OTA patching, notification/VOIP tweaks, cache purge or
  manual AOT-cache publication. Core still supports other HyperOS models.
- Framework is disabled until explicitly prepared/enabled, and requires reboot.
  An unconfirmed activation is skipped at the next boot; recovery access is still required.
- Not yet validated for real-device boot, delivery, OEM cache behavior or battery use.

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
