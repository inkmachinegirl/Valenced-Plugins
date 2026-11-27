package dev.ketsuyumi.loopbox.data

import android.content.Context
import android.content.SharedPreferences
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlin.properties.ReadWriteProperty
import kotlin.reflect.KProperty

/**
 * App settings, as Compose state (screens update when one changes), saved on the phone.
 * Assigning one saves it: `Settings.loop = false`.
 */
object Settings {
    private lateinit var prefs: SharedPreferences

    // ---- Appearance ----
    /** Accent colour (ARGB) for buttons, likes, switches and tabs. */
    var accent by int("accent", 0xFFFF4FD1.toInt())
    /** "black" (pure black), "dark" (near-black panels), "standard" (grey panels). */
    var theme by string("theme", "black")
    /** Bottom navigation: icons only. */
    var hideNavLabels by bool("hideNavLabels", false)
    /** Bottom navigation: see-through, and the feed goes on behind it. */
    var glassNav by bool("glassNav", true)

    // ---- Feed ----
    /** Feed tab to open on: "foryou", "following" or "saved". */
    var startTab by string("startTab", "foryou")
    var showAuthor by bool("showAuthor", true)
    var showLike by bool("showLike", true)
    var showSave by bool("showSave", true)
    var showShare by bool("showShare", true)
    var showComments by bool("showComments", true)
    var showMore by bool("showMore", true)
    var showSpeed by bool("showSpeed", true)
    var showDisc by bool("showDisc", true)
    var showUploadDate by bool("showUploadDate", true)
    /** "relative" (2d ago) or "date" (25 Nov 2026). */
    var timestamp by string("timestamp", "relative")
    var showRegion by bool("showRegion", true)
    var flagOnly by bool("flagOnly", false)
    /** Exact counts (1,234) instead of 1.2K. */
    var noRounding by bool("noRounding", false)
    /** Double tap: "like", "save" or "none". */
    var doubleTap by string("doubleTap", "like")
    /** Long press: "speed" (2x while held), "clear" (hide the buttons) or "none". */
    var longPress by string("longPress", "speed")
    /** Swipe left: "profile" (open the author) or "none". */
    var swipeLeft by string("swipeLeft", "profile")
    var confirmLike by bool("confirmLike", false)
    var confirmShare by bool("confirmShare", true)
    /** In Saved, each saved sound shows a video that uses it. */
    var feedVideos by bool("feedVideos", true)

    // ---- Sync ----
    /** Each saved (bookmarked) video's sound is added to your sounds too, and downloaded. */
    var soundsFromVideos by bool("soundsFromVideos", true)
    /** Saved videos taken per sync: "1000", "5000" or "all". */
    var videoCap by string("videoCap", "1000")

    // ---- Filters (For You and Following) ----
    var blockAds by bool("blockAds", true)
    var hideLive by bool("hideLive", true)
    var hidePhotos by bool("hidePhotos", false)
    var hideAi by bool("hideAi", true)
    var hideShop by bool("hideShop", true)
    var hidePaid by bool("hidePaid", true)
    var hideSeries by bool("hideSeries", true)
    var hideSubscriber by bool("hideSubscriber", true)
    var hideVerified by bool("hideVerified", false)
    /** Comma-separated words; videos whose caption or author has one are hidden. */
    var hiddenWords by string("hiddenWords", "")
    /** Views / likes limits ("" = no limit) and a date range (ms, 0 = any). */
    var minViews by string("minViews", "")
    var maxViews by string("maxViews", "")
    var minLikes by string("minLikes", "")
    var maxLikes by string("maxLikes", "")
    var dateFrom by long("dateFrom", 0)
    var dateTo by long("dateTo", 0)
    /** Hidden authors (@usernames) and blocked audio ("key|title"), one per line; added from a video's ⋯ menu. */
    var hiddenAuthors by string("hiddenAuthors", "")
    var blockedAudio by string("blockedAudio", "")
    /** Only videos posted from these regions (two-letter codes, comma-separated). */
    var filterRegion by bool("filterRegion", false)
    var regions by string("regions", "")

    // ---- Comments ----
    var commentUsernames by bool("commentUsernames", true)
    var exactCommentTime by bool("exactCommentTime", true)
    /** "collapse" (… More) or "expand" (all at once). */
    var longComments by string("longComments", "expand")
    var copyWithoutName by bool("copyWithoutName", true)
    var pauseForComments by bool("pauseForComments", false)
    /** Comma-separated words / usernames whose comments are hidden. */
    var blockCommentWords by string("blockCommentWords", "")
    var blockCommentUsers by string("blockCommentUsers", "")

    // ---- Downloads ----
    /** "auto" (as played), "h264" or "best" (highest bitrate). */
    var downloadQuality by string("downloadQuality", "auto")
    var namesWithAuthor by bool("namesWithAuthor", true)
    /** Folders under the phone's Movies and Music (videos, sounds). */
    var videoFolder by string("videoFolder", "Loopbox")
    var soundFolder by string("soundFolder", "Loopbox")
    var batchSelect by bool("batchSelect", true)

    // ---- Playback ----
    /** Loop each video/sound until you swipe (off: go on to the next one). */
    var loop by bool("loop", true)
    /** A seek bar you can drag on every video. */
    var seekBar by bool("seekBar", true)
    var rememberSpeed by bool("rememberSpeed", true)
    var speed by float("speed", 1f)
    /** Whole video frame with bars (on) or cropped to fill the screen (off). */
    var fitVideo by bool("fitVideo", true)
    var extendStatusBar by bool("extendStatusBar", true)
    /** "auto", "saver" (lowest) or "best" (highest). */
    var qualityWifi by string("qualityWifi", "auto")
    var qualityMobile by string("qualityMobile", "auto")
    /** Pick the H.264 copy of TikTok videos when there is one (lighter to decode, more data). */
    var forceH264 by bool("forceH264", false)
    /** Fade the feed's buttons and text, and shift them slowly, to avoid OLED burn-in. */
    var burnIn by bool("burnIn", false)
    var uiVisibility by float("uiVisibility", 0.65f)
    var shiftUi by bool("shiftUi", true)
    var hideSystemBars by bool("hideSystemBars", false)

    // ---- Privacy ----
    /** Remove tracking parameters from links you share. */
    var sanitizeLinks by bool("sanitizeLinks", true)
    var allowScreenshots by bool("allowScreenshots", true)
    /** Open links in the browser rather than the TikTok / Instagram app. */
    var openInBrowser by bool("openInBrowser", false)
    /** Block TikTok's tracking and logging requests in Loopbox's TikTok pages. */
    var blockTelemetry by bool("blockTelemetry", true)
    /** Don't keep "Recently played". */
    var noHistory by bool("noHistory", false)

    /** On mobile data (metered) right now, for the video quality setting. */
    @Volatile var metered = false; private set

    val quality: String get() = if (metered) qualityMobile else qualityWifi

    fun init(context: Context) {
        if (::prefs.isInitialized) return
        prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)
        // Old setting: "Fill the screen" is now "Fit video to screen" turned off.
        if (prefs.contains("fillScreen")) {
            prefs.edit().putBoolean("fitVideo", !prefs.getBoolean("fillScreen", false)).remove("fillScreen").apply()
        }
        val cm = context.getSystemService(ConnectivityManager::class.java)
        metered = cm.isActiveNetworkMetered
        runCatching {
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                    metered = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
                }
            })
        }
    }

    // ---- storage ----

    private fun <T> pref(key: String, default: T, read: SharedPreferences.(String, T) -> T, write: SharedPreferences.Editor.(String, T) -> Unit) =
        object : ReadWriteProperty<Any?, T> {
            private val state = mutableStateOf(default)
            private var loaded = false

            override fun getValue(thisRef: Any?, property: KProperty<*>): T {
                if (!loaded && ::prefs.isInitialized) { state.value = prefs.read(key, default); loaded = true }
                return state.value
            }

            override fun setValue(thisRef: Any?, property: KProperty<*>, value: T) {
                state.value = value
                loaded = true
                if (::prefs.isInitialized) prefs.edit().apply { write(key, value) }.apply()
            }
        }

    private fun bool(key: String, default: Boolean) = pref(key, default, { k, d -> getBoolean(k, d) }, { k, v -> putBoolean(k, v) })
    private fun int(key: String, default: Int) = pref(key, default, { k, d -> getInt(k, d) }, { k, v -> putInt(k, v) })
    private fun long(key: String, default: Long) = pref(key, default, { k, d -> getLong(k, d) }, { k, v -> putLong(k, v) })
    private fun float(key: String, default: Float) = pref(key, default, { k, d -> getFloat(k, d) }, { k, v -> putFloat(k, v) })
    private fun string(key: String, default: String) = pref(key, default, { k, d -> getString(k, d) ?: d }, { k, v -> putString(k, v) })
}
