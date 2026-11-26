package dev.ketsuyumi.loopbox.sync

import android.webkit.CookieManager
import dev.ketsuyumi.loopbox.data.Library
import dev.ketsuyumi.loopbox.data.Source
import dev.ketsuyumi.loopbox.data.Sound
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Saves a sound's audio to the phone, as the logged-in browser would fetch it: with the
 * WebView's cookies for that site, its user agent and the site as referer. Sound URLs from these
 * sites often expire, so they're downloaded right when they're found.
 */
object Downloader {
    var userAgent: String = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"

    suspend fun download(sound: Sound): Result<File> = withContext(Dispatchers.IO) {
        runCatching {
            val referer = when (sound.source) {
                Source.TIKTOK -> "https://www.tiktok.com/"
                Source.INSTAGRAM -> "https://www.instagram.com/"
            }
            var url = URL(sound.remoteUrl)
            var conn: HttpURLConnection
            var hops = 0
            while (true) {
                conn = (url.openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = false
                    connectTimeout = 15000
                    readTimeout = 30000
                    setRequestProperty("User-Agent", userAgent)
                    setRequestProperty("Referer", referer)
                    setRequestProperty("Accept", "*/*")
                    CookieManager.getInstance().getCookie(url.toString())?.let { setRequestProperty("Cookie", it) }
                }
                val code = conn.responseCode
                if (code in 300..399 && hops++ < 5) {
                    val next = conn.getHeaderField("Location") ?: break
                    url = URL(url, next)
                    conn.disconnect()
                    continue
                }
                if (code !in 200..299) error("HTTP $code")
                break
            }
            val type = conn.contentType.orEmpty()
            val ext = when {
                "mpeg" in type || sound.remoteUrl.contains(".mp3") -> "mp3"
                "ogg" in type -> "ogg"
                "webm" in type -> "webm"
                else -> "m4a"
            }
            val name = sound.key.replace(Regex("[^A-Za-z0-9_-]"), "_") + "." + ext
            val target = File(Library.audioDir, name)
            val tmp = File(Library.audioDir, "$name.part")
            conn.inputStream.use { input -> tmp.outputStream().use { input.copyTo(it) } }
            conn.disconnect()
            if (tmp.length() < 1024) {
                tmp.delete()
                error("the file was empty")
            }
            tmp.renameTo(target)
            Library.setFile(sound.key, target.absolutePath)
            target
        }
    }
}
