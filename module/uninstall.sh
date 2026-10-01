#!/system/bin/sh
# Settings-only uninstall. Never unmount a loaded framework or purge cache.
MODDIR=${0%/*}
case "$MODDIR" in /data/adb/modules/oneone_fcm|/data/adb/modules_update/oneone_fcm) ;; *) exit 1 ;; esac
RESTORE_DIR=/data/adb/service.d
RESTORE_CONF=/data/adb/oneone_fcm_restore.conf
RESTORE_SCRIPT="$RESTORE_DIR/oneone_fcm_restore.sh"
[ -f "$MODDIR/stock_settings.conf" ] || exit 1
mkdir -p "$RESTORE_DIR" || exit 1
cp -f "$MODDIR/stock_settings.conf" "$RESTORE_CONF.tmp.$$" || exit 1
chmod 0600 "$RESTORE_CONF.tmp.$$"
mv -f "$RESTORE_CONF.tmp.$$" "$RESTORE_CONF" || exit 1
cp -f "$MODDIR/restore-on-boot.sh" "$RESTORE_SCRIPT.tmp.$$" || exit 1
chmod 0755 "$RESTORE_SCRIPT.tmp.$$"
mv -f "$RESTORE_SCRIPT.tmp.$$" "$RESTORE_SCRIPT" || exit 1
rm -f /data/system/fcm_pk_boot.conf /data/system/fcm_wake.conf
# Restoration runs after Android boot; original settings stay available on failure.
