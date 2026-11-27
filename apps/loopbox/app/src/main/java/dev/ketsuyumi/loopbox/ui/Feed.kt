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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.zIndex
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
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
import dev.ketsuyumi.loopbox.sync.SyncService
import dev.ketsuyumi.loopbox.sync.LiveFeedWeb
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import dev.ketsuyumi.loopbox.sync.SyncLog
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged

/** Which feed tab is open, and a saved item to start on (set from the library's "Watch"). */
object FeedNav {
    const val SAVED = 0
    const val FOLLOWING = 1
    const val FOR_YOU = 2
    var tab by mutableIntStateOf(FOR_YOU)
    var open by mutableStateOf(false)
    var startKey by mutableStateOf<String?>(null)

    /** Watch a saved video (or sound) in the Saved feed. */
    fun watch(s: Sound) {
        startKey = s.key
        tab = SAVED
        open = true
    }
}

private val TABS = listOf("Saved", "Following", "For You")

/** Room to leave at the bottom of the feed for a see-through navigation bar over it. */
private val LocalNavSpace = androidx.compose.runtime.staticCompositionLocalOf { 0.dp }

/** A list opened full screen from Home or a playlist (keys in order, and where to start). */
object Viewer {
    var keys by mutableStateOf<List<String>?>(null); private set
    var start by mutableStateOf<String?>(null); private set
    var title by mutableStateOf(""); private set

    fun open(title: String, list: List<Sound>, at: Sound) {
        this.title = title; start = at.key; keys = list.map { it.key }
    }

    fun close() { keys = null }
}

/** The list from [Viewer], like TikTok: full screen, swipe up for the next; back to leave. */
@Composable
fun ViewerScreen() {
    val keys = Viewer.keys ?: return
    androidx.activity.compose.BackHandler { Viewer.close() }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        SavedFeed(onSync = {}, look = Look(1f, 0.dp, 0.dp), keys = keys, startKey = Viewer.start)
        Row(Modifier.statusBarsPadding().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { Viewer.close() }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White)
            }
            Text(Viewer.title, color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1)
        }
    }
}

/** Burn-in protection: how much to show the feed's buttons and text, and how far to shift them. */
internal data class Look(val ui: Float, val dx: Dp, val dy: Dp)

/**
 * The feed, like TikTok: For You and Following are your real TikTok feeds, as videos with their
 * own sound; Saved is your saved sounds and videos. Tabs on top, settings on the right.
 */
@Composable
fun FeedScreen(onSync: () -> Unit, onSettings: () -> Unit) {
    var shift by remember { mutableIntStateOf(0) }
    LaunchedEffect(Settings.burnIn, Settings.shiftUi) {
        while (Settings.burnIn && Settings.shiftUi) { delay(60_000); shift = (shift + 1) % 8 }
    }
    val on = Settings.burnIn && Settings.shiftUi
    val look = Look(
        if (Settings.burnIn) Settings.uiVisibility else 1f,
        if (on) listOf(0, 3, 5, 3, 0, -3, -5, -3)[shift].dp else 0.dp,
        if (on) listOf(-3, -5, -3, 0, 3, 5, 3, 0)[shift].dp else 0.dp,
    )
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        androidx.compose.runtime.CompositionLocalProvider(LocalNavSpace provides if (Settings.glassNav) 80.dp else 0.dp) {
        when (FeedNav.tab) {
            FeedNav.SAVED -> SavedFeed(onSync, look)
            FeedNav.FOLLOWING -> LiveFeed("https://www.tiktok.com/following", look)
            else -> LiveFeed("https://www.tiktok.com/foryou", look)
        }
        }
        Row(
            Modifier.fillMaxWidth().then(if (Settings.extendStatusBar) Modifier.statusBarsPadding() else Modifier)
                .padding(top = 6.dp).offset(look.dx, look.dy).alpha(look.ui),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Spacer(Modifier.width(48.dp))
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.Center) {
                TABS.forEachIndexed { i, name ->
                    Column(
                        Modifier.clickable { FeedNav.tab = i }.padding(horizontal = 10.dp, vertical = 6.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            name, color = if (FeedNav.tab == i) Color.White else Color.White.copy(alpha = 0.6f),
                            style = MaterialTheme.typography.titleMedium, fontWeight = if (FeedNav.tab == i) FontWeight.Bold else FontWeight.Normal,
                        )
                        Spacer(Modifier.height(4.dp))
                        Box(Modifier.width(22.dp).height(2.dp).background(if (FeedNav.tab == i) Color.White else Color.Transparent))
                    }
                }
            }
            IconButton(onClick = onSettings) { Icon(Icons.Filled.Settings, "Settings", tint = Color.White) }
        }
    }
}

@OptIn(UnstableApi::class)
private fun videoPlayer(context: android.content.Context): ExoPlayer {
    val http = DefaultHttpDataSource.Factory().setUserAgent(VideoResolver.USER_AGENT).setAllowCrossProtocolRedirects(true)
    val withCookies = ResolvingDataSource.Factory(http) { spec -> spec.withAdditionalHeaders(VideoResolver.headers(spec.uri.toString())) }
    return ExoPlayer.Builder(context).setMediaSourceFactory(DefaultMediaSourceFactory(withCookies)).build()
}

/** Videos from your TikTok feeds, kept while the app runs so coming back doesn't start empty. */
private object LiveFeeds {
    val lists = HashMap<String, androidx.compose.runtime.snapshots.SnapshotStateList<Sound>>()
    fun of(url: String) = lists.getOrPut(url) { mutableStateListOf() }
    val position = HashMap<String, Int>()
    var speed by mutableFloatStateOf(if (Settings.rememberSpeed) Settings.speed else 1f)
}

/** Settings › Filters: whether a video from For You / Following is shown. */
private fun passes(s: Sound): Boolean {
    val f = s.flags
    if (Settings.blockAds && "ad" in f) return false
    if (Settings.hideLive && "live" in f) return false
    if (Settings.hidePhotos && "photo" in f) return false
    if (Settings.hideAi && "ai" in f) return false
    if (Settings.hideShop && "shop" in f) return false
    if (Settings.hidePaid && "paid" in f) return false
    if (Settings.hideSeries && "series" in f) return false
    if (Settings.hideSubscriber && "subscriber" in f) return false
    if (Settings.hideVerified && "verified" in f) return false
    val words = Settings.hiddenWords.split(',').map { it.trim().lowercase() }.filter { it.isNotEmpty() }
    if (words.isNotEmpty()) {
        val text = (s.title + " " + s.artist + " " + (s.user ?: "")).lowercase()
        if (words.any { it in text }) return false
    }
    return true
}

/** Video players kept for a video pager: the one on screen, the next and the previous (loaded ahead). */
private const val SLOTS = 3

/**
 * A TikTok feed (For You / Following), played as videos with their own sound. The real TikTok
 * page is open behind it (out of sight, its videos paused) and loads the feed; its videos are
 * picked up as they arrive (minus what Settings › Filters hides), and it's moved on for more as
 * you get near the end. "Show TikTok page" brings it to the front, e.g. to log in or close a pop-up.
 */
@Composable
private fun LiveFeed(url: String, look: Look) {
    val items = remember(url) { LiveFeeds.of(url) }
    var waited by remember { mutableIntStateOf(0) }
    var status by remember { mutableStateOf("Opening TikTok…") }
    var showPage by remember { mutableStateOf(false) }
    var hidden by remember { mutableIntStateOf(0) }
    // Where you were in this feed, kept while the app runs.
    val pager = rememberPagerState(initialPage = LiveFeeds.position[url] ?: 0) { items.size }
    LaunchedEffect(pager) { snapshotFlow { pager.settledPage }.collect { LiveFeeds.position[url] = it } }
    LaunchedEffect(Unit) { while (items.isEmpty()) { delay(200); waited++ } }

    // The TikTok page, behind everything (in front with "Show TikTok page"); moved on when fewer
    // than 5 videos are left.
    val needMore = items.size - pager.currentPage < 6
    LiveFeedWeb(
        url, needMore, Modifier.fillMaxSize().zIndex(if (showPage) 2f else 0f),
        onStatus = { status = it },
    ) { found ->
        val have = items.map { it.key }.toHashSet()
        // Your own posts aren't feed (they turned up once the feed ran dry).
        val me = Library.state.value.syncPages[Source.TIKTOK]?.let { dev.ketsuyumi.loopbox.sync.requestPath(it).removePrefix("/@").substringBefore('/') }
        val fresh = found.filter { it.key !in have && (me == null || !it.user.equals(me, ignoreCase = true)) }
        val ok = fresh.filter(::passes)
        hidden += fresh.size - ok.size
        items.addAll(ok)
    }
    if (showPage) {
        Box(Modifier.fillMaxSize().zIndex(3f)) {
            Text(
                "Back to the feed", color = Color.Black, fontWeight = FontWeight.Bold,
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 96.dp)
                    .clip(CircleShape).background(Accent).clickable { showPage = false }.padding(horizontal = 20.dp, vertical = 10.dp),
            )
        }
        return
    }

    if (items.isEmpty()) {
        Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
                CircularProgressIndicator(color = Accent)
                Spacer(Modifier.height(16.dp))
                Text(if (waited < 100) "Loading your feed…" else "Still nothing from TikTok.", color = Color.White)
                Text(status + if (hidden > 0) " · $hidden hidden by filters" else "", color = Color.Gray, style = MaterialTheme.typography.bodySmall)
                if (waited >= 50) {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "It may be waiting for a login, a cookie pop-up or a puzzle.",
                        color = Color.Gray, style = MaterialTheme.typography.bodySmall,
                    )
                }
                Spacer(Modifier.height(16.dp))
                Text(
                    "Show TikTok page", color = Color.Black, fontWeight = FontWeight.Bold,
                    modifier = Modifier.clip(CircleShape).background(Accent).clickable { showPage = true }.padding(horizontal = 20.dp, vertical = 10.dp),
                )
            }
        }
        return
    }
    // Paused while a profile is open over it.
    VideoPager(items, look, pager, active = Profiles.user == null)
}

/**
 * Videos played full screen with their own sound, swipe up for the next (a TikTok feed, or a
 * profile's videos). Three players take turns (page % 3): the video on screen plays while the
 * next and previous ones load and show their first frame, so swiping lands on a video that's
 * ready. [active] off pauses it (e.g. a profile opened over it).
 */
@OptIn(UnstableApi::class)
@Composable
internal fun VideoPager(items: List<Sound>, look: Look, pager: androidx.compose.foundation.pager.PagerState, active: Boolean) {
    val context = LocalContext.current
    val pool = remember { List(SLOTS) { videoPlayer(context).apply { repeatMode = if (Settings.loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF } } }
    val slotKey = remember { mutableStateListOf<String?>(*arrayOfNulls(SLOTS)) }   // whose video each player has
    val shown = remember { androidx.compose.runtime.mutableStateMapOf<String, Boolean>() } // videos with a first frame
    val failed = remember { androidx.compose.runtime.mutableStateMapOf<String, String>() } // key -> why
    var playing by remember { mutableStateOf(true) }
    var progress by remember { mutableFloatStateOf(0f) }
    val retried = remember { HashSet<String>() }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val currentSlot = pager.settledPage % SLOTS
    val list by androidx.compose.runtime.rememberUpdatedState(items)

    fun load(slot: Int, s: Sound, why: String) {
        slotKey[slot] = s.key
        val p = pool[slot]
        SyncLog.add("video $why: " + (s.videoUrl?.let { android.net.Uri.parse(it).host } ?: "no address") + " · @" + (s.user ?: s.artist))
        p.setMediaItem(MediaItem.fromUri(s.videoUrl ?: return))
        p.prepare()
        p.playWhenReady = false
    }

    DisposableEffect(pool) {
        PlayerConnection.pause() // one sound at a time
        val listeners = pool.mapIndexed { i, player ->
            object : Player.Listener {
                override fun onRenderedFirstFrame() {
                    val k = slotKey[i] ?: return
                    if (shown[k] != true) SyncLog.add("video showing" + if (i == pager.settledPage % SLOTS) "" else " (ready ahead)")
                    shown[k] = true
                }
                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    if (i == pager.settledPage % SLOTS) playing = isPlaying || player.playWhenReady
                }
                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    val s = list.firstOrNull { it.key == slotKey[i] } ?: return
                    val why = VideoResolver.why(error)
                    SyncLog.add("video didn't play ($why): ${s.videoUrl?.let { android.net.Uri.parse(it).host }} · ${s.pageUrl}")
                    // Once: a fresh address from the video's page. Then: at least its sound.
                    scope.launch {
                        val fresh = if (retried.add(s.key)) VideoResolver.refresh(s) else null
                        if (slotKey[i] != s.key) return@launch
                        if (fresh != null) {
                            SyncLog.add("retrying with a fresh address (${android.net.Uri.parse(fresh).host})")
                            player.setMediaItem(MediaItem.fromUri(fresh))
                        } else {
                            failed[s.key] = why
                            if (s.remoteUrl == s.videoUrl) return@launch
                            player.setMediaItem(MediaItem.fromUri(s.remoteUrl))
                        }
                        player.prepare()
                        player.playWhenReady = i == pager.settledPage % SLOTS && playing && active
                    }
                }
            }.also { player.addListener(it) }
        }
        onDispose { pool.forEachIndexed { i, p -> p.removeListener(listeners[i]); p.release() } }
    }
    LaunchedEffect(Settings.loop) { pool.forEach { it.repeatMode = if (Settings.loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF } }
    LaunchedEffect(LiveFeeds.speed) { pool.forEach { it.setPlaybackSpeed(LiveFeeds.speed) } }
    LaunchedEffect(active) {
        if (!active) pool.forEach { it.playWhenReady = false }
        else if (playing) { PlayerConnection.pause(); pool[pager.settledPage % SLOTS].playWhenReady = true }
    }
    LaunchedEffect(pool) {
        while (true) {
            delay(200)
            val player = pool[pager.settledPage % SLOTS]
            val d = player.duration
            progress = if (d > 0) (player.currentPosition.toFloat() / d).coerceIn(0f, 1f) else 0f
            if (active && player.playbackState == Player.STATE_ENDED && !Settings.loop && pager.currentPage < list.size - 1) pager.animateScrollToPage(pager.currentPage + 1)
        }
    }
    // On each page: the video on screen plays (from the start); the next and previous load ahead.
    LaunchedEffect(pager, items.size) {
        snapshotFlow { pager.settledPage }.collect { page ->
            if (list.isEmpty()) return@collect
            for ((p, why) in listOf(page to "loading", page + 1 to "loading ahead", page - 1 to "loading behind")) {
                val s = list.getOrNull(p) ?: continue
                if (slotKey[p % SLOTS] != s.key) load(p % SLOTS, s, why)
            }
            if (active) PlayerConnection.pause()
            pool.forEachIndexed { i, pl ->
                if (i == page % SLOTS) { pl.playWhenReady = active; playing = true }
                else { pl.playWhenReady = false; pl.seekTo(0) }
            }
        }
    }
    LaunchedEffect(pager.settledPage, slotKey[currentSlot]) {
        val k = slotKey[currentSlot] ?: return@LaunchedEffect
        delay(12_000)
        if (slotKey[currentSlot] == k && shown[k] != true && k !in failed) SyncLog.add("video still not showing after 12 s: " + stateOf(pool[currentSlot]))
    }

    VerticalPager(state = pager, modifier = Modifier.fillMaxSize(), beyondViewportPageCount = 1, key = { items[it].key }) { page ->
        val s = items[page]
        val current = page == pager.settledPage
        val slot = page % SLOTS
        val player = pool[slot]
        FeedPage(
            s, if (slotKey[slot] == s.key) player else null, look, live = true, ready = shown[s.key] == true,
            problem = failed[s.key]?.let { "Video couldn't load ($it), playing its sound" },
            current = current, playing = current && playing, progress = if (current) progress else 0f,
            onToggle = { if (player.playWhenReady) player.pause() else player.play(); playing = player.playWhenReady },
            speed = LiveFeeds.speed, onSpeed = { LiveFeeds.speed = it; if (Settings.rememberSpeed) Settings.speed = it },
            onSeek = { f -> if (player.duration > 0) player.seekTo((player.duration * f).toLong()) },
        )
    }
}

/**
 * Your saved sounds and videos, newest first. Saved videos show themselves; saved sounds show a
 * video that uses them when one can be found (Settings › Videos in the feed), otherwise a
 * spinning record. The video is muted: the sound plays through the normal player, so the lock
 * screen, background play and looping all work the same.
 */
@OptIn(UnstableApi::class)
@Composable
private fun SavedFeed(onSync: () -> Unit, look: Look, keys: List<String>? = null, startKey: String? = null) {
    val state by Library.state.collectAsState()
    val context = LocalContext.current
    val byKey = remember(state.sounds) { state.sounds.associateBy { it.key } }
    // [keys]: a list opened from Home or a playlist, in its order. Otherwise everything saved,
    // newest first; pages are keyed, so new ones arriving don't move you.
    val feed = remember(state.sounds.size, keys) {
        keys?.mapNotNull { byKey[it] } ?: state.sounds.sortedByDescending { it.addedAt }
    }

    val video = remember { videoPlayer(context).apply { volume = 0f; repeatMode = Player.REPEAT_MODE_ONE } }
    var videoKey by remember { mutableStateOf<String?>(null) }   // whose video is loaded
    var shownKey by remember { mutableStateOf<String?>(null) }   // whose video has a first frame
    var attachedKey by remember { mutableStateOf<String?>(null) } // whose video address is in the player
    val retried = remember { HashSet<String>() }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val currentFeed by androidx.compose.runtime.rememberUpdatedState(feed)
    DisposableEffect(video) {
        val l = object : Player.Listener {
            override fun onRenderedFirstFrame() {
                if (shownKey != videoKey) SyncLog.add("video showing")
                shownKey = videoKey
            }
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                val s = currentFeed.firstOrNull { it.key == videoKey } ?: return
                SyncLog.add("video didn't play (${VideoResolver.why(error)}): ${s.pageUrl}")
                if (retried.add(s.key)) scope.launch {
                    val url = VideoResolver.refresh(s)
                    if (url != null && videoKey == s.key) { video.setMediaItem(MediaItem.fromUri(url)); video.prepare(); video.playWhenReady = PlayerConnection.isPlaying; attachedKey = s.key }
                }
            }
        }
        video.addListener(l)
        onDispose { video.removeListener(l); video.release() }
    }
    LaunchedEffect(PlayerConnection.isPlaying) { video.playWhenReady = PlayerConnection.isPlaying }
    LaunchedEffect(PlayerConnection.speed) { video.setPlaybackSpeed(PlayerConnection.speed) }

    if (feed.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Filled.MusicNote, null, tint = Accent, modifier = Modifier.size(48.dp))
                Spacer(Modifier.height(12.dp))
                Text("Nothing saved yet", color = Color.White, style = MaterialTheme.typography.titleLarge)
                Text("Sync your saved TikTok or Instagram sounds and videos", color = Color.Gray)
                Spacer(Modifier.height(16.dp))
                Text("Sync now", color = Accent, fontWeight = FontWeight.Bold, modifier = Modifier.clickable(onClick = onSync).padding(8.dp))
            }
        }
        return
    }
    val wanted = startKey ?: FeedNav.startKey ?: PlayerConnection.currentKey
    val start = feed.indexOfFirst { it.key == wanted }.coerceAtLeast(0)
    val pager = rememberPagerState(initialPage = start) { feed.size }
    LaunchedEffect(Unit) { FeedNav.startKey = null }

    // Play what's on screen and find its video.
    LaunchedEffect(pager, feed) {
        snapshotFlow { pager.settledPage }.distinctUntilChanged().collectLatest { page ->
            val s = feed.getOrNull(page) ?: return@collectLatest
            if (PlayerConnection.currentKey != s.key) PlayerConnection.play(feed, s)
            PlayerConnection.setLoop(if (Settings.loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_ALL)
            if (videoKey != s.key) {
                video.stop(); video.clearMediaItems(); videoKey = s.key; shownKey = null; attachedKey = null
                val url = if (Settings.feedVideos || s.video) VideoResolver.videoFor(s) else null
                if (Settings.feedVideos || s.video) SyncLog.add("video loading: " + (url?.let { android.net.Uri.parse(it).host } ?: "none found") + " · " + s.title.take(40))
                if (url != null && videoKey == s.key) {
                    attachedKey = s.key
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
        val current = PlayerConnection.currentKey == s.key
        FeedPage(
            s, if (attachedKey == s.key) video else null, look, live = false, ready = shownKey == s.key,
            current = current, playing = current && PlayerConnection.isPlaying,
            progress = if (current) PlayerConnection.position.toFloat() / PlayerConnection.duration.coerceAtLeast(1) else 0f,
            onToggle = { if (current) PlayerConnection.toggle() },
            speed = PlayerConnection.speed, onSpeed = { PlayerConnection.setSpeedPitch(it, 1f); if (Settings.rememberSpeed) Settings.speed = it },
            onSeek = { f -> if (current) PlayerConnection.seek((PlayerConnection.duration * f).toLong()) },
        )
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun FeedPage(
    s: Sound, video: ExoPlayer?, look: Look, live: Boolean,
    current: Boolean, playing: Boolean, progress: Float, onToggle: () -> Unit,
    speed: Float, onSpeed: (Float) -> Unit, onSeek: (Float) -> Unit, problem: String? = null,
    ready: Boolean = false,
) {
    val (ui0, dx, dy) = look
    val context = LocalContext.current
    var playlistsMenu by remember { mutableStateOf(false) }
    val state by Library.state.collectAsState()
    // A video from your feed is "saved" once it's in the library.
    val inLibrary = state.sounds.firstOrNull { it.key == s.key }
    val liked = inLibrary?.liked == true
    val name = s.artist.ifBlank { if (s.source == Source.TIKTOK) "tiktok" else "instagram" }
    val profile = s.user?.let { if (s.source == Source.TIKTOK) "https://www.tiktok.com/@$it" else "https://www.instagram.com/$it/" }
    val openProfile = {
        if (s.source == Source.TIKTOK && s.user != null) Profiles.open(s.user)
        else (profile ?: s.pageUrl)?.let { openLink(context, it) }
    }
    var clear by remember { mutableStateOf(false) }          // long press › Clear display
    var held by remember { mutableStateOf(false) }           // long press › 2x while held
    var heart by remember { mutableIntStateOf(0) }           // double tap animation
    var armed by remember { mutableStateOf<String?>(null) }  // "Tap twice to …": the first tap
    LaunchedEffect(armed) { if (armed != null) { delay(2000); armed = null } }
    LaunchedEffect(heart) { if (heart > 0) { delay(700); heart = 0 } }
    val ui = if (clear) 0f else ui0
    // Settings › Glass navigation bar: keep the text and buttons above it.
    val navSpace = LocalNavSpace.current

    fun like() {
        if (inLibrary == null) saveToLibrary(context, s.copy(liked = true)) else Library.toggleLike(s.key)
    }
    fun save() {
        if (live && inLibrary == null) saveToLibrary(context, s) else playlistsMenu = true
    }
    fun confirmed(what: String, enabled: Boolean, act: () -> Unit) {
        if (!enabled || armed == what) { armed = null; act() } else armed = what
    }

    val spin = rememberInfiniteTransition(label = "disc")
    val angle by spin.animateFloat(0f, 360f, infiniteRepeatable(tween(8000, easing = LinearEasing), RepeatMode.Restart), label = "angle")

    Box(
        Modifier.fillMaxSize().background(Color.Black)
            .pointerInput(s.key) {
                detectTapGestures(
                    onTap = { if (clear) clear = false else onToggle() },
                    onDoubleTap = {
                        when (Settings.doubleTap) {
                            "like" -> { if (!liked) like(); heart++ }
                            "save" -> { if (inLibrary == null) saveToLibrary(context, s); heart++ }
                        }
                    },
                    onLongPress = {
                        when (Settings.longPress) {
                            "speed" -> { held = true; onSpeedHold(true, speed, onSpeed) }
                            "clear" -> clear = !clear
                        }
                    },
                    onPress = {
                        tryAwaitRelease()
                        if (held) { held = false; onSpeedHold(false, speed, onSpeed) }
                    },
                )
            }
            .pointerInput(s.key) {
                var total = 0f
                detectHorizontalDragGestures(
                    onDragStart = { total = 0f },
                    onDragEnd = { if (total < -120f && Settings.swipeLeft == "profile") openProfile() },
                ) { _, d -> total += d }
            },
    ) {
        if (video != null) {
            // The video (Saved: muted, the sound plays through the player).
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
                    it.resizeMode = if (Settings.fitVideo) AspectRatioFrameLayout.RESIZE_MODE_FIT else AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                },
                onRelease = { it.player = null },
            )
            if (ready) Box(Modifier.fillMaxSize().alpha(ui).background(Brush.verticalGradient(listOf(Color(0x44000000), Color.Transparent, Color.Transparent, Color(0x99000000)))))
        }
        // [video] is attached as soon as it's loaded (it can't show a first frame without a view);
        // until that first frame ([ready]), or with no video: the blurred cover and a big spinning record.
        if ((video == null || !ready) && s.video && s.cover != null) {
            // A video post loading: its cover (TikTok's is its first frame), placed like the video.
            AsyncImage(
                model = s.cover, contentDescription = null,
                contentScale = if (Settings.fitVideo) ContentScale.Fit else ContentScale.Crop,
                modifier = Modifier.fillMaxSize().background(Color.Black),
            )
        } else if (video == null || !ready) {
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
        problem?.let {
            Text(
                it, color = Color.White, style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.align(Alignment.Center).padding(top = 320.dp, start = 32.dp, end = 32.dp)
                    .clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp)).background(Color(0xAA000000)).padding(10.dp),
            )
        }
        if (heart > 0) Icon(Icons.Filled.Favorite, null, tint = Accent, modifier = Modifier.align(Alignment.Center).size(120.dp))
        if (held) Text(
            "2x", color = Color.White, fontWeight = FontWeight.Bold,
            modifier = Modifier.align(Alignment.TopCenter).padding(top = 90.dp).clip(CircleShape).background(Color(0x88000000)).padding(horizontal = 14.dp, vertical = 6.dp),
        )
        armed?.let {
            Text(
                "Tap again to $it", color = Color.White,
                modifier = Modifier.align(Alignment.Center).clip(CircleShape).background(Color(0xAA000000)).padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }

        // Name, date, country, caption and sound, bottom left.
        Column(
            Modifier.align(Alignment.BottomStart).offset(dx, dy).alpha(ui)
                .padding(start = 14.dp, end = 84.dp, bottom = 26.dp + navSpace),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    name, color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false).clickable { openProfile() },
                )
                val extra = buildList {
                    if (Settings.showUploadDate && s.postedAt > 0) add(postedLabel(s.postedAt))
                    if (Settings.showRegion && s.region != null) add(flag(s.region) + if (Settings.flagOnly) "" else " ${s.region}")
                }
                if (extra.isNotEmpty()) Text(
                    " · " + extra.joinToString(" · "), color = Color.White.copy(alpha = 0.75f),
                    style = MaterialTheme.typography.bodyMedium, maxLines = 1,
                )
            }
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

        // The right rail, like TikTok's (Settings › Feed buttons chooses which show).
        Column(
            Modifier.align(Alignment.BottomEnd).offset(dx, dy).alpha(ui).padding(end = 8.dp, bottom = 22.dp + navSpace),
            verticalArrangement = Arrangement.spacedBy(16.dp), horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (Settings.showAuthor) Box(
                Modifier.size(50.dp).clip(CircleShape).border(2.dp, Color.White, CircleShape).clickable { openProfile() },
            ) { Cover(s.cover, 50.dp, s.source, 25.dp) }
            if (Settings.showLike) RailButton(Icons.Filled.Favorite, countOr(s.likes, if (liked) "Liked" else "Like"), if (liked) Accent else Color.White) {
                confirmed("like", Settings.confirmLike) { like() }
            }
            if (Settings.showSave) Box {
                val saved = if (live) inLibrary != null else state.playlists.any { s.key in it.keys }
                RailButton(Icons.Filled.Bookmark, countOr(s.saves, if (live && saved) "Saved" else "Save"), if (saved) Color(0xFFFFC83D) else Color.White) { save() }
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
            if (Settings.showShare) s.pageUrl?.let { url ->
                RailButton(Icons.Filled.Share, countOr(s.shares, "Share"), Color.White) {
                    confirmed("share", Settings.confirmShare) { shareLink(context, url) }
                }
            }
            if (Settings.showSpeed) RailButton(Icons.Filled.Speed, speedLabel(speed), if (speed != 1f) Accent else Color.White) {
                onSpeed(when (speed) { 1f -> 1.5f; 1.5f -> 2f; else -> 1f })
            }
            if (Settings.showDisc) Record(s, 46.dp, if (playing) angle else 0f, Modifier)
        }

        // Progress along the bottom edge; Settings › Show seek bar makes it draggable.
        if (current) {
            val bar = if (Settings.seekBar) 18.dp else 2.dp
            Box(
                Modifier.align(Alignment.BottomStart).padding(bottom = navSpace).fillMaxWidth().height(bar).alpha(ui)
                    .then(if (Settings.seekBar) Modifier.pointerInput(Unit) {
                        detectTapGestures { o -> onSeek((o.x / size.width).coerceIn(0f, 1f)) }
                    }.pointerInput(Unit) {
                        detectHorizontalDragGestures { change, _ -> onSeek((change.position.x / size.width).coerceIn(0f, 1f)) }
                    } else Modifier),
                contentAlignment = Alignment.BottomStart,
            ) {
                Box(Modifier.fillMaxWidth().height(if (Settings.seekBar) 3.dp else 2.dp).background(Color(0x33FFFFFF)))
                Box(Modifier.fillMaxWidth(progress.coerceIn(0f, 1f)).height(if (Settings.seekBar) 3.dp else 2.dp).background(Color.White))
            }
        }
    }
}

/** What a player is doing, for the log when a video doesn't show. */
private fun stateOf(p: ExoPlayer): String {
    val state = when (p.playbackState) { Player.STATE_IDLE -> "idle"; Player.STATE_BUFFERING -> "buffering"; Player.STATE_READY -> "ready"; else -> "ended" }
    val hasVideo = p.currentTracks.groups.any { it.type == androidx.media3.common.C.TRACK_TYPE_VIDEO }
    return "$state, " + (if (hasVideo) "has a video track" else "no video track") + ", " + (p.videoFormat?.sampleMimeType ?: "no video format")
}

/** Long press › 2x speed while held: [on] starts it, off puts the old speed back. */
private var heldFrom = 1f
private fun onSpeedHold(on: Boolean, speed: Float, set: (Float) -> Unit) {
    if (on) { heldFrom = speed; set(2f) } else set(heldFrom)
}

/** "2d ago" or "25 Nov 2026" (Settings › Timestamp format). */
private fun postedLabel(ms: Long): String {
    if (Settings.timestamp == "date") return java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.getDefault()).format(java.util.Date(ms))
    val m = (System.currentTimeMillis() - ms) / 60_000
    return when {
        m < 60 -> "${m.coerceAtLeast(1)}m ago"
        m < 1440 -> "${m / 60}h ago"
        m < 1440 * 7 -> "${m / 1440}d ago"
        m < 1440 * 365 -> "${m / 10080}w ago"
        else -> "${m / 525600}y ago"
    }
}

/** The flag emoji for a two-letter country code. */
private fun flag(code: String) = code.uppercase().map { String(Character.toChars(0x1F1E6 + (it - 'A'))) }.joinToString("")

/** A count like TikTok's (1.2K, or exact with Settings › Disable number rounding), or [fallback]. */
private fun countOr(n: Long, fallback: String): String = when {
    n < 0 -> fallback
    Settings.noRounding || n < 1000 -> java.text.NumberFormat.getIntegerInstance().format(n)
    n < 1_000_000 -> trim(n / 1000.0) + "K"
    n < 1_000_000_000 -> trim(n / 1_000_000.0) + "M"
    else -> trim(n / 1_000_000_000.0) + "B"
}

private fun trim(v: Double) = if (v >= 100) v.toLong().toString() else "%.1f".format(v).removeSuffix(".0").removeSuffix(",0")

/** Adds a video from your feed to the library, and downloads its sound for offline. */
private fun saveToLibrary(context: android.content.Context, s: Sound) {
    val fresh = Library.addAll(listOf(s.copy(addedAt = System.currentTimeMillis())))
    SyncService.enqueue(context, fresh.map { it.key })
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
