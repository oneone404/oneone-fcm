package com.android.server.am;

import android.os.FileObserver;
import android.os.SystemClock;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.ResolveInfo;
import java.lang.reflect.Field;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/** Selected GMS push thaws only. No stopped-package flags or notification changes. */
public final class OneOnePushPolicy {
    private static final String DIRECTORY = "/data/system";
    private static final String NAME = "oneone_fcm_policy.conf";
    private static volatile Snapshot snapshot = new Snapshot(false, -1, Collections.<String>emptySet());
    private static volatile boolean dirty = true;
    private static long nextCheck;
    private static FileObserver observer;
    private static volatile Field[] recordFields;

    private static final class Snapshot {
        final boolean enabled;
        final int gmsUid;
        final Set<String> packages;
        Snapshot(boolean enabled, int uid, Set<String> packages) {
            this.enabled = enabled; this.gmsUid = uid; this.packages = packages;
        }
    }

    /** A false result means defer to OEM policy, not block ordinary delivery. */
    public static boolean allow(int callerUid, String caller, int targetUid, String target, String action) {
        if (!"com.google.android.c2dm.intent.RECEIVE".equals(action)
                || !"com.google.android.gms".equals(caller) || targetUid < 0 || target == null) return false;
        refresh();
        Snapshot current = snapshot;
        return current.enabled && callerUid == current.gmsUid
                && current.packages.contains((targetUid / 100000) + ":" + target);
    }

    public static boolean allowAutoStart(Object record, ResolveInfo receiver) {
        try {
            if (record == null || receiver == null || receiver.activityInfo == null) return false;
            ApplicationInfo app = receiver.activityInfo.applicationInfo;
            if (app == null || (app.flags & ApplicationInfo.FLAG_STOPPED) != 0) return false;
            Field[] fields = recordFields;
            if (fields == null) {
                Class<?> type = record.getClass();
                fields = new Field[] { type.getDeclaredField("callingUid"), type.getDeclaredField("callerPackage"), type.getDeclaredField("intent") };
                for (Field field : fields) field.setAccessible(true);
                recordFields = fields;
            }
            Intent intent = (Intent) fields[2].get(record);
            return intent != null && allow(fields[0].getInt(record), (String) fields[1].get(record),
                    app.uid, app.packageName, intent.getAction());
        } catch (Throwable failure) { return false; }
    }

    private static synchronized void refresh() {
        long now = SystemClock.elapsedRealtime();
        // Event-driven invalidation plus a bounded, on-demand retry. No polling thread.
        if (!dirty && now < nextCheck) return;
        nextCheck = now + 5000;
        dirty = false;
        try {
            if (observer == null) {
                observer = new FileObserver(DIRECTORY, FileObserver.CLOSE_WRITE | FileObserver.MOVED_TO
                        | FileObserver.DELETE | FileObserver.CREATE) {
                    @Override public void onEvent(int event, String path) {
                        if (NAME.equals(path)) dirty = true;
                    }
                };
                observer.startWatching();
            }
            snapshot = read(new File(DIRECTORY, NAME));
        } catch (Throwable failure) {
            snapshot = new Snapshot(false, -1, Collections.<String>emptySet());
        }
    }

    static Snapshot read(File file) throws Exception {
        if (!file.isFile() || file.length() > 65536) return new Snapshot(false, -1, Collections.<String>emptySet());
        boolean enabled = false;
        boolean seenEnabled = false;
        boolean seenUid = false;
        int uid = -1;
        Set<String> packages = new HashSet<String>();
        try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.equals("enabled=1") || line.equals("enabled=0")) {
                    if (seenEnabled) throw new IllegalArgumentException("Duplicate activation flag");
                    seenEnabled = true; enabled = line.equals("enabled=1");
                } else if (line.startsWith("gms_uid=")) {
                    if (seenUid) throw new IllegalArgumentException("Duplicate GMS uid");
                    seenUid = true; uid = Integer.parseInt(line.substring(8));
                    if (uid < 10000 || uid >= 100000) throw new IllegalArgumentException("Primary-user GMS uid required");
                }
                else if (line.matches("0:[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+)+")) packages.add(line);
                else if (!line.isEmpty()) throw new IllegalArgumentException("Invalid policy");
                if (packages.size() > 500) throw new IllegalArgumentException("Policy too large");
            }
        }
        if (!seenEnabled || !seenUid) throw new IllegalArgumentException("Incomplete policy");
        return new Snapshot(enabled, uid, Collections.unmodifiableSet(packages));
    }
}
