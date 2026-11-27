package dev.ketsuyumi.loopbox.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Where a sound came from. */
enum class Source { TIKTOK, INSTAGRAM }

/**
 * One saved sound, or a saved video ([video]). [file] is the downloaded audio on the phone (null
 * until downloaded). [videoUrl]: the last known address of the video (they expire; the feed
 * finds a fresh one from [pageUrl]). A saved video plays its sound as audio like any other entry.
 */
data class Sound(
    val key: String,
    val source: Source,
    val title: String,
    val artist: String,
    val cover: String?,
    val remoteUrl: String,
    val pageUrl: String?,
    val file: String? = null,
    val addedAt: Long = System.currentTimeMillis(),
    val liked: Boolean = false,
    val video: Boolean = false,
    val videoUrl: String? = null,
    /** Video posts: when it was posted (ms), the country it was posted from, @username. */
    val postedAt: Long = 0,
    val region: String? = null,
    val user: String? = null,
    /** Video posts: counts, -1 when unknown. */
    val likes: Long = -1,
    val comments: Long = -1,
    val saves: Long = -1,
    val shares: Long = -1,
    val views: Long = -1,
    /** Video posts: the sound it uses (key like "tt:123", and its title), for Blocked audio. */
    val musicKey: String? = null,
    val musicTitle: String? = null,
    /** Video posts: what kind it is, for the feed filters (ad, ai, shop, paid, series, subscriber, verified, photo, live). Not saved. */
    val flags: Set<String> = emptySet(),
)

data class Playlist(val id: String, val name: String, val keys: List<String>)

data class LibraryState(
    val sounds: List<Sound> = emptyList(),
    val playlists: List<Playlist> = emptyList(),
    val recent: List<String> = emptyList(),
    /** Per source: the page the saved sounds were last found on, for "Sync now". */
    val syncPages: Map<Source, String> = emptyMap(),
    /** Per source: the site's own request that lists the saved sounds, for syncing in the background. */
    val syncApis: Map<Source, String> = emptyMap(),
    /** Per source: the same for saved videos. */
    val videoApis: Map<Source, String> = emptyMap(),
)

/**
 * The whole library, kept in memory and saved to library.json in the app's private storage.
 * Audio files live in files/audio/. Everything is on the phone, so it all plays offline.
 */
object Library {
    private lateinit var dir: File
    private val _state = MutableStateFlow(LibraryState())
    val state: StateFlow<LibraryState> = _state.asStateFlow()

    val audioDir: File get() = File(dir, "audio").also { it.mkdirs() }
    private val file: File get() = File(dir, "library.json")

    fun init(context: Context) {
        if (::dir.isInitialized) return
        dir = context.filesDir
        val loaded = load()
        _state.value = forgetWrongLists(loaded)
        if (_state.value !== loaded) scheduleSave()
    }

    /**
     * Earlier versions could remember TikTok's For You request (and page) as the saved list,
     * because its query has "data_collection_enabled". Only saved-list requests and profile pages
     * are kept; background syncs then click through to the right list and remember it.
     */
    private fun forgetWrongLists(s: LibraryState): LibraryState {
        fun path(u: String) = runCatching { java.net.URI(u).path.orEmpty().lowercase() }.getOrDefault("")
        val saved = Regex("collect|favorite|favourite|music_list|musiclist|saved|audio|clips")
        val apis = s.syncApis.filterValues { saved.containsMatchIn(path(it)) }
        val videoApis = s.videoApis.filterValues { saved.containsMatchIn(path(it)) }
        val pages = s.syncPages.filter { (src, u) -> if (src == Source.TIKTOK) path(u).startsWith("/@") else "/saved" in path(u) }
        if (apis == s.syncApis && videoApis == s.videoApis && pages == s.syncPages) return s
        return s.copy(syncApis = apis, videoApis = videoApis, syncPages = pages)
    }

    fun sound(key: String): Sound? = _state.value.sounds.firstOrNull { it.key == key }

    /** Adds sounds not in the library yet; returns the new ones. */
    @Synchronized
    fun addAll(found: List<Sound>): List<Sound> {
        val have = _state.value.sounds.map { it.key }.toSet()
        val fresh = found.filter { it.key !in have }.distinctBy { it.key }
        if (fresh.isEmpty()) return emptyList()
        update { it.copy(sounds = fresh + it.sounds) }
        return fresh
    }

    fun setFile(key: String, path: String) = updateSound(key) { it.copy(file = path) }

    fun toggleLike(key: String) = updateSound(key) { it.copy(liked = !it.liked) }

    fun remove(key: String) {
        sound(key)?.file?.let { File(it).delete() }
        update { s ->
            s.copy(
                sounds = s.sounds.filter { it.key != key },
                playlists = s.playlists.map { p -> p.copy(keys = p.keys - key) },
                recent = s.recent - key,
            )
        }
    }

    fun played(key: String) = update { s -> s.copy(recent = (listOf(key) + (s.recent - key)).take(50)) }

    fun clearRecent() = update { it.copy(recent = emptyList()) }

    fun createPlaylist(name: String): Playlist {
        val p = Playlist("p" + System.currentTimeMillis().toString(36), name.ifBlank { "New playlist" }, emptyList())
        update { it.copy(playlists = it.playlists + p) }
        return p
    }

    fun renamePlaylist(id: String, name: String) =
        update { s -> s.copy(playlists = s.playlists.map { if (it.id == id) it.copy(name = name) else it }) }

    fun deletePlaylist(id: String) = update { s -> s.copy(playlists = s.playlists.filter { it.id != id }) }

    fun addToPlaylist(id: String, key: String) = update { s ->
        s.copy(playlists = s.playlists.map { if (it.id == id && key !in it.keys) it.copy(keys = it.keys + key) else it })
    }

    fun removeFromPlaylist(id: String, key: String) = update { s ->
        s.copy(playlists = s.playlists.map { if (it.id == id) it.copy(keys = it.keys - key) else it })
    }

    fun setSyncPage(source: Source, url: String) = update { it.copy(syncPages = it.syncPages + (source to url)) }

    fun setSyncApi(source: Source, url: String) {
        if (_state.value.syncApis[source] != url) update { it.copy(syncApis = it.syncApis + (source to url)) }
    }

    fun setVideoApi(source: Source, url: String) {
        if (_state.value.videoApis[source] != url) update { it.copy(videoApis = it.videoApis + (source to url)) }
    }

    fun setVideoUrl(key: String, url: String) = updateSound(key) { it.copy(videoUrl = url) }

    private fun updateSound(key: String, change: (Sound) -> Sound) =
        update { s -> s.copy(sounds = s.sounds.map { if (it.key == key) change(it) else it }) }

    @Synchronized
    private fun update(change: (LibraryState) -> LibraryState) {
        _state.value = change(_state.value)
        scheduleSave()
    }

    // Saving writes the whole library; a big sync changes it thousands of times, so writes are
    // made off the main thread and bunched together.
    private val saver = java.util.concurrent.Executors.newSingleThreadExecutor()
    private val dirty = java.util.concurrent.atomic.AtomicBoolean(false)

    private fun scheduleSave() {
        if (!dirty.compareAndSet(false, true)) return
        saver.execute {
            Thread.sleep(500)
            dirty.set(false)
            runCatching { save(_state.value) }
        }
    }

    // ---- JSON ----

    private fun save(s: LibraryState) {
        val root = JSONObject()
        root.put("sounds", JSONArray().apply {
            s.sounds.forEach { x ->
                put(JSONObject().apply {
                    put("key", x.key); put("source", x.source.name); put("title", x.title)
                    put("artist", x.artist); put("cover", x.cover ?: JSONObject.NULL)
                    put("remoteUrl", x.remoteUrl); put("pageUrl", x.pageUrl ?: JSONObject.NULL)
                    put("file", x.file ?: JSONObject.NULL); put("addedAt", x.addedAt); put("liked", x.liked)
                    if (x.video) put("video", true)
                    if (x.videoUrl != null) put("videoUrl", x.videoUrl)
                    if (x.postedAt > 0) put("postedAt", x.postedAt)
                    if (x.region != null) put("region", x.region)
                    if (x.user != null) put("user", x.user)
                    if (x.likes >= 0) { put("likes", x.likes); put("comments", x.comments); put("saves", x.saves); put("shares", x.shares); put("views", x.views) }
                    if (x.musicKey != null) { put("musicKey", x.musicKey); put("musicTitle", x.musicTitle ?: "") }
                })
            }
        })
        root.put("playlists", JSONArray().apply {
            s.playlists.forEach { p ->
                put(JSONObject().apply {
                    put("id", p.id); put("name", p.name); put("keys", JSONArray(p.keys))
                })
            }
        })
        root.put("recent", JSONArray(s.recent))
        root.put("syncPages", JSONObject().apply { s.syncPages.forEach { (k, v) -> put(k.name, v) } })
        root.put("syncApis", JSONObject().apply { s.syncApis.forEach { (k, v) -> put(k.name, v) } })
        root.put("videoApis", JSONObject().apply { s.videoApis.forEach { (k, v) -> put(k.name, v) } })
        val tmp = File(dir, "library.json.tmp")
        tmp.writeText(root.toString())
        tmp.renameTo(file)
    }

    private fun load(): LibraryState = try {
        val root = JSONObject(file.readText())
        val sounds = root.optJSONArray("sounds")?.let { a ->
            (0 until a.length()).map { i ->
                val o = a.getJSONObject(i)
                Sound(
                    key = o.getString("key"),
                    source = Source.valueOf(o.getString("source")),
                    title = o.optString("title"),
                    artist = o.optString("artist"),
                    cover = o.optStringOrNull("cover"),
                    remoteUrl = o.optString("remoteUrl"),
                    pageUrl = o.optStringOrNull("pageUrl"),
                    file = o.optStringOrNull("file")?.takeIf { File(it).exists() },
                    addedAt = o.optLong("addedAt"),
                    liked = o.optBoolean("liked"),
                    video = o.optBoolean("video"),
                    videoUrl = o.optStringOrNull("videoUrl"),
                    postedAt = o.optLong("postedAt"),
                    region = o.optStringOrNull("region"),
                    user = o.optStringOrNull("user"),
                    likes = o.optLong("likes", -1), comments = o.optLong("comments", -1),
                    saves = o.optLong("saves", -1), shares = o.optLong("shares", -1), views = o.optLong("views", -1),
                    musicKey = o.optStringOrNull("musicKey"), musicTitle = o.optStringOrNull("musicTitle"),
                )
            }
        } ?: emptyList()
        val playlists = root.optJSONArray("playlists")?.let { a ->
            (0 until a.length()).map { i ->
                val o = a.getJSONObject(i)
                val keys = o.getJSONArray("keys")
                Playlist(o.getString("id"), o.getString("name"), (0 until keys.length()).map { keys.getString(it) })
            }
        } ?: emptyList()
        val recent = root.optJSONArray("recent")?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
        fun map(name: String) = root.optJSONObject(name)?.let { o ->
            o.keys().asSequence().mapNotNull { k -> runCatching { Source.valueOf(k) to o.getString(k) }.getOrNull() }.toMap()
        } ?: emptyMap()
        LibraryState(sounds, playlists, recent, map("syncPages"), map("syncApis"), map("videoApis"))
    } catch (e: Exception) {
        LibraryState()
    }
}

private fun JSONObject.optStringOrNull(name: String): String? =
    if (isNull(name)) null else optString(name).takeIf { it.isNotEmpty() }
