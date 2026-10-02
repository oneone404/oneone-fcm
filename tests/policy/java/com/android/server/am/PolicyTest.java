package com.android.server.am;

import android.content.Intent;
import android.content.pm.*;
import java.io.File;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

public final class PolicyTest {
    public static final class Broadcast {
        public int callingUid=10001;
        public String callerPackage="com.google.android.gms";
        public Intent intent=new Intent("com.google.android.c2dm.intent.RECEIVE");
    }
    private static void set(String name, Object value) throws Exception {
        Field field = OneOnePushPolicy.class.getDeclaredField(name); field.setAccessible(true); field.set(null, value);
    }
    private static Object parse(File file) throws Exception {
        Method read = OneOnePushPolicy.class.getDeclaredMethod("read", File.class); read.setAccessible(true); return read.invoke(null, file);
    }
    private static void check(boolean value) { if (!value) throw new AssertionError(); }
    public static void main(String[] args) throws Exception {
        File file = new File(args[0], "policy-test.conf");
        Files.write(file.toPath(), "enabled=1\ngms_uid=10001\n0:com.mbbank\n".getBytes(StandardCharsets.UTF_8));
        set("snapshot", parse(file)); set("dirty", false); set("nextCheck", Long.MAX_VALUE);
        String receive="com.google.android.c2dm.intent.RECEIVE";
        check(OneOnePushPolicy.allow(10001,"com.google.android.gms",10200,"com.mbbank",receive));
        check(!OneOnePushPolicy.allow(10002,"com.google.android.gms",10200,"com.mbbank",receive));
        check(!OneOnePushPolicy.allow(10001,"com.example.fake",10200,"com.mbbank",receive));
        check(!OneOnePushPolicy.allow(10001,"com.google.android.gms",10200,"com.other",receive));
        check(!OneOnePushPolicy.allow(10001,"com.google.android.gms",110200,"com.mbbank",receive));
        check(!OneOnePushPolicy.allow(10001,"com.google.android.gms",10200,"com.mbbank","unrelated.ACTION"));
        ApplicationInfo app = new ApplicationInfo(); app.uid=10200; app.packageName="com.mbbank";
        ResolveInfo receiver = new ResolveInfo(); receiver.activityInfo=new ActivityInfo(); receiver.activityInfo.applicationInfo=app;
        Broadcast broadcast = new Broadcast();
        check(OneOnePushPolicy.allowAutoStart(broadcast,receiver));
        app.flags=ApplicationInfo.FLAG_STOPPED;
        check(!OneOnePushPolicy.allowAutoStart(broadcast,receiver));
        app.flags=0; broadcast.callingUid=10002;
        check(!OneOnePushPolicy.allowAutoStart(broadcast,receiver));
        check(!OneOnePushPolicy.allowAutoStart(null,receiver));
        for (String malformed : new String[]{"enabled=1\ngms_uid=10001\nenabled=0\n", "enabled=1\n", "enabled=1\ngms_uid=0\n", "enabled=1\ngms_uid=10001\n1:com.mbbank\n", "enabled=1\ngms_uid=10001\nMODE=ALL\n"}) {
            Files.write(file.toPath(), malformed.getBytes(StandardCharsets.UTF_8));
            try { parse(file); throw new AssertionError("Malformed configuration accepted"); }
            catch (InvocationTargetException expected) { check(expected.getCause() instanceof IllegalArgumentException); }
        }
        Files.write(file.toPath(), "enabled=0\ngms_uid=10001\n0:com.mbbank\n".getBytes(StandardCharsets.UTF_8));
        set("snapshot",parse(file));
        check(!OneOnePushPolicy.allow(10001,"com.google.android.gms",10200,"com.mbbank",receive));
        file.delete(); set("snapshot",parse(file));
        check(!OneOnePushPolicy.allow(10001,"com.google.android.gms",10200,"com.mbbank",receive));
        System.out.println("PASS: actual Java policy parser, authenticated GMS caller, action/package/user scopes, force-stop preservation, malformed/disabled/missing config");
    }
}
