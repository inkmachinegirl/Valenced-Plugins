package dev.ketsuyumi.loopbox.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import dev.ketsuyumi.loopbox.data.Library
import dev.ketsuyumi.loopbox.data.Playlist
import dev.ketsuyumi.loopbox.data.Source
import dev.ketsuyumi.loopbox.data.Sound
import dev.ketsuyumi.loopbox.playback.PlayerConnection
import dev.ketsuyumi.loopbox.sync.Downloader
import kotlinx.coroutines.launch

val Accent = Color(0xFFFF4FD1)
val Surface1 = Color(0xFF121212)
val Surface2 = Color(0xFF1E1E1E)

val LoopboxColors = darkColorScheme(
    primary = Accent,
    onPrimary = Color.Black,
    secondary = Accent,
    background = Color.Black,
    surface = Surface1,
    surfaceVariant = Surface2,
    onBackground = Color.White,
    onSurface = Color.White,
    onSurfaceVariant = Color(0xFFB3B3B3),
)

/** Cover art, or a gradient tile with a note when there's none. */
@Composable
fun Cover(url: String?, size: Dp, source: Source? = null, corner: Dp = 6.dp) {
    val shape = RoundedCornerShape(corner)
    Box(
        Modifier.size(size).clip(shape).background(
            Brush.linearGradient(
                if (source == Source.INSTAGRAM) listOf(Color(0xFF833AB4), Color(0xFFFD1D1D), Color(0xFFFCAF45))
                else listOf(Color(0xFF25F4EE), Color(0xFF000000), Color(0xFFFE2C55)),
            ),
        ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.MusicNote, null, tint = Color.White.copy(alpha = 0.8f), modifier = Modifier.size(size / 2.5f))
        if (url != null) AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(size))
    }
}

@Composable
fun SoundRow(
    sound: Sound,
    queue: List<Sound>,
    playlists: List<Playlist>,
    inPlaylist: Playlist? = null,
) {
    val playing = PlayerConnection.currentKey == sound.key
    var menu by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Row(
        Modifier.fillMaxWidth().clickable { PlayerConnection.play(queue, sound) }.padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(sound.cover, 48.dp, sound.source)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (playing) Icon(Icons.Filled.GraphicEq, null, tint = Accent, modifier = Modifier.size(16.dp).padding(end = 4.dp))
                Text(
                    sound.title, color = if (playing) Accent else Color.White, fontWeight = FontWeight.Medium,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (sound.file == null) Icon(Icons.Filled.CloudOff, "Not downloaded", tint = Color.Gray, modifier = Modifier.size(14.dp).padding(end = 4.dp))
                Text(
                    listOf(if (sound.source == Source.TIKTOK) "TikTok" else "Instagram", sound.artist).filter { it.isNotBlank() }.joinToString(" • "),
                    color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
        IconButton(onClick = { Library.toggleLike(sound.key) }) {
            Icon(
                if (sound.liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, "Like",
                tint = if (sound.liked) Accent else Color.Gray,
            )
        }
        Box {
            IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "More", tint = Color.Gray) }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                if (sound.file == null) DropdownMenuItem(text = { Text("Download for offline") }, onClick = {
                    menu = false
                    scope.launch { Downloader.download(sound) }
                })
                playlists.filter { it.id != inPlaylist?.id && sound.key !in it.keys }.forEach { p ->
                    DropdownMenuItem(text = { Text("Add to ${p.name}") }, onClick = {
                        menu = false
                        Library.addToPlaylist(p.id, sound.key)
                    })
                }
                DropdownMenuItem(text = { Text("Add to new playlist") }, onClick = {
                    menu = false
                    val p = Library.createPlaylist("Playlist ${playlists.size + 1}")
                    Library.addToPlaylist(p.id, sound.key)
                })
                if (inPlaylist != null) DropdownMenuItem(text = { Text("Remove from ${inPlaylist.name}") }, onClick = {
                    menu = false
                    Library.removeFromPlaylist(inPlaylist.id, sound.key)
                })
                DropdownMenuItem(text = { Text("Delete from library") }, onClick = {
                    menu = false
                    Library.remove(sound.key)
                })
            }
        }
    }
}

@Composable
fun SectionTitle(text: String) {
    Text(
        text, color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
    )
}
