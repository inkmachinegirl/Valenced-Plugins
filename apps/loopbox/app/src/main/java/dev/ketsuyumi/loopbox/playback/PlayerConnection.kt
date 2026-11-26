package dev.ketsuyumi.loopbox.playback

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Bundle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import dev.ketsuyumi.loopbox.data.Sound
import java.io.File

/** The app's handle on the player service, as Compose state. */
object PlayerConnection {
    private var controller: MediaController? = null

    var currentKey by mutableStateOf<String?>(null); private set
    var isPlaying by mutableStateOf(false); private set
    var position by mutableLongStateOf(0L); private set
    var duration by mutableLongStateOf(0L); private set
    var repeat by mutableIntStateOf(Player.REPEAT_MODE_OFF); private set
    var shuffle by mutableStateOf(false); private set
    var speed by mutableFloatStateOf(1f); private set
    var pitch by mutableFloatStateOf(1f); private set

    fun connect(context: Context) {
        if (controller != null) return
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        val future = MediaController.Builder(context, token).buildAsync()
        future.addListener({
            val c = runCatching { future.get() }.getOrNull() ?: return@addListener
            controller = c
            c.addListener(object : Player.Listener {
                override fun onEvents(player: Player, events: Player.Events) = sync()
            })
            sync()
        }, ContextCompat.getMainExecutor(context))
    }

    /** Called often by the UI to move the progress bar. */
    fun tick() {
        val c = controller ?: return
        position = c.currentPosition.coerceAtLeast(0)
        duration = c.duration.takeIf { it > 0 } ?: 0
    }

    private fun sync() {
        val c = controller ?: return
        currentKey = c.currentMediaItem?.mediaId
        isPlaying = c.isPlaying
        repeat = c.repeatMode
        shuffle = c.shuffleModeEnabled
        speed = c.playbackParameters.speed
        pitch = c.playbackParameters.pitch
        tick()
    }

    fun play(queue: List<Sound>, start: Sound) {
        val c = controller ?: return
        val at = queue.indexOfFirst { it.key == start.key }.coerceAtLeast(0)
        // Same queue already loaded (swiping through the feed): just jump, don't resend thousands of items.
        val same = c.mediaItemCount == queue.size && queue.indices.all { c.getMediaItemAt(it).mediaId == queue[it].key }
        if (same) {
            c.seekToDefaultPosition(at)
            c.play()
            return
        }
        val items = queue.map(::itemOf)
        c.setMediaItems(items, at, 0)
        c.prepare()
        c.play()
    }

    fun toggle() {
        val c = controller ?: return
        if (c.isPlaying) c.pause() else {
            if (c.playbackState == Player.STATE_ENDED) c.seekTo(0)
            c.play()
        }
    }

    fun next() = controller?.seekToNext()
    fun previous() = controller?.seekToPrevious()
    fun seek(ms: Long) = controller?.seekTo(ms)

    /** Off → loop all → loop this one → off. */
    fun cycleRepeat() {
        val c = controller ?: return
        c.repeatMode = when (c.repeatMode) {
            Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
            Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
    }

    fun setLoop(mode: Int) {
        controller?.repeatMode = mode
    }

    fun toggleShuffle() {
        val c = controller ?: return
        c.shuffleModeEnabled = !c.shuffleModeEnabled
    }

    fun setSpeedPitch(newSpeed: Float, newPitch: Float) {
        controller?.playbackParameters = PlaybackParameters(newSpeed, newPitch)
    }

    private fun itemOf(s: Sound): MediaItem {
        val uri = s.file?.let { Uri.fromFile(File(it)) } ?: Uri.parse(s.remoteUrl)
        return MediaItem.Builder()
            .setMediaId(s.key)
            .setUri(uri)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(s.title)
                    .setArtist(s.artist.ifBlank { if (s.source.name == "TIKTOK") "TikTok" else "Instagram" })
                    .setArtworkUri(s.cover?.let(Uri::parse))
                    .setExtras(Bundle().apply { putString("source", s.source.name) })
                    .build(),
            )
            .build()
    }
}
