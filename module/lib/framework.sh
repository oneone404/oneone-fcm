#!/system/bin/sh
# Framework engine is optional. It must never prevent the Core boot service.
FW_STATE=${FW_STATE:-/data/adb/oneone_fcm}
FW_POLICY=${FW_POLICY:-/data/system/oneone_fcm_policy.conf}
FW_TARGET=/system_ext/framework/miui-services.jar
FW_PROFILE_FILE="$MODDIR/profiles/pandora-319.conf"
fw_profile_value() { sed -n "s/^$1=//p" "$FW_PROFILE_FILE" 2>/dev/null | head -n1; }
FW_PROFILE=$(fw_profile_value id)
FW_REVISION=1

fw_hash() { sha256sum "$1" 2>/dev/null | awk '{print $1}'; }
fw_init() { mkdir -p "$FW_STATE" && chmod 0700 "$FW_STATE"; }
fw_requested() { grep -qx 'enabled=1' "$FW_POLICY" 2>/dev/null; }
fw_supported() {
    [ -n "$FW_PROFILE" ] && [ -s "$FW_PROFILE_FILE" ] &&
    [ "$(getprop ro.product.device)" = "$(fw_profile_value device)" ] &&
    [ "$(getprop ro.build.version.incremental)" = "$(fw_profile_value incremental)" ] &&
    [ "$(getprop ro.build.version.sdk)" = "$(fw_profile_value sdk)" ] && [ -f "$FW_TARGET" ]
}
fw_env_key() {
    # Stable dependency inventory usable both while Android is running and before zygote.
    [ -s /data/system/environ/classpath ] || return 1
    [ -s /apex/apex-info-list.xml ] || return 1
    (
        getprop ro.build.fingerprint
        getprop ro.system.build.fingerprint
        getprop ro.system_ext.build.fingerprint
        getprop ro.build.version.security_patch
        fw_hash /data/system/environ/classpath
        fw_hash /apex/apex-info-list.xml
        _fw_paths=$(sed -n 's/^export BOOTCLASSPATH //p;s/^export SYSTEMSERVERCLASSPATH //p;s/^export STANDALONE_SYSTEMSERVER_JARS //p' /data/system/environ/classpath | tr ':"\047' '   ')
        [ -n "$_fw_paths" ] || exit 1
        for _fw_path in $_fw_paths; do
            case "$_fw_path" in /system/*|/system_ext/*|/product/*|/apex/*) ;; *) exit 1 ;; esac
            # This JAR has a separately recorded pristine hash; it may currently be overlaid.
            [ "$_fw_path" = "$FW_TARGET" ] && continue
            [ -s "$_fw_path" ] || exit 1
            _fw_sha=$(fw_hash "$_fw_path")
            [ -n "$_fw_sha" ] || exit 1
            printf '%s %s\n' "$_fw_sha" "$_fw_path"
        done
        fw_hash /apex/com.android.art/bin/dex2oat64
        fw_hash /apex/com.android.art/lib64/libart.so
    ) > "$FW_STATE/env-check.$$" || { rm -f "$FW_STATE/env-check.$$"; return 1; }
    fw_hash "$FW_STATE/env-check.$$"
    rm -f "$FW_STATE/env-check.$$"
}
fw_meta() { sed -n "s/^$1=//p" "$FW_STATE/artifacts/manifest" 2>/dev/null | head -n1; }
fw_key() {
    _fw_env=$(fw_env_key) || return 1
    _fw_tool=$(fw_hash "$MODDIR/tools/patcher.jar")
    [ -n "$_fw_env" ] && [ -n "$_fw_tool" ] || return 1
    printf '%s\n' "$FW_PROFILE|$FW_REVISION|$(fw_hash "$FW_PROFILE_FILE")|$_fw_env|$_fw_tool" | sha256sum | awk '{print $1}'
}
fw_ready() {
    fw_supported || return 1
    [ "$(fw_meta profile)" = "$FW_PROFILE" ] && [ "$(fw_meta art_verified)" = 1 ] || return 1
    [ -s "$FW_STATE/artifacts/miui-services.jar" ] || return 1
    [ "$(fw_hash "$FW_STATE/artifacts/miui-services.jar")" = "$(fw_meta output_sha256)" ] || return 1
    [ "$(fw_key)" = "$(fw_meta key)" ] || return 1
}
fw_active() {
    [ -f "$FW_STATE/active-boot" ] &&
    [ "$(cat "$FW_STATE/active-boot")" = "$(cat /proc/sys/kernel/random/boot_id)" ] &&
    [ "$(fw_hash "$FW_TARGET")" = "$(fw_meta output_sha256)" ]
}
fw_status() {
    FW_STATUS=unsupported
    fw_supported || return 0
    FW_STATUS=not_prepared
    if [ -f "$FW_STATE/job.pid" ] && kill -0 "$(cat "$FW_STATE/job.pid")" 2>/dev/null; then FW_STATUS=preparing; return; fi
    if fw_active; then
        if ! fw_requested; then FW_STATUS=disabled_reboot;
        elif fw_ready; then FW_STATUS=active;
        else FW_STATUS=active_stale;
        fi
    elif fw_ready; then
        if fw_requested; then FW_STATUS=reboot_required; else FW_STATUS=ready; fi
    elif [ -d "$FW_STATE/artifacts" ]; then FW_STATUS=stale;
    elif [ -f "$FW_STATE/prepare.failed" ]; then FW_STATUS=failed;
    fi
}
fw_write_policy() (
    # One lock covers a read/modify/write, so concurrent dialogs cannot lose updates.
    fw_init || exit 1
    mkdir "$FW_STATE/policy.lock" 2>/dev/null || exit 1
    trap 'rm -f "$FW_POLICY.tmp.$$"; rmdir "$FW_STATE/policy.lock" 2>/dev/null' EXIT
    case "$1" in
        list)
            [ "${#2}" -le 65536 ] || exit 1
            printf '%s\n' "$2" | awk 'NF && $0 !~ /^0:[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/ {exit 1}' || exit 1
            _fw_list=$(printf '%s\n' "$2" | awk 'NF && !seen[$0]++ {print}')
            [ "$(printf '%s\n' "$_fw_list" | awk 'NF {n++} END {print n+0}')" -le 500 ] || exit 1
            _fw_enabled=0; fw_requested && _fw_enabled=1
            ;;
        enabled)
            case "$2" in 0|1) _fw_enabled="$2" ;; *) exit 1 ;; esac
            if [ "$2" = 1 ]; then fw_ready || exit 1; fi
            _fw_list=$(grep -E '^0:[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$' "$FW_POLICY" 2>/dev/null)
            ;;
        *) exit 1 ;;
    esac
    _fw_uid=$(pm list packages --user 0 -U com.google.android.gms 2>/dev/null | sed -n 's/^package:com.google.android.gms uid:\([0-9]*\)$/\1/p' | head -n1)
    case "$_fw_uid" in ''|*[!0-9]*) exit 1 ;; esac
    {
        printf 'enabled=%s\ngms_uid=%s\n' "$_fw_enabled" "$_fw_uid"
        [ -z "$_fw_list" ] || printf '%s\n' "$_fw_list"
    } > "$FW_POLICY.tmp.$$" || exit 1
    chmod 0640 "$FW_POLICY.tmp.$$" && chown root:system "$FW_POLICY.tmp.$$" || exit 1
    chcon u:object_r:system_data_file:s0 "$FW_POLICY.tmp.$$" || exit 1
    mv -f "$FW_POLICY.tmp.$$" "$FW_POLICY" || exit 1
)
fw_run_patcher() {
    [ -x /apex/com.android.art/bin/dalvikvm ] || return 1
    ANDROID_DATA="$1" /apex/com.android.art/bin/dalvikvm -Xmx512m -cp "$MODDIR/tools/patcher.jar" oneone.fcm.FrameworkPatcher patch "$2" "$3" "$MODDIR/tools/patcher.jar"
}
fw_prepare() (
    fw_init && fw_supported || exit 1
    mkdir "$FW_STATE/prepare.lock" 2>/dev/null || exit 1
    echo "$$" > "$FW_STATE/job.pid"
    _fw_stage=""
    _fw_ok=0
    trap '[ "$_fw_ok" = 1 ] || touch "$FW_STATE/prepare.failed"; [ -z "$_fw_stage" ] || rm -rf "$_fw_stage"; rm -f "$FW_STATE/job.pid"; rmdir "$FW_STATE/prepare.lock" 2>/dev/null' EXIT
    _fw_stage=$(mktemp -d "$FW_STATE/stage.XXXXXX") || exit 1
    # Never take an overlay as pristine input. Disable + reboot if already mounted.
    [ "$(fw_hash "$FW_TARGET")" = "$(fw_profile_value miui_sha256)" ] || exit 1
    [ "$(fw_hash /system/framework/services.jar)" = "$(fw_profile_value services_sha256)" ] || exit 1
    # Known bytecode shape is not proof of a successful real-device boot.
    _fw_key=$(fw_key) || exit 1
    fw_run_patcher "$_fw_stage" "$FW_TARGET" "$_fw_stage/miui-services.jar" || exit 1
    _fw_dex2oat=/apex/com.android.art/bin/dex2oat64
    [ -x "$_fw_dex2oat" ] && [ "$(getprop ro.product.cpu.abi)" = arm64-v8a ] || exit 1
    "$_fw_dex2oat" --instruction-set=arm64 --dex-file="$_fw_stage/miui-services.jar" --dex-location="$FW_TARGET" \
        --oat-file="$_fw_stage/verify.odex" --compiler-filter=verify --abort-on-hard-verifier-error || exit 1
    # No publishing into ART-managed caches. ART remains responsible for compilation.
    cp -f "$FW_TARGET" "$_fw_stage/stock.jar" || exit 1
    _fw_output=$(fw_hash "$_fw_stage/miui-services.jar")
    [ -n "$_fw_output" ] || exit 1
    printf 'profile=%s\nkey=%s\noutput_sha256=%s\nart_verified=1\n' "$FW_PROFILE" "$_fw_key" "$_fw_output" > "$_fw_stage/manifest" || exit 1
    chmod 0644 "$_fw_stage/miui-services.jar" && chcon u:object_r:system_file:s0 "$_fw_stage/miui-services.jar" || exit 1
    # Refuse any input/runtime change while the job was running.
    [ "$(fw_key)" = "$_fw_key" ] || exit 1
    [ -f "$MODDIR/module.prop" ] && [ ! -f "$FW_STATE/remove-requested" ] || exit 1
    mkdir "$_fw_stage/publish" || exit 1
    for _fw_file in miui-services.jar stock.jar manifest; do mv "$_fw_stage/$_fw_file" "$_fw_stage/publish/$_fw_file" || exit 1; done
    if [ -d "$FW_STATE/artifacts.previous" ]; then
        [ -d "$FW_STATE/artifacts" ] || mv "$FW_STATE/artifacts.previous" "$FW_STATE/artifacts" || exit 1
        rm -rf "$FW_STATE/artifacts.previous"
    fi
    [ ! -d "$FW_STATE/artifacts" ] || mv "$FW_STATE/artifacts" "$FW_STATE/artifacts.previous" || exit 1
    if ! mv "$_fw_stage/publish" "$FW_STATE/artifacts"; then
        [ ! -d "$FW_STATE/artifacts.previous" ] || mv "$FW_STATE/artifacts.previous" "$FW_STATE/artifacts"
        exit 1
    fi
    rm -f "$FW_STATE/prepare.failed"
    _fw_ok=1
)
