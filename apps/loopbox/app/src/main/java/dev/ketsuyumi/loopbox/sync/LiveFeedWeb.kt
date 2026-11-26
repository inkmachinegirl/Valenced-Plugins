package dev.ketsuyumi.loopbox.sync

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
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
 * page script and their videos passed to [onVideos]. Liked/saved/profile lists are left out.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun LiveFeedWeb(url: String, more: Boolean, modifier: Modifier, onVideos: (List<Sound>) -> Unit) {
    val main = remember { Handler(Looper.getMainLooper()) }
    val deliver by rememberUpdatedState(onVideos)
    var web by remember { mutableStateOf<WebView?>(null) }
    val bridge = remember {
        object {
            @JavascriptInterface
            fun found(text: String, page: String, from: String): Boolean {
                val f = from.lowercase()
                if (!f.startsWith("http") || "collect" in f || "favorite" in f || "/post/" in f) return true
                val videos = Extractor.extractAll(Source.TIKTOK, text, page).second
                if (videos.isNotEmpty()) main.post { deliver(videos) }
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
                addJavascriptInterface(bridge, "LoopboxBridge")
                val early = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
                if (early) {
                    WebViewCompat.addDocumentStartJavaScript(this, CAPTURE_JS, setOf("*"))
                    WebViewCompat.addDocumentStartJavaScript(this, FEED_JS, setOf("*"))
                }
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, u: String) {
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
