package dev.ketsuyumi.loopbox.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.FilterAlt
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.ViewDay
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.media3.common.Player
import dev.ketsuyumi.loopbox.data.Library
import dev.ketsuyumi.loopbox.data.Settings
import dev.ketsuyumi.loopbox.playback.PlayerConnection
import dev.ketsuyumi.loopbox.sync.SyncLog
import kotlin.reflect.KMutableProperty0

private enum class Page(val title: String, val desc: String, val icon: ImageVector) {
    APPEARANCE("Appearance", "Accent colour, theme, navigation bar", Icons.Filled.Palette),
    FEED("Feed", "Tabs, buttons, dates, gestures", Icons.Filled.ViewDay),
    FILTERS("Filters", "Ads and what to hide in For You", Icons.Filled.FilterAlt),
    PLAYBACK("Playback", "Looping, speed, quality, display", Icons.Filled.PlayCircle),
    COMMENTS("Comments", "Names, times, long comments, blocked words", Icons.Filled.ChatBubble),
    DOWNLOADS("Downloads", "Saving videos and sounds to the phone", Icons.Filled.Download),
    PRIVACY("Privacy", "Links, screenshots, tracking, history", Icons.Filled.Lock),
    LOG("Sync log", "What the last syncs did, to copy and send", Icons.Filled.Sync),
}

private val ACCENTS = listOf(
    0xFFFF4FD1, 0xFFFF2D55, 0xFFFF375F, 0xFFFF7A00, 0xFFFFC400, 0xFF22C55E,
    0xFF00C2FF, 0xFF3B82F6, 0xFF8B5CF6, 0xFFFFFFFF,
).map { it.toInt() }

@Composable
fun SettingsScreen(onClose: () -> Unit) {
    var page by rememberSaveable { mutableStateOf<Page?>(null) }
    BackHandler { if (page != null) page = null else onClose() }
    Column(Modifier.fillMaxSize().background(Background)) {
        Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { if (page != null) page = null else onClose() }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White)
            }
        }
        Text(
            page?.title ?: "Settings", color = Color.White, style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(start = 20.dp, bottom = 8.dp),
        )
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 14.dp).padding(bottom = 32.dp)) {
            when (page) {
                null -> Section(null) {
                    Page.entries.forEach { p ->
                        Row(
                            Modifier.fillMaxWidth().clickable { page = p }.padding(horizontal = 16.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(p.icon, null, tint = Accent)
                            Spacer(Modifier.width(16.dp))
                            Column(Modifier.weight(1f)) {
                                Text(p.title, color = Color.White, style = MaterialTheme.typography.titleMedium)
                                Text(p.desc, color = Color.Gray, style = MaterialTheme.typography.bodySmall)
                            }
                            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Color.Gray)
                        }
                    }
                }
                Page.APPEARANCE -> Appearance()
                Page.FEED -> Feed()
                Page.FILTERS -> Filters()
                Page.PLAYBACK -> Playback()
                Page.PRIVACY -> Privacy()
                Page.COMMENTS -> Comments()
                Page.DOWNLOADS -> Downloads()
                Page.LOG -> Log()
            }
        }
    }
}

@Composable
private fun Appearance() {
    Section(null) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text("Accent color", color = Color.White, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            Text("#%06X".format(Settings.accent and 0xFFFFFF), color = Color.Gray)
        }
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            ACCENTS.forEach { c ->
                Box(
                    Modifier.size(42.dp).clip(CircleShape).background(Color(c))
                        .border(if (Settings.accent == c) 3.dp else 0.dp, Color.White, CircleShape)
                        .clickable { Settings.accent = c },
                )
            }
        }
        Hint("Changes the pink across buttons, likes, switches and tabs")
        Spacer(Modifier.height(8.dp))
        Text("Dark theme style", color = Color.White, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf(
                Triple("black", "Black", Color.Black to Color(0xFF121212)),
                Triple("dark", "Dark", Color(0xFF0B0B0D) to Color(0xFF16161A)),
                Triple("standard", "Standard", Color(0xFF17171A) to Color(0xFF242428)),
            ).forEach { (key, label, colors) ->
                val (bg, panel) = colors
                val on = Settings.theme == key
                Column(
                    Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable { Settings.theme = key },
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        Modifier.fillMaxWidth().height(90.dp).clip(RoundedCornerShape(12.dp)).background(bg)
                            .border(if (on) 2.dp else 1.dp, if (on) Accent else Color(0xFF333333), RoundedCornerShape(12.dp)),
                    ) {
                        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Box(Modifier.fillMaxWidth(0.7f).height(6.dp).clip(CircleShape).background(Color(0xFF555555)))
                            Box(Modifier.fillMaxWidth().height(22.dp).clip(RoundedCornerShape(6.dp)).background(panel))
                            Box(Modifier.width(24.dp).height(6.dp).clip(CircleShape).background(Accent))
                        }
                    }
                    Text(label, color = Color.White, modifier = Modifier.padding(top = 6.dp))
                    RadioButton(selected = on, onClick = { Settings.theme = key }, colors = RadioButtonDefaults.colors(selectedColor = Accent))
                }
            }
        }
        Hint("Black is pure black, Dark is near-black with panels that stay visible, Standard is grey")
    }
    Section("Navigation bar") {
        Toggle("Hide tab labels", "Only icons on the bottom navigation bar", Settings::hideNavLabels)
        Toggle("Glass navigation bar", "See-through over the feed, and the feed goes on behind it", Settings::glassNav)
    }
}

@Composable
private fun Feed() {
    Section("Top tabs") {
        Choice("Start on", "The feed tab Loopbox opens on", Settings::startTab, listOf("foryou" to "For You", "following" to "Following", "saved" to "Saved"))
    }
    Section("Feed buttons") {
        Toggle("Author", "The picture at the top; tap for their profile", Settings::showAuthor)
        Toggle("Like", null, Settings::showLike)
        Toggle("Save", "Saves a feed video to your library; on saved ones, playlists", Settings::showSave)
        Toggle("Comments", null, Settings::showComments)
        Toggle("Share", null, Settings::showShare)
        Toggle("More (⋯)", "Download, save sound, hide author, block audio, copy link", Settings::showMore)
        Toggle("Speed", "1x, 1.5x, 2x", Settings::showSpeed)
        Toggle("Spinning disc", null, Settings::showDisc)
    }
    Section("On video") {
        Toggle("Always show upload date", "Displays when it was posted, next to the name", Settings::showUploadDate)
        Choice("Timestamp format", "Under a video in the feed", Settings::timestamp, listOf("relative" to "2d ago", "date" to "25 Nov 2026"))
        Toggle("Show upload region", "Country flag and code next to the upload date", Settings::showRegion)
        Toggle("Flag icon only", "Only the flag, without the two-letter code", Settings::flagOnly)
        Toggle("Disable number rounding", "1,234 instead of 1.2K", Settings::noRounding)
    }
    Section("Gestures") {
        Choice("Double tap", null, Settings::doubleTap, listOf("like" to "Like (default)", "save" to "Save", "none" to "Nothing"))
        Choice("Long press", null, Settings::longPress, listOf("speed" to "2x speed (default)", "clear" to "Clear display", "none" to "Nothing"))
        Choice("Swipe left", null, Settings::swipeLeft, listOf("profile" to "Open profile (default)", "none" to "Nothing"))
    }
    Section("Accidental tap confirmation") {
        Toggle("Tap twice to like", null, Settings::confirmLike)
        Toggle("Tap twice to share", "Requires a second tap to confirm", Settings::confirmShare)
    }
    Section("Saved") {
        Toggle("Videos for saved sounds", "Each saved sound shows a TikTok video that uses it. Uses more data", Settings::feedVideos)
    }
    Section("Sync") {
        Toggle(
            "Sounds from saved videos", "The sound of every video you bookmarked is added to your sounds too, and downloaded for offline",
            Settings::soundsFromVideos,
        )
        Choice(
            "Saved videos per sync", "Newest first; later syncs only add new ones", Settings::videoCap,
            listOf("1000" to "1,000 (default)", "5000" to "5,000", "all" to "All"),
        )
    }
}

@Composable
private fun Filters() {
    Section("Ads") {
        Toggle("Block all ads", "Ads in For You and Following", Settings::blockAds)
    }
    Section("Hide in For You and Following") {
        Toggle("Hide live streams", null, Settings::hideLive)
        Toggle("Hide photo posts", null, Settings::hidePhotos)
        Toggle("Hide AI-generated posts", "Posts labeled as AI-generated", Settings::hideAi)
        Toggle("Hide TikTok Shop videos", null, Settings::hideShop)
        Toggle("Hide paid partnerships", null, Settings::hidePaid)
        Toggle("Hide series episodes", null, Settings::hideSeries)
        Toggle("Hide subscriber-only posts", null, Settings::hideSubscriber)
        Toggle("Hide verified accounts", null, Settings::hideVerified)
    }
    Section("Views, likes and date") {
        var open by remember { mutableStateOf(false) }
        val parts = buildList {
            if (Settings.minViews.isNotBlank() || Settings.maxViews.isNotBlank()) add("views")
            if (Settings.minLikes.isNotBlank() || Settings.maxLikes.isNotBlank()) add("likes")
            if (Settings.dateFrom > 0 || Settings.dateTo > 0) add("date")
        }
        Row(
            Modifier.fillMaxWidth().clickable { open = true }.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("Filter by views, likes and date", color = Color.White, style = MaterialTheme.typography.titleMedium)
                Text("Hides For You and Following videos outside the limits", color = Color.Gray, style = MaterialTheme.typography.bodySmall)
            }
            Text(parts.joinToString(", ").ifEmpty { "Off" }, color = Color.Gray)
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Color.Gray)
        }
        if (open) LimitsSheet { open = false }
    }
    Section("Hidden") {
        ListRow("Hidden authors", Settings::hiddenAuthors) { it.let { "@$it" } }
        ListRow("Blocked audio", Settings::blockedAudio) { it.substringAfter('|') }
        Hint("Added from a video's ⋯ menu. Tap an entry to restore it to your feed")
    }
    Section("Regions") {
        Toggle("Filter by region", "Only videos posted from these countries", Settings::filterRegion)
        if (Settings.filterRegion) OutlinedTextField(
            value = Settings.regions, onValueChange = { Settings.regions = it.uppercase() },
            placeholder = { Text("RO, US, JP") }, singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        )
    }
    Section("Hidden words") {
        OutlinedTextField(
            value = Settings.hiddenWords, onValueChange = { Settings.hiddenWords = it },
            placeholder = { Text("spoiler, giveaway, #ad") }, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        )
        Hint("Videos whose caption or author has one of these words (comma-separated) are hidden")
    }
}

@Composable
private fun Playback() {
    Section("Video") {
        Toggle("Show seek bar on all videos", "Drag or tap the bar at the bottom to jump", Settings::seekBar)
        Toggle("Loop", "A video or sound plays again until you swipe. When off, the next one starts by itself", Settings::loop) {
            PlayerConnection.setLoop(if (it) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_ALL)
        }
        Toggle("Remember playback speed", "Keeps 1.5x or 2x for the next videos and next time", Settings::rememberSpeed)
        Toggle("Fit video to screen", "The whole video frame, with bars, instead of cropping the edges", Settings::fitVideo)
        Toggle("Extend video behind status bar", "The feed fills the full screen height", Settings::extendStatusBar)
    }
    Section("Quality") {
        Choice("Video quality on Wi-Fi", null, Settings::qualityWifi, QUALITY)
        Choice("Video quality on mobile data", null, Settings::qualityMobile, QUALITY)
        Toggle("Force H.264 codec", "Uses H.264 playback when available. Reduces CPU load on older devices but consumes more data", Settings::forceH264)
    }
    Section("Display") {
        Toggle("Burn-in protection", null, Settings::burnIn)
        if (Settings.burnIn) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text("Interface visibility", color = Color.White, modifier = Modifier.weight(1f))
                Text("${(Settings.uiVisibility * 100).toInt()}%", color = Color.White)
            }
            Slider(
                value = Settings.uiVisibility, onValueChange = { Settings.uiVisibility = it },
                modifier = Modifier.padding(horizontal = 16.dp),
                colors = SliderDefaults.colors(thumbColor = Accent, activeTrackColor = Accent, inactiveTrackColor = Accent.copy(alpha = 0.25f)),
            )
            Hint("Adjusts feed UI opacity to prevent OLED burn-in. Elements remain clickable. At 0% the interface is hidden")
            Toggle("Shift UI elements", "Slightly shifts UI positions over time to prevent burn-in", Settings::shiftUi)
        }
        Toggle("Hide system bars", "The status bar and navigation bar disappear over the feed. Swipe from the screen edge to show them for a moment", Settings::hideSystemBars)
    }
}

private val QUALITY = listOf("auto" to "Auto (default)", "saver" to "Data saver", "best" to "Best")

@Composable
private fun Privacy() {
    Section(null) {
        Toggle("Sanitize shared links", "Removes tracking parameters from links you share", Settings::sanitizeLinks)
        Toggle("Allow screenshots and screen recording", null, Settings::allowScreenshots)
        Toggle("Open links in browser", "Profiles and posts open in your browser instead of the TikTok or Instagram app", Settings::openInBrowser)
        Toggle("Block telemetry", "TikTok's logging and analytics requests from Loopbox's TikTok pages are blocked", Settings::blockTelemetry)
    }
    Section("History") {
        Toggle("Don't keep Recently played", "What you play isn't added to Home › Recently played", Settings::noHistory)
        Row(
            Modifier.fillMaxWidth().clickable { Library.clearRecent() }.padding(horizontal = 16.dp, vertical = 14.dp),
        ) { Text("Clear Recently played", color = Accent, style = MaterialTheme.typography.titleMedium) }
    }
}

@Composable
private fun Log() {
    val clipboard = androidx.compose.ui.platform.LocalClipboardManager.current
    val lines = SyncLog.lines
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            "Copy", color = Color.Black, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
            modifier = Modifier.clip(CircleShape).background(Accent)
                .clickable { clipboard.setText(androidx.compose.ui.text.AnnotatedString(lines.joinToString("\n"))) }
                .padding(horizontal = 20.dp, vertical = 10.dp),
        )
        Text(
            "Clear", color = Color.White,
            modifier = Modifier.clip(CircleShape).background(Surface2).clickable { SyncLog.clear() }.padding(horizontal = 20.dp, vertical = 10.dp),
        )
    }
    Hint("Tap Sync now, wait for it to finish, then Copy and send it. It shows each page asked for and what TikTok answered; no passwords or cookies.")
    Section(null) {
        if (lines.isEmpty()) Hint("Nothing yet. Run a sync.")
        lines.forEach { l ->
            Text(
                l, color = Color(0xFFCFCFCF), style = MaterialTheme.typography.bodySmall,
                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp),
            )
        }
    }
}

@Composable
private fun Comments() {
    Section(null) {
        Toggle("Show @username instead of name", "Displays the author's @username instead of the display name in comments", Settings::commentUsernames)
        Toggle("Exact comment time", "The date and time on every comment instead of \"2d\"", Settings::exactCommentTime)
        Choice("Long comments", null, Settings::longComments, listOf("expand" to "Expand all at once", "collapse" to "Collapse (… More)"))
        Toggle("Copy comment text without nickname", "Hold a comment to copy it", Settings::copyWithoutName)
        Toggle("Pause while comments are open", "The video stops while its comments are open and goes on when they close", Settings::pauseForComments)
    }
    Section("Hide") {
        Text("Block keywords in comments", color = Color.White, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 16.dp, top = 12.dp))
        OutlinedTextField(
            value = Settings.blockCommentWords, onValueChange = { Settings.blockCommentWords = it },
            placeholder = { Text("spoiler, first") }, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        )
        Text("Block users in comments", color = Color.White, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 16.dp, top = 4.dp))
        OutlinedTextField(
            value = Settings.blockCommentUsers, onValueChange = { Settings.blockCommentUsers = it },
            placeholder = { Text("@someone, nickname") }, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        )
        Hint("Hides comments containing these words, or from these accounts (@username or nickname), comma-separated")
    }
}

@Composable
private fun Downloads() {
    Section(null) {
        Choice(
            "Download quality", "Downloads from a video's ⋯ menu", Settings::downloadQuality,
            listOf("auto" to "As played (default)", "h264" to "H.264", "best" to "Best quality"),
        )
        Toggle("Include author and date in file names", null, Settings::namesWithAuthor)
        Toggle("Batch select videos on profile", "Hold a video in a profile's grid to select; save up to 50 at once", Settings::batchSelect)
    }
    Section("Download folders") {
        Text("Videos: Movies/", color = Color.White, modifier = Modifier.padding(start = 16.dp, top = 12.dp))
        OutlinedTextField(
            value = Settings.videoFolder, onValueChange = { Settings.videoFolder = it }, singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        )
        Text("Sounds: Music/", color = Color.White, modifier = Modifier.padding(start = 16.dp, top = 6.dp))
        OutlinedTextField(
            value = Settings.soundFolder, onValueChange = { Settings.soundFolder = it }, singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        )
        Hint("Your gallery and music apps find them there")
    }
}

/** A list setting (one entry per line), shown as a count; opens a list where a tap restores an entry. */
@Composable
private fun ListRow(title: String, setting: KMutableProperty0<String>, label: (String) -> String) {
    val entries = setting.get().lines().filter { it.isNotBlank() }
    var open by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().clickable { open = true }.padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, color = Color.White, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
        Text("${entries.size}", color = Color.Gray)
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Color.Gray)
    }
    if (open) androidx.compose.material3.AlertDialog(
        onDismissRequest = { open = false },
        title = { Text(title) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                if (entries.isEmpty()) Text("Nothing here yet.", color = Color.Gray)
                entries.forEach { e ->
                    Row(
                        Modifier.fillMaxWidth().clickable { setting.set(entries.filter { it != e }.joinToString("\n")) }.padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(label(e), modifier = Modifier.weight(1f))
                        Text("Restore", color = Accent)
                    }
                }
            }
        },
        confirmButton = { androidx.compose.material3.TextButton(onClick = { open = false }) { Text("Done") } },
    )
}

/** Filter by views, likes and date: min / max fields and a date range, like the sheet in TikTok mods. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun LimitsSheet(onClose: () -> Unit) {
    var minViews by remember { mutableStateOf(Settings.minViews) }
    var maxViews by remember { mutableStateOf(Settings.maxViews) }
    var minLikes by remember { mutableStateOf(Settings.minLikes) }
    var maxLikes by remember { mutableStateOf(Settings.maxLikes) }
    var from by remember { mutableStateOf(Settings.dateFrom) }
    var to by remember { mutableStateOf(Settings.dateTo) }
    var picking by remember { mutableStateOf<String?>(null) }
    val day = java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.getDefault())
    androidx.compose.material3.ModalBottomSheet(onDismissRequest = onClose, containerColor = Surface1) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            Text("Filter by views, likes and date", color = Color.White, style = MaterialTheme.typography.titleLarge, modifier = Modifier.align(Alignment.CenterHorizontally))
            Text("Leave empty for no limit", color = Color.Gray, modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 6.dp, bottom = 12.dp))
            @Composable
            fun pair(title: String, a: String, b: String, setA: (String) -> Unit, setB: (String) -> Unit) {
                Text(title, color = Color.White, modifier = Modifier.padding(top = 8.dp, bottom = 6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(a, { setA(it.filter(Char::isDigit)) }, label = { Text("Min") }, placeholder = { Text("No limit") }, singleLine = true, modifier = Modifier.weight(1f),
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number))
                    OutlinedTextField(b, { setB(it.filter(Char::isDigit)) }, label = { Text("Max") }, placeholder = { Text("No limit") }, singleLine = true, modifier = Modifier.weight(1f),
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number))
                }
            }
            pair("By views", minViews, maxViews, { minViews = it }, { maxViews = it })
            pair("By likes", minLikes, maxLikes, { minLikes = it }, { maxLikes = it })
            Text("By date", color = Color.White, modifier = Modifier.padding(top = 8.dp, bottom = 6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                listOf("From" to from, "To" to to).forEach { (label, v) ->
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(8.dp)).border(1.dp, Color(0xFF555555), RoundedCornerShape(8.dp))
                            .clickable { picking = label }.padding(12.dp),
                    ) {
                        Text(label, color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                        Text(if (v > 0) day.format(java.util.Date(v)) else if (label == "From") "Any" else "Today", color = Color.White)
                    }
                }
            }
            if (from > 0 || to > 0) Text("Clear dates", color = Accent, modifier = Modifier.padding(top = 8.dp).clickable { from = 0; to = 0 })
            Spacer(Modifier.height(20.dp))
            androidx.compose.material3.Button(
                onClick = {
                    Settings.minViews = minViews; Settings.maxViews = maxViews
                    Settings.minLikes = minLikes; Settings.maxLikes = maxLikes
                    Settings.dateFrom = from; Settings.dateTo = to
                    onClose()
                },
                modifier = Modifier.fillMaxWidth(),
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = Accent),
            ) { Text("Save", color = Color.White) }
        }
    }
    picking?.let { which ->
        val state = androidx.compose.material3.rememberDatePickerState(initialSelectedDateMillis = (if (which == "From") from else to).takeIf { it > 0 })
        androidx.compose.material3.DatePickerDialog(
            onDismissRequest = { picking = null },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    val v = state.selectedDateMillis ?: 0
                    if (which == "From") from = v else to = v
                    picking = null
                }) { Text("OK") }
            },
        ) { androidx.compose.material3.DatePicker(state) }
    }
}

// ---- building blocks ----

@Composable
private fun Section(title: String?, content: @Composable ColumnScope.() -> Unit) {
    if (title != null) Text(title, color = Color.Gray, modifier = Modifier.padding(start = 16.dp, top = 20.dp, bottom = 10.dp))
    else Spacer(Modifier.height(12.dp))
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Surface1).padding(vertical = 6.dp), content = content)
}

@Composable
private fun Hint(text: String) {
    Text(text, color = Color.Gray, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
}

@Composable
private fun Toggle(title: String, desc: String?, setting: KMutableProperty0<Boolean>, after: (Boolean) -> Unit = {}) {
    val value = setting.get()
    val change = { v: Boolean -> setting.set(v); after(v) }
    Row(
        Modifier.fillMaxWidth().clickable { change(!value) }.padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Color.White, style = MaterialTheme.typography.titleMedium)
            if (desc != null) Text(desc, color = Color.Gray, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            checked = value, onCheckedChange = change,
            colors = SwitchDefaults.colors(checkedTrackColor = Accent, checkedThumbColor = Color.White, uncheckedThumbColor = Color.Gray, uncheckedTrackColor = Color.Black),
        )
    }
}

@Composable
private fun Choice(title: String, desc: String?, setting: KMutableProperty0<String>, options: List<Pair<String, String>>) {
    var open by remember { mutableStateOf(false) }
    val current = options.firstOrNull { it.first == setting.get() }?.second ?: options.first().second
    Box {
        Row(
            Modifier.fillMaxWidth().clickable { open = true }.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(title, color = Color.White, style = MaterialTheme.typography.titleMedium)
                if (desc != null) Text(desc, color = Color.Gray, style = MaterialTheme.typography.bodySmall)
            }
            Text(current, color = Color.Gray)
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Color.Gray)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (key, label) ->
                DropdownMenuItem(
                    text = { Text((if (key == setting.get()) "✓ " else "") + label) },
                    onClick = { setting.set(key); open = false },
                )
            }
        }
    }
}
