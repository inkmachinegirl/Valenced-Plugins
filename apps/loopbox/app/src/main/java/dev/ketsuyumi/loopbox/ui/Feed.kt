package dev.ketsuyumi.loopbox.ui

import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.annotation.OptIn
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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import dev.ketsuyumi.loopbox.data.Library
import dev.ketsuyumi.loopbox.data.Settings
import dev.ketsuyumi.loopbox.data.Sound
import dev.ketsuyumi.loopbox.data.Source
import dev.ketsuyumi.loopbox.playback.PlayerConnection
import dev.ketsuyumi.loopbox.playback.VideoResolver
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged

private val TABS = listOf("Videos", "Sounds", "For You")

/**
 * The TikTok-style feed: one saved sound or video per screen, swipe up for the next. Saved videos
 * show themselves; saved sounds show a video that uses them when one can be found (otherwise a
 * spinning record). The video is muted: the sound plays through the normal player, so the lock
 * screen, background play and looping all work the same. Tabs: Videos, Sounds, For You (both).
 */
@OptIn(UnstableApi::class)
@Composable
fun FeedScreen(onSync: () -> Unit, onSettings: () -> Unit) {
    val state by Library.state.collectAsState()
    val context = LocalContext.current
    var tab by rememberSaveable { mutableIntStateOf(2) }
    // Newest saves first; pages are keyed, so new ones arriving don't move you.
    val feed = remember(state.sounds.size, tab, Settings.feedVideos) {
        state.sounds.filter {
            when (tab) {
                0 -> it.video
                1 -> !it.video
                else -> !it.video || Settings.feedVideos
            }
        }.sortedByDescending { it.addedAt }
    }
    val byKey = remember(state.sounds) { state.sounds.associateBy { it.key } }

    val video = remember {
        val http = DefaultHttpDataSource.Factory().setUserAgent(VideoResolver.USER_AGENT).setAllowCrossProtocolRedirects(true)
        val withCookies = ResolvingDataSource.Factory(http) { spec -> spec.withAdditionalHeaders(VideoResolver.headers(spec.uri.toString())) }
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(withCookies))
            .build().apply { volume = 0f; repeatMode = Player.REPEAT_MODE_ONE }
    }
    var videoKey by remember { mutableStateOf<String?>(null) }   // whose video is loaded
    var shownKey by remember { mutableStateOf<String?>(null) }   // whose video has a first frame
    DisposableEffect(video) {
        val l = object : Player.Listener {
            override fun onRenderedFirstFrame() { shownKey = videoKey }
        }
        video.addListener(l)
        onDispose { video.removeListener(l); video.release() }
    }
    LaunchedEffect(PlayerConnection.isPlaying) { video.playWhenReady = PlayerConnection.isPlaying }
    LaunchedEffect(PlayerConnection.speed) { video.setPlaybackSpeed(PlayerConnection.speed) }

    // Burn-in protection: shift the buttons and text a little every minute.
    var shift by remember { mutableIntStateOf(0) }
    LaunchedEffect(Settings.burnIn, Settings.shiftUi) {
        while (Settings.burnIn && Settings.shiftUi) { delay(60_000); shift = (shift + 1) % 8 }
    }
    val dx = if (Settings.burnIn && Settings.shiftUi) listOf(0, 3, 5, 3, 0, -3, -5, -3)[shift].dp else 0.dp
    val dy = if (Settings.burnIn && Settings.shiftUi) listOf(-3, -5, -3, 0, 3, 5, 3, 0)[shift].dp else 0.dp
    val ui = if (Settings.burnIn) Settings.uiVisibility else 1f

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (feed.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Filled.MusicNote, null, tint = Accent, modifier = Modifier.size(48.dp))
                    Spacer(Modifier.height(12.dp))
                    Text(if (tab == 0) "No saved videos yet" else "Nothing here yet", color = Color.White, style = MaterialTheme.typography.titleLarge)
                    Text("Sync your saved TikTok or Instagram sounds and videos", color = Color.Gray)
                    Spacer(Modifier.height(16.dp))
                    Text("Sync now", color = Accent, fontWeight = FontWeight.Bold, modifier = Modifier.clickable(onClick = onSync).padding(8.dp))
                }
            }
        } else {
            val start = feed.indexOfFirst { it.key == PlayerConnection.currentKey }.coerceAtLeast(0)
            val pager = rememberPagerState(initialPage = start) { feed.size }

            // Play what's on screen and find its video.
            LaunchedEffect(pager, feed) {
                snapshotFlow { pager.settledPage }.distinctUntilChanged().collectLatest { page ->
                    val s = feed.getOrNull(page) ?: return@collectLatest
                    if (PlayerConnection.currentKey != s.key) PlayerConnection.play(feed, s)
                    PlayerConnection.setLoop(if (Settings.loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_ALL)
                    if (videoKey != s.key) {
                        video.stop(); video.clearMediaItems(); videoKey = s.key; shownKey = null
                        val url = if (Settings.feedVideos || s.video) VideoResolver.videoFor(s) else null
                        if (url != null && videoKey == s.key) {
                            video.setMediaItem(MediaItem.fromUri(url))
                            video.prepare()
                            video.playWhenReady = PlayerConnection.isPlaying
                        }
                    }
                    // Get the next one ready too.
                    feed.getOrNull(page + 1)?.let { if (Settings.feedVideos || it.video) VideoResolver.videoFor(it) }
                }
            }
            // Follow the player when it moves on by itself (loop off, notification).
            LaunchedEffect(PlayerConnection.currentKey) {
                val at = feed.indexOfFirst { it.key == PlayerConnection.currentKey }
                if (at >= 0 && at != pager.currentPage) pager.animateScrollToPage(at)
            }

            VerticalPager(state = pager, modifier = Modifier.fillMaxSize(), beyondViewportPageCount = 1, key = { feed[it].key }) { page ->
                val s = byKey[feed[page].key] ?: feed[page]
                FeedPage(s, if (shownKey == s.key) video else null, ui, dx, dy)
            }
        }

        // Tabs on top, like TikTok's Following / For You.
        Row(
            Modifier.fillMaxWidth().padding(top = 6.dp).offset(dx, dy).alpha(ui),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Spacer(Modifier.width(48.dp))
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.Center) {
                TABS.forEachIndexed { i, name ->
                    Column(
                        Modifier.clickable { tab = i }.padding(horizontal = 12.dp, vertical = 6.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            name, color = if (tab == i) Color.White else Color.White.copy(alpha = 0.6f),
                            style = MaterialTheme.typography.titleMedium, fontWeight = if (tab == i) FontWeight.Bold else FontWeight.Normal,
                        )
                        Spacer(Modifier.height(4.dp))
                        Box(Modifier.width(22.dp).height(2.dp).background(if (tab == i) Color.White else Color.Transparent))
                    }
                }
            }
            IconButton(onClick = onSettings) { Icon(Icons.Filled.Settings, "Settings", tint = Color.White) }
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun FeedPage(s: Sound, video: ExoPlayer?, ui: Float, dx: Dp, dy: Dp) {
    val current = PlayerConnection.currentKey == s.key
    val playing = current && PlayerConnection.isPlaying
    val context = LocalContext.current
    var playlistsMenu by remember { mutableStateOf(false) }
    val state by Library.state.collectAsState()
    val name = s.artist.ifBlank { if (s.source == Source.TIKTOK) "tiktok" else "instagram" }
    val open = { s.pageUrl?.let { url -> runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } } }

    val spin = rememberInfiniteTransition(label = "disc")
    val angle by spin.animateFloat(0f, 360f, infiniteRepeatable(tween(8000, easing = LinearEasing), RepeatMode.Restart), label = "angle")

    Box(
        Modifier.fillMaxSize().background(Color.Black).clickable(
            interactionSource = remember { MutableInteractionSource() }, indication = null,
        ) { if (current) PlayerConnection.toggle() },
    ) {
        if (video != null) {
            // The video (muted; the sound plays through the player).
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        useController = false
                        setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                        player = video
                    }
                },
                update = {
                    it.player = video
                    it.resizeMode = if (Settings.fillScreen) AspectRatioFrameLayout.RESIZE_MODE_ZOOM else AspectRatioFrameLayout.RESIZE_MODE_FIT
                },
                onRelease = { it.player = null },
            )
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0x44000000), Color.Transparent, Color.Transparent, Color(0x99000000)))))
        } else {
            // No video: the blurred cover and a big spinning record.
            if (s.cover != null) AsyncImage(
                model = s.cover, contentDescription = null, contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().let { if (Build.VERSION.SDK_INT >= 31) it.blur(40.dp) else it },
                alpha = if (Build.VERSION.SDK_INT >= 31) 0.55f else 0.25f,
            )
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0x66000000), Color(0x22000000), Color(0xCC000000)))))
            Record(s, 260.dp, if (playing) angle else 0f, Modifier.align(Alignment.Center))
        }
        if (current && !playing) Icon(
            Icons.Filled.PlayArrow, "Paused", tint = Color.White.copy(alpha = 0.8f),
            modifier = Modifier.align(Alignment.Center).size(88.dp),
        )

        // Name, caption and sound, bottom left.
        Column(
            Modifier.align(Alignment.BottomStart).offset(dx, dy).alpha(ui)
                .padding(start = 14.dp, end = 84.dp, bottom = 22.dp),
        ) {
            Text(
                name, color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.clickable { open() },
            )
            Spacer(Modifier.height(4.dp))
            if (s.video) Text(s.title, color = Color.White, style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.MusicNote, null, tint = Color.White, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(4.dp))
                Text(
                    if (s.video) "original sound - $name" else "${s.title} - $name",
                    color = Color.White, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }

        // The right rail, like TikTok's: picture, like, save, share, speed, and the spinning disc.
        Column(
            Modifier.align(Alignment.BottomEnd).offset(dx, dy).alpha(ui).padding(end = 8.dp, bottom = 18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp), horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                Modifier.size(50.dp).clip(CircleShape).border(2.dp, Color.White, CircleShape).clickable { open() },
            ) { Cover(s.cover, 50.dp, s.source, 25.dp) }
            RailButton(Icons.Filled.Favorite, if (s.liked) "Liked" else "Like", if (s.liked) Accent else Color.White) {
                Library.toggleLike(s.key)
            }
            Box {
                val saved = state.playlists.any { s.key in it.keys }
                RailButton(Icons.Filled.Bookmark, "Save", if (saved) Color(0xFFFFC83D) else Color.White) { playlistsMenu = true }
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
            s.pageUrl?.let { url ->
                RailButton(Icons.Filled.Share, "Share", Color.White) {
                    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url)
                    runCatching { context.startActivity(Intent.createChooser(send, null)) }
                }
            }
            RailButton(Icons.Filled.Speed, speedLabel(PlayerConnection.speed), if (PlayerConnection.speed != 1f) Accent else Color.White) {
                val next = when (PlayerConnection.speed) { 1f -> 1.5f; 1.5f -> 2f; else -> 1f }
                PlayerConnection.setSpeedPitch(next, 1f)
            }
            Record(s, 46.dp, if (playing) angle else 0f, Modifier)
        }

        // Progress along the bottom edge.
        if (current) {
            val d = PlayerConnection.duration.coerceAtLeast(1)
            Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(2.dp).alpha(ui).background(Color(0x33FFFFFF))) {
                Box(Modifier.fillMaxWidth((PlayerConnection.position.toFloat() / d).coerceIn(0f, 1f)).height(2.dp).background(Color.White))
            }
        }
    }
}

/** A record with the cover in the middle, turned by [angle]. */
@Composable
private fun Record(s: Sound, size: Dp, angle: Float, modifier: Modifier) {
    Box(
        modifier.size(size).clip(CircleShape).background(Color(0xFF111111))
            .border(size / 26, Color(0xFF1C1C1C), CircleShape).rotate(angle),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(size * 0.62f).clip(CircleShape)) { Cover(s.cover, size * 0.62f, s.source, size) }
        Box(Modifier.size(size / 14).clip(CircleShape).background(Color.Black))
    }
}

@Composable
private fun RailButton(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable(onClick = onClick)) {
        Icon(icon, label, tint = tint, modifier = Modifier.size(36.dp))
        Text(label, color = Color.White, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
    }
}

private fun speedLabel(v: Float) = when (v) { 1f -> "1x"; 1.5f -> "1.5x"; 2f -> "2x"; else -> "%.2gx".format(v) }
