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

/** One saved sound. [file] is the downloaded audio on the phone (null until downloaded). */
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
)

data class Playlist(val id: String, val name: String, val keys: List<String>)

data class LibraryState(
    val sounds: List<Sound> = emptyList(),
    val playlists: List<Playlist> = emptyList(),
    val recent: List<String> = emptyList(),
    /** Per source: the page the saved sounds were last found on, for "Sync now". */
    val syncPages: Map<Source, String> = emptyMap(),
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
        _state.value = load()
    }

    fun sound(key: String): Sound? = _state.value.sounds.firstOrNull { it.key == key }

    /** Adds sounds not in the library yet; returns how many were new. */
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

    private fun updateSound(key: String, change: (Sound) -> Sound) =
        update { s -> s.copy(sounds = s.sounds.map { if (it.key == key) change(it) else it }) }

    @Synchronized
    private fun update(change: (LibraryState) -> LibraryState) {
        _state.value = change(_state.value)
        save(_state.value)
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
        val pages = root.optJSONObject("syncPages")?.let { o ->
            o.keys().asSequence().mapNotNull { k -> runCatching { Source.valueOf(k) to o.getString(k) }.getOrNull() }.toMap()
        } ?: emptyMap()
        LibraryState(sounds, playlists, recent, pages)
    } catch (e: Exception) {
        LibraryState()
    }
}

private fun JSONObject.optStringOrNull(name: String): String? =
    if (isNull(name)) null else optString(name).takeIf { it.isNotEmpty() }
