package dev.ketsuyumi.loopbox.sync

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import dev.ketsuyumi.loopbox.data.Source
import dev.ketsuyumi.loopbox.data.Sound

/**
 * Pauses the page's own videos (we play them ourselves) and, while [more] is on, moves the feed
 * on like a person would: scroll down and press the down arrow, which makes TikTok load more.
 */
private const val FEED_JS = """
(function(){
  if (window.__loopboxFeed) return; window.__loopboxFeed = true;
  setInterval(function(){
    document.querySelectorAll('video').forEach(function(v){ v.muted = true; if (!v.paused) v.pause(); });
  }, 800);
  var t = null;
  window.__loopboxMore = function(on){
    if (t) { clearInterval(t); t = null; }
    if (on) t = setInterval(function(){
      document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true}));
      window.__loopboxScroll && window.__loopboxScroll(true);
      setTimeout(function(){ window.__loopboxScroll && window.__loopboxScroll(false); }, 1000);
    }, 1500);
  };
})();
"""

/**
 * The real TikTok page for a feed ([url]: For You or Following), laid out behind the app's own
 * feed (covered by it, so it can't be seen or touched). Its feed requests are picked up by the
 * page script (and the feed built into the page itself) and their videos passed to [onVideos].
 * Liked/saved/profile lists are left out. [onStatus]: what the page is doing, for the loading screen.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun LiveFeedWeb(
    url: String, more: Boolean, modifier: Modifier, onStatus: (String) -> Unit = {},
    /** A profile page: whose ([url] is tiktok.com/@name); its own posts are taken, and [onProfile] gets its details. */
    profileOf: String? = null, onProfile: (Extractor.Profile) -> Unit = {}, onWeb: (WebView?) -> Unit = {},
    onVideos: (List<Sound>) -> Unit,
) {
    val main = remember { Handler(Looper.getMainLooper()) }
    val deliver by rememberUpdatedState(onVideos)
    val report by rememberUpdatedState(onStatus)
    val profileTo by rememberUpdatedState(onProfile)
    var page by remember { mutableStateOf("") }
    var responses by remember { mutableStateOf(0) }
    var videos by remember { mutableStateOf(0) }
    fun status() = report(
        (if (page.isEmpty()) "Opening TikTok…" else "Page: " + page.removePrefix("https://").removePrefix("www.").substringBefore('?').take(40)) +
            " · $responses response${if (responses == 1) "" else "s"} · $videos video${if (videos == 1) "" else "s"}",
    )
    var web by remember { mutableStateOf<WebView?>(null) }
    // The feed's own request (For You: /api/recommend/item_list), to ask for more batches with.
    var feedRequest by remember { mutableStateOf<String?>(null) }
    // A profile: its videos are asked for directly (/api/post/item_list), 30 at a time, with the
    // settings the page's own requests use, when the page doesn't load them itself.
    var base by remember { mutableStateOf<String?>(null) }      // a TikTok API request's query, to reuse
    var secUid by remember { mutableStateOf<String?>(null) }
    var postCursor by remember { mutableStateOf("0") }
    var postsDone by remember { mutableStateOf(false) }
    var asked by remember { mutableStateOf<String?>(null) }
    val bridge = remember {
        object {
            @JavascriptInterface
            fun found(text: String, page: String, from: String): Boolean {
                val f = requestPath(from)
                main.post { responses++; status() }
                // The feed comes from the site's requests, or is built into the page ("embedded").
                // A profile: its details, and its own posts (/api/post/…), not suggestions.
                if (profileOf != null) {
                    Extractor.tiktokProfile(text, profileOf)?.let { p -> main.post { profileTo(p); if (p.secUid != null) secUid = p.secUid } }
                    if (from.startsWith("https://www.tiktok.com/api/")) {
                        val q = android.net.Uri.parse(from)
                        val kept = q.queryParameterNames.filter { it !in setOf("X-Bogus", "X-Gnarly", "_signature", "cursor", "count", "secUid", "id", "itemID", "coverFormat") }
                        val query = kept.joinToString("&") { k -> k + "=" + android.net.Uri.encode(q.getQueryParameter(k).orEmpty()) }
                        main.post { if (base == null) base = query }
                    }
                    if ("/post/item_list" in f) runCatching {
                        val j = org.json.JSONObject(text)
                        val has = j.optBoolean("hasMore") || j.optBoolean("has_more")
                        val c = j.opt("cursor")?.toString()
                        val n = j.optJSONArray("itemList")?.length() ?: 0
                        SyncLog.add("profile @$profileOf: $n videos, hasMore=$has")
                        main.post { if (c != null) postCursor = c; postsDone = !has }
                    }
                }
                if (!(from.startsWith("http") || f == "embedded") || "collect" in f || "favorite" in f) return true
                if (profileOf == null && "/post/" in f) return true
                if (profileOf == null && from.startsWith("http") && "item_list" in f) main.post { feedRequest = from }
                val found = Extractor.extractAll(Source.TIKTOK, text, page).videos
                    .filter { profileOf == null || it.user.equals(profileOf, ignoreCase = true) }
                if (found.isNotEmpty()) main.post { videos += found.size; status(); deliver(found) }
                return true
            }

            @JavascriptInterface
            fun log(m: String) = SyncLog.add(m)

            @JavascriptInterface fun paging(n: Int) {}
            @JavascriptInterface fun done(why: String) {}
        }
    }
    LaunchedEffect(more, web) { web?.evaluateJavascript("window.__loopboxMore && window.__loopboxMore($more)", null) }
    LaunchedEffect(profileOf, more, web, base, secUid, postCursor, postsDone) {
        val w = web ?: return@LaunchedEffect
        val b = base ?: return@LaunchedEffect
        val id = secUid ?: return@LaunchedEffect
        if (profileOf == null || !more || postsDone || asked == postCursor) return@LaunchedEffect
        // The first page: give the page a moment to load it itself.
        kotlinx.coroutines.delay(if (postCursor == "0") 3000 else 600)
        if (asked == postCursor) return@LaunchedEffect
        asked = postCursor
        val url = "https://www.tiktok.com/api/post/item_list/?$b&secUid=${android.net.Uri.encode(id)}&count=30&cursor=$postCursor&coverFormat=2"
        SyncLog.add("profile @$profileOf: asking for videos from $postCursor")
        w.evaluateJavascript("window.fetch(" + org.json.JSONObject.quote(url) + ", { credentials: 'include' })", null)
    }
    // Near the end: ask for the next batch the way the page does (its fetch signs the request; each
    // ask brings new videos), every few seconds until there are enough again. Scrolling stays as a backup.
    LaunchedEffect(more, web, feedRequest) {
        val w = web ?: return@LaunchedEffect
        val req = feedRequest ?: return@LaunchedEffect
        while (more) {
            w.evaluateJavascript(
                "(function(u){ try { var x = new URL(u); ['X-Bogus','X-Gnarly','_signature'].forEach(function(k){ x.searchParams.delete(k); });" +
                    " window.fetch(x.toString(), { credentials: 'include' }); } catch(e){} })(" + org.json.JSONObject.quote(req) + ")",
                null,
            )
            kotlinx.coroutines.delay(4000)
        }
    }
    LaunchedEffect(web) { onWeb(web) }
    DisposableEffect(url) { onDispose { onWeb(null); web?.destroy(); web = null } }
    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            SyncWebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.databaseEnabled = true
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true
                settings.mediaPlaybackRequiresUserGesture = true
                settings.userAgentString = DESKTOP_UA
                CookieManager.getInstance().setAcceptCookie(true)
                CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                addJavascriptInterface(bridge, "LoopboxBridge")
                val early = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
                if (early) {
                    WebViewCompat.addDocumentStartJavaScript(this, CAPTURE_JS, setOf("*"))
                    WebViewCompat.addDocumentStartJavaScript(this, FEED_JS, setOf("*"))
                }
                webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) = Telemetry.block(request)

                    override fun onPageStarted(view: WebView, u: String, favicon: android.graphics.Bitmap?) {
                        page = u; status()
                    }

                    override fun onPageFinished(view: WebView, u: String) {
                        page = u; status()
                        if (!early) { view.evaluateJavascript(CAPTURE_JS, null); view.evaluateJavascript(FEED_JS, null) }
                        view.evaluateJavascript("window.__loopboxMore && window.__loopboxMore($more)", null)
                    }
                }
                loadUrl(url)
                web = this
            }
        },
    )
}
