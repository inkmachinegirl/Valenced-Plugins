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
import dev.ketsuyumi.loopbox.sync.Downloader
import kotlinx.coroutines.launch
import java.util.Calendar

// ---- Home ----

@Composable
fun HomeScreen(onSync: (Source, Boolean) -> Unit) {
    val state by Library.state.collectAsState()
    val recent = state.recent.mapNotNull { k -> state.sounds.firstOrNull { it.key == k } }
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            Text(
                when (hour) { in 5..11 -> "Good morning"; in 12..17 -> "Good afternoon"; else -> "Good evening" },
                color = Color.White, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(16.dp),
            )
        }
        item {
            Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SyncCard(Source.TIKTOK, state.syncPages[Source.TIKTOK] != null, state.sounds.count { it.source == Source.TIKTOK }, onSync, Modifier.weight(1f))
                SyncCard(Source.INSTAGRAM, state.syncPages[Source.INSTAGRAM] != null, state.sounds.count { it.source == Source.INSTAGRAM }, onSync, Modifier.weight(1f))
            }
        }
        if (recent.isNotEmpty()) {
            item { SectionTitle("Recently played") }
            item {
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(recent.take(20), key = { it.key }) { s -> Tile(s, recent) }
                }
            }
        }
        val liked = state.sounds.filter { it.liked }
        if (liked.isNotEmpty()) {
            item { SectionTitle("Liked sounds") }
            item {
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(liked.take(20), key = { it.key }) { s -> Tile(s, liked) }
                }
            }
        }
        if (state.sounds.isNotEmpty()) {
            item { SectionTitle("Recently added") }
            items(state.sounds.sortedByDescending { it.addedAt }.take(10), key = { "added-" + it.key }) { s ->
                SoundRow(s, state.sounds.sortedByDescending { it.addedAt }, state.playlists)
            }
        } else {
            item {
                Text(
                    "Your library is empty. Tap a sync card above, log in, and open your saved sounds.",
                    color = Color.Gray, modifier = Modifier.padding(16.dp),
                )
            }
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
        if (hasPage) {
            Button(onClick = { onSync(source, true) }, contentPadding = PaddingValues(horizontal = 10.dp)) {
                Icon(Icons.Filled.Sync, null, Modifier.padding(end = 4.dp)); Text("Sync now")
            }
            TextButton(onClick = { onSync(source, false) }) { Text("Open") }
        } else {
            Button(onClick = { onSync(source, false) }, contentPadding = PaddingValues(horizontal = 10.dp)) { Text("Log in & sync") }
        }
    }
}

@Composable
private fun Tile(s: Sound, queue: List<Sound>) {
    Column(Modifier.width(140.dp).clickable { PlayerConnection.play(queue, s) }) {
        Cover(s.cover, 140.dp, s.source, 8.dp)
        Spacer(Modifier.height(6.dp))
        Text(s.title, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
        Text(s.artist, color = Color.Gray, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
    }
}

// ---- Library ----

private enum class Filter(val label: String) { ALL("All"), LIKED("Liked"), TIKTOK("TikTok"), INSTAGRAM("Instagram"), MISSING("Not downloaded") }

@Composable
fun LibraryScreen() {
    val state by Library.state.collectAsState()
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf(Filter.ALL) }
    var downloading by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val q = query.trim().lowercase()
    val shown = state.sounds
        .filter {
            when (filter) {
                Filter.ALL -> true
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
            val missing = state.sounds.filter { it.file == null }
            if (missing.isNotEmpty()) TextButton(enabled = !downloading, onClick = {
                downloading = true
                scope.launch { missing.forEach { Downloader.download(it) }; downloading = false }
            }) { Icon(Icons.Filled.CloudDownload, null, Modifier.padding(end = 4.dp)); Text(if (downloading) "Downloading…" else "Download ${missing.size}") }
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

@Composable
fun PlaylistsScreen() {
    val state by Library.state.collectAsState()
    var open by remember { mutableStateOf<String?>(null) }
    var naming by remember { mutableStateOf<Playlist?>(null) }
    var creating by remember { mutableStateOf(false) }
    val current = state.playlists.firstOrNull { it.id == open }
    if (current != null) {
        PlaylistDetail(current, state.sounds, state.playlists, onBack = { open = null }, onRename = { naming = current })
    } else {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Playlists", color = Color.White, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                IconButton(onClick = { creating = true }) { Icon(Icons.Filled.Add, "New playlist", tint = Color.White) }
            }
            LazyColumn {
                items(state.playlists, key = { it.id }) { p ->
                    val first = p.keys.firstNotNullOfOrNull { k -> state.sounds.firstOrNull { it.key == k } }
                    Row(
                        Modifier.fillMaxWidth().clickable { open = p.id }.padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Cover(first?.cover, 56.dp, first?.source)
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(p.name, color = Color.White, fontWeight = FontWeight.Medium)
                            Text("${p.keys.size} sound${if (p.keys.size == 1) "" else "s"}", color = Color.Gray, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                if (state.playlists.isEmpty()) item {
                    Text("No playlists yet. Tap + to make one, or use ⋮ on any sound.", color = Color.Gray, modifier = Modifier.padding(16.dp))
                }
            }
        }
    }
    if (creating) NameDialog("New playlist", "", onDone = { name -> creating = false; if (name != null) Library.createPlaylist(name) })
    naming?.let { p -> NameDialog("Rename playlist", p.name, onDone = { name -> naming = null; if (name != null) Library.renamePlaylist(p.id, name) }) }
}

@Composable
private fun PlaylistDetail(p: Playlist, all: List<Sound>, playlists: List<Playlist>, onBack: () -> Unit, onRename: () -> Unit) {
    val sounds = p.keys.mapNotNull { k -> all.firstOrNull { it.key == k } }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White) }
            Text(p.name, color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f).clickable(onClick = onRename))
            if (sounds.isNotEmpty()) PlayButtons(sounds)
        }
        Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onRename) { Text("Rename") }
            OutlinedButton(onClick = { Library.deletePlaylist(p.id); onBack() }) { Text("Delete") }
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
            items(sounds, key = { it.key }) { s -> SoundRow(s, sounds, playlists, inPlaylist = p) }
            if (sounds.isEmpty()) item { Text("Empty. Add sounds with ⋮ in your library.", color = Color.Gray, modifier = Modifier.padding(16.dp)) }
        }
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
