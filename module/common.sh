#!/system/bin/sh
# OneOne FCM shared state helpers. No framework patching or mounting.
# PowerKeeper state touched by the module is stored in stock_settings.conf.
# Each userTable backup records both row existence and the bgControl value so
# restoration can remove rows that the module had to create.
backup_powerkeeper_state() {
    _pk_conf="$1"
    [ -n "$_pk_conf" ] || return 1
    if ! grep -q '^powerkeeper_gms_control=' "$_pk_conf" 2>/dev/null; then
        _pk_gms_ctrl=$(read_powerkeeper_control) || return 1
        echo "powerkeeper_gms_control=${_pk_gms_ctrl}" >> "$_pk_conf"
    fi

    for _pk_pkg in com.google.android.gms com.android.vending; do
        _pk_exists_key="powerkeeper_user:${_pk_pkg}:exists"
        if grep -Fq "${_pk_exists_key}=" "$_pk_conf" 2>/dev/null; then
            continue
        fi

        _pk_row=$(content query --uri content://com.miui.powerkeeper.configure/userTable \
          --where "pkgName='${_pk_pkg}' AND userId=0" 2>/dev/null)
        _pk_query_status=$?
        [ "$_pk_query_status" -eq 0 ] || return 1
        case "$_pk_row" in *Error*|*Exception*|*Permission*|*Unknown*) return 1 ;; esac

        if printf '%s\n' "$_pk_row" | grep -q "pkgName=${_pk_pkg}"; then
            _pk_bg_control=$(printf '%s\n' "$_pk_row" | grep -o 'bgControl=[^,]*' | cut -d= -f2- | head -n1 | tr -d '\r')
            _pk_bg_control=$(printf '%s' "$_pk_bg_control" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            [ -z "$_pk_bg_control" ] && _pk_bg_control="NULL"
            echo "${_pk_exists_key}=1" >> "$_pk_conf"
            echo "powerkeeper_user:${_pk_pkg}:bg_control=${_pk_bg_control}" >> "$_pk_conf"
        else
            echo "${_pk_exists_key}=0" >> "$_pk_conf"
        fi
    done
}

ensure_powerkeeper_backup() {
    _pk_target_conf="$1"
    [ -n "$_pk_target_conf" ] || return 1
    _pk_tmp="${_pk_target_conf}.tmp.$$"
    rm -f "$_pk_tmp" 2>/dev/null
    if [ -f "$_pk_target_conf" ]; then
        cp -f "$_pk_target_conf" "$_pk_tmp" 2>/dev/null || return 1
    else
        : > "$_pk_tmp" || return 1
    fi

    if ! backup_powerkeeper_state "$_pk_tmp"; then
        rm -f "$_pk_tmp" 2>/dev/null
        return 1
    fi

    chmod 0600 "$_pk_tmp" 2>/dev/null
    mv -f "$_pk_tmp" "$_pk_target_conf" 2>/dev/null
}

restore_powerkeeper_state() {
    _pk_conf="$1"
    [ -f "$_pk_conf" ] || return 1
    _pk_restore_status=0

    _pk_gms_ctrl=$(awk -F= '$1 == "powerkeeper_gms_control" { print substr($0, index($0, "=") + 1); exit }' "$_pk_conf" 2>/dev/null)
    case "$_pk_gms_ctrl" in true|false) ;; *) return 1 ;; esac
    content call --uri content://com.miui.powerkeeper.configure/SimpleSettings/misc \
      --method PUT_misc --arg gms_control --extra value:s:"$_pk_gms_ctrl" 2>/dev/null || _pk_restore_status=1

    for _pk_pkg in com.google.android.gms com.android.vending; do
        _pk_existed=$(awk -F= -v key="powerkeeper_user:${_pk_pkg}:exists" \
          '$1 == key { print substr($0, index($0, "=") + 1); exit }' "$_pk_conf" 2>/dev/null)
        if [ "$_pk_existed" = "0" ]; then
            content delete --uri content://com.miui.powerkeeper.configure/userTable \
              --where "pkgName='${_pk_pkg}' AND userId=0" 2>/dev/null || _pk_restore_status=1
        elif [ "$_pk_existed" = "1" ]; then
            _pk_bg_control=$(awk -F= -v key="powerkeeper_user:${_pk_pkg}:bg_control" \
              '$1 == key { print substr($0, index($0, "=") + 1); exit }' "$_pk_conf" 2>/dev/null)
            if [ -z "$_pk_bg_control" ]; then
                _pk_restore_status=1
                continue
            fi

            _pk_row=$(content query --uri content://com.miui.powerkeeper.configure/userTable \
              --where "pkgName='${_pk_pkg}' AND userId=0" 2>/dev/null)
            _pk_query_status=$?
            if [ "$_pk_query_status" -ne 0 ]; then
                _pk_restore_status=1
                continue
            fi
            if [ "$_pk_bg_control" = "NULL" ] || [ "$_pk_bg_control" = "null" ]; then
                _pk_binding="bgControl:n:"
            else
                _pk_binding="bgControl:s:${_pk_bg_control}"
            fi
            if printf '%s\n' "$_pk_row" | grep -q "pkgName=${_pk_pkg}"; then
                content update --uri content://com.miui.powerkeeper.configure/userTable \
                  --bind "$_pk_binding" --where "pkgName='${_pk_pkg}' AND userId=0" 2>/dev/null || _pk_restore_status=1
            else
                content insert --uri content://com.miui.powerkeeper.configure/userTable \
                  --bind pkgName:s:"$_pk_pkg" --bind userId:i:0 --bind "$_pk_binding" 2>/dev/null || _pk_restore_status=1
            fi
        fi
    done

    return "$_pk_restore_status"
}

appop_line_mode() {
    case "$1" in
        *": allow"*)      echo "allow" ;;
        *": ignore"*)     echo "ignore" ;;
        *": deny"*)       echo "deny" ;;
        *": foreground"*) echo "foreground" ;;
        *": default"*)    echo "default" ;;
        *)                echo "" ;;
    esac
}

read_appop_mode() {
    _ra_pkg="$1"
    _ra_op="$2"
    _ra_mode="unknown"
    if [ -z "$_ra_pkg" ] || [ -z "$_ra_op" ]; then
        echo "$_ra_mode"
        return 1
    fi

    _ra_out=$(cmd appops get "$_ra_pkg" "$_ra_op" 2>/dev/null)
    _ra_status=$?
    if [ "$_ra_status" -eq 0 ] && [ -n "$_ra_out" ]; then
        # Four sources, in falling order of precedence. Each is a line of the
        # form "<something>: <mode>", so appop_line_mode classifies all of them.
        #
        #   1. the package record  - what `cmd appops set <pkg> ...` writes, and
        #      therefore what a restore puts back;
        #   2. the uid record, printed as "Uid mode: <OP>: <mode>" - a different
        #      record, but on some packages it is the ONLY line the framework
        #      prints, and reading those as "unknown" is how a restore ends up
        #      writing "default" over a mode the user had set. Measured on
        #      OS3.0.307.0.WNVCNXM: 6 of 154 third-party packages print only this
        #      line for USE_FULL_SCREEN_INTENT - com.vkontakte.android among
        #      them. A restore then writes the uid value as the package mode,
        #      which is not the same record, but preserves the effective answer
        #      under either precedence rule and beats guessing;
        #   3. the op's stated default mode, when the framework prints one;
        #   4. "No operations." - nothing recorded at all, so it sits at default.
        #
        # The name in front of the first colon is compared exactly rather than by
        # regex: a MIUI op is printed wrapped, as "MIUIOP(10021): allow", so
        # anchoring on the bare number never matches.
        _ra_line=$(printf '%s\n' "$_ra_out" | awk -v op="$_ra_op" '
            {
                line = $0
                sub(/^[[:space:]]+/, "", line)
                if (index(line, "Uid mode:") == 1) next
                p = index(line, ":")
                if (p == 0) next
                name = substr(line, 1, p - 1)
                sub(/[[:space:]]+$/, "", name)
                if (name == op || name == "MIUIOP(" op ")") { print line; exit }
            }
        ')
        if [ -n "$_ra_line" ]; then
            # A package record exists and is authoritative. If its mode is one
            # this reader cannot classify, the answer is "unknown" - falling
            # through to the uid record here would restore a value the package
            # never had.
            _ra_mode=$(appop_line_mode "$_ra_line")
        else
            _ra_uid=$(printf '%s\n' "$_ra_out" | awk -v op="$_ra_op" '
                {
                    line = $0
                    sub(/^[[:space:]]+/, "", line)
                    if (index(line, "Uid mode:") != 1) next
                    if (index(line, op) == 0) next
                    print line; exit
                }
            ')
            _ra_mode=$(appop_line_mode "$_ra_uid")

            if [ -z "$_ra_mode" ]; then
                _ra_default=$(printf '%s\n' "$_ra_out" | awk '
                    /^[[:space:]]*Default mode[[:space:]]*:/ { print; exit }
                ')
                _ra_mode=$(appop_line_mode "$_ra_default")
            fi

            if [ -z "$_ra_mode" ]; then
                case "$_ra_out" in
                    *"No operations."*) _ra_mode="default" ;;
                esac
            fi
        fi

        [ -z "$_ra_mode" ] && _ra_mode="unknown"
    fi
    echo "$_ra_mode"
}

# No device/firmware allowlist. Detect Android-based HyperOS and CN region.
is_hyperos() {
    [ -n "$(getprop ro.mi.os.version.name)" ] && return 0
    [ -n "$(getprop ro.mi.os.version.code)" ] && return 0
    case "$(getprop ro.build.version.incremental)" in OS[0-9]*) return 0 ;; esac
    return 1
}

default_pk_boot() {
    case "$(getprop ro.build.version.incremental)" in *CNXM*|*cnxm*) echo true; return ;; esac
    for _region_key in ro.miui.region ro.miui.build.region ro.vendor.miui.region; do
        _region=$(getprop "$_region_key" | tr '[:upper:]' '[:lower:]')
        [ "$_region" = cn ] && { echo true; return; }
    done
    echo false
}

read_powerkeeper_control() {
    _pk_raw=$(content query --uri content://com.miui.powerkeeper.configure/SimpleSettings/misc --where "name='gms_control'" 2>/dev/null) || return 1
    _pk_value=$(printf '%s\n' "$_pk_raw" | grep -o 'value=[a-z]*' | cut -d= -f2 | head -n1)
    case "$_pk_value" in true|false) printf '%s\n' "$_pk_value" ;; *) return 1 ;; esac
}
