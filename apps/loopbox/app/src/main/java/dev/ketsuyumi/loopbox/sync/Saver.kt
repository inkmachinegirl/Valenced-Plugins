package dev.ketsuyumi.loopbox.sync

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import dev.ketsuyumi.loopbox.data.Settings
import dev.ketsuyumi.loopbox.data.Sound
import dev.ketsuyumi.loopbox.playback.VideoResolver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Saves to the phone, where the gallery and music apps see them: videos to Movies/<folder>,
 * sounds to Music/<folder> (Settings › Downloads).
 */
object Saver {
    /** A video post's video. Returns the file name. */
    suspend fun saveVideo(context: Context, s: Sound): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val url = VideoResolver.downloadUrl(s) ?: error("no video address")
            val name = fileName(s, "mp4")
            open(url).use { input -> write(context, input, name, "video/mp4", video = true) }
            name
        }.onFailure { SyncLog.add("saving the video failed: $it") }
    }

    /** A sound (or a video post's sound): downloaded first if it isn't yet, then copied to Music. */
    suspend fun saveSound(context: Context, s: Sound): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val local = s.file?.let(::File)?.takeIf { it.exists() } ?: Downloader.download(s).getOrThrow()
            val ext = local.extension.ifBlank { "m4a" }
            val name = fileName(s, ext)
            val mime = when (ext) { "mp3" -> "audio/mpeg"; "aac" -> "audio/aac"; "ogg" -> "audio/ogg"; else -> "audio/mp4" }
            local.inputStream().use { write(context, it, name, mime, video = false) }
            name
        }.onFailure { SyncLog.add("saving the sound failed: $it") }
    }

    private fun fileName(s: Sound, ext: String): String {
        val id = s.key.substringAfter(':').take(40)
        val base = if (Settings.namesWithAuthor) {
            val who = (s.user ?: s.artist).ifBlank { "tiktok" }
            val day = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(if (s.postedAt > 0) s.postedAt else System.currentTimeMillis()))
            "${who}_${day}_$id"
        } else id
        return base.replace(Regex("[^\\w.\\-@]+"), "_") + "." + ext
    }

    private fun open(url: String): InputStream {
        var target = URL(url)
        repeat(5) {
            val c = target.openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.connectTimeout = 20000; c.readTimeout = 60000
            VideoResolver.headers(target.toString()).forEach { (k, v) -> c.setRequestProperty(k, v) }
            val code = c.responseCode
            if (code in 300..399) { target = URL(target, c.getHeaderField("Location")); c.disconnect(); return@repeat }
            if (code !in 200..299) { c.disconnect(); error("HTTP $code") }
            return c.inputStream
        }
        error("too many redirects")
    }

    private fun write(context: Context, input: InputStream, name: String, mime: String, video: Boolean) {
        val folder = (if (video) Settings.videoFolder else Settings.soundFolder).trim().trim('/').ifBlank { "Loopbox" }
        if (Build.VERSION.SDK_INT >= 29) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, (if (video) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_MUSIC) + "/" + folder)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val collection = if (video) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            val uri = context.contentResolver.insert(collection, values) ?: error("couldn't create the file")
            context.contentResolver.openOutputStream(uri)!!.use { input.copyTo(it) }
            context.contentResolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
        } else {
            // Older Android: the app's own folder on the phone storage.
            val dir = File(context.getExternalFilesDir(if (video) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_MUSIC), folder).also { it.mkdirs() }
            File(dir, name).outputStream().use { input.copyTo(it) }
        }
        SyncLog.add("saved $name")
    }
}
