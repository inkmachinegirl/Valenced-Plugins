package dev.ketsuyumi.loopbox.sync

import androidx.compose.runtime.mutableStateListOf
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * What the last syncs did, line by line (pages asked for, what came back, why a list ended), so
 * a sync that stops early can be looked into: Settings › Sync log, with Copy. Kept in memory.
 */
object SyncLog {
    val lines = mutableStateListOf<String>()
    private val time = SimpleDateFormat("HH:mm:ss", Locale.US)

    fun add(line: String) {
        val l = time.format(Date()) + "  " + line.take(400)
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            lines.add(l)
            if (lines.size > 400) lines.removeRange(0, lines.size - 400)
        }
    }

    fun clear() = lines.clear()

    /** A request URL without its long tokens: path and the short parameters (cursor, count…). */
    fun short(url: String): String = runCatching {
        val u = android.net.Uri.parse(url)
        u.path + "?" + u.queryParameterNames.mapNotNull { k ->
            val v = u.getQueryParameter(k).orEmpty()
            if (v.length <= 24) "$k=$v" else null
        }.joinToString("&")
    }.getOrDefault(url.take(120))

    /** Whether [url] asks for the first page of a list (its cursor parameters are 0 or absent). */
    fun firstPage(url: String): Boolean = runCatching {
        val u = android.net.Uri.parse(url)
        u.queryParameterNames.filter { CURSOR.matches(it) }.all { u.getQueryParameter(it).let { v -> v.isNullOrEmpty() || v == "0" } }
    }.getOrDefault(true)

    private val CURSOR = Regex("(?i)cursor|max_cursor|maxcursor|min_cursor|mincursor|offset|max_id|maxid")
}
