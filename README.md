# OneOne FCM

OneOne FCM is a ReSukiSU / KernelSU module for Xiaomi 17 Pro on HyperOS China firmware. It keeps FCM delivery working without replacing the ROM or kernel.

The Lite profile keeps only the parts required for delivery: the FCM wake filter,
Google Play services exemption, and the China-ROM PowerKeeper/Greezer handling.
It does not force lockscreen/AOD settings, notification-channel permissions,
sound behavior, FullScreen Intent, or MIUI prestart settings.

## Fast UI and logic updates

The installer writes a compatibility key for the patched framework. On a later
update it reuses the existing framework JARs and AOT cache only when the ROM
fingerprint, stock JAR hashes, patcher hash, and patch revision all match.
This makes WebUI or shell-only updates skip bytecode patching, ART verification,
and dex2oat. A firmware, patcher, or patch-revision change always falls back to
a full verified rebuild.

## Install

1. Download the latest OneOne FCM ZIP from [Releases](../../releases).
2. Open ReSukiSU, then Modules, then install from storage.
3. Select the ZIP, let the installer finish, then reboot when it asks.
4. Open the module WebUI and choose the wake policy and app list.

Only install a release that explicitly supports your model and firmware. Keep a working recovery route before changing a root module.

## Online updates

The module exposes the standard updateJson manifest used by KernelSU-compatible managers. When a newer compatible release is published, ReSukiSU can offer an **Update** action. Updates always require your confirmation; the module never downloads or installs an update by itself.

## Release process

1. Update module/module.prop (version and versionCode).
2. Update update.json with the same values and the new GitHub Release URL.
3. Commit the changes, then push a matching tag such as v1.1.1.
4. GitHub Actions packages module/ and publishes the corresponding ZIP.
5. Bump `PATCH_REVISION` in `module/customize.sh` if a framework patch changes
   without changing `tools/patcher.jar`.

The ZIP is intentionally built from the contents of module/, so it has the layout ReSukiSU expects at the root of the archive.
