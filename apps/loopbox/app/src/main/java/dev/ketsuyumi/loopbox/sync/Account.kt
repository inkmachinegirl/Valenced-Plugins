package dev.ketsuyumi.loopbox.sync

import android.webkit.CookieManager
import dev.ketsuyumi.loopbox.data.Source
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Who you're logged in as on each site, from the sync browser's cookies. */
object Account {
    /** Logged in: the site's session cookie is there. */
    fun loggedIn(source: Source): Boolean {
        val site = if (source == Source.TIKTOK) "https://www.tiktok.com" else "https://www.instagram.com"
        return CookieManager.getInstance().getCookie(site)?.contains("sessionid=") == true
    }

    /**
     * Your TikTok profile page (https://www.tiktok.com/@name), asked from TikTok's account info
     * for the logged-in browser. Null if it can't be found. Blocking: call off the main thread.
     */
    fun tiktokProfile(): String? = runCatching {
        val url = "https://www.tiktok.com/passport/web/account/info/?aid=1459&app_language=en&app_name=tiktok_web"
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15000; c.readTimeout = 15000
        c.setRequestProperty("User-Agent", DESKTOP_UA)
        c.setRequestProperty("Referer", "https://www.tiktok.com/")
        CookieManager.getInstance().getCookie(url)?.let { c.setRequestProperty("Cookie", it) }
        val body = c.inputStream.bufferedReader().use { it.readText() }
        c.disconnect()
        val data = JSONObject(body).optJSONObject("data")
        val name = data?.optString("username").orEmpty().ifBlank { data?.optString("unique_id").orEmpty() }
        SyncLog.add(if (name.isNotBlank()) "logged in as @$name" else "couldn't find your username (${body.take(80)})")
        name.takeIf { it.isNotBlank() }?.let { "https://www.tiktok.com/@$it" }
    }.onFailure { SyncLog.add("account info failed: $it") }.getOrNull()
}
