#!/system/bin/sh
# OneOne FCM installer: settings only, no JAR/dex2oat work.
ui_print "- OneOne FCM v1.5.0 — stock framework"
[ "$(getprop ro.product.device)" = pandora ] || abort "This release is tested only for pandora."
[ "$(getprop ro.build.version.incremental)" = OS3.0.319.0.WBLCNXM ] || abort "Supported firmware: OS3.0.319.0.WBLCNXM."
[ "$(getprop ro.build.version.sdk)" = 36 ] || abort "Supported Android SDK: 36."

. "$MODPATH/common.sh"
for _old in /data/adb/modules/oneone_fcm /data/adb/modules/fcm_notification_fix; do
    [ -d "$_old" ] || continue
    [ "$_old" != "$MODPATH" ] || abort "Install through your manager's staged module update."
    if [ -f "$_old/stock_settings.conf" ] && [ ! -f "$MODPATH/stock_settings.conf" ]; then
        cp -f "$_old/stock_settings.conf" "$MODPATH/stock_settings.conf" || abort "Could not preserve stock settings."
    fi
    stage_legacy_cache_cleanup "$_old" "$MODPATH/legacy-cache.tsv" || abort "Could not stage legacy cache cleanup."
done
# Recover an uninstall backup if reinstalled before the restoration boot.
if [ ! -f "$MODPATH/stock_settings.conf" ] && [ -f /data/adb/oneone_fcm_restore.conf ]; then
    cp -f /data/adb/oneone_fcm_restore.conf "$MODPATH/stock_settings.conf" || abort "Could not recover stock settings."
fi
touch "$MODPATH/skip_mount"
set_perm_recursive "$MODPATH" 0 0 0755 0644
for _script in common.sh post-fs-data.sh service.sh uninstall.sh restore-on-boot.sh webroot/cgi-bin/exec; do
    set_perm "$MODPATH/$_script" 0 0 0755
done
[ -f "$MODPATH/stock_settings.conf" ] && set_perm "$MODPATH/stock_settings.conf" 0 0 0600
[ -f "$MODPATH/legacy-cache.tsv" ] && set_perm "$MODPATH/legacy-cache.tsv" 0 0 0600
# The old module ID must not mount its framework beside the new module.
[ -d /data/adb/modules/fcm_notification_fix ] && touch /data/adb/modules/fcm_notification_fix/disable
ui_print "- Existing GMS/PowerKeeper backups and boot preference preserved."
ui_print "- No framework JAR, patcher, AOT archive or mount included."
ui_print "- REBOOT REQUIRED: the old framework overlay lasts until reboot."
