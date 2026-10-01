# OneOne FCM

A settings-only ReSukiSU / KernelSU module for Xiaomi 17 Pro on HyperOS China.
This release is gated to **pandora / OS3.0.319.0.WBLCNXM / Android SDK 36**.
Other firmware has not been validated; no guarantee of notification delivery.

## What v1.5.0 does

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

There is **no JAR patch, framework mount, bytecode compiler, wake filter,
per-app whitelist, keep-alive watcher, Vector/LSPosed or lockscreen override**.
The Greezer thaw lease is 24 hours; OEM settings may be changed again by
the OS. This is not an always-running guarantee.

FCM requires a working connection to Google. Some apps use their own push
services. App permissions, channels, autostart and battery restrictions still
matter. Without the old framework patch, force-stopped apps are not forcibly
awakened and delivery may differ from patched releases.

## Installation and upgrade

1. Download [OneOne FCM v1.5.0](https://github.com/oneone404/oneone-fcm/releases/tag/v1.5.0)
   or use the manager's online Update action.
2. Install the ZIP in ReSukiSU / KernelSU.
3. **Reboot.** An old JAR overlay remains active until reboot; do not unmount
   or replace a framework currently used by system_server.
4. Open the WebUI. Home reports the GMS Doze exemption, not a delivery test.
   PowerKeeper controls and English/Vietnamese Light/Dark/system theme remain.

Upgrades preserve stock_settings.conf (original GMS/PowerKeeper settings)
and /data/system/fcm_pk_boot.conf. Only small records of the old cache manifest
and archive checksums are carried forward, never JARs or the AOT archive.
On the next boot before zygote, exact matching legacy artifacts under
/data/dalvik-cache are removed. Changed, unrelated and symlinked entries are
left alone; /data/misc/apexdata/com.android.art/dalvik-cache is never touched.
Missing old archives are not guessed or replaced by broad cache deletion.
The old wake configuration is retired. A legacy fcm_notification_fix install
is disabled to prevent it mounting alongside the new module; its directory
is not deleted automatically.

### Roll back to the patched v1.4.0

On the same supported firmware, reinstall the v1.4.0 ZIP from Releases and
reboot; its installer rebuilds the framework patch. This is not a live toggle.
The previous custom whitelist is not backed up; the old installer recreates
its default list. Downgrading across different OS builds is not supported.
Rollback has not yet been exercised on the phone.

Do not update the OS assuming this firmware-gated build will keep working.
Recheck GMS/PowerKeeper behavior and publish a tested build for the new OS.
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
Tests check syntax, UI consistency, backup preservation and scoped/idempotent
cache cleanup. They do not replace testing on the target phone.

Bump module/module.prop, add release notes and tag the same version.
GitHub Actions tests, packages module/ and publishes the ZIP. After the asset
is available, update update.json with the matching versionCode and URL.
ReSukiSU reads updateJson from module.prop; updates require user confirmation.
