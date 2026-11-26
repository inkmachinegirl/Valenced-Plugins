package dev.ketsuyumi.loopbox.sync

import dev.ketsuyumi.loopbox.data.Source
import dev.ketsuyumi.loopbox.data.Sound
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

/**
 * Finds sounds in the data TikTok and Instagram pages load (their API responses and the JSON
 * embedded in the page), whatever the exact shape: the whole tree is walked and any object that
 * looks like a sound is taken.
 *
 * - TikTok: a "music" object with a play URL (`playUrl` as a string, or `play_url.url_list`),
 *   a title, an author and a cover.
 * - Instagram: `music_asset_info` (licensed songs) and `original_sound_info` (original audio),
 *   each with a `progressive_download_url`.
 */
object Extractor {

    fun extract(source: Source, text: String, pageUrl: String?): List<Sound> {
        val root = parse(text) ?: return emptyList()
        val out = LinkedHashMap<String, Sound>()
        walk(root, 0) { o ->
            val s = when (source) {
                Source.TIKTOK -> tiktok(o, pageUrl)
                Source.INSTAGRAM -> instagram(o, pageUrl)
            }
            if (s != null) out.putIfAbsent(s.key, s)
        }
        return out.values.toList()
    }

    private fun parse(text: String): Any? {
        val t = text.trim()
        if (t.isEmpty() || (t[0] != '{' && t[0] != '[')) return null
        return try {
            JSONTokener(t).nextValue()
        } catch (e: Exception) {
            null
        }
    }

    private fun walk(node: Any?, depth: Int, visit: (JSONObject) -> Unit) {
        if (depth > 40) return
        when (node) {
            is JSONObject -> {
                visit(node)
                val keys = node.keys()
                while (keys.hasNext()) walk(node.opt(keys.next()), depth + 1, visit)
            }
            is JSONArray -> for (i in 0 until node.length()) walk(node.opt(i), depth + 1, visit)
        }
    }

    // ---- TikTok ----

    private fun tiktok(o: JSONObject, pageUrl: String?): Sound? {
        val play = urlOf(o.opt("playUrl")) ?: urlOf(o.opt("play_url")) ?: return null
        if (!play.startsWith("http")) return null
        val title = o.optString("title").ifBlank { o.optString("musicName") }.ifBlank { return null }
        val id = o.optString("idStr").ifBlank { o.optString("id_str") }.ifBlank { o.optString("id") }.ifBlank { play }
        val artist = o.optString("authorName").ifBlank { o.optString("author") }.ifBlank { o.optString("owner_nickname") }
        val cover = urlOf(o.opt("coverLarge")) ?: urlOf(o.opt("coverMedium")) ?: urlOf(o.opt("coverThumb"))
            ?: urlOf(o.opt("cover_large")) ?: urlOf(o.opt("cover_medium")) ?: urlOf(o.opt("cover_thumb"))
        return Sound(
            key = "tt:$id",
            source = Source.TIKTOK,
            title = title,
            artist = artist,
            cover = cover,
            remoteUrl = play,
            pageUrl = if (id.all { it.isDigit() }) "https://www.tiktok.com/music/x-$id" else pageUrl,
        )
    }

    // ---- Instagram ----

    private fun instagram(o: JSONObject, pageUrl: String?): Sound? {
        val url = o.optString("progressive_download_url").takeIf { it.startsWith("http") } ?: return null
        val music = o.has("display_artist") || o.has("audio_cluster_id") && o.has("title")
        val title = if (music) o.optString("title") else o.optString("original_audio_title")
        val artist = if (music) o.optString("display_artist")
        else o.optJSONObject("ig_artist")?.optString("username") ?: o.optString("display_artist")
        val id = o.optString("audio_asset_id").ifBlank { o.optString("audio_cluster_id") }
            .ifBlank { o.optString("id") }.ifBlank { url.substringBefore('?') }
        val cover = o.optString("cover_artwork_uri").ifBlank { o.optString("cover_artwork_thumbnail_uri") }
            .ifBlank { o.optJSONObject("ig_artist")?.optString("profile_pic_url") ?: "" }
        return Sound(
            key = "ig:$id",
            source = Source.INSTAGRAM,
            title = title.ifBlank { "Original audio" },
            artist = artist,
            cover = cover.takeIf { it.startsWith("http") },
            remoteUrl = url,
            pageUrl = pageUrl,
        )
    }

    /** A URL from a string, an array of strings, or {url_list: [...]} / {UrlList: [...]} / {urlList: [...]}. */
    private fun urlOf(v: Any?): String? = when (v) {
        is String -> v.takeIf { it.startsWith("http") }
        is JSONArray -> (0 until v.length()).asSequence().mapNotNull { urlOf(v.opt(it)) }.firstOrNull()
        is JSONObject -> urlOf(v.opt("url_list")) ?: urlOf(v.opt("UrlList")) ?: urlOf(v.opt("urlList"))
        else -> null
    }
}
