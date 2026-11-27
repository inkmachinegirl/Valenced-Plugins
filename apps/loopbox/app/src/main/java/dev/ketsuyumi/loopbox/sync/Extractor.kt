package dev.ketsuyumi.loopbox.sync

import dev.ketsuyumi.loopbox.data.Settings
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
 *
 * Video posts (a TikTok item with `video.playAddr`, an Instagram media with `video_versions`)
 * come out as videos, and what's inside them is skipped: the sound a video uses isn't a saved
 * sound.
 */
object Extractor {

    /**
     * What a response or page holds: [sounds] (sound objects on their own, like a saved-sounds
     * list), [videos] (video posts), and [videoSounds] (the sound each of those videos uses).
     */
    data class Found(val sounds: List<Sound>, val videos: List<Sound>, val videoSounds: List<Sound>)

    /** Sounds only (video posts and their sounds are left out). */
    fun extract(source: Source, text: String, pageUrl: String?): List<Sound> = extractAll(source, text, pageUrl).sounds

    /** Sounds, video posts, and the sounds those videos use. */
    fun extractAll(source: Source, text: String, pageUrl: String?): Found {
        val root = parse(text) ?: return Found(emptyList(), emptyList(), emptyList())
        val sounds = LinkedHashMap<String, Sound>()
        val videos = LinkedHashMap<String, Sound>()
        val videoSounds = LinkedHashMap<String, Sound>()
        walk(root, 0) { o ->
            val v = when (source) {
                Source.TIKTOK -> tiktokVideo(o)
                Source.INSTAGRAM -> instagramVideo(o)
            }
            if (v != null) {
                videos.putIfAbsent(v.key, v)
                // The video's sound, as a sound of its own (linked to its sound page).
                val s = when (source) {
                    Source.TIKTOK -> o.optJSONObject("music")?.let { tiktok(it, null) }
                    Source.INSTAGRAM -> o.optJSONObject("clips_metadata")?.let { c ->
                        (c.optJSONObject("music_info")?.optJSONObject("music_asset_info") ?: c.optJSONObject("original_sound_info"))
                            ?.let { instagram(it, v.pageUrl) }
                    }
                }
                if (s != null) videoSounds.putIfAbsent(s.key, s.copy(cover = s.cover ?: v.cover))
                return@walk false
            }
            val s = when (source) {
                Source.TIKTOK -> tiktok(o, pageUrl)
                Source.INSTAGRAM -> instagram(o, pageUrl)
            }
            if (s != null) sounds.putIfAbsent(s.key, s)
            true
        }
        return Found(sounds.values.toList(), videos.values.toList(), videoSounds.values.toList())
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

    /** [visit] returns whether to look inside the object too. */
    private fun walk(node: Any?, depth: Int, visit: (JSONObject) -> Boolean) {
        if (depth > 40) return
        when (node) {
            is JSONObject -> {
                if (!visit(node)) return
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

    /** A TikTok video post: {id, desc, author, video: {playAddr, cover, bitrateInfo}, music, stats, ...}. */
    private fun tiktokVideo(o: JSONObject): Sound? {
        val video = o.optJSONObject("video") ?: return null
        val play = pickVariant(video) ?: urlOf(video.opt("playAddr")) ?: urlOf(video.opt("play_addr")) ?: urlOf(video.opt("downloadAddr")) ?: return null
        val id = o.optString("id").ifBlank { o.optString("aweme_id") }.takeIf { it.isNotBlank() && it.all(Char::isDigit) } ?: return null
        val author = o.optJSONObject("author")
        val user = author?.optString("uniqueId")?.ifBlank { author.optString("unique_id") } ?: o.optString("author")
        val nick = author?.optString("nickname").orEmpty().ifBlank { user }
        val music = o.optJSONObject("music")
        val audio = music?.let { urlOf(it.opt("playUrl")) ?: urlOf(it.opt("play_url")) } ?: play
        val cover = urlOf(video.opt("cover")) ?: urlOf(video.opt("originCover")) ?: urlOf(video.opt("origin_cover"))
            ?: music?.let { urlOf(it.opt("coverLarge")) ?: urlOf(it.opt("cover_large")) }
        val stats = o.optJSONObject("statsV2") ?: o.optJSONObject("stats")
        fun count(vararg k: String) = k.firstNotNullOfOrNull { stats?.opt(it)?.toString()?.toLongOrNull() } ?: -1L
        val created = o.optString("createTime").ifBlank { o.optString("create_time") }.toLongOrNull() ?: 0L
        return Sound(
            key = "ttv:$id",
            source = Source.TIKTOK,
            title = o.optString("desc").ifBlank { music?.optString("title").orEmpty() }.ifBlank { "Video" },
            artist = nick,
            cover = cover,
            remoteUrl = audio,
            pageUrl = "https://www.tiktok.com/@${user.ifBlank { "_" }}/video/$id",
            video = true,
            videoUrl = play,
            postedAt = created * 1000,
            region = o.optString("locationCreated").ifBlank { o.optString("region") }.takeIf { it.length == 2 },
            user = user.ifBlank { null },
            likes = count("diggCount", "digg_count"),
            comments = count("commentCount", "comment_count"),
            saves = count("collectCount", "collect_count"),
            shares = count("shareCount", "share_count"),
            flags = tiktokFlags(o, author),
        )
    }

    /** What kind of post it is, for the feed filters. */
    private fun tiktokFlags(o: JSONObject, author: JSONObject?): Set<String> = buildSet {
        fun yes(k: String) = o.opt(k).let { it == true || (it is Number && it.toInt() != 0) || (it is String && it.isNotBlank() && it != "0" && it != "false") }
        if (yes("isAd") || o.has("adInfo") || o.has("ad_info") || yes("is_ads")) add("ad")
        if (o.has("liveRoomInfo") || yes("isLive")) add("live")
        if (o.has("imagePost") || o.has("image_post_info")) add("photo")
        if (yes("aigcLabelType") || yes("AIGCDescription") || yes("aigcDescription") || yes("isAigc")) add("ai")
        if (yes("isECVideo") || o.has("productInfo") || o.optJSONArray("anchors")?.toString()?.contains("shop", ignoreCase = true) == true) add("shop")
        if (yes("isPaidPartnership") || yes("brandOrganicType") || yes("branded_content_type")) add("paid")
        if (o.has("seriesInfo") || yes("isSeries") || o.has("series")) add("series")
        if (yes("isSubscriberOnly") || yes("subscriberOnly") || o.has("subscribeInfo")) add("subscriber")
        if (author?.optBoolean("verified") == true) add("verified")
    }

    /**
     * The copy to play from video.bitrateInfo: Settings › video quality (lowest / highest bitrate)
     * and Force H.264. Null: the default playAddr.
     */
    private fun pickVariant(video: JSONObject): String? {
        val list = video.optJSONArray("bitrateInfo") ?: return null
        val all = (0 until list.length()).mapNotNull { list.optJSONObject(it) }.filter { urlOf(it.opt("PlayAddr")) != null }
        if (all.isEmpty()) return null
        val (h264, quality) = runCatching { Settings.forceH264 to Settings.quality }.getOrDefault(false to "auto")
        val pool = if (h264) all.filter { it.optString("CodecType").contains("h264", ignoreCase = true) }.ifEmpty { all } else all
        val chosen = when (quality) {
            "saver" -> pool.minByOrNull { it.optLong("Bitrate") }
            "best" -> pool.maxByOrNull { it.optLong("Bitrate") }
            else -> if (h264 && pool !== all) pool.first() else null
        }
        return chosen?.let { urlOf(it.opt("PlayAddr")) }
    }

    /** A TikTok profile's details. */
    data class Profile(
        val user: String, val name: String, val avatar: String?, val bio: String, val verified: Boolean,
        val following: Long, val followers: Long, val likes: Long, val videos: Long,
        /** TikTok's internal id for the account, used to ask for its videos. */
        val secUid: String? = null,
    )

    /** [user]'s profile in a page or response: {user: {uniqueId, nickname, avatarLarger, signature}, stats: {...}}. */
    fun tiktokProfile(text: String, user: String): Profile? {
        val root = parse(text) ?: return null
        var found: Profile? = null
        walk(root, 0) { o ->
            if (found != null) return@walk false
            val u = o.optJSONObject("user")
            val st = o.optJSONObject("statsV2") ?: o.optJSONObject("stats")
            if (u != null && st != null && u.optString("uniqueId").equals(user, ignoreCase = true) && st.has("followerCount")) {
                fun n(vararg k: String) = k.firstNotNullOfOrNull { st.opt(it)?.toString()?.toLongOrNull() } ?: -1L
                found = Profile(
                    user = u.optString("uniqueId"),
                    name = u.optString("nickname").ifBlank { u.optString("uniqueId") },
                    avatar = urlOf(u.opt("avatarLarger")) ?: urlOf(u.opt("avatarMedium")) ?: urlOf(u.opt("avatarThumb")),
                    bio = u.optString("signature"),
                    verified = u.optBoolean("verified"),
                    following = n("followingCount"), followers = n("followerCount"),
                    likes = n("heartCount", "heart"), videos = n("videoCount"),
                    secUid = u.optString("secUid").ifBlank { null },
                )
                return@walk false
            }
            true
        }
        return found
    }

    /** TikTok videos in a page or response, e.g. a sound's page (videos that use it). */
    fun tiktokVideos(text: String): List<Sound> = extractAll(Source.TIKTOK, text, null).videos

    // ---- Instagram ----

    /** An Instagram video post (reel): {code, user, video_versions: [{url}], image_versions2}. */
    private fun instagramVideo(o: JSONObject): Sound? {
        val versions = o.optJSONArray("video_versions") ?: return null
        val play = urlOf(versions.optJSONObject(0)?.opt("url")) ?: return null
        val code = o.optString("code").ifBlank { return null }
        val user = o.optJSONObject("user")?.optString("username").orEmpty()
        val cover = o.optJSONObject("image_versions2")?.optJSONArray("candidates")?.optJSONObject(0)?.optString("url")
        val caption = o.optJSONObject("caption")?.optString("text").orEmpty()
        val clips = o.optJSONObject("clips_metadata")
        val audio = clips?.optJSONObject("music_info")?.optJSONObject("music_asset_info")?.optString("progressive_download_url")
            ?: clips?.optJSONObject("original_sound_info")?.optString("progressive_download_url")
        return Sound(
            key = "igv:$code",
            source = Source.INSTAGRAM,
            title = caption.ifBlank { "Reel" }.take(200),
            artist = user,
            cover = cover?.takeIf { it.startsWith("http") },
            remoteUrl = audio?.takeIf { it.startsWith("http") } ?: play,
            pageUrl = "https://www.instagram.com/reel/$code/",
            video = true,
            videoUrl = play,
        )
    }

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
