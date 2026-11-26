package dev.ketsuyumi.loopbox.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.material.icons.filled.Settings
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.ketsuyumi.loopbox.data.Library
import dev.ketsuyumi.loopbox.data.Playlist
import dev.ketsuyumi.loopbox.data.Source
import dev.ketsuyumi.loopbox.data.Sound
import dev.ketsuyumi.loopbox.playback.PlayerConnection
import dev.ketsuyumi.loopbox.sync.SyncService
import kotlinx.coroutines.launch
import java.util.Calendar
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.layout.size
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.runtime.saveable.rememberSaveable
import dev.ketsuyumi.loopbox.sync.Account

// ---- Home ----

private enum class HomeTab(val label: String) { VIDEOS("Videos"), SOUNDS("Sounds"), LIKED("Liked"), RECENT("Recent") }

/**
 * Home, like a TikTok profile: the sync cards on top, then your saved videos, sounds, likes and
 * recently played as a grid of tiles; a tile opens that list full screen to swipe through.
 */
@Composable
fun HomeScreen(onSync: (Source, Boolean) -> Unit, onSettings: () -> Unit = {}) {
    val state by Library.state.collectAsState()
    var tab by rememberSaveable { mutableStateOf(HomeTab.VIDEOS) }
    val byKey = remember(state.sounds) { state.sounds.associateBy { it.key } }
    val list = remember(state.sounds, state.recent, tab) {
        when (tab) {
            HomeTab.VIDEOS -> state.sounds.filter { it.video }.sortedByDescending { it.addedAt }
            HomeTab.SOUNDS -> state.sounds.filter { !it.video }.sortedByDescending { it.addedAt }
            HomeTab.LIKED -> state.sounds.filter { it.liked }.sortedByDescending { it.addedAt }
            HomeTab.RECENT -> state.recent.mapNotNull { byKey[it] }
        }
    }
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    val full = { _: androidx.compose.foundation.lazy.grid.LazyGridItemSpanScope -> androidx.compose.foundation.lazy.grid.GridItemSpan(3) }
    androidx.compose.foundation.lazy.grid.LazyVerticalGrid(
        columns = androidx.compose.foundation.lazy.grid.GridCells.Fixed(3),
        contentPadding = PaddingValues(bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp), verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        item(span = full) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    when (hour) { in 5..11 -> "Good morning"; in 12..17 -> "Good afternoon"; else -> "Good evening" },
                    color = Color.White, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(16.dp).weight(1f),
                )
                IconButton(onClick = onSettings) { Icon(Icons.Filled.Settings, "Settings", tint = Color.White) }
            }
        }
        item(span = full) {
            Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SyncCard(Source.TIKTOK, state.syncPages[Source.TIKTOK] != null || state.syncApis[Source.TIKTOK] != null, state.sounds.count { it.source == Source.TIKTOK && !it.video }, onSync, Modifier.weight(1f))
                SyncCard(Source.INSTAGRAM, state.syncPages[Source.INSTAGRAM] != null || state.syncApis[Source.INSTAGRAM] != null, state.sounds.count { it.source == Source.INSTAGRAM && !it.video }, onSync, Modifier.weight(1f))
            }
        }
        // Tabs, like the ones under a TikTok profile.
        item(span = full) {
            Row(Modifier.fillMaxWidth().padding(top = 16.dp)) {
                HomeTab.entries.forEach { t ->
                    val on = tab == t
                    Column(Modifier.weight(1f).clickable { tab = t }, horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            when (t) {
                                HomeTab.VIDEOS -> Icons.Filled.GridView
                                HomeTab.SOUNDS -> Icons.Filled.MusicNote
                                HomeTab.LIKED -> Icons.Filled.Favorite
                                HomeTab.RECENT -> Icons.Filled.History
                            },
                            t.label, tint = if (on) Color.White else Color.Gray,
                        )
                        Text(t.label, color = if (on) Color.White else Color.Gray, style = MaterialTheme.typography.labelMedium)
                        Spacer(Modifier.height(6.dp))
                        Box(Modifier.fillMaxWidth(0.5f).height(2.dp).background(if (on) Color.White else Color.Transparent))
                    }
                }
            }
        }
        items(list, key = { it.key }) { s -> VideoTile(s) { Viewer.open(tab.label, list, s) } }
        if (list.isEmpty()) item(span = full) {
            Text(
                when (tab) {
                    HomeTab.VIDEOS -> "No saved videos yet. Sync now adds your TikTok Favorites › Posts."
                    HomeTab.SOUNDS -> "No sounds yet. Tap a sync card above."
                    HomeTab.LIKED -> "Nothing liked yet. Double tap a video in the feed."
                    HomeTab.RECENT -> "Nothing played yet."
                },
                color = Color.Gray, modifier = Modifier.padding(24.dp),
            )
        }
    }
}

@Composable
private fun SyncCard(source: Source, hasPage: Boolean, count: Int, onSync: (Source, Boolean) -> Unit, modifier: Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(12.dp)).background(Surface2).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(if (source == Source.TIKTOK) "TikTok" else "Instagram", color = Color.White, fontWeight = FontWeight.Bold)
        Text("$count sound${if (count == 1) "" else "s"}", color = Color.Gray, style = MaterialTheme.typography.bodySmall)
        val sync by SyncService.progress.collectAsState()
        val name = if (source == Source.TIKTOK) "TikTok" else "Instagram"
        if (sync.listing == name) Text(
            "Syncing… ${sync.found} new" + if (sync.pages > 0) " · page ${sync.pages + 1}" else "",
            color = Accent, style = MaterialTheme.typography.bodySmall,
        )
        if (hasPage || Account.loggedIn(source)) {
            Button(enabled = sync.listing == null, onClick = { onSync(source, true) }, contentPadding = PaddingValues(horizontal = 10.dp)) {
                Icon(Icons.Filled.Sync, null, Modifier.padding(end = 4.dp)); Text("Sync now")
            }
            TextButton(onClick = { onSync(source, false) }) { Text("Open") }
        } else {
            Button(onClick = { onSync(source, false) }, contentPadding = PaddingValues(horizontal = 10.dp)) { Text("Log in & sync") }
        }
    }
}

/**
 * A tile like a TikTok grid: the cover, tall; videos show their likes, sounds a note and their
 * title. [onLongClick]: e.g. remove from a playlist.
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun VideoTile(s: Sound, onLongClick: (() -> Unit)? = null, onClick: () -> Unit) {
    val playing = PlayerConnection.currentKey == s.key
    Box(
        Modifier.fillMaxWidth().aspectRatio(3f / 4f).background(Surface2)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick),
    ) {
        if (s.cover != null) coil.compose.AsyncImage(
            model = s.cover, contentDescription = s.title, contentScale = androidx.compose.ui.layout.ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        ) else Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.MusicNote, null, tint = Color.Gray, modifier = Modifier.size(32.dp))
        }
        Box(Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent, Color(0xAA000000)))))
        Row(Modifier.align(Alignment.BottomStart).padding(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(if (s.video) Icons.Filled.PlayArrow else Icons.Filled.MusicNote, null, tint = Color.White, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(2.dp))
            Text(
                if (s.video) (if (s.likes >= 0) compact(s.likes) else s.artist) else s.title,
                color = Color.White, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        if (playing) Icon(Icons.Filled.GraphicEq, "Playing", tint = Accent, modifier = Modifier.align(Alignment.TopEnd).padding(6.dp).size(16.dp))
        if (s.liked) Icon(Icons.Filled.Favorite, "Liked", tint = Accent, modifier = Modifier.align(Alignment.TopStart).padding(6.dp).size(14.dp))
    }
}

private fun compact(n: Long): String = when {
    n < 1000 -> n.toString()
    n < 1_000_000 -> "%.1fK".format(n / 1000.0).replace(".0K", "K")
    else -> "%.1fM".format(n / 1_000_000.0).replace(".0M", "M")
}

// ---- Library ----

private enum class Filter(val label: String) { ALL("All"), SOUNDS("Sounds"), VIDEOS("Videos"), LIKED("Liked"), TIKTOK("TikTok"), INSTAGRAM("Instagram"), MISSING("Not downloaded") }

@Composable
fun LibraryScreen() {
    val state by Library.state.collectAsState()
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf(Filter.ALL) }
    var confirmDelete by remember { mutableStateOf(false) }
    val context = androidx.compose.ui.platform.LocalContext.current
    val q = query.trim().lowercase()
    val shown = state.sounds
        .filter {
            // Saved sounds and saved videos together; a video plays as audio here, or Watch it.
            when (filter) {
                Filter.ALL -> true
                Filter.SOUNDS -> !it.video
                Filter.VIDEOS -> it.video
                Filter.LIKED -> it.liked
                Filter.TIKTOK -> it.source == Source.TIKTOK
                Filter.INSTAGRAM -> it.source == Source.INSTAGRAM
                Filter.MISSING -> it.file == null
            }
        }
        .filter { q.isEmpty() || it.title.lowercase().contains(q) || it.artist.lowercase().contains(q) }
    Column(Modifier.fillMaxSize()) {
        Text("Your library", color = Color.White, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(16.dp))
        OutlinedTextField(
            value = query, onValueChange = { query = it }, singleLine = true,
            leadingIcon = { Icon(Icons.Filled.Search, null) }, placeholder = { Text("Search sounds") },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        )
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(Filter.entries) { f -> FilterChip(selected = filter == f, onClick = { filter = f }, label = { Text(f.label) }) }
        }
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("${shown.size} sound${if (shown.size == 1) "" else "s"}", color = Color.Gray, modifier = Modifier.weight(1f))
            val missing = shown.filter { it.file == null }
            val sync by SyncService.progress.collectAsState()
            if (missing.isNotEmpty()) TextButton(enabled = sync.waiting == 0, onClick = {
                SyncService.enqueue(context, missing.map { it.key })
            }) { Icon(Icons.Filled.CloudDownload, null, Modifier.padding(end = 4.dp)); Text(if (sync.waiting > 0) "Downloading… ${sync.waiting} left" else "Download ${missing.size}") }
            if (shown.isNotEmpty()) PlayButtons(shown)
        }
        if (shown.isNotEmpty()) TextButton(onClick = { confirmDelete = true }, modifier = Modifier.padding(horizontal = 8.dp)) {
            Text("Delete all ${shown.size} shown", color = Color(0xFFFF6B6B))
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
            items(shown, key = { it.key }) { s -> SoundRow(s, shown, state.playlists) }
        }
    }
    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("Delete ${shown.size} sounds?") },
        text = { Text("They're removed from your library, playlists and phone. Sync again to bring saved ones back.") },
        confirmButton = { TextButton(onClick = { confirmDelete = false; shown.forEach { Library.remove(it.key) } }) { Text("Delete", color = Color(0xFFFF6B6B)) } },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
    )
}

@Composable
private fun PlayButtons(queue: List<Sound>) {
    IconButton(onClick = { PlayerConnection.play(queue.shuffled(), queue.random()); if (!PlayerConnection.shuffle) PlayerConnection.toggleShuffle() }) {
        Icon(Icons.Filled.Shuffle, "Shuffle", tint = Color.White)
    }
    FilledIconButton(onClick = { PlayerConnection.play(queue, queue.first()) }, colors = IconButtonDefaults.filledIconButtonColors(containerColor = Accent)) {
        Icon(Icons.Filled.PlayArrow, "Play", tint = Color.Black)
    }
}

// ---- Playlists ----

/** Playlists as cover tiles; one opens as a grid, and a tile there plays the playlist full screen. */
@Composable
fun PlaylistsScreen() {
    val state by Library.state.collectAsState()
    var open by remember { mutableStateOf<String?>(null) }
    var naming by remember { mutableStateOf<Playlist?>(null) }
    var creating by remember { mutableStateOf(false) }
    val byKey = remember(state.sounds) { state.sounds.associateBy { it.key } }
    val current = state.playlists.firstOrNull { it.id == open }
    if (current != null) {
        BackHandler { open = null }
        PlaylistDetail(current, byKey, onBack = { open = null }, onRename = { naming = current })
    } else {
        val full = { _: androidx.compose.foundation.lazy.grid.LazyGridItemSpanScope -> androidx.compose.foundation.lazy.grid.GridItemSpan(2) }
        androidx.compose.foundation.lazy.grid.LazyVerticalGrid(
            columns = androidx.compose.foundation.lazy.grid.GridCells.Fixed(2),
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item(span = full) {
                Row(Modifier.padding(vertical = 12.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Playlists", color = Color.White, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    IconButton(onClick = { creating = true }) { Icon(Icons.Filled.Add, "New playlist", tint = Color.White) }
                }
            }
            items(state.playlists, key = { it.id }) { p ->
                val items = p.keys.mapNotNull { byKey[it] }
                Column(Modifier.clip(RoundedCornerShape(12.dp)).clickable { open = p.id }) {
                    // A 2×2 mosaic of the first covers, like a playlist on TikTok.
                    Box(Modifier.fillMaxWidth().aspectRatio(3f / 4f).clip(RoundedCornerShape(12.dp)).background(Surface2)) {
                        val covers = items.mapNotNull { it.cover }.take(4)
                        if (covers.isEmpty()) Icon(Icons.Filled.MusicNote, null, tint = Color.Gray, modifier = Modifier.align(Alignment.Center).size(40.dp))
                        else if (covers.size < 4) coil.compose.AsyncImage(covers[0], null, contentScale = androidx.compose.ui.layout.ContentScale.Crop, modifier = Modifier.fillMaxSize())
                        else Column {
                            for (r in 0..1) Row(Modifier.weight(1f)) {
                                for (c in 0..1) coil.compose.AsyncImage(covers[r * 2 + c], null, contentScale = androidx.compose.ui.layout.ContentScale.Crop, modifier = Modifier.weight(1f).fillMaxSize())
                            }
                        }
                    }
                    Text(p.name, color = Color.White, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
                    val videos = items.count { it.video }
                    Text(
                        listOfNotNull(
                            (items.size - videos).takeIf { it > 0 }?.let { "$it sound${if (it == 1) "" else "s"}" },
                            videos.takeIf { it > 0 }?.let { "$it video${if (it == 1) "" else "s"}" },
                        ).joinToString(" · ").ifEmpty { "Empty" },
                        color = Color.Gray, style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            if (state.playlists.isEmpty()) item(span = full) {
                Text("No playlists yet. Tap + to make one, or Save on any video in the feed.", color = Color.Gray, modifier = Modifier.padding(8.dp))
            }
        }
    }
    if (creating) NameDialog("New playlist", "", onDone = { name -> creating = false; if (name != null) Library.createPlaylist(name) })
    naming?.let { p -> NameDialog("Rename playlist", p.name, onDone = { name -> naming = null; if (name != null) Library.renamePlaylist(p.id, name) }) }
}

@Composable
private fun PlaylistDetail(p: Playlist, byKey: Map<String, Sound>, onBack: () -> Unit, onRename: () -> Unit) {
    val items = p.keys.mapNotNull { byKey[it] }
    var removing by remember { mutableStateOf<Sound?>(null) }
    val full = { _: androidx.compose.foundation.lazy.grid.LazyGridItemSpanScope -> androidx.compose.foundation.lazy.grid.GridItemSpan(3) }
    androidx.compose.foundation.lazy.grid.LazyVerticalGrid(
        columns = androidx.compose.foundation.lazy.grid.GridCells.Fixed(3),
        contentPadding = PaddingValues(bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp), verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        item(span = full) {
            Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White) }
                Text(p.name, color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f).clickable(onClick = onRename))
                if (items.isNotEmpty()) PlayButtons(items)
            }
        }
        item(span = full) {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (items.isNotEmpty()) Button(onClick = { Viewer.open(p.name, items, items.first()) }) {
                    Icon(Icons.Filled.PlayArrow, null, Modifier.padding(end = 4.dp)); Text("Watch")
                }
                OutlinedButton(onClick = onRename) { Text("Rename") }
                OutlinedButton(onClick = { Library.deletePlaylist(p.id); onBack() }) { Text("Delete") }
            }
        }
        if (items.isNotEmpty()) item(span = full) {
            Text("Hold a tile to remove it", color = Color.Gray, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
        }
        items(items, key = { it.key }) { s -> VideoTile(s, onLongClick = { removing = s }) { Viewer.open(p.name, items, s) } }
        if (items.isEmpty()) item(span = full) {
            Text("Empty. Tap Save on a video in the feed, or ⋮ on a sound in your library.", color = Color.Gray, modifier = Modifier.padding(16.dp))
        }
    }
    removing?.let { s ->
        AlertDialog(
            onDismissRequest = { removing = null },
            title = { Text("Remove from ${p.name}?") },
            text = { Text(s.title, maxLines = 2, overflow = TextOverflow.Ellipsis) },
            confirmButton = { TextButton(onClick = { Library.removeFromPlaylist(p.id, s.key); removing = null }) { Text("Remove") } },
            dismissButton = { TextButton(onClick = { removing = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun NameDialog(title: String, initial: String, onDone: (String?) -> Unit) {
    var text by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = { onDone(null) },
        title = { Text(title) },
        text = { OutlinedTextField(value = text, onValueChange = { text = it }, singleLine = true) },
        confirmButton = { TextButton(onClick = { onDone(text.trim()) }) { Text("Save") } },
        dismissButton = { TextButton(onClick = { onDone(null) }) { Text("Cancel") } },
    )
}
