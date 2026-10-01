# OneOne FCM

A settings-only ReSukiSU / KernelSU module for Android-based Xiaomi HyperOS
phones and tablets, including Xiaomi / Redmi / POCO, China and Global ROMs.
There is no model, exact firmware or SDK allowlist. Installation detects
HyperOS and requires Google Play services for the primary Android user (0).

Cross-device support is capability-based, not a promise that every model/OS
has been tested. Unsupported AppOps and unavailable Greezer/PowerKeeper
controls are skipped. Future HyperOS behavior can change; this module cannot
guarantee delivery, and does not install GMS on a ROM missing Google services.

## What v1.6.0 does

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

There is **no JAR patch, framework mount, bytecode compiler, wake filter,
per-app whitelist, keep-alive watcher, Vector/LSPosed or lockscreen override**.
The Greezer thaw lease is 24 hours; OEM settings may be changed again by
the OS. This is not an always-running guarantee.

FCM requires a working connection to Google. Some apps use their own push
services. App permissions, channels, autostart and battery restrictions still
matter. Without the old framework patch, force-stopped apps are not forcibly
awakened and delivery may differ from patched releases.

## Installation and upgrade

1. Download [OneOne FCM v1.6.0](https://github.com/oneone404/oneone-fcm/releases/tag/v1.6.0)
   or use the manager's online Update action.
2. Install the ZIP in ReSukiSU / KernelSU.
3. **Reboot** to activate the updated service and module scripts.
4. Open the single-page WebUI. Status reports the GMS Doze exemption, not a
   delivery test. PowerKeeper and theme/language controls are on the same page,
   without bottom navigation. English/Vietnamese and system/light/dark remain.

Upgrades preserve only stock_settings.conf (original GMS/PowerKeeper settings)
and /data/system/fcm_pk_boot.conf. Obsolete FSI and Android Settings records
are filtered out. There is no JAR/whitelist backup, migration engine,
post-fs-data hook or Android cache operation.

This release accepts fresh stock-framework installs and upgrades from v1.5.0
or later after reboot has finished the v1.5.0 cleanup. A pre-v1.5 install or
pending cache-cleanup record is rejected without changing the installed module.
No direct upgrade from a patched version is provided in v1.6.0.

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

## Development and online releases

Run `node tests/verify.mjs` with Git Bash available for shell fixtures.
Tests check syntax, UI consistency, essential settings preservation, uninstall
restoration and rejection of unfinished/unsupported upgrades. They do not
replace testing on the target phone.
China/Global, different HyperOS properties and missing OEM-feature fixtures
exercise compatibility; these are simulated, not physical-device coverage.

Bump module/module.prop, add release notes and tag the same version.
GitHub Actions tests, packages module/ and publishes the ZIP. After the asset
is available, update update.json with the matching versionCode and URL.
ReSukiSU reads updateJson from module.prop; updates require user confirmation.
