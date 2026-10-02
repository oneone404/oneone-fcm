package android.os;
public abstract class FileObserver {
    public static final int CLOSE_WRITE=8, MOVED_TO=128, DELETE=512, CREATE=256;
    public FileObserver(String path, int events) {}
    public void startWatching() {}
    public abstract void onEvent(int event, String path);
}
