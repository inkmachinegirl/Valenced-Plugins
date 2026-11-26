package dev.ketsuyumi.loopbox.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.media3.common.Player
import dev.ketsuyumi.loopbox.data.Settings
import dev.ketsuyumi.loopbox.playback.PlayerConnection

@Composable
fun SettingsScreen(onClose: () -> Unit) {
    BackHandler(onBack = onClose)
    Column(Modifier.fillMaxSize().background(Color.Black)) {
        Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onClose) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White) }
            Text("Settings", color = Color.White, style = MaterialTheme.typography.titleLarge)
        }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 14.dp).padding(bottom = 24.dp)) {
            Section("Playback") {
                Toggle(
                    "Loop", "Each video or sound plays again until you swipe, in every feed. When off, the next one starts by itself",
                    Settings.loop,
                ) {
                    Settings.putLoop(it)
                    PlayerConnection.setLoop(if (it) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_ALL)
                }
            }
            Section("Feed") {
                Toggle(
                    "Videos for saved sounds", "In Saved, each saved sound shows a TikTok video that uses it. Uses more data",
                    Settings.feedVideos, Settings::putFeedVideos,
                )
                Toggle(
                    "Fill the screen", "Videos are cropped to fill the whole screen instead of fitting with black bars",
                    Settings.fillScreen, Settings::putFillScreen,
                )
                Toggle(
                    "Force H.264 codec", "Uses H.264 playback when available. Reduces CPU load on older devices but consumes more data",
                    Settings.forceH264, Settings::putForceH264,
                )
            }
            Section("Display") {
                Toggle("Burn-in protection", null, Settings.burnIn, Settings::putBurnIn)
                if (Settings.burnIn) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                        Text("Interface visibility", color = Color.White, modifier = Modifier.weight(1f))
                        Text("${(Settings.uiVisibility * 100).toInt()}%", color = Color.White)
                    }
                    Slider(
                        value = Settings.uiVisibility, onValueChange = Settings::putUiVisibility,
                        modifier = Modifier.padding(horizontal = 16.dp),
                        colors = SliderDefaults.colors(thumbColor = Accent, activeTrackColor = Accent, inactiveTrackColor = Accent.copy(alpha = 0.25f)),
                    )
                    Text(
                        "Adjusts feed UI opacity to prevent OLED burn-in. Elements remain clickable. At 0% the interface is hidden",
                        color = Color.Gray, style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    )
                    Toggle("Shift UI elements", "Slightly shifts UI positions over time to prevent burn-in", Settings.shiftUi, Settings::putShiftUi)
                }
                Toggle(
                    "Hide system bars", "The status bar and navigation bar disappear over the feed. Swipe from the screen edge to show them for a moment",
                    Settings.hideSystemBars, Settings::putHideSystemBars,
                )
            }
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    Text(title, color = Color.Gray, modifier = Modifier.padding(start = 16.dp, top = 20.dp, bottom = 10.dp))
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Surface1).padding(vertical = 6.dp), content = content)
}

@Composable
private fun Toggle(title: String, desc: String?, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onChange(!value) }.padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Color.White, style = MaterialTheme.typography.titleMedium)
            if (desc != null) Text(desc, color = Color.Gray, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            checked = value, onCheckedChange = onChange,
            colors = SwitchDefaults.colors(checkedTrackColor = Accent, checkedThumbColor = Color.White, uncheckedThumbColor = Color.Gray, uncheckedTrackColor = Color.Black),
        )
    }
}
