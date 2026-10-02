#!/system/bin/sh
# Core updates never run the optional framework patcher.
ui_print "- OneOne FCM — Core + optional verified Framework"
[ -s "$MODPATH/tools/patcher.jar" ] && [ -s "$MODPATH/tools/catalog.jar" ] || abort "Missing native helpers; build the release package first."
. "$MODPATH/common.sh"
is_hyperos || abort "Android-based Xiaomi HyperOS is required."
command -v cmd >/dev/null 2>&1 || abort "Install from running Android."
_gms_path=$(pm path --user 0 com.google.android.gms 2>/dev/null)
printf '%s\n' "$_gms_path" | grep -q '^package:' || abort "Google Play services must be installed for the primary user."

_old=/data/adb/modules/oneone_fcm
if [ -d "$_old" ]; then
    [ "$_old" != "$MODPATH" ] || abort "Install through your manager's staged module update."
    _old_version=$(sed -n 's/^versionCode=//p' "$_old/module.prop" | head -n1)
    case "$_old_version" in ""|*[!0-9]*) abort "Cannot verify installed module version." ;; esac
    [ "$_old_version" -ge 150 ] || abort "Install v1.5.0 and reboot before this release."
    [ ! -e "$_old/legacy-cache.tsv" ] || abort "Reboot v1.5.0 to finish its cleanup before updating."
    if [ -f "$_old/stock_settings.conf" ] && [ ! -f "$MODPATH/stock_settings.conf" ]; then
        cp -f "$_old/stock_settings.conf" "$MODPATH/stock_settings.conf" || abort "Could not preserve stock settings."
    fi
fi
# Recover an uninstall backup if reinstalled before the restoration boot.
if [ ! -f "$MODPATH/stock_settings.conf" ] && [ -f /data/adb/oneone_fcm_restore.conf ]; then
    cp -f /data/adb/oneone_fcm_restore.conf "$MODPATH/stock_settings.conf" || abort "Could not recover stock settings."
fi
# Keep only the original settings still touched by the current module.
if [ -f "$MODPATH/stock_settings.conf" ]; then
    awk -F= '
        $1 == "gms_user_whitelisted" ||
        $1 ~ /^gms_appop:(RUN_IN_BACKGROUND|RUN_ANY_IN_BACKGROUND|10008|WAKE_LOCK)$/ ||
        $1 == "powerkeeper_gms_control" ||
        $1 ~ /^powerkeeper_user:(com[.]google[.]android[.]gms|com[.]android[.]vending):(exists|bg_control)$/ {
            if (!seen[$1]++) print
        }
    ' "$MODPATH/stock_settings.conf" > "$MODPATH/stock_settings.conf.tmp.$$" || abort "Could not filter settings."
    mv -f "$MODPATH/stock_settings.conf.tmp.$$" "$MODPATH/stock_settings.conf" || abort "Could not save settings."
fi
touch "$MODPATH/skip_mount"
set_perm_recursive "$MODPATH" 0 0 0755 0644
for _script in common.sh service.sh post-fs-data.sh framework-job.sh lib/framework.sh uninstall.sh restore-on-boot.sh webroot/cgi-bin/exec; do
    set_perm "$MODPATH/$_script" 0 0 0755
done
[ -f "$MODPATH/stock_settings.conf" ] && set_perm "$MODPATH/stock_settings.conf" 0 0 0600
# Reinstallation supersedes a pending uninstall; do not alter whitelist/artifacts.
rm -f /data/adb/oneone_fcm/remove-requested
ui_print "- Existing GMS/PowerKeeper backups and boot preference preserved."
ui_print "- Framework artifacts remain in private module state; UI updates do not re-patch."
ui_print "- Framework is off until prepared, verified and explicitly enabled in WebUI."
ui_print "- Reboot to activate the updated module scripts."
