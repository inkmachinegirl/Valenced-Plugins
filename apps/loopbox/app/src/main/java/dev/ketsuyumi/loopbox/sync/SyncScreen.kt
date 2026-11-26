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

private const val DESKTOP_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

fun startUrl(source: Source) = when (source) {
    Source.TIKTOK -> "https://www.tiktok.com/login"
    Source.INSTAGRAM -> "https://www.instagram.com/accounts/login/"
}

fun howTo(source: Source) = when (source) {
    Source.TIKTOK -> "Log in, then open your profile › Favorites › Sounds and scroll. Sounds are picked up as they load."
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
  function send(t){ try { if (t && t.length < 8e6 && KEYS.test(t)) LoopboxBridge.found(t, location.href); } catch(e){} }
  var f = window.fetch;
  if (f) window.fetch = function(){ return f.apply(this, arguments).then(function(r){ try { r.clone().text().then(send); } catch(e){} return r; }); };
  var o = XMLHttpRequest.prototype.open, s = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(){ var x = this; x.addEventListener('load', function(){ try { if (!x.responseType || x.responseType === 'text') send(x.responseText); } catch(e){} }); return s.apply(this, arguments); };
  var seen = {};
  function scan(){
    var els = document.querySelectorAll('script[type="application/json"], script#__UNIVERSAL_DATA_FOR_REHYDRATION__, script#SIGI_STATE');
    for (var i = 0; i < els.length; i++){ var t = els[i].textContent || ''; var k = t.length + ':' + t.slice(0, 64); if (!seen[k]) { seen[k] = 1; send(t); } }
  }
  document.addEventListener('DOMContentLoaded', scan); setInterval(scan, 3000);
  var timer = null;
  window.__loopboxScroll = function(on){
    if (timer) { clearInterval(timer); timer = null; }
    if (on) timer = setInterval(function(){ window.scrollBy(0, window.innerHeight * 0.9);
      var el = document.scrollingElement; var boxes = document.querySelectorAll('div');
      for (var i = 0; i < boxes.length; i++){ var b = boxes[i]; if (b.scrollHeight > b.clientHeight + 200 && b.clientHeight > 300) b.scrollTop += b.clientHeight * 0.9; }
    }, 1200);
  };
})();
""".trimIndent()

/**
 * The sync browser. [auto]: opened by "Sync now" on the page saved sounds were last found on,
 * scrolling by itself and importing new sounds as they appear.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun SyncScreen(source: Source, auto: Boolean, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    val found = remember { mutableStateListOf<Sound>() }
    var page by remember { mutableStateOf("") }
    var autoScroll by remember { mutableStateOf(auto) }
    var importing by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf(0) }
    var failed by remember { mutableStateOf(0) }
    var status by remember { mutableStateOf(howTo(source)) }
    var web by remember { mutableStateOf<WebView?>(null) }
    val main = remember { Handler(Looper.getMainLooper()) }

    fun import(list: List<Sound>) {
        if (list.isEmpty() || importing) return
        importing = true
        scope.launch {
            val fresh = Library.addAll(list)
            found.removeAll { s -> list.any { it.key == s.key } }
            for (s in fresh) {
                Downloader.download(s).onSuccess { done++ }.onFailure { failed++ }
            }
            status = "Imported ${fresh.size} new sound${if (fresh.size == 1) "" else "s"}" +
                if (failed > 0) " ($failed couldn't download yet; they'll retry from the library)" else ""
            importing = false
        }
    }

    val bridge = remember {
        object {
            @JavascriptInterface
            fun found(text: String, url: String) {
                val sounds = Extractor.extract(source, text, url)
                if (sounds.isEmpty()) return
                main.post {
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
            if (importing) LinearProgressIndicator(Modifier.fillMaxWidth().padding(bottom = 8.dp))
            Text(
                if (found.isNotEmpty()) "Found ${found.size} new sound${if (found.size == 1) "" else "s"}" else status,
                color = Color.White, style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.padding(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                FilterChip(selected = autoScroll, onClick = { autoScroll = !autoScroll }, label = { Text("Auto-scroll & import") })
                Spacer(Modifier.weight(1f))
                Button(enabled = found.isNotEmpty() && !importing, onClick = { import(found.toList()) }) {
                    Text(if (found.isEmpty()) "Import" else "Import ${found.size}")
                }
            }
            if (done > 0) Text("$done downloaded this time", color = Color.Gray, style = MaterialTheme.typography.bodySmall)
        }
    }
}

