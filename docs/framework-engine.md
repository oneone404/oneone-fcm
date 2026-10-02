# OneOne FCM: unified Core / Framework engine

Status: v1.7.0 experimental Framework engine. No physical-device
boot, FCM-delivery, native catalog or battery verification has been completed.

## Ownership and layout

One module ID (`oneone_fcm`), one ZIP and one single-page WebUI. Core runs in
service.sh. Framework preparation and boot mounting are independent of Core.

| Path | Owner / purpose |
| --- | --- |
| module/lib/framework.sh | Preparation, verification, reuse, status and policy writes |
| module/post-fs-data.sh | Optional pre-zygote guarded mount; never patch at boot |
| module/framework-job.sh | One requested preparation job; no persistent worker |
| module/tools/catalog.jar | Legacy generated helper; no longer invoked by the WebUI |
| module/tools/patcher.jar | Source-built policy helper plus DEX patcher |
| module/profiles/pandora-319.conf | Exact experimental input allowlist |
| /data/adb/oneone_fcm | Root-only generated state, JARs, manifest and preparation log |
| /data/system/oneone_fcm_policy.conf | root:system 0640, system_data_file, atomically replaced policy |

Helper source is in patcher/src. Reused DEX repacking/register/linkage utilities
derive from biplobsd/fcm_notification_fix v1.5 under MIT. Attribution/licenses
are shipped in module/licenses alongside the embedded library notices.

## Policy, not permanent keep-alive

Policy has exactly one enabled flag, one primary-user GMS UID and zero or more
`0:package.name` entries. No ALL/BLACKLIST mode. Missing, malformed or unreadable
policy defaults to stock behavior. The UID and package must identify GMS, the
action must be `com.google.android.c2dm.intent.RECEIVE`, and the target user and
package must be selected. A rejected exception means **defer to OEM policy**,
not block a notification that would ordinarily be delivered.

The policy is immutable in memory. A parent-directory FileObserver invalidates
it on atomic replacement; an on-demand five-second retry covers missed events.
No polling thread, per-app process keep-alive or permanently held wakelock exists.
The autostart exception also refuses ApplicationInfo.FLAG_STOPPED.

Two narrow hooks in miui-services.jar:

1. BroadcastQueueModernStubImpl.checkApplicationAutoStart: return allowed only
   for the selected GMS push and a non-stopped receiver; otherwise execute stock.
2. GreezeManagerService.isAllowBroadcast: admit the same selected GMS push to
   the existing freezer/thaw path; otherwise execute stock.

services.jar is hashed as a dependency but **not patched**. There is no
INCLUDE_STOPPED_PACKAGES injection, notification grouping/audio-rate change,
FSI/VOIP bypass, global international-build override or arbitrary service-start bypass.
Apps using a different push transport may need a different diagnosed solution.

## Preparation and updates

Fresh installation leaves Framework disabled. Choosing apps alone has no
framework effect. Preparation is requested explicitly in WebUI, runs in private
staging, validates the exact pristine source hashes, patches two methods, runs
structural/linkage checks, and requires the device's ART hard-error verifier.
An absent/failed verifier is not a successful preparation.

The key covers profile contents, patch revision, patcher.jar checksum, firmware
properties, classpath inventory/dependency hashes, APEX inventory and ART binaries.
The manager app-catalog API and shell inventory are separate from the patcher,
so changing app presentation or WebUI does not invalidate a framework artifact.
Reinstall/update does not run the patcher.
Unchanged artifacts remain outside the root manager's replaceable module tree.
An existing mount must be disabled and rebooted before taking new pristine input.

Publish a complete staged directory, retaining the previous generation when
publication fails. There is no transaction that spans a power loss atomically
across all filesystem operations: an incomplete/missing manifest fails closed.
Original input is retained for analysis and recovery, not flashed to /system.

There is no manual AOT-cache publication, cache sweeping, or restoration loop.
ART handles normal compilation and invalidation. Whether the OEM runtime correctly
loads the patched dex and regenerates dependent artifacts remains a device test.
ART verification is necessary, but does not prove a successful boot or delivery.

## Boot and OTA guard

At post-fs-data, only a requested, hash-checked, ART-verified artifact whose key
matches the current environment can be bind-mounted read-only. Unknown builds,
changed ART/classpaths, corrupt output or mismatched stock input skip the mount.
Core continues independently. No automatic OTA repatching is attempted.

Before mounting, record the boot ID as pending. Core clears that marker only
after Android reports boot completed. If a previous activation is unconfirmed,
the next invocation skips mounting and attempts to disable the request.
This reduces repeated failed activations; it is **not a guarantee of automatic
recovery**. The root manager/boot stage itself may fail before the guard runs.
Maintain a verified recovery/Safe Mode method to disable oneone_fcm without ADB.

Switching Framework off invalidates runtime exceptions when policy reloads;
reboot unloads the JAR overlay. Never unmount a JAR from live system_server.
Removing the module stages Core settings restoration and state cleanup at reboot.

## Device test checklist (still required)

- Confirm current model/build and both pristine JAR hashes via read-only ADB.
- Confirm classpath format, ART paths and mount visibility at post-fs-data.
- Check manager listPackages/getPackagesInfo and ksu://icon support; compare
  names/icons to the launcher/Settings. Test package-only fallback if unavailable.
- Prepare without enabling: inspect /data/adb/oneone_fcm/prepare.log and ART output.
- Verify disabling modules from recovery **before** the first framework reboot.
- Activate once and inspect system_server/ART logs, pending marker and live JAR hash.
- Send real remote messages to a selected app and an unselected control app.
- Compare Core-only and Framework-on with screen on, locked for 10/30/60 minutes,
  Wi-Fi/mobile data, process eviction (not Force Stop), and after reboot.
- Verify Force Stop still requires reopening the app, and unrelated broadcasts,
  calls, DND, channel settings and notification sound behavior remain stock.
- Test changing whitelist without reboot, UI-only update artifact reuse, disable
  then reboot, failed preparation and uninstall/reinstall.
- Measure battery/process usage rather than assigning an estimated percentage.

## Local development

Use Node 22+, JDK 17+, Android platform 36/build-tools 36.0.0 and Git Bash on
Windows. Set JAVA_HOME and ANDROID_HOME, then run:

```text
node tools/build-tools.mjs
node tests/verify.mjs
node tools/preview.mjs
```

Dependencies are pinned by SHA256. Native JARs are generated, ignored by Git,
and rebuilt by release CI. Preview is loopback-only; `?fixture=1` injects a
clearly labelled simulated bridge and never invokes ADB/root. Fixtures are
development files and are not included in the module ZIP.

Tests cover Core lifecycle, real Java policy logic with Android stubs, backend
whitelist validation, preparation failure preservation, artifact gates and the
UI bridge. These are not Android system_server or OEM integration tests.
