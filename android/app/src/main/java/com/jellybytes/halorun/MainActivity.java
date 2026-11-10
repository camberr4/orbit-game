package com.jellybytes.halorun;

import android.content.pm.ActivityInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import androidx.activity.EdgeToEdge;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this);   // draw behind the system bars on every Android version (Android 15 and newer do it by default)
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        allowRotationOnTablets();
        useDisplayCutout();
        enterImmersive();
        requestHighRefreshRate();
    }

    /** Phones stay upright; a tablet (shortest side 600 dp or more) may turn to landscape and back. (Done here, not in the manifest, so large screens are not restricted.) */
    private void allowRotationOnTablets() {
        setRequestedOrientation(getResources().getConfiguration().smallestScreenWidthDp >= 600
            ? ActivityInfo.SCREEN_ORIENTATION_FULL_USER
            : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
    }

    /** Let the picture run under a camera hole or notch (the page keeps its own safe margins), instead of leaving a black bar there. */
    private void useDisplayCutout() {
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
    }

    /** Prefer the mode closest to 60 Hz at the current resolution: 120 Hz doubles the work and the heat for no visible gain here. */
    private void requestHighRefreshRate() {
        try {
            Display d = getWindowManager().getDefaultDisplay();
            Display.Mode cur = d.getMode(), best = cur;
            for (Display.Mode m : d.getSupportedModes()) {
                if (m.getPhysicalWidth() == cur.getPhysicalWidth() && m.getPhysicalHeight() == cur.getPhysicalHeight() && Math.abs(m.getRefreshRate() - 60f) < Math.abs(best.getRefreshRate() - 60f)) best = m;
            }
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.preferredDisplayModeId = best.getModeId();
            getWindow().setAttributes(lp);
        } catch (Throwable ignored) { /* older devices: keep the default */ }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersive();
    }

    /** Full-screen, edge-to-edge: system bars hide and reappear only on an edge swipe. */
    private void enterImmersive() {
        Window w = getWindow();
        WindowCompat.setDecorFitsSystemWindows(w, false);
        View decor = w.getDecorView();
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, decor);
        if (c != null) {
            c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            c.hide(WindowInsetsCompat.Type.systemBars());
        }
    }
}
