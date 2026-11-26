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
import androidx.compose.material.icons.filled.FilterAlt
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.PlayCircle
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
import kotlin.reflect.KMutableProperty0

private enum class Page(val title: String, val desc: String, val icon: ImageVector) {
    APPEARANCE("Appearance", "Accent colour, theme, navigation bar", Icons.Filled.Palette),
    FEED("Feed", "Tabs, buttons, dates, gestures", Icons.Filled.ViewDay),
    FILTERS("Filters", "Ads and what to hide in For You", Icons.Filled.FilterAlt),
    PLAYBACK("Playback", "Looping, speed, quality, display", Icons.Filled.PlayCircle),
    PRIVACY("Privacy", "Links, screenshots, tracking, history", Icons.Filled.Lock),
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
        Toggle("Share", null, Settings::showShare)
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
