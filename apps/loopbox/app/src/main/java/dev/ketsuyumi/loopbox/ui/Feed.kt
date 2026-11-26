package dev.ketsuyumi.loopbox.ui

import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LibraryAdd
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.media3.common.Player
import coil.compose.AsyncImage
import dev.ketsuyumi.loopbox.data.Library
import dev.ketsuyumi.loopbox.data.Source
import dev.ketsuyumi.loopbox.data.Sound
import dev.ketsuyumi.loopbox.playback.PlayerConnection
import kotlinx.coroutines.flow.distinctUntilChanged

/** The TikTok-style feed: one sound per screen, swipe up for the next, it plays and loops. */
@Composable
fun FeedScreen(onSync: () -> Unit) {
    val state by Library.state.collectAsState()
    // Newest saves first, like a feed; the order is fixed while you're here so pages don't jump.
    val feed = remember(state.sounds.size) { state.sounds.sortedByDescending { it.addedAt } }
    if (feed.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Filled.MusicNote, null, tint = Accent, modifier = Modifier.size(48.dp))
                Spacer(Modifier.height(12.dp))
                Text("No sounds yet", color = Color.White, style = MaterialTheme.typography.titleLarge)
                Text("Sync your saved TikTok or Instagram sounds", color = Color.Gray)
                Spacer(Modifier.height(16.dp))
                Text("Sync now", color = Accent, fontWeight = FontWeight.Bold, modifier = Modifier.clickable(onClick = onSync).padding(8.dp))
            }
        }
        return
    }
    val start = feed.indexOfFirst { it.key == PlayerConnection.currentKey }.coerceAtLeast(0)
    val pager = rememberPagerState(initialPage = start) { feed.size }

    // Play what's on screen, looping it like TikTok.
    LaunchedEffect(pager, feed) {
        androidx.compose.runtime.snapshotFlow { pager.settledPage }.distinctUntilChanged().collect { page ->
            val s = feed.getOrNull(page) ?: return@collect
            if (PlayerConnection.currentKey != s.key) {
                PlayerConnection.play(feed, s)
                if (PlayerConnection.repeat == Player.REPEAT_MODE_OFF) PlayerConnection.setLoop(Player.REPEAT_MODE_ONE)
            }
        }
    }
    // Follow the player when it moves on by itself (notification, end of a sound).
    LaunchedEffect(PlayerConnection.currentKey) {
        val at = feed.indexOfFirst { it.key == PlayerConnection.currentKey }
        if (at >= 0 && at != pager.currentPage) pager.animateScrollToPage(at)
    }

    VerticalPager(state = pager, modifier = Modifier.fillMaxSize(), beyondViewportPageCount = 1, key = { feed[it].key }) { page ->
        FeedPage(state.sounds.firstOrNull { it.key == feed[page].key } ?: feed[page])
    }
}

@Composable
private fun FeedPage(s: Sound) {
    val current = PlayerConnection.currentKey == s.key
    val playing = current && PlayerConnection.isPlaying
    val context = LocalContext.current
    var playlistsMenu by remember { mutableStateOf(false) }
    val state by Library.state.collectAsState()

    val spin = rememberInfiniteTransition(label = "disc")
    val angle by spin.animateFloat(0f, 360f, infiniteRepeatable(tween(8000, easing = LinearEasing), RepeatMode.Restart), label = "angle")

    Box(
        Modifier.fillMaxSize().background(Color.Black).clickable(
            interactionSource = remember { MutableInteractionSource() }, indication = null,
        ) { if (current) PlayerConnection.toggle() },
    ) {
        // Blurred cover behind everything.
        if (s.cover != null) AsyncImage(
            model = s.cover, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize().let { if (Build.VERSION.SDK_INT >= 31) it.blur(40.dp) else it },
            alpha = if (Build.VERSION.SDK_INT >= 31) 0.55f else 0.25f,
        )
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0x66000000), Color(0x22000000), Color(0xCC000000)))))

        // The record, spinning while it plays.
        Box(
            Modifier.align(Alignment.Center).size(260.dp).clip(CircleShape).background(Color(0xFF111111))
                .border(10.dp, Color(0xFF1C1C1C), CircleShape)
                .rotate(if (playing) angle else 0f),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(170.dp).clip(CircleShape)) { Cover(s.cover, 170.dp, s.source, 85.dp) }
            Box(Modifier.size(18.dp).clip(CircleShape).background(Color.Black))
        }
        if (current && !playing) Icon(
            Icons.Filled.PlayArrow, "Paused", tint = Color.White.copy(alpha = 0.85f),
            modifier = Modifier.align(Alignment.Center).size(96.dp),
        )

        // Title, artist, source.
        Column(Modifier.align(Alignment.BottomStart).padding(start = 16.dp, end = 96.dp, bottom = 28.dp)) {
            Text(
                "@" + s.artist.ifBlank { if (s.source == Source.TIKTOK) "tiktok" else "instagram" }.replace(" ", ""),
                color = Color.White, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Text(s.title, color = Color.White, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier.clip(RoundedCornerShape(50)).background(Color(0x33FFFFFF)).padding(horizontal = 10.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.MusicNote, null, tint = Color.White, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text(
                    (if (s.source == Source.TIKTOK) "TikTok" else "Instagram") + if (s.file == null) " · streaming" else " · offline",
                    color = Color.White, style = MaterialTheme.typography.labelMedium,
                )
            }
        }

        // The right rail, like TikTok's.
        Column(
            Modifier.align(Alignment.BottomEnd).padding(end = 10.dp, bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp), horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            RailButton(if (s.liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, if (s.liked) "Liked" else "Like", if (s.liked) Accent else Color.White) {
                Library.toggleLike(s.key)
            }
            Box {
                RailButton(Icons.Filled.LibraryAdd, "Save", Color.White) { playlistsMenu = true }
                DropdownMenu(expanded = playlistsMenu, onDismissRequest = { playlistsMenu = false }) {
                    state.playlists.forEach { p ->
                        val inIt = s.key in p.keys
                        DropdownMenuItem(text = { Text((if (inIt) "✓ " else "") + p.name) }, onClick = {
                            playlistsMenu = false
                            if (inIt) Library.removeFromPlaylist(p.id, s.key) else Library.addToPlaylist(p.id, s.key)
                        })
                    }
                    DropdownMenuItem(text = { Text("New playlist") }, onClick = {
                        playlistsMenu = false
                        val p = Library.createPlaylist("Playlist ${state.playlists.size + 1}")
                        Library.addToPlaylist(p.id, s.key)
                    })
                }
            }
            RailButton(Icons.Filled.RepeatOne, if (PlayerConnection.repeat == Player.REPEAT_MODE_ONE) "Loop on" else "Loop off",
                if (PlayerConnection.repeat == Player.REPEAT_MODE_ONE) Accent else Color.White) {
                PlayerConnection.setLoop(if (PlayerConnection.repeat == Player.REPEAT_MODE_ONE) Player.REPEAT_MODE_ALL else Player.REPEAT_MODE_ONE)
            }
            RailButton(Icons.Filled.Speed, speedLabel(PlayerConnection.speed), if (PlayerConnection.speed != 1f) Accent else Color.White) {
                val next = when (PlayerConnection.speed) { 1f -> 1.25f; 1.25f -> 0.85f; else -> 1f }
                PlayerConnection.setSpeedPitch(next, if (next == 1f) 1f else PlayerConnection.pitch)
            }
            s.pageUrl?.let { url ->
                RailButton(Icons.AutoMirrored.Filled.OpenInNew, "Open", Color.White) {
                    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                }
            }
        }

        // Progress along the bottom edge.
        if (current) {
            val d = PlayerConnection.duration.coerceAtLeast(1)
            Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(2.dp).background(Color(0x33FFFFFF))) {
                Box(Modifier.fillMaxWidth((PlayerConnection.position.toFloat() / d).coerceIn(0f, 1f)).height(2.dp).background(Color.White))
            }
        }
    }
}

@Composable
private fun RailButton(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable(onClick = onClick)) {
        Box(Modifier.size(48.dp).clip(CircleShape).background(Color(0x33000000)), contentAlignment = Alignment.Center) {
            Icon(icon, label, tint = tint, modifier = Modifier.size(30.dp))
        }
        Text(label, color = Color.White, style = MaterialTheme.typography.labelSmall)
    }
}

private fun speedLabel(v: Float) = when (v) { 1f -> "1x"; 1.25f -> "1.25x"; 0.85f -> "0.85x"; else -> "%.2fx".format(v) }
