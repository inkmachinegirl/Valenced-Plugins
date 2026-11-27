package dev.ketsuyumi.loopbox.playback

import android.net.Uri
import android.webkit.CookieManager
import dev.ketsuyumi.loopbox.data.Library
import dev.ketsuyumi.loopbox.data.Source
import dev.ketsuyumi.loopbox.data.Sound
import dev.ketsuyumi.loopbox.sync.DESKTOP_UA
import dev.ketsuyumi.loopbox.sync.Extractor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

/**
 * Finds a video to show in the feed:
 * - a saved video: its own, from the address saved with it while that's still valid, otherwise
 *   a fresh one from its page;
 * - a saved TikTok sound: a video that uses it, from the sound's page.
 *
 * Pages are fetched like the logged-in browser would (its cookies, the same user agent), and
 * cookies the site sets are kept for streaming the video. Results last for the session.
 */
object VideoResolver {
    const val USER_AGENT = DESKTOP_UA
    private val cache = ConcurrentHashMap<String, String>()
    private val none = ConcurrentHashMap.newKeySet<String>()

    /** Headers for streaming a video address. */
    fun headers(url: String): Map<String, String> = buildMap {
        val instagram = "instagram" in url || "fbcdn" in url || "cdninstagram" in url
        put("User-Agent", USER_AGENT)
        put("Referer", if (instagram) "https://www.instagram.com/" else "https://www.tiktok.com/")
        // TikTok's video servers check your TikTok cookies (tt_chain_token…), but their addresses
        // aren't always on tiktok.com (EU: tiktokcdn-eu.com, tiktokv.eu…), so send tiktok.com's.
        val cm = CookieManager.getInstance()
        val site = if (instagram) "https://www.instagram.com" else "https://www.tiktok.com"
        val cookies = listOfNotNull(cm.getCookie(url), cm.getCookie(site))
            .flatMap { it.split(';') }.map { it.trim() }.filter { it.isNotEmpty() }
            .distinctBy { it.substringBefore('=') }
        if (cookies.isNotEmpty()) put("Cookie", cookies.joinToString("; "))
    }

    /** A fresh address for a video whose address didn't play: from its page, skipping what's cached. */
    suspend fun refresh(s: Sound): String? {
        if (s.source != Source.TIKTOK) return null
        val page = s.pageUrl ?: return null
        val found = withContext(Dispatchers.IO) { runCatching { fromPage(page, s) }.getOrNull() } ?: return null
        cache[s.key] = found
        if (s.video && Library.sound(s.key) != null) Library.setVideoUrl(s.key, found)
        return found
    }

    /**
     * The address to download a video post from (Settings › Downloads › quality): as played, or
     * from its page the H.264 / highest-bitrate copy.
     */
    suspend fun downloadUrl(s: Sound): String? {
        val pref = dev.ketsuyumi.loopbox.data.Settings.downloadQuality
        if (pref != "auto" && s.source == Source.TIKTOK && s.pageUrl != null) {
            val picked = withContext(Dispatchers.IO) {
                runCatching {
                    val html = get(s.pageUrl) ?: return@runCatching null
                    val json = Regex("""<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>""", RegexOption.DOT_MATCHES_ALL).find(html)?.groupValues?.get(1)
                        ?: return@runCatching null
                    val id = s.key.substringAfter(':')
                    bestOf(json, id, pref)
                }.getOrNull()
            }
            if (picked != null) return picked
        }
        return if (s.videoUrl != null && fresh(s.videoUrl)) s.videoUrl else refresh(s) ?: s.videoUrl
    }

    /** From a page's data, the video [id]'s bitrateInfo copy: "h264" (H.264) or "best" (highest bitrate). */
    private fun bestOf(json: String, id: String, pref: String): String? {
        val root = org.json.JSONTokener(json).nextValue()
        var out: String? = null
        fun walk(n: Any?, depth: Int) {
            if (out != null || depth > 30) return
            when (n) {
                is org.json.JSONObject -> {
                    val v = n.optJSONObject("video")
                    val list = v?.optJSONArray("bitrateInfo")
                    if (list != null && n.optString("id") == id) {
                        val all = (0 until list.length()).mapNotNull { list.optJSONObject(it) }
                        val pool = if (pref == "h264") all.filter { it.optString("CodecType").contains("h264", true) }.ifEmpty { all } else all
                        val c = pool.maxByOrNull { it.optLong("Bitrate") }
                        out = c?.optJSONObject("PlayAddr")?.optJSONArray("UrlList")?.optString(0)?.takeIf { it.startsWith("http") }
                        return
                    }
                    n.keys().forEach { walk(n.opt(it), depth + 1) }
                }
                is org.json.JSONArray -> for (i in 0 until n.length()) walk(n.opt(i), depth + 1)
            }
        }
        walk(root, 0)
        return out
    }

    /** Why a video didn't play, short: the HTTP status when there was one. */
    fun why(e: androidx.media3.common.PlaybackException): String {
        var c: Throwable? = e
        while (c != null) {
            if (c is androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException) return "HTTP ${c.responseCode}"
            c = c.cause
        }
        return e.errorCodeName.removePrefix("ERROR_CODE_").lowercase().replace('_', ' ')
    }

    suspend fun videoFor(s: Sound): String? {
        cache[s.key]?.let { return it }
        if (s.key in none) return null
        if (s.video && s.videoUrl != null && fresh(s.videoUrl)) return s.videoUrl.also { cache[s.key] = it }
        if (s.source != Source.TIKTOK) return null // Instagram: only the address saved with it
        val page = s.pageUrl ?: return null
        val found = withContext(Dispatchers.IO) { runCatching { fromPage(page, s) }.getOrNull() }
        if (found == null) { none += s.key; return null }
        cache[s.key] = found
        if (s.video) Library.setVideoUrl(s.key, found)
        return found
    }

    /** TikTok and Instagram video addresses carry their expiry (TikTok: expire=<seconds>; Instagram: oe=<hex seconds>). */
    private fun fresh(url: String): Boolean {
        val u = Uri.parse(url)
        val now = System.currentTimeMillis() / 1000 + 120
        u.getQueryParameter("expire")?.toLongOrNull()?.let { return it > now }
        u.getQueryParameter("oe")?.toLongOrNull(16)?.let { return it > now }
        return false
    }

    private fun fromPage(page: String, s: Sound): String? {
        val html = get(page) ?: return null
        val videos = Regex("""<script[^>]*id="(?:__UNIVERSAL_DATA_FOR_REHYDRATION__|SIGI_STATE)"[^>]*>(.*?)</script>""", RegexOption.DOT_MATCHES_ALL)
            .findAll(html).flatMap { Extractor.tiktokVideos(it.groupValues[1]) }.toList()
        val own = if (s.video) videos.firstOrNull { it.key == s.key } else null
        return (own ?: videos.firstOrNull())?.videoUrl
    }

    private fun get(url: String): String? {
        var target = URL(url)
        repeat(5) {
            val c = target.openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.connectTimeout = 15000; c.readTimeout = 20000
            c.setRequestProperty("User-Agent", USER_AGENT)
            c.setRequestProperty("Accept", "text/html,application/xhtml+xml")
            c.setRequestProperty("Accept-Language", "en-US,en;q=0.9")
            CookieManager.getInstance().getCookie(target.toString())?.let { c.setRequestProperty("Cookie", it) }
            val code = c.responseCode
            c.headerFields["Set-Cookie"]?.forEach { CookieManager.getInstance().setCookie(target.toString(), it) }
            if (code in 300..399) {
                target = URL(target, c.getHeaderField("Location") ?: return null)
                c.disconnect()
                return@repeat
            }
            if (code != 200) { c.disconnect(); return null }
            return c.inputStream.bufferedReader().use { it.readText() }.also { c.disconnect() }
        }
        return null
    }
}
