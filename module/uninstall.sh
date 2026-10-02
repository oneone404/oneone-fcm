#!/system/bin/sh
# Disable framework policy now; loaded framework is restored by reboot, never hot-unmounted.
MODDIR=${0%/*}
case "$MODDIR" in /data/adb/modules/oneone_fcm|/data/adb/modules_update/oneone_fcm) ;; *) exit 1 ;; esac
. "$MODDIR/lib/framework.sh"
fw_write_policy enabled 0 >/dev/null 2>&1 || true
rm -f /data/system/oneone_fcm_policy.conf
fw_init && touch "$FW_STATE/remove-requested"
RESTORE_DIR=/data/adb/service.d
RESTORE_CONF=/data/adb/oneone_fcm_restore.conf
RESTORE_SCRIPT="$RESTORE_DIR/oneone_fcm_restore.sh"
mkdir -p "$RESTORE_DIR" || exit 1
if [ -f "$MODDIR/stock_settings.conf" ]; then
    cp -f "$MODDIR/stock_settings.conf" "$RESTORE_CONF.tmp.$$" || exit 1
else
    # Still stage artifact cleanup if removed before the first Core service ran.
    printf '# No Core changes recorded\n' > "$RESTORE_CONF.tmp.$$" || exit 1
fi
chmod 0600 "$RESTORE_CONF.tmp.$$"
mv -f "$RESTORE_CONF.tmp.$$" "$RESTORE_CONF" || exit 1
cp -f "$MODDIR/restore-on-boot.sh" "$RESTORE_SCRIPT.tmp.$$" || exit 1
chmod 0755 "$RESTORE_SCRIPT.tmp.$$"
mv -f "$RESTORE_SCRIPT.tmp.$$" "$RESTORE_SCRIPT" || exit 1
rm -f /data/system/fcm_pk_boot.conf /data/system/fcm_wake.conf
# Restoration runs after Android boot; original settings stay available on failure.
