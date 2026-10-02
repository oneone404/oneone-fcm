package oneone.fcm;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/** Root app_process helper. Reads user 0 metadata, never APK code or private app data. */
public final class AppCatalog {
    public static void main(String[] args) throws Exception {
        if (args.length != 1 || !args[0].equals("list")) throw new IllegalArgumentException("list only");
        Class<?> activityThread = Class.forName("android.app.ActivityThread");
        Object thread = activityThread.getMethod("systemMain").invoke(null);
        Method getContext = activityThread.getMethod("getSystemContext");
        Context context = (Context) getContext.invoke(thread);
        PackageManager pm = context.getPackageManager();
        List<ApplicationInfo> apps = pm.getInstalledApplications(0);
        Collections.sort(apps, new Comparator<ApplicationInfo>() {
            public int compare(ApplicationInfo left, ApplicationInfo right) {
                return pm.getApplicationLabel(left).toString().compareToIgnoreCase(pm.getApplicationLabel(right).toString());
            }
        });
        JSONArray result = new JSONArray();
        for (ApplicationInfo app : apps) {
            if ((app.flags & ApplicationInfo.FLAG_INSTALLED) == 0) continue;
            JSONObject row = new JSONObject();
            row.put("package", app.packageName);
            row.put("user", 0);
            row.put("name", pm.getApplicationLabel(app).toString());
            row.put("system", (app.flags & ApplicationInfo.FLAG_SYSTEM) != 0);
            row.put("enabled", app.enabled);
            try {
                Drawable drawable = pm.getApplicationIcon(app);
                Bitmap bitmap = Bitmap.createBitmap(48, 48, Bitmap.Config.ARGB_8888);
                drawable.setBounds(0, 0, 48, 48);
                drawable.draw(new Canvas(bitmap));
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, bytes);
                bitmap.recycle();
                row.put("icon", "data:image/png;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
            } catch (Exception unavailable) { row.put("icon", JSONObject.NULL); }
            result.put(row);
        }
        System.out.println(new JSONObject().put("status", "ok").put("apps", result).toString());
        System.exit(0); // systemMain prepares a Looper; this is a one-shot helper.
    }
}
