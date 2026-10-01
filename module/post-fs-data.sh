#!/system/bin/sh
MODDIR=${0%/*}
touch "$MODDIR/skip_mount"
. "$MODDIR/common.sh"
# Only exact checksummed artifacts archived by previous OneOne versions.
# No mount, unmount, compiler or ART-managed cache operation.
if cleanup_legacy_cache "$MODDIR/legacy-cache.tsv" /data/dalvik-cache; then
    printf 'Legacy cache migration complete\n' > "$MODDIR/migration.log"
else
    printf 'Legacy cache cleanup incomplete; will retry next boot\n' > "$MODDIR/migration.log"
fi
# Obsolete wake-filter settings have no effect on stock framework.
rm -f /data/system/fcm_wake.conf /data/system/fcm_channel_sync.json \
    /data/system/fcm_synced_channels.txt /data/system/fcm_sound_state.json \
    /data/system/fcm_sound.lock
