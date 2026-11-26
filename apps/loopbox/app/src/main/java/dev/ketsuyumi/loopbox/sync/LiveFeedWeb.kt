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
fun LiveFeedWeb(url: String, more: Boolean, modifier: Modifier, onStatus: (String) -> Unit = {}, onVideos: (List<Sound>) -> Unit) {
    val main = remember { Handler(Looper.getMainLooper()) }
    val deliver by rememberUpdatedState(onVideos)
    val report by rememberUpdatedState(onStatus)
    var page by remember { mutableStateOf("") }
    var responses by remember { mutableStateOf(0) }
    var videos by remember { mutableStateOf(0) }
    fun status() = report(
        (if (page.isEmpty()) "Opening TikTok…" else "Page: " + page.removePrefix("https://").removePrefix("www.").substringBefore('?').take(40)) +
            " · $responses response${if (responses == 1) "" else "s"} · $videos video${if (videos == 1) "" else "s"}",
    )
    var web by remember { mutableStateOf<WebView?>(null) }
    val bridge = remember {
        object {
            @JavascriptInterface
            fun found(text: String, page: String, from: String): Boolean {
                val f = from.lowercase()
                main.post { responses++; status() }
                // The feed comes from the site's requests, or is built into the page ("embedded").
                if (!(f.startsWith("http") || f == "embedded") || "collect" in f || "favorite" in f || "/post/" in f) return true
                val found = Extractor.extractAll(Source.TIKTOK, text, page).second
                if (found.isNotEmpty()) main.post { videos += found.size; status(); deliver(found) }
                return true
            }

            @JavascriptInterface fun paging(n: Int) {}
            @JavascriptInterface fun done(why: String) {}
        }
    }
    LaunchedEffect(more, web) { web?.evaluateJavascript("window.__loopboxMore && window.__loopboxMore($more)", null) }
    DisposableEffect(url) { onDispose { web?.destroy(); web = null } }
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
