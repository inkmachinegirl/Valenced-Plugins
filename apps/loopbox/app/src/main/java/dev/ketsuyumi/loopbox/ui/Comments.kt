package dev.ketsuyumi.loopbox.ui

import android.webkit.WebView
import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import dev.ketsuyumi.loopbox.data.Settings
import dev.ketsuyumi.loopbox.data.Sound
import dev.ketsuyumi.loopbox.sync.Extractor
import dev.ketsuyumi.loopbox.sync.LiveFeedWeb
import dev.ketsuyumi.loopbox.sync.SyncLog
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** The video whose comments are open (null: none). */
object CommentsOpen {
    var video by mutableStateOf<Sound?>(null)
}

/**
 * A video's comments in a sheet, like TikTok's. The video's own TikTok page is opened out of
 * sight in the sheet; it loads the comments (/api/comment/list) and they're read from there;
 * more are asked for (signed by the page) as you scroll.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun CommentsSheet() {
    val s = CommentsOpen.video ?: return
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val comments = remember(s.key) { mutableStateListOf<Extractor.Comment>() }
    var total by remember(s.key) { mutableStateOf(s.comments) }
    var cursor by remember(s.key) { mutableStateOf<String?>(null) }
    var hasMore by remember(s.key) { mutableStateOf(true) }
    var base by remember(s.key) { mutableStateOf<String?>(null) }
    var web by remember(s.key) { mutableStateOf<WebView?>(null) }
    var asked by remember(s.key) { mutableStateOf<String?>(null) }
    var waited by remember(s.key) { mutableStateOf(0) }
    val expanded = remember(s.key) { mutableStateListOf<String>() }
    val list = rememberLazyListState()
    val nearEnd by remember { derivedStateOf { (list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) > comments.size - 5 } }
    val id = s.key.substringAfter(':')
    val main = remember { android.os.Handler(android.os.Looper.getMainLooper()) }

    LaunchedEffect(s.key) { while (comments.isEmpty() && waited < 100) { delay(200); waited++ } }
    // More: the next page, signed by the page (and the first one if the page doesn't load it).
    LaunchedEffect(s.key, web, base, cursor, hasMore, nearEnd, waited > 20) {
        val w = web ?: return@LaunchedEffect
        val b = base ?: return@LaunchedEffect
        val c = cursor ?: if (waited > 20) "0" else return@LaunchedEffect
        if (!hasMore || !nearEnd || asked == c) return@LaunchedEffect
        asked = c
        val url = "https://www.tiktok.com/api/comment/list/?$b&aweme_id=$id&count=20&cursor=$c"
        w.evaluateJavascript("window.__loopboxFetch && window.__loopboxFetch(" + org.json.JSONObject.quote(url) + ", 'comments')", null)
    }

    val blockedWords = Settings.blockCommentWords.split(',').map { it.trim().lowercase() }.filter { it.isNotEmpty() }
    val blockedUsers = Settings.blockCommentUsers.split(',', '\n').map { it.trim().removePrefix("@").lowercase() }.filter { it.isNotEmpty() }
    val shown = comments.filter { c ->
        blockedWords.none { it in c.text.lowercase() } &&
            blockedUsers.none { it == c.user.lowercase() || it == c.name.lowercase() }
    }

    ModalBottomSheet(
        onDismissRequest = { CommentsOpen.video = null },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Color(0xFF121212),
    ) {
        Box(Modifier.fillMaxWidth().fillMaxHeight(0.75f)) {
            // The video's page, behind the list.
            LiveFeedWeb(
                s.pageUrl ?: "https://www.tiktok.com/", more = false, modifier = Modifier.fillMaxSize(),
                onWeb = { web = it },
                onRaw = { text, from ->
                    if (from.startsWith("https://www.tiktok.com/api/") && base == null) {
                        val q = android.net.Uri.parse(from)
                        val kept = q.queryParameterNames.filter { it !in setOf("X-Bogus", "X-Gnarly", "_signature", "cursor", "count", "aweme_id", "item_id", "secUid", "id") }
                        val query = kept.joinToString("&") { k -> k + "=" + android.net.Uri.encode(q.getQueryParameter(k).orEmpty()) }
                        main.post { if (base == null) base = query }
                    }
                    Extractor.tiktokComments(text)?.let { got ->
                        main.post {
                            val have = comments.map { it.id }.toHashSet()
                            comments.addAll(got.list.filter { it.id !in have })
                            cursor = got.cursor; hasMore = got.hasMore
                            if (got.total >= 0) total = got.total
                        }
                    }
                },
            ) { }
            Box(Modifier.fillMaxSize().background(Color(0xFF121212)))
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Spacer(Modifier.width(48.dp))
                    Text(
                        if (total >= 0) "%,d comments".format(total) else "Comments",
                        color = Color.White, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = { CommentsOpen.video = null }) { Icon(Icons.Filled.Close, "Close", tint = Color.White) }
                }
                if (comments.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    if (waited < 100) CircularProgressIndicator(color = Accent)
                    else Text("TikTok didn't send the comments.", color = Color.Gray)
                }
                LazyColumn(state = list, modifier = Modifier.fillMaxSize()) {
                    items(shown, key = { it.id }) { c ->
                        val long = c.text.length > 150 && Settings.longComments == "collapse" && c.id !in expanded
                        Row(
                            Modifier.fillMaxWidth()
                                .combinedClickable(
                                    onClick = { if (long) expanded.add(c.id) },
                                    onLongClick = {
                                        clipboard.setText(AnnotatedString(if (Settings.copyWithoutName) c.text else "${c.name}: ${c.text}"))
                                        Toast.makeText(context, "Comment copied", Toast.LENGTH_SHORT).show()
                                    },
                                )
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                        ) {
                            Box(Modifier.size(36.dp).clip(CircleShape).background(Surface2)) {
                                c.avatar?.let { AsyncImage(it, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
                            }
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    if (Settings.commentUsernames) "@${c.user}" else c.name.ifBlank { c.user },
                                    color = Color.Gray, style = MaterialTheme.typography.labelMedium,
                                )
                                Text(
                                    if (long) c.text.take(150) + "… More" else c.text,
                                    color = Color.White, style = MaterialTheme.typography.bodyMedium,
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    commentTime(c.time) + if (c.replies > 0) " · ${c.replies} repl${if (c.replies == 1L) "y" else "ies"}" else "",
                                    color = Color.Gray, style = MaterialTheme.typography.labelSmall,
                                )
                            }
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(start = 8.dp)) {
                                Icon(Icons.Filled.FavoriteBorder, null, tint = Color.Gray, modifier = Modifier.size(18.dp))
                                Text(if (c.likes > 0) "%,d".format(c.likes) else "", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                    if (comments.isNotEmpty() && shown.size < comments.size) item {
                        Text(
                            "${comments.size - shown.size} hidden by your comment filters", color = Color.Gray,
                            style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(14.dp),
                        )
                    }
                }
            }
        }
    }
    LaunchedEffect(s.key) { SyncLog.add("comments: opening " + (s.pageUrl ?: "?")) }
}

/** "25 Nov 2026, 14:03" (Settings › Exact comment time) or "2d". */
private fun commentTime(ms: Long): String {
    if (ms <= 0) return ""
    if (Settings.exactCommentTime) return SimpleDateFormat("d MMM yyyy, HH:mm", Locale.getDefault()).format(Date(ms))
    val m = (System.currentTimeMillis() - ms) / 60_000
    return when { m < 60 -> "${m.coerceAtLeast(1)}m"; m < 1440 -> "${m / 60}h"; m < 10080 -> "${m / 1440}d"; else -> "${m / 10080}w" }
}
