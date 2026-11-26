package dev.ketsuyumi.loopbox.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.media3.common.Player
import coil.compose.AsyncImage
import dev.ketsuyumi.loopbox.data.Library
import dev.ketsuyumi.loopbox.playback.PlayerConnection
import kotlinx.coroutines.delay

/** Moves the progress bar while something plays. */
@Composable
fun ProgressTicker() {
    LaunchedEffect(PlayerConnection.isPlaying) {
        while (true) {
            PlayerConnection.tick()
            delay(if (PlayerConnection.isPlaying) 250 else 1000)
        }
    }
}

@Composable
fun MiniPlayer(onOpen: () -> Unit) {
    val state by Library.state.collectAsState()
    val s = state.sounds.firstOrNull { it.key == PlayerConnection.currentKey } ?: return
    Column(Modifier.padding(horizontal = 8.dp).clip(RoundedCornerShape(10.dp)).background(Color(0xFF2A2A2A)).clickable(onClick = onOpen)) {
        Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Cover(s.cover, 42.dp, s.source)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(s.title, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Medium)
                Text(s.artist, color = Color.Gray, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
            }
            IconButton(onClick = { Library.toggleLike(s.key) }) {
                Icon(if (s.liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, "Like", tint = if (s.liked) Accent else Color.White)
            }
            IconButton(onClick = { PlayerConnection.toggle() }) {
                Icon(if (PlayerConnection.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow, "Play/pause", tint = Color.White)
            }
        }
        val d = PlayerConnection.duration
        LinearProgressIndicator(
            progress = { if (d > 0) (PlayerConnection.position.toFloat() / d).coerceIn(0f, 1f) else 0f },
            modifier = Modifier.fillMaxWidth().height(2.dp), color = Color.White, trackColor = Color.DarkGray,
        )
    }
}

private fun time(ms: Long): String {
    val s = (ms / 1000).coerceAtLeast(0)
    return "%d:%02d".format(s / 60, s % 60)
}

@Composable
fun NowPlaying(onClose: () -> Unit) {
    val state by Library.state.collectAsState()
    val s = state.sounds.firstOrNull { it.key == PlayerConnection.currentKey }
    if (s == null) { onClose(); return }
    var dragging by remember { mutableStateOf<Float?>(null) }
    var showTune by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF3A1240), Color.Black))).padding(horizontal = 24.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onClose) { Icon(Icons.Filled.KeyboardArrowDown, "Close", tint = Color.White) }
            Text(
                if (s.source.name == "TIKTOK") "From TikTok" else "From Instagram",
                color = Color.White, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(24.dp))
        Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp))) {
            Cover(null, 400.dp, s.source, 12.dp)
            if (s.cover != null) AsyncImage(model = s.cover, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.Crop)
        }
        Spacer(Modifier.height(28.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(s.title, color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(s.artist, color = Color.LightGray, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            IconButton(onClick = { Library.toggleLike(s.key) }) {
                Icon(if (s.liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, "Like", tint = if (s.liked) Accent else Color.White, modifier = Modifier.size(28.dp))
            }
        }
        val d = PlayerConnection.duration.coerceAtLeast(1)
        Slider(
            value = dragging ?: (PlayerConnection.position.toFloat() / d).coerceIn(0f, 1f),
            onValueChange = { dragging = it },
            onValueChangeFinished = { dragging?.let { PlayerConnection.seek((it * d).toLong()) }; dragging = null },
            colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = Color.White, inactiveTrackColor = Color.DarkGray),
        )
        Row {
            Text(time(dragging?.let { (it * d).toLong() } ?: PlayerConnection.position), color = Color.Gray, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            Text(time(PlayerConnection.duration), color = Color.Gray, style = MaterialTheme.typography.bodySmall)
        }
        Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { PlayerConnection.toggleShuffle() }) {
                Icon(Icons.Filled.Shuffle, "Shuffle", tint = if (PlayerConnection.shuffle) Accent else Color.White)
            }
            IconButton(onClick = { PlayerConnection.previous() }) { Icon(Icons.Filled.SkipPrevious, "Previous", tint = Color.White, modifier = Modifier.size(36.dp)) }
            FilledIconButton(
                onClick = { PlayerConnection.toggle() }, modifier = Modifier.size(68.dp),
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color.White),
            ) {
                Icon(if (PlayerConnection.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow, "Play/pause", tint = Color.Black, modifier = Modifier.size(36.dp))
            }
            IconButton(onClick = { PlayerConnection.next() }) { Icon(Icons.Filled.SkipNext, "Next", tint = Color.White, modifier = Modifier.size(36.dp)) }
            IconButton(onClick = { PlayerConnection.cycleRepeat() }) {
                Icon(
                    if (PlayerConnection.repeat == Player.REPEAT_MODE_ONE) Icons.Filled.RepeatOne else Icons.Filled.Repeat, "Loop",
                    tint = if (PlayerConnection.repeat == Player.REPEAT_MODE_OFF) Color.White else Accent,
                )
            }
        }
        TextButton(onClick = { showTune = !showTune }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text(
                "Speed ${"%.2f".format(PlayerConnection.speed)}× · Pitch ${"%.2f".format(PlayerConnection.pitch)}×" + if (showTune) "  ▲" else "  ▼",
                color = Color.White,
            )
        }
        if (showTune) TuneControls()
    }
}

@Composable
private fun TuneControls() {
    var speed by remember { mutableFloatStateOf(PlayerConnection.speed) }
    var pitch by remember { mutableFloatStateOf(PlayerConnection.pitch) }
    Column(Modifier.clip(RoundedCornerShape(12.dp)).background(Color(0x22FFFFFF)).padding(12.dp)) {
        Text("Speed", color = Color.White)
        Slider(
            value = speed, valueRange = 0.5f..2f, steps = 5,
            onValueChange = { speed = it }, onValueChangeFinished = { PlayerConnection.setSpeedPitch(speed, pitch) },
            colors = SliderDefaults.colors(thumbColor = Accent, activeTrackColor = Accent),
        )
        Text("Pitch", color = Color.White)
        Slider(
            value = pitch, valueRange = 0.5f..2f,
            onValueChange = { pitch = it }, onValueChangeFinished = { PlayerConnection.setSpeedPitch(speed, pitch) },
            colors = SliderDefaults.colors(thumbColor = Accent, activeTrackColor = Accent),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Slowed" to (0.85f to 0.9f), "Normal" to (1f to 1f), "Sped up" to (1.25f to 1.15f), "Nightcore" to (1.3f to 1.3f)).forEach { (name, sp) ->
                TextButton(onClick = { speed = sp.first; pitch = sp.second; PlayerConnection.setSpeedPitch(sp.first, sp.second) }) { Text(name, color = Accent) }
            }
        }
    }
}
