package dev.ketsuyumi.loopbox

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
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
import dev.ketsuyumi.loopbox.ui.Accent
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
        PlayerConnection.connect(this)
        if (Build.VERSION.SDK_INT >= 33) notifications.launch(Manifest.permission.POST_NOTIFICATIONS)

        setContent {
            MaterialTheme(colorScheme = LoopboxColors) {
                var tab by rememberSaveable { mutableStateOf(0) }
                var nowPlaying by remember { mutableStateOf(false) }
                var sync by remember { mutableStateOf<Pair<Source, Boolean>?>(null) }
                ProgressTicker()

                Box(Modifier.fillMaxSize().background(Color.Black).safeDrawingPadding()) {
                    val open = sync
                    when {
                        open != null -> SyncScreen(open.first, open.second, onClose = { sync = null })
                        nowPlaying -> {
                            BackHandler { nowPlaying = false }
                            NowPlaying(onClose = { nowPlaying = false })
                        }
                        else -> Column(Modifier.fillMaxSize()) {
                            Box(Modifier.weight(1f)) {
                                when (tab) {
                                    0 -> HomeScreen(onSync = { source, auto -> sync = source to auto })
                                    1 -> LibraryScreen()
                                    else -> PlaylistsScreen()
                                }
                            }
                            MiniPlayer(onOpen = { nowPlaying = true })
                            NavigationBar(containerColor = Surface1, modifier = Modifier.padding(top = 4.dp)) {
                                val colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = Color.White, selectedTextColor = Color.White,
                                    indicatorColor = Accent.copy(alpha = 0.25f),
                                    unselectedIconColor = Color.Gray, unselectedTextColor = Color.Gray,
                                )
                                NavigationBarItem(tab == 0, { tab = 0 }, { Icon(Icons.Filled.Home, null) }, label = { Text("Home") }, colors = colors)
                                NavigationBarItem(tab == 1, { tab = 1 }, { Icon(Icons.Filled.LibraryMusic, null) }, label = { Text("Library") }, colors = colors)
                                NavigationBarItem(tab == 2, { tab = 2 }, { Icon(Icons.AutoMirrored.Filled.QueueMusic, null) }, label = { Text("Playlists") }, colors = colors)
                            }
                        }
                    }
                }
            }
        }
    }
}
