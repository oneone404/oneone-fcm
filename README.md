# OneOne FCM

v1.7.1 adds manager-native app selection and local Save Log. Its manager API
integration is PC-tested, not yet verified on a connected phone.

A ReSukiSU / KernelSU module for Android-based Xiaomi HyperOS
phones and tablets, including Xiaomi / Redmi / POCO, China and Global ROMs.
**v1.7.0 includes an experimental Framework engine**: one ZIP
with a broadly compatible settings Core and an optional, firmware-specific
Framework engine. PC tests passed, but physical-device boot/delivery testing
has not been completed. Framework stays off until explicitly prepared/enabled.
Core has no model, exact firmware or SDK allowlist. Installation detects
HyperOS and requires Google Play services for the primary Android user (0).

Cross-device support is capability-based, not a promise that every model/OS
has been tested. Unsupported AppOps and unavailable Greezer/PowerKeeper
controls are skipped. Future HyperOS behavior can change; this module cannot
guarantee delivery, and does not install GMS on a ROM missing Google services.

## Core behavior

After boot, it gives Google Play services a user Doze exemption and allows
RUN_IN_BACKGROUND, RUN_ANY_IN_BACKGROUND, MIUI autostart (10008), and WAKE_LOCK.
It requests a Greezer thaw/unmonitor, unfreezes GMS cgroup nodes when present,
and sends GCM_RECONNECT once to GMS. This is a reconnect request,
not evidence of an active FCM connection.

Optional PowerKeeper handling disables gms_control, keeps Play Store on
miuiAuto, and flushes only the IPv4/IPv6 gms_wall chains. It retries during
startup, not indefinitely. The WebUI controls its current state and whether
to apply it on boot. Turning off boot application prevents future application;
it does not restore the current state. Turn off the firewall-disarm switch
to restore the recorded PowerKeeper settings.

PowerKeeper boot handling defaults to on for China and off for other regions.
An existing explicit boot preference is retained. If gms_control cannot be
read, its switches are unavailable and no PowerKeeper changes are attempted.

Core itself performs no JAR patch or framework mount. v1.7.0 separately adds
an optional selected-app Framework engine described below. Neither engine
requires Vector/LSPosed or changes lockscreen/VOIP/notification alert behavior.
The Greezer thaw lease is 24 hours; OEM settings may be changed again by
the OS. This is not an always-running guarantee.

FCM requires a working connection to Google. Some apps use their own push
services. App permissions, channels, autostart and battery restrictions still
matter. The new patch does not add INCLUDE_STOPPED_PACKAGES flags, and its
autostart exception excludes stopped applications.

## Optional Framework engine (experimental)

The app picker prefers the root manager's listPackages/getPackagesInfo APIs for
user-0 app names and packages, and ksu://icon for app icons. If those APIs are
unavailable, malformed or empty, primary-user shell inventory keeps package-only
rows selectable. Missing names/icons use local fallbacks; the Java catalog helper
is no longer invoked. Actual installed-manager support remains a device test.
Selection alone does nothing to framework behavior until a verified patch is
prepared, enabled and activated by reboot. Exceptions apply only to selected
targets of authenticated GMS C2DM pushes; unselected/unrelated requests retain
stock OEM policy. This is not a whitelist for arbitrary background services.

The current experimental profile admits only Pandora OS3.0.319 / Android 16
with exact stock services.jar and miui-services.jar hashes. Only miui-services.jar
is modified, at its autostart and Greezer broadcast checks. Other HyperOS builds
continue using Core, without a framework patch. No all-model patch claim is made.

Preparation requires structural/linkage validation and on-device ART verification;
missing/failing verification cannot be enabled. Outputs and stock input remain
in private /data/adb/oneone_fcm state across module/UI updates. A changed runtime,
profile or patcher invalidates reuse; UI/catalog changes do not. An OTA mismatch
skips the mount rather than repatching automatically. Never hot-unmount a loaded JAR.

See [architecture and testing](docs/framework-engine.md) before testing. There
is no physical-device boot/delivery validation yet. Keep recovery-based module
disable access available; boot guards cannot guarantee recovery from every failure.

## Installation and upgrade

1. Download [OneOne FCM v1.7.1](https://github.com/oneone404/oneone-fcm/releases/tag/v1.7.1)
   or use the manager's online Update action.
2. Install the ZIP in ReSukiSU / KernelSU.
3. **Reboot** to activate the updated service and module scripts.
4. Open the single-page WebUI. Status reports the GMS Doze exemption, not a
   delivery test. PowerKeeper and theme/language controls are on the same page,
   without bottom navigation. English/Vietnamese and system/light/dark remain.

Optional Framework testing on the admitted Pandora OS3.0.319 profile:

1. Verify recovery/Safe Mode module-disable access before enabling Framework.
2. Open **Choose apps**, select packages using their names/icons, and save.
3. Choose **Prepare and verify patch**. Do not enable if preparation fails.
4. Only after **Ready / disabled**, enable Framework and reboot again.
5. Confirm **Active**, then test actual remote messages with the screen locked.

Changing selected apps does not require repatching or reboot while the verified
Framework is active. Disabling Framework requires reboot to unload its overlay.
Other builds remain Core-only. This is an experimental test path, not boot certification.

## Local diagnostics

Reproduce the problem (for example open **Choose apps**) and, without closing
the WebUI, press **Save Log**. It saves a new `OneOne-FCM-*.log` in
`/storage/emulated/0/Download` (the Android Download folder, not `/downloads`).
The exact path or a storage/root error is shown below the button.

The file includes module version, model/firmware, current GMS Doze/AppOps and
PowerKeeper state, Framework status/manifest, full policy and full `prepare.log`
if present, and raw retained manager/bridge responses and errors. This is module
diagnostics, not all Android logs or a delivery trace. No keybox, account/token
files or Android-wide logcat are collected. Package names and error text are
not redacted: inspect the file before manually sharing it anywhere.

WebUI history is held only in memory for the current open session, limited to
24000 characters; removed/truncated entries are explicitly counted. Closing
the WebUI clears that history, but exported files stay in Download until you
delete them. No extra daemon, polling loop, upload, GitHub token or automatic
issue submission is used. Save Log does not change notification policy or patch
any JAR, and a UI-only update reuses valid Framework artifacts.

Upgrades preserve stock_settings.conf (original GMS/PowerKeeper settings),
the PowerKeeper boot preference, and the new engine's external policy/artifacts.
Obsolete FSI and Android Settings records are filtered out. The installer does
not patch or compile JARs; preparation is an explicit WebUI action.

This release accepts fresh stock-framework installs and upgrades from v1.5.0
or later after reboot has finished the v1.5.0 cleanup. A pre-v1.5 install or
pending cache-cleanup record is rejected without changing the installed module.
No direct upgrade from pre-v1.5 patched versions is provided.

After an OS update, recheck GMS/PowerKeeper capabilities and delivery. This
module does not replace the kernel or perform firmware-specific repatching.
Keep a way to disable modules from recovery before installing root changes.

## Removal and resource use

Remove the module and reboot. Original GMS AppOps/Doze and PowerKeeper state
are restored after boot from the preserved backup; the restore job keeps the
backup on PowerKeeper failure. Greezer is returned to monitoring (the original
monitoring state was not recorded by older releases). This is not a complete
rollback of changes made separately by the user or other modules.

There is no continuous daemon/polling or held wakelock. Keeping GMS less
restricted can nevertheless increase battery use; no fixed percentage has
been measured on the phone.
The optional JAR overlay also has storage/ART compilation costs that have not
been measured. On uninstall, its policy is removed and private artifacts are
cleaned at the next boot; live system_server is never hot-unmounted.

## Development and online releases

Set JAVA_HOME and ANDROID_HOME (JDK 17+, Android platform/build-tools 36).
Run `node tools/build-tools.mjs`, then `node tests/verify.mjs`; Git Bash is
required for Windows shell fixtures. Generated helper JARs are not committed.
Tests check syntax, UI consistency, essential settings preservation, uninstall
restoration and rejection of unfinished/unsupported upgrades. They do not
replace testing on the target phone.
China/Global, different HyperOS properties and missing OEM-feature fixtures
exercise compatibility; these are simulated, not physical-device coverage.

Bump module/module.prop, add release notes and tag the same version.
GitHub Actions tests, packages module/ and publishes the ZIP. After the asset
is available, update update.json with the matching versionCode and URL.
ReSukiSU reads updateJson from module.prop; updates require user confirmation.
