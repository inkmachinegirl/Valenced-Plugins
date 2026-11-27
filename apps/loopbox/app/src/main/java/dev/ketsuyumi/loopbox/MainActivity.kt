package dev.ketsuyumi.loopbox

import android.Manifest
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import android.view.WindowManager
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.ui.Alignment
import dev.ketsuyumi.loopbox.ui.Background
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import dev.ketsuyumi.loopbox.data.Library
import dev.ketsuyumi.loopbox.data.Source
import dev.ketsuyumi.loopbox.playback.PlayerConnection
import dev.ketsuyumi.loopbox.sync.SyncScreen
import dev.ketsuyumi.loopbox.sync.SyncService
import dev.ketsuyumi.loopbox.ui.Accent
import dev.ketsuyumi.loopbox.ui.FeedScreen
import dev.ketsuyumi.loopbox.ui.FeedNav
import dev.ketsuyumi.loopbox.ui.CommentsSheet
import dev.ketsuyumi.loopbox.ui.Profiles
import dev.ketsuyumi.loopbox.ui.ProfileScreen
import dev.ketsuyumi.loopbox.ui.Viewer
import dev.ketsuyumi.loopbox.ui.ViewerScreen
import dev.ketsuyumi.loopbox.ui.SettingsScreen
import dev.ketsuyumi.loopbox.data.Settings
import androidx.compose.runtime.LaunchedEffect
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import dev.ketsuyumi.loopbox.ui.HomeScreen
import dev.ketsuyumi.loopbox.ui.LibraryScreen
import dev.ketsuyumi.loopbox.ui.LoopboxColors
import dev.ketsuyumi.loopbox.ui.MiniPlayer
import dev.ketsuyumi.loopbox.ui.NowPlaying
import dev.ketsuyumi.loopbox.ui.PlaylistsScreen
import dev.ketsuyumi.loopbox.ui.ProgressTicker
import dev.ketsuyumi.loopbox.ui.Surface1

class MainActivity : ComponentActivity() {
    private val notifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Library.init(this)
        Settings.init(this)
        PlayerConnection.connect(this)
        if (Build.VERSION.SDK_INT >= 33) notifications.launch(Manifest.permission.POST_NOTIFICATIONS)

        // Draw behind the system bars (Settings › Extend video behind status bar), with light icons.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )

        setContent {
            MaterialTheme(colorScheme = LoopboxColors) {
                var tab by rememberSaveable { mutableStateOf(0) }
                var nowPlaying by remember { mutableStateOf(false) }
                var sync by remember { mutableStateOf<Pair<Source, Boolean>?>(null) }
                var settings by remember { mutableStateOf(false) }
                // Settings › Feed › Start on.
                LaunchedEffect(Unit) {
                    FeedNav.tab = when (Settings.startTab) { "saved" -> FeedNav.SAVED; "following" -> FeedNav.FOLLOWING; else -> FeedNav.FOR_YOU }
                }
                // The library's Watch: go to the feed.
                LaunchedEffect(FeedNav.open) {
                    if (FeedNav.open) { tab = 0; nowPlaying = false; settings = false; FeedNav.open = false }
                }
                // Settings › Hide system bars: over the feed only; a swipe from the edge shows them for a moment.
                val hideBars = Settings.hideSystemBars && tab == 0 && sync == null && !nowPlaying && !settings
                LaunchedEffect(hideBars) {
                    val bars = WindowCompat.getInsetsController(window, window.decorView)
                    bars.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    if (hideBars) bars.hide(WindowInsetsCompat.Type.systemBars()) else bars.show(WindowInsetsCompat.Type.systemBars())
                }
                // Settings › Privacy › Allow screenshots and screen recording.
                LaunchedEffect(Settings.allowScreenshots) {
                    if (Settings.allowScreenshots) window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    else window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                }
                ProgressTicker()

                Box(Modifier.fillMaxSize().background(if ((tab == 0 || Viewer.keys != null) && sync == null && !settings && !nowPlaying) Color.Black else Background)) {
                    val open = sync
                    when {
                        open != null -> Box(Modifier.safeDrawingPadding()) { SyncScreen(open.first, open.second, onClose = { sync = null }) }
                        settings -> Box(Modifier.safeDrawingPadding()) { SettingsScreen(onClose = { settings = false }) }
                        // A list opened from Home or a playlist: full screen, like TikTok.
                        Viewer.keys != null -> ViewerScreen()
                        nowPlaying -> Box(Modifier.safeDrawingPadding()) {
                            BackHandler { nowPlaying = false }
                            NowPlaying(onClose = { nowPlaying = false })
                        }
                        else -> {
                            val feed = tab == 0
                            // Glass navigation: see-through, over the feed, which goes on behind it.
                            val overNav = feed && Settings.glassNav
                            val nav = @androidx.compose.runtime.Composable { m: Modifier ->
                                NavigationBar(containerColor = if (overNav) Color(0x66000000) else Surface1, modifier = m) {
                                    val colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = Color.White, selectedTextColor = Color.White,
                                        indicatorColor = Accent.copy(alpha = 0.25f),
                                        unselectedIconColor = Color.Gray, unselectedTextColor = Color.Gray,
                                    )
                                    val labels = !Settings.hideNavLabels
                                    @androidx.compose.runtime.Composable
                                    fun item(i: Int, icon: androidx.compose.ui.graphics.vector.ImageVector, name: String) = NavigationBarItem(
                                        tab == i, { tab = i }, { Icon(icon, name) },
                                        label = if (labels) ({ Text(name) }) else null, alwaysShowLabel = labels, colors = colors,
                                    )
                                    item(0, Icons.Filled.PlayCircle, "Feed")
                                    item(1, Icons.Filled.Home, "Home")
                                    item(2, Icons.Filled.LibraryMusic, "Library")
                                    item(3, Icons.AutoMirrored.Filled.QueueMusic, "Playlists")
                                }
                            }
                            Column(Modifier.fillMaxSize()) {
                                Box(Modifier.weight(1f).then(if (feed && Settings.extendStatusBar) Modifier else Modifier.statusBarsPadding())) {
                                    when (tab) {
                                        0 -> FeedScreen(onSync = { tab = 1 }, onSettings = { settings = true })
                                        1 -> HomeScreen(onSettings = { settings = true }, onSync = { source, auto ->
                                            // Sync now: in the background with a notification; the sync page
                                            // the first time, to log in.
                                            if (auto && SyncService.syncNow(this@MainActivity, source)) {
                                                Toast.makeText(this@MainActivity, "Syncing in the background, see the notification", Toast.LENGTH_SHORT).show()
                                            } else sync = source to auto
                                        })
                                        2 -> LibraryScreen()
                                        else -> PlaylistsScreen()
                                    }
                                }
                                // The feed is its own player, so the mini player only shows on the Spotify side.
                                if (!feed) MiniPlayer(onOpen = { nowPlaying = true })
                                if (!overNav) nav(Modifier)
                            }
                            if (overNav) Box(Modifier.align(Alignment.BottomCenter)) { nav(Modifier) }
                        }
                    }
                    // A video's comments, in a sheet.
                    CommentsSheet()
                    // A TikTok profile, over everything (the feed under it pauses).
                    if (Profiles.user != null && sync == null && !settings) {
                        BackHandler { Profiles.close() }
                        Box(Modifier.fillMaxSize()) { ProfileScreen() }
                    }
                }
            }
        }
    }
}
