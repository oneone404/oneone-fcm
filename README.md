# OneOne FCM

OneOne FCM is a ReSukiSU / KernelSU module for Xiaomi 17 Pro on HyperOS China firmware. It keeps FCM delivery working without replacing the ROM or kernel.

The Lite profile keeps only the parts required for delivery: the FCM wake filter,
Google Play services exemption, and the China-ROM PowerKeeper/Greezer handling.
It does not force lockscreen/AOD settings, notification-channel permissions,
sound behavior, FullScreen Intent, or MIUI prestart settings.

## v1.8.0 baseline and compatibility

This release restores the **v1.4.0 engine**, including both framework JAR patches,
with a single-page WebUI and the newer native-style app picker. It is **not**
the all-HyperOS settings-only/experimental v1.5–v1.7 engine.

Supported target: **Xiaomi 17 Pro (`pandora`), OS3.0.319.0.WBLCNXM, SDK 36**.
The installer verifies the model, firmware and pristine JAR hashes and refuses
other targets. Do not bypass these checks.

### Coming from v1.7.x

1. Disable OneOne FCM in ReSukiSU and reboot, so the old overlay is no longer
   mounted. Do not just untick the WebUI framework option without rebooting.
2. Install v1.8.0 through the manager (online Update or the release ZIP). The
   restored installer must read pristine stock JARs; v1.7's external artifact
   directory is not used as patch input or deleted by this release.
3. Reboot after successful installation, open WebUI and check patch status.
4. Choose the wake mode, open Choose apps, select apps and press Save selection.
   The v1.7 `0:package` policy is not converted; choose the list again. Do not
   rely on existing v1.7 selections carrying across.

If installing fails with a JAR hash mismatch, keep the module disabled, verify
the exact firmware and stock framework, and do not force the installer through.
The first transition rebuilds both patches; later UI-only updates on this engine
can reuse the existing verified artifacts as described below.

The picker shows full names/icons through compatible manager APIs. With an
unavailable API it still offers the backend's third-party package names; it does
not claim those fallback names are app labels. Cancel discards the popup draft.
Save selection also saves the current wake mode through the v1.4 backend.
App-list changes take effect without reboot **after** the framework is active;
installing or replacing the framework still requires a reboot.

### Local WebUI verification

Run `node tests/verify-webui.mjs` for policy/picker and firmware-baseline tests.
Run `node tools/preview.mjs` and open `http://127.0.0.1:8766/` for a desktop demo.
The preview uses fake manager/package data and never accesses an Android device.
It cannot verify real manager APIs, ART compilation or notification delivery.

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
2. Run WebUI tests and keep update.json pointing at the last verified release.
3. Commit the changes, then push a matching tag such as v1.8.0.
4. GitHub Actions packages module/ and publishes the corresponding ZIP.
5. Verify the published ZIP, then update and push update.json with the new
   version, versionCode and release URL. Never expose an unbuilt ZIP in the feed.
6. Bump `PATCH_REVISION` in `module/customize.sh` if a framework patch changes
   without changing `tools/patcher.jar`.

The ZIP is intentionally built from the contents of module/, so it has the layout ReSukiSU expects at the root of the archive.
