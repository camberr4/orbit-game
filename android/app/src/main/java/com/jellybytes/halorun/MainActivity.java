package com.jellybytes.halorun;

import android.content.pm.ActivityInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
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
        watchHeat();
    }

    @Override
    public void onResume() {
        super.onResume();
        tellHeat();
    }

    /** The game lowers its frame rate and detail while the phone is warm (Android 10 and newer report it). The page is told on every change, on return to the app, and once shortly after start (when it has loaded). */
    private void watchHeat() {
        if (Build.VERSION.SDK_INT < 29) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm == null) return;
            pm.addThermalStatusListener(getMainExecutor(), this::sendHeat);
            getWindow().getDecorView().postDelayed(this::tellHeat, 6000);
        } catch (Throwable ignored) { /* no heat reports: the game keeps its own slow-frame watch */ }
    }

    private void tellHeat() {
        if (Build.VERSION.SDK_INT < 29) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) sendHeat(pm.getCurrentThermalStatus());
        } catch (Throwable ignored) { /* as above */ }
    }

    /** 0 none, 1 light, 2 moderate, 3 severe, 4 and up critical (PowerManager.THERMAL_STATUS_*) */
    private void sendHeat(int status) {
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            final String js = "window.__heat=" + status + ";if(window.OD&&OD.game&&OD.game.heat)OD.game.heat(" + status + ");";
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(js, null));
        } catch (Throwable ignored) { /* the page is not there yet */ }
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

    /** Ask for the display's fastest mode at the current resolution (90/120 Hz phones otherwise often stay at 60). The player can cap the frame rate in Settings. */
    private void requestHighRefreshRate() {
        try {
            Display d = getWindowManager().getDefaultDisplay();
            Display.Mode cur = d.getMode(), best = cur;
            for (Display.Mode m : d.getSupportedModes()) {
                if (m.getPhysicalWidth() == cur.getPhysicalWidth() && m.getPhysicalHeight() == cur.getPhysicalHeight() && m.getRefreshRate() > best.getRefreshRate()) best = m;
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
