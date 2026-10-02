#!/system/bin/sh
MODDIR=${0%/*}
. "$MODDIR/lib/framework.sh"
# WebUI preparation cannot survive reboot; discard only its empty lock directories.
rm -f "$FW_STATE/job.pid"
rmdir "$FW_STATE/prepare.lock" "$FW_STATE/policy.lock" 2>/dev/null || true
# Core has no auto-mounted tree. Only this validated, optional boot path mounts a JAR.
fw_requested || exit 0
fw_init && fw_ready || exit 0
[ "$(fw_hash "$FW_TARGET")" = "$(fw_profile_value miui_sha256)" ] || exit 0
# An unconfirmed previous activation is disabled rather than retried indefinitely.
if [ -f "$FW_STATE/boot-pending" ]; then
    fw_write_policy enabled 0 >/dev/null 2>&1
    exit 0
fi
cp /proc/sys/kernel/random/boot_id "$FW_STATE/boot-pending" || exit 0
if mount -o bind "$FW_STATE/artifacts/miui-services.jar" "$FW_TARGET"; then
    if mount -o remount,ro,bind "$FW_TARGET"; then
        cp /proc/sys/kernel/random/boot_id "$FW_STATE/active-boot"
    else
        umount "$FW_TARGET" 2>/dev/null
        rm -f "$FW_STATE/boot-pending"
    fi
else
    rm -f "$FW_STATE/boot-pending"
fi
