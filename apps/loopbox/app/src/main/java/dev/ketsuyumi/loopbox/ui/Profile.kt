package dev.ketsuyumi.loopbox.ui

import android.webkit.WebView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridItemSpanScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.zIndex
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import dev.ketsuyumi.loopbox.data.Sound
import dev.ketsuyumi.loopbox.playback.PlayerConnection
import dev.ketsuyumi.loopbox.sync.Extractor
import dev.ketsuyumi.loopbox.sync.LiveFeedWeb
import kotlinx.coroutines.delay

/** The TikTok profile open in the app (its @username), over whatever was on screen. */
object Profiles {
    var user by mutableStateOf<String?>(null); private set
    private val back = ArrayDeque<String>()

    fun open(name: String) {
        user?.let { if (it != name) back.addLast(it) }
        user = name
    }

    /** Back: the profile before (opened from this one's videos), or close. */
    fun close() { user = back.removeLastOrNull() }
}

/**
 * A TikTok profile inside the app, like TikTok's: picture, name, following / followers / likes,
 * bio, Follow, and a grid of their videos; a video opens them full screen to swipe through.
 * Its TikTok page loads out of sight behind it (logged in as you) and is read like the feed.
 */
@Composable
fun ProfileScreen() {
    val name = Profiles.user ?: return
    androidx.compose.runtime.key(name) { Profile(name) }
}

@Composable
private fun Profile(name: String) {
    var info by remember { mutableStateOf<Extractor.Profile?>(null) }
    val videos = remember { mutableStateListOf<Sound>() }
    var web by remember { mutableStateOf<WebView?>(null) }
    var watching by remember { mutableStateOf<Int?>(null) }
    var following by remember { mutableStateOf<Boolean?>(null) }
    var waited by remember { mutableStateOf(0) }
    var showPage by remember { mutableStateOf(false) }
    val grid = rememberLazyGridState()
    // Load more of their videos when the grid gets near its end.
    val needMore by remember { derivedStateOf { (grid.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) > videos.size - 6 } }

    BackHandler { if (showPage) showPage = false else if (watching != null) watching = null else Profiles.close() }
    LaunchedEffect(Unit) { PlayerConnection.pause(); while (videos.isEmpty()) { delay(200); waited++ } }

    /** Their follow button on the TikTok page: [click] presses it; answers its text ("Follow", "Following", "Friends"). */
    fun followButton(click: Boolean, answer: (String) -> Unit) {
        val js = """(function(){
            var b = document.querySelector('[data-e2e="follow-button"]') ||
              Array.prototype.slice.call(document.querySelectorAll('button')).filter(function(x){ return /^(Follow|Following|Friends|Follow back)$/i.test((x.textContent||'').trim()); })[0];
            if (!b) return '';
            ${if (click) "b.click();" else ""}
            return (b.textContent || '').trim();
        })()"""
        web?.evaluateJavascript(js) { answer(it.trim('"')) }
    }
    LaunchedEffect(web, info) {
        if (web != null && info != null) followButton(false) { t -> if (t.isNotEmpty()) following = !t.equals("Follow", true) && !t.equals("Follow back", true) }
    }

    Box(Modifier.fillMaxSize().background(Background)) {
        LiveFeedWeb(
            "https://www.tiktok.com/@$name", needMore && watching == null && !showPage,
            Modifier.fillMaxSize().zIndex(if (showPage) 5f else 0f),
            profileOf = name, onProfile = { info = it }, onWeb = { web = it },
        ) { found ->
            val have = videos.map { it.key }.toHashSet()
            videos.addAll(found.filter { it.key !in have })
        }
        // Covers the page behind.
        Box(Modifier.fillMaxSize().background(Background))

        val full = { _: LazyGridItemSpanScope -> GridItemSpan(3) }
        LazyVerticalGrid(
            columns = GridCells.Fixed(3), state = grid, modifier = Modifier.fillMaxSize().statusBarsPadding(),
            contentPadding = PaddingValues(bottom = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp), verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            item(span = full) {
                Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { Profiles.close() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White) }
                    Text(
                        info?.name ?: name, color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium,
                        textAlign = TextAlign.Center, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.width(48.dp))
                }
            }
            item(span = full) {
                Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.size(96.dp).clip(CircleShape).background(Surface2)) {
                        info?.avatar?.let { AsyncImage(it, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("@$name", color = Color.White, fontWeight = FontWeight.SemiBold)
                        if (info?.verified == true) Icon(Icons.Filled.Verified, "Verified", tint = Color(0xFF20D5EC), modifier = Modifier.padding(start = 4.dp).size(16.dp))
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                        Stat(info?.following, "Following")
                        Stat(info?.followers, "Followers")
                        Stat(info?.likes, "Likes")
                    }
                    Spacer(Modifier.height(14.dp))
                    // Follow / Following, by pressing their button on the TikTok page.
                    val on = following == true
                    Text(
                        if (on) "Following" else "Follow", color = if (on) Color.White else Color.Black, fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.width(180.dp).clip(RoundedCornerShape(6.dp))
                            .background(if (on) Surface2 else Accent)
                            .then(if (on) Modifier.border(1.dp, Color(0xFF444444), RoundedCornerShape(6.dp)) else Modifier)
                            .clickable(enabled = web != null) {
                                following = !on
                                followButton(true) { }
                            }
                            .padding(vertical = 10.dp),
                    )
                    info?.bio?.takeIf { it.isNotBlank() }?.let {
                        Spacer(Modifier.height(12.dp))
                        Text(it, color = Color.White, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 32.dp))
                    }
                }
            }
            item(span = full) {
                Column(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Filled.GridView, "Videos", tint = Color.White)
                    Spacer(Modifier.height(6.dp))
                    Box(Modifier.width(60.dp).height(2.dp).background(Color.White))
                }
            }
            items(videos, key = { it.key }) { s -> VideoTile(s) { watching = videos.indexOf(s) } }
            if (videos.isEmpty()) item(span = full) {
                Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    if ((info?.videos ?: -1) == 0L) Text("No videos yet", color = Color.Gray)
                    else {
                        if (waited < 100) CircularProgressIndicator(color = Accent)
                        else Text("TikTok hasn't sent their videos yet.", color = Color.Gray)
                        if (waited >= 25) {
                            Spacer(Modifier.height(16.dp))
                            Text(
                                "Show TikTok page", color = Color.Black, fontWeight = FontWeight.Bold,
                                modifier = Modifier.clip(CircleShape).background(Accent).clickable { showPage = true }.padding(horizontal = 20.dp, vertical = 10.dp),
                            )
                            Text(
                                "Scroll their videos there; they're picked up here as they load.",
                                color = Color.Gray, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center,
                                modifier = Modifier.padding(top = 8.dp),
                            )
                        }
                    }
                }
            }
        }

        // Their TikTok page in front, to scroll it yourself.
        if (showPage) Box(Modifier.fillMaxSize().zIndex(6f)) {
            Text(
                "Back (${videos.size} videos)", color = Color.Black, fontWeight = FontWeight.Bold,
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 48.dp)
                    .clip(CircleShape).background(Accent).clickable { showPage = false }.padding(horizontal = 20.dp, vertical = 10.dp),
            )
        }
        // A video: their videos full screen, from that one.
        watching?.let { start ->
            val pager = rememberPagerState(initialPage = start) { videos.size }
            Box(Modifier.fillMaxSize().background(Color.Black)) {
                VideoPager(videos, Look(1f, 0.dp, 0.dp), pager, active = true)
                IconButton(onClick = { watching = null }, modifier = Modifier.statusBarsPadding().padding(4.dp)) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White)
                }
            }
        }
    }
}

@Composable
private fun Stat(n: Long?, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            if (n == null || n < 0) "–" else if (n < 10_000) "%,d".format(n) else if (n < 1_000_000) "%.1fK".format(n / 1000.0) else "%.1fM".format(n / 1_000_000.0),
            color = Color.White, fontWeight = FontWeight.Bold,
        )
        Text(label, color = Color.Gray, style = MaterialTheme.typography.bodySmall)
    }
}
