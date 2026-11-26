package dev.ketsuyumi.loopbox.sync

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import dev.ketsuyumi.loopbox.data.Library
import dev.ketsuyumi.loopbox.data.Source
import dev.ketsuyumi.loopbox.data.Sound
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

private const val DESKTOP_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

fun startUrl(source: Source) = when (source) {
    Source.TIKTOK -> "https://www.tiktok.com/login"
    Source.INSTAGRAM -> "https://www.instagram.com/accounts/login/"
}

fun howTo(source: Source) = when (source) {
    Source.TIKTOK -> "Log in, then open your profile › Favorites › Sounds. The rest of the list loads by itself; turn on Auto to import as it goes."
    Source.INSTAGRAM -> "Log in, then open your profile › Saved › Audio and scroll. Sounds are picked up as they load."
}

/**
 * Injected into every page before it runs: passes the site's own data to the app.
 * - fetch / XMLHttpRequest responses that mention a sound URL;
 * - the JSON embedded in the page (TikTok's rehydration data, Instagram's application/json
 *   scripts), on load and again every few seconds as the page changes;
 * - window.__loopboxScroll(true) scrolls the page by itself (Sync now).
 */
private val CAPTURE_JS = """
(function(){
  if (window.__loopbox) return; window.__loopbox = true;
  var KEYS = /playUrl|play_url|progressive_download_url/;
  function send(t, from){ try { if (t && t.length < 8e6 && KEYS.test(t)) { LoopboxBridge.found(t, location.href, from || ''); more(t, from); } } catch(e){} }
  // The saved list comes a page (~30) at a time. When a page says there's more, ask for the next
  // one straight away with the same request, so thousands of sounds don't need scrolling. The
  // site's own script signs the new request; old signatures are dropped first.
  var paged = {};
  function more(t, from){
    if (!/^https?:/.test(from || '') || !/collect|favorite|favourite|music_list|musiclist|saved|audio/i.test(from)) return;
    var j; try { j = JSON.parse(t); } catch(e){ return; }
    var has = j.hasMore || j.has_more || j.more_available;
    var c = j.cursor != null ? j.cursor : (j.max_cursor != null ? j.max_cursor : j.next_max_id);
    if (!has || c == null || c === '') return;
    var u; try { u = new URL(from, location.href); } catch(e){ return; }
    ['X-Bogus','X-Gnarly','_signature'].forEach(function(k){ u.searchParams.delete(k); });
    var name = u.searchParams.has('max_cursor') ? 'max_cursor' : (u.searchParams.has('max_id') || j.next_max_id != null ? 'max_id' : 'cursor');
    var key = u.pathname + '|' + c; if (paged[key]) return; paged[key] = 1;
    u.searchParams.set(name, String(c));
    try { LoopboxBridge.paging(Object.keys(paged).length); } catch(e){}
    setTimeout(function(){ var x = new XMLHttpRequest(); x.open('GET', u.toString()); x.withCredentials = true; x.send(); }, 600);
  }
  var f = window.fetch;
  if (f) window.fetch = function(input){ var u = typeof input === 'string' ? input : (input && input.url) || '';
    return f.apply(this, arguments).then(function(r){ try { r.clone().text().then(function(t){ send(t, r.url || u); }); } catch(e){} return r; }); };
  var s = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(){ var x = this; x.addEventListener('load', function(){ try { if (!x.responseType || x.responseType === 'text') send(x.responseText, x.responseURL); } catch(e){} }); return s.apply(this, arguments); };
  var seen = {};
  function scan(){
    var els = document.querySelectorAll('script[type="application/json"], script#__UNIVERSAL_DATA_FOR_REHYDRATION__, script#SIGI_STATE');
    for (var i = 0; i < els.length; i++){ var t = els[i].textContent || ''; var k = t.length + ':' + t.slice(0, 64); if (!seen[k]) { seen[k] = 1; send(t, 'embedded'); } }
  }
  document.addEventListener('DOMContentLoaded', scan); setInterval(scan, 3000);
  var timer = null;
  window.__loopboxScroll = function(on){
    if (timer) { clearInterval(timer); timer = null; }
    if (on) timer = setInterval(function(){ window.scrollTo(0, document.body.scrollHeight);
      var el = document.scrollingElement; var boxes = document.querySelectorAll('div');
      for (var i = 0; i < boxes.length; i++){ var b = boxes[i]; if (b.scrollHeight > b.clientHeight + 200 && b.clientHeight > 300) b.scrollTop = b.scrollHeight; }
    }, 1200);
  };
})();
""".trimIndent()

/**
 * The sync browser. [auto]: opened by "Sync now" on the page saved sounds were last found on,
 * scrolling by itself and importing new sounds as they appear.
 */
/**
 * Whether data from [from] (the request URL, or "embedded" for data in the page itself) on
 * [page] is the user's saved sounds, not a feed. The For You page carries the music of every
 * video in it, which isn't what was saved.
 */
fun isSavedList(source: Source, page: String, from: String): Boolean {
    val p = page.lowercase()
    val f = from.lowercase()
    return when (source) {
        Source.TIKTOK -> Regex("collect|favorite|favourite|music_list|musiclist|/music/list").containsMatchIn(f) ||
            (f == "embedded" && ("favorite" in p || "/music/" in p))
        Source.INSTAGRAM -> "/saved" in p || Regex("saved|collection|/audio/|music/").containsMatchIn(f)
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun SyncScreen(source: Source, auto: Boolean, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    val found = remember { mutableStateListOf<Sound>() }
    var page by remember { mutableStateOf("") }
    var autoScroll by remember { mutableStateOf(auto) }
    var onlySaved by remember { mutableStateOf(true) }
    var skipped by remember { mutableStateOf(0) }
    var imported by remember { mutableStateOf(0) }
    var pending by remember { mutableStateOf(0) }
    var pages by remember { mutableStateOf(0) }
    val gate = remember { Semaphore(4) }
    var done by remember { mutableStateOf(0) }
    var failed by remember { mutableStateOf(0) }
    var status by remember { mutableStateOf(howTo(source)) }
    var web by remember { mutableStateOf<WebView?>(null) }
    val main = remember { Handler(Looper.getMainLooper()) }

    // Imports never get dropped: each batch is added to the library at once, and its downloads
    // join a queue that runs a few at a time.
    fun import(list: List<Sound>) {
        if (list.isEmpty()) return
        val fresh = Library.addAll(list)
        found.removeAll { s -> list.any { it.key == s.key } }
        imported += fresh.size
        pending += fresh.size
        for (s in fresh) scope.launch {
            gate.withPermit { Downloader.download(s).onSuccess { done++ }.onFailure { failed++ } }
            pending--
        }
    }

    val bridge = remember {
        object {
            @JavascriptInterface
            fun paging(n: Int) {
                main.post { pages = n }
            }

            @JavascriptInterface
            fun found(text: String, url: String, from: String) {
                val sounds = Extractor.extract(source, text, url)
                if (sounds.isEmpty()) return
                main.post {
                    if (onlySaved && !isSavedList(source, url, from)) {
                        skipped += sounds.size
                        return@post
                    }
                    val have = Library.state.value.sounds.map { it.key }.toSet()
                    val new = sounds.filter { it.key !in have && found.none { f -> f.key == it.key } }
                    if (new.isEmpty()) return@post
                    found.addAll(new)
                    Library.setSyncPage(source, url)
                    if (autoScroll) import(new)
                }
            }
        }
    }

    BackHandler {
        val w = web
        if (w != null && w.canGoBack()) w.goBack() else onClose()
    }

    LaunchedEffect(autoScroll, web) {
        web?.evaluateJavascript("window.__loopboxScroll && window.__loopboxScroll($autoScroll)", null)
    }

    DisposableEffect(Unit) {
        onDispose {
            web?.evaluateJavascript("window.__loopboxScroll && window.__loopboxScroll(false)", null)
            web?.destroy()
        }
    }

    Column(Modifier.fillMaxSize().background(Color.Black)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onClose) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Close", tint = Color.White) }
            Column(Modifier.weight(1f)) {
                Text(
                    if (source == Source.TIKTOK) "Sync TikTok sounds" else "Sync Instagram audio",
                    style = MaterialTheme.typography.titleMedium, color = Color.White,
                )
                Text(page.removePrefix("https://").take(60), style = MaterialTheme.typography.bodySmall, color = Color.Gray, maxLines = 1)
            }
            IconButton(onClick = { web?.reload() }) { Icon(Icons.Filled.Refresh, "Reload", tint = Color.White) }
        }
        Box(Modifier.weight(1f)) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    WebView(ctx).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.mediaPlaybackRequiresUserGesture = true
                        // The desktop site (TikTok) is laid out wider than a phone; without these it
                        // drew nothing visible.
                        settings.useWideViewPort = true
                        settings.loadWithOverviewMode = true
                        settings.setSupportZoom(true)
                        settings.builtInZoomControls = true
                        settings.displayZoomControls = false
                        if (source == Source.TIKTOK) settings.userAgentString = DESKTOP_UA
                        Downloader.userAgent = settings.userAgentString
                        CookieManager.getInstance().setAcceptCookie(true)
                        CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                        addJavascriptInterface(bridge, "LoopboxBridge")
                        val early = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
                        if (early) WebViewCompat.addDocumentStartJavaScript(this, CAPTURE_JS, setOf("*"))
                        webChromeClient = WebChromeClient()
                        webViewClient = object : WebViewClient() {
                            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                                page = url
                                if (!early) view.evaluateJavascript(CAPTURE_JS, null)
                            }

                            override fun onPageFinished(view: WebView, url: String) {
                                page = url
                                if (!early) view.evaluateJavascript(CAPTURE_JS, null)
                                view.evaluateJavascript("window.__loopboxScroll && window.__loopboxScroll($autoScroll)", null)
                                CookieManager.getInstance().flush()
                            }
                        }
                        val saved = Library.state.value.syncPages[source]
                        loadUrl(if (auto && saved != null) saved else startUrl(source))
                        web = this
                    }
                },
            )
        }
        Column(Modifier.fillMaxWidth().background(Color(0xFF121212)).padding(12.dp)) {
            if (pending > 0) LinearProgressIndicator(Modifier.fillMaxWidth().padding(bottom = 8.dp))
            Text(
                when {
                    found.isNotEmpty() -> "Found ${found.size} new saved sound${if (found.size == 1) "" else "s"}" +
                        if (imported > 0) " · $imported imported" else ""
                    imported > 0 -> "Imported $imported" + if (pending > 0) " · downloading $pending" else " · all downloaded"
                    else -> status
                },
                color = Color.White, style = MaterialTheme.typography.bodyMedium,
            )
            if (pages > 0) Text(
                "Loading your whole list: page ${pages + 1}…",
                color = Color.Gray, style = MaterialTheme.typography.bodySmall,
            )
            if (failed > 0) Text(
                "$failed couldn't download; they still play online and retry from the library",
                color = Color.Gray, style = MaterialTheme.typography.bodySmall,
            )
            if (skipped > 0 && onlySaved) Text(
                "Skipped $skipped from feeds (not saved). Open your saved sounds page.",
                color = Color.Gray, style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.padding(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                FilterChip(selected = autoScroll, onClick = { autoScroll = !autoScroll }, label = { Text("Auto") })
                FilterChip(selected = onlySaved, onClick = { onlySaved = !onlySaved }, label = { Text("Only saved") })
                Spacer(Modifier.weight(1f))
                Button(enabled = found.isNotEmpty(), onClick = { import(found.toList()) }) {
                    Text(if (found.isEmpty()) "Import" else "Import ${found.size}")
                }
            }
        }
    }
}

