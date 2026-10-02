#!/system/bin/sh
# One-shot stock-state restoration staged by uninstall.sh.

RESTORE_CONF="/data/adb/oneone_fcm_restore.conf"
RESTORE_SCRIPT="/data/adb/service.d/oneone_fcm_restore.sh"
[ -f "$RESTORE_CONF" ] || exit 1
MODULE_DIR="/data/adb/modules/oneone_fcm"

cleanup_restore() {
    rm -f "$RESTORE_CONF" "$RESTORE_SCRIPT" 2>/dev/null || true
}

until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 2
done

# A reinstall before reboot supersedes the pending uninstall restoration.
if [ -d "$MODULE_DIR" ] && [ ! -f "$MODULE_DIR/remove" ]; then
    cleanup_restore
    exit 0
fi

# This exact directory belongs to the removed module; no system cache is purged.
rm -rf /data/adb/oneone_fcm



GMS_APPOPS="
RUN_IN_BACKGROUND
RUN_ANY_IN_BACKGROUND
10008
WAKE_LOCK
"

# Dynamically resolve Google Play Services UID with exact package anchoring
GMS_UID=$(pm list packages --user 0 -U com.google.android.gms 2>/dev/null | grep -E '^package:com\.google\.android\.gms ' | grep -o 'uid:[0-9]*' | cut -d: -f2 | head -n1)
[ -z "$GMS_UID" ] && GMS_UID=$(stat -c %u /data/data/com.google.android.gms 2>/dev/null)

# Restore the Doze whitelist only when the package was not user-whitelisted
# before installation; otherwise restore the original exemption.
RESTORE_FAILED=0
GMS_WAS_WHITELISTED=$(sed -n 's/^gms_user_whitelisted=//p' "$RESTORE_CONF" | head -n1)
case "$GMS_WAS_WHITELISTED" in
    0) cmd deviceidle whitelist -com.google.android.gms >/dev/null 2>&1 || RESTORE_FAILED=1 ;;
    1) cmd deviceidle whitelist +com.google.android.gms >/dev/null 2>&1 || RESTORE_FAILED=1 ;;
esac

# Restore only recorded, supported AppOps; never guess absent operations.
for op in $GMS_APPOPS; do
    [ -z "$op" ] && continue
    mode="default"
    if [ -f "$RESTORE_CONF" ]; then
        saved_mode=$(awk -F= -v key="gms_appop:$op" '
            $1 == key { print substr($0, index($0, "=") + 1); exit }
        ' "$RESTORE_CONF" 2>/dev/null)
        case "$saved_mode" in
            allow|ignore|deny|foreground|default) mode="$saved_mode" ;;
            *) continue ;;
        esac
    fi
    _op_available=$(cmd appops get com.google.android.gms "$op" 2>/dev/null) || continue
    case "$_op_available" in *Unknown*|*unknown*|*Error*) continue ;; esac
    cmd appops set com.google.android.gms "$op" "$mode" 2>/dev/null || RESTORE_FAILED=1
done

# Expire the module's thaw lease and return GMS to freezer monitoring.
if [ -n "$GMS_UID" ] && [ -n "$GMS_WAS_WHITELISTED" ]; then
    cmd greezer thuid "$GMS_UID" 0 2>/dev/null || true
    cmd greezer monitor "$GMS_UID" 2>/dev/null || true
fi



# Restore PowerKeeper gms_control and both userTable rows to stock
pk_ctrl=""
if [ -f "$RESTORE_CONF" ]; then
    saved_pk=$(awk -F= '$1 == "powerkeeper_gms_control" { print substr($0, index($0, "=") + 1); exit }' "$RESTORE_CONF" 2>/dev/null)
    [ -n "$saved_pk" ] && pk_ctrl="$saved_pk"
fi
case "$pk_ctrl" in
    true|false)
        content call --uri content://com.miui.powerkeeper.configure/SimpleSettings/misc \
          --method PUT_misc --arg gms_control --extra value:s:"$pk_ctrl" 2>/dev/null || RESTORE_FAILED=1
        ;;
esac

if [ -f "$RESTORE_CONF" ]; then
    for pk_pkg in com.google.android.gms com.android.vending; do
        pk_existed=$(awk -F= -v key="powerkeeper_user:${pk_pkg}:exists" \
          '$1 == key { print substr($0, index($0, "=") + 1); exit }' "$RESTORE_CONF" 2>/dev/null)
        if [ "$pk_existed" = "0" ]; then
            content delete --uri content://com.miui.powerkeeper.configure/userTable \
              --where "pkgName='${pk_pkg}' AND userId=0" 2>/dev/null || RESTORE_FAILED=1
        elif [ "$pk_existed" = "1" ]; then
            pk_bg_control=$(awk -F= -v key="powerkeeper_user:${pk_pkg}:bg_control" \
              '$1 == key { print substr($0, index($0, "=") + 1); exit }' "$RESTORE_CONF" 2>/dev/null)
            if [ -z "$pk_bg_control" ]; then
                RESTORE_FAILED=1
                continue
            fi
            pk_row=$(content query --uri content://com.miui.powerkeeper.configure/userTable \
              --where "pkgName='${pk_pkg}' AND userId=0" 2>/dev/null)
            pk_query_status=$?
            if [ "$pk_query_status" -ne 0 ]; then
                RESTORE_FAILED=1
                continue
            fi
            if [ "$pk_bg_control" = "NULL" ] || [ "$pk_bg_control" = "null" ]; then
                pk_binding="bgControl:n:"
            else
                pk_binding="bgControl:s:${pk_bg_control}"
            fi
            if printf '%s\n' "$pk_row" | grep -q "pkgName=${pk_pkg}"; then
                content update --uri content://com.miui.powerkeeper.configure/userTable \
                  --bind "$pk_binding" --where "pkgName='${pk_pkg}' AND userId=0" 2>/dev/null || RESTORE_FAILED=1
            else
                content insert --uri content://com.miui.powerkeeper.configure/userTable \
                  --bind pkgName:s:"$pk_pkg" --bind userId:i:0 --bind "$pk_binding" 2>/dev/null || RESTORE_FAILED=1
            fi
        fi
    done
fi



if [ "$RESTORE_FAILED" -ne 0 ]; then
    exit 1
fi

cleanup_restore
exit 0
