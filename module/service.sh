#!/system/bin/sh
MODDIR=${0%/*}
[ -f "$MODDIR/common.sh" ] && . "$MODDIR/common.sh"

# Wait for Android boot completion
until [ "$(getprop sys.boot_completed)" = "1" ]; do
  sleep 2
done
[ -f "$MODDIR/lib/framework.sh" ] && . "$MODDIR/lib/framework.sh"
if [ "$(cat "$FW_STATE/boot-pending" 2>/dev/null)" = "$(cat /proc/sys/kernel/random/boot_id)" ]; then
    rm -f "$FW_STATE/boot-pending"
fi
_gms_path=$(pm path --user 0 com.google.android.gms 2>/dev/null)
printf '%s\n' "$_gms_path" | grep -q '^package:' || exit 0

# No automatic post-OTA patching. Unknown environments keep the stock framework.

# ==============================================================================
# 1. Preserve the stock state required to restore the GMS exemption cleanly.
# ==============================================================================
STOCK_CONF="$MODDIR/stock_settings.conf"

GMS_APPOPS="
RUN_IN_BACKGROUND
RUN_ANY_IN_BACKGROUND
10008
WAKE_LOCK
"

# First boot: back up only state this Lite module changes. It deliberately does
# not alter lockscreen, AOD, channel, sound, or prestart preferences.
if [ ! -f "$STOCK_CONF" ] || ! grep -q '^gms_user_whitelisted=' "$STOCK_CONF" 2>/dev/null; then
    STOCK_TMP="$MODDIR/stock_settings.conf.tmp.$$"
    rm -f "$STOCK_TMP" 2>/dev/null
    if [ -f "$STOCK_CONF" ]; then
        cp -f "$STOCK_CONF" "$STOCK_TMP" 2>/dev/null || exit 1
    else
        : > "$STOCK_TMP"
    fi

    # Refuse changes if the original exemption cannot be read.
    _gms_idle=$(cmd deviceidle whitelist 2>/dev/null) || exit 1
    if printf '%s\n' "$_gms_idle" | grep -q "com.google.android.gms"; then
        echo "gms_user_whitelisted=1" >> "$STOCK_TMP"
    else
        echo "gms_user_whitelisted=0" >> "$STOCK_TMP"
    fi

    # Backup initial GMS AppOps state for surgical restoration on uninstall.
    # Preserve the effective mode rather than guessing that it was default.
    for op in $GMS_APPOPS; do
        [ -z "$op" ] && continue
        op_mode=$(read_appop_mode com.google.android.gms "$op")
        [ "$op_mode" = unknown ] && continue
        echo "gms_appop:${op}=${op_mode}" >> "$STOCK_TMP"
    done

    chmod 0600 "$STOCK_TMP" 2>/dev/null
    mv -f "$STOCK_TMP" "$STOCK_CONF" 2>/dev/null || exit 1
fi



# ==============================================================================
# 2. Google Play Services (GMS) Surgical Exemption
# ==============================================================================
# Dynamically resolve Google Play Services UID with exact package anchoring
GMS_UID=$(pm list packages --user 0 -U com.google.android.gms 2>/dev/null | grep -E '^package:com\.google\.android\.gms ' | grep -o 'uid:[0-9]*' | cut -d: -f2 | head -n1)
[ -z "$GMS_UID" ] && GMS_UID=$(stat -c %u /data/data/com.google.android.gms 2>/dev/null)

if [ -n "$GMS_UID" ]; then
  cmd greezer thuid "$GMS_UID" 86400000 2>/dev/null
  cmd greezer unmonitor "$GMS_UID" 2>/dev/null
  cmd deviceidle whitelist +com.google.android.gms 2>/dev/null
  for op in $GMS_APPOPS; do
    [ "$(read_appop_mode com.google.android.gms "$op")" = unknown ] && continue
    grep -Fq "gms_appop:${op}=" "$STOCK_CONF" || continue
    cmd appops set com.google.android.gms "$op" allow 2>/dev/null || true
  done

  # Unfreeze GMS cgroup freezer nodes across cgroup v1 and v2 hierarchies
  for fz in "/sys/fs/cgroup/apps/uid_${GMS_UID}/cgroup.freeze" \
            "/sys/fs/cgroup/uid_${GMS_UID}/cgroup.freeze" \
            "/sys/fs/cgroup/apps/uid_${GMS_UID}"/*/cgroup.freeze \
            "/sys/fs/cgroup/uid_${GMS_UID}"/*/cgroup.freeze \
            "/dev/freezer/apps/uid_${GMS_UID}/freezer.state"; do
    if [ -f "$fz" ]; then
      case "$fz" in
        *freezer.state) echo "THAWED" > "$fz" 2>/dev/null ;;
        *)              echo 0 > "$fz" 2>/dev/null ;;
      esac
    fi
  done

  # ── Gap 1: GMS Socket Recovery ─────────────────────────────────────────────
  # Request a reconnect; GMS may ignore this and network access is still required.
  am broadcast -a com.google.android.intent.action.GCM_RECONNECT \
    -p com.google.android.gms >/dev/null 2>&1
fi

# ==============================================================================
# 3. Disarm PowerKeeper GMS Firewall & DNS Blocker (China ROM Boot Apply)
# ==============================================================================
# PowerKeeper's GmsObserver creates iptables CHAIN_GMS_WALL to block all GMS
# TCP/DNS when Google servers are unreachable. On CN ROM, defaultState=true
# (IS_INTERNATIONAL_BUILD=false). Setting gms_control=false completely disarms
# the firewall chain, DNS blocker, wakelock revocation, and alarm suppression.
apply_pk_boot_disarm() {
    _pk_boot=$(default_pk_boot)
    if [ -f "/data/system/fcm_pk_boot.conf" ]; then
        _v=$(cat "/data/system/fcm_pk_boot.conf" 2>/dev/null | tr -d ' \r\n')
        case "$_v" in true|1) _pk_boot=true ;; false|0) _pk_boot=false ;; esac
    fi
    [ "$_pk_boot" = "true" ] || return 0

    # Retries at boot completion, +5s, and +15s to prevent PowerKeeper's delayed
    # startup on China ROM from silently overriding the disarmed state.
    for _delay in 0 5 15; do
        [ "$_delay" -gt 0 ] && sleep "$_delay"
        if command -v content >/dev/null 2>&1; then
            if read_powerkeeper_control >/dev/null 2>&1; then
                disarm_powerkeeper_with_gms_policy "$STOCK_CONF" || continue
            fi
        fi
    done
}

[ -f "$MODDIR/webroot/cgi-bin/exec" ] && chmod 0755 "$MODDIR/webroot/cgi-bin/exec" 2>/dev/null

# Run the PowerKeeper disarm asynchronously after boot completion.
apply_pk_boot_disarm &
