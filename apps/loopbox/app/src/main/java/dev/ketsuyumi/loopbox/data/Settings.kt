package dev.ketsuyumi.loopbox.data

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** App settings, as Compose state, saved on the phone. */
object Settings {
    private lateinit var prefs: SharedPreferences

    /** Loop each sound/video until you swipe (off: go on to the next one). */
    var loop by mutableStateOf(true); private set
    /** Show videos in the feed (saved videos, and a video that uses each saved sound). */
    var feedVideos by mutableStateOf(true); private set
    /** Videos fill the whole screen (cropped) instead of fitting with bars, like TikTok. */
    var fillScreen by mutableStateOf(false); private set
    /** Hide the status and navigation bars over the feed. */
    var hideSystemBars by mutableStateOf(false); private set
    /** Fade the feed's buttons and text, and shift them slowly, to avoid OLED burn-in. */
    var burnIn by mutableStateOf(false); private set
    var uiVisibility by mutableFloatStateOf(0.65f); private set
    var shiftUi by mutableStateOf(true); private set
    /** Pick the H.264 copy of TikTok videos when there is one (lighter to decode, more data). */
    var forceH264 by mutableStateOf(false); private set

    fun init(context: Context) {
        if (::prefs.isInitialized) return
        prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)
        loop = prefs.getBoolean("loop", true)
        feedVideos = prefs.getBoolean("feedVideos", true)
        fillScreen = prefs.getBoolean("fillScreen", false)
        hideSystemBars = prefs.getBoolean("hideSystemBars", false)
        burnIn = prefs.getBoolean("burnIn", false)
        uiVisibility = prefs.getFloat("uiVisibility", 0.65f)
        shiftUi = prefs.getBoolean("shiftUi", true)
        forceH264 = prefs.getBoolean("forceH264", false)
    }

    fun putLoop(v: Boolean) { loop = v; prefs.edit().putBoolean("loop", v).apply() }
    fun putFeedVideos(v: Boolean) { feedVideos = v; prefs.edit().putBoolean("feedVideos", v).apply() }
    fun putFillScreen(v: Boolean) { fillScreen = v; prefs.edit().putBoolean("fillScreen", v).apply() }
    fun putHideSystemBars(v: Boolean) { hideSystemBars = v; prefs.edit().putBoolean("hideSystemBars", v).apply() }
    fun putBurnIn(v: Boolean) { burnIn = v; prefs.edit().putBoolean("burnIn", v).apply() }
    fun putUiVisibility(v: Float) { uiVisibility = v; prefs.edit().putFloat("uiVisibility", v).apply() }
    fun putShiftUi(v: Boolean) { shiftUi = v; prefs.edit().putBoolean("shiftUi", v).apply() }
    fun putForceH264(v: Boolean) { forceH264 = v; prefs.edit().putBoolean("forceH264", v).apply() }
}
