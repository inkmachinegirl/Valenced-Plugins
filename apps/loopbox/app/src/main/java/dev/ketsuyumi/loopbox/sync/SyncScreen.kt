package dev.ketsuyumi.loopbox.sync

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import dev.ketsuyumi.loopbox.data.Library
import dev.ketsuyumi.loopbox.data.Source

internal const val DESKTOP_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

/** The WebView's own user agent made to look like Chrome: no "; wv" and no "Version/4.0". */
fun chromeUa(webViewUa: String) = webViewUa.replace("; wv)", ")").replace(Regex("Version/\\S+ "), "")

fun startUrl(source: Source) = when (source) {
    Source.TIKTOK -> "https://www.tiktok.com/login"
    Source.INSTAGRAM -> "https://www.instagram.com/accounts/login/"
}

fun howTo(source: Source) = when (source) {
    Source.TIKTOK -> "Log in, then open your profile › Favorites › Sounds (and Posts for videos). The rest loads by itself. After that, Sync now on Home does it all in the background."
    Source.INSTAGRAM -> "Log in, then open your profile › Saved › Audio (and your saved reels). After that, Sync now on Home does it in the background."
}


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

/**
 * The sync browser: log in and open your saved sounds / videos once; everything found is added
 * to the library straight away (downloads run in the background service). [auto]: opened on the
 * page saved sounds were last found on, clicking through to them and scrolling by itself.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun SyncScreen(source: Source, auto: Boolean, onClose: () -> Unit) {
    var page by remember { mutableStateOf("") }
    var autoScroll by remember { mutableStateOf(auto) }
    var onlySaved by remember { mutableStateOf(true) }
    var pages by remember { mutableStateOf(0) }
    var counts by remember { mutableStateOf(Triple(0, 0, 0)) } // sounds, videos, skipped
    var loading by remember { mutableStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val progress by SyncService.progress.collectAsState()
    var web by remember { mutableStateOf<WebView?>(null) }
    val main = remember { Handler(Looper.getMainLooper()) }
    val importer = remember { Importer(context, source) { onlySaved } }

    val bridge = remember {
        object {
            @JavascriptInterface
            fun log(m: String) = SyncLog.add(m)

            @JavascriptInterface
            fun paging(n: Int) {
                main.post { pages = n }
            }

            @JavascriptInterface
            fun done(why: String) {
                main.post { if (why.startsWith("stuck")) error = "The site stopped answering after page ${pages + 1}. Scroll down to load the rest." }
            }

            @JavascriptInterface
            fun found(text: String, url: String, from: String): Boolean {
                val go = importer.take(text, url, from)
                if (from.startsWith("http") && (importer.sounds + importer.videos) > 0) main.post { Library.setSyncPage(source, url) }
                main.post { counts = Triple(importer.sounds, importer.videos, importer.skipped) }
                return go
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
        SyncService.listing(context, if (source == Source.TIKTOK) "TikTok" else "Instagram")
        onDispose {
            SyncService.listing(context, null)
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
                    if (source == Source.TIKTOK) "Sync TikTok" else "Sync Instagram",
                    style = MaterialTheme.typography.titleMedium, color = Color.White,
                )
                Text(page.removePrefix("https://").take(60), style = MaterialTheme.typography.bodySmall, color = Color.Gray, maxLines = 1)
            }
            IconButton(onClick = { web?.reload() }) { Icon(Icons.Filled.Refresh, "Reload", tint = Color.White) }
        }
        if (loading in 1..99) LinearProgressIndicator(progress = { loading / 100f }, modifier = Modifier.fillMaxWidth())
        error?.let {
            Text(it, color = Color(0xFFFF8A80), style = MaterialTheme.typography.bodySmall, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp))
        }
        Box(Modifier.weight(1f)) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    SyncWebView(ctx).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.databaseEnabled = true
                        settings.mediaPlaybackRequiresUserGesture = true
                        // The desktop site (TikTok) is laid out wider than a phone; without these it
                        // drew nothing visible.
                        settings.useWideViewPort = true
                        settings.loadWithOverviewMode = true
                        settings.setSupportZoom(true)
                        settings.builtInZoomControls = true
                        settings.displayZoomControls = false
                        // TikTok: the desktop site has the Favorites lists. Instagram: a plain mobile
                        // Chrome; it draws an empty page for an in-app browser ("; wv").
                        settings.userAgentString = when (source) {
                            Source.TIKTOK -> DESKTOP_UA
                            Source.INSTAGRAM -> chromeUa(settings.userAgentString)
                        }
                        Downloader.userAgent = settings.userAgentString
                        CookieManager.getInstance().setAcceptCookie(true)
                        CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                        addJavascriptInterface(bridge, "LoopboxBridge")
                        val early = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
                        if (early) WebViewCompat.addDocumentStartJavaScript(this, CAPTURE_JS, setOf("*"))
                        webChromeClient = object : WebChromeClient() {
                            override fun onProgressChanged(view: WebView, newProgress: Int) { loading = newProgress }
                        }
                        var drove = false
                        webViewClient = object : WebViewClient() {
                            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) = Telemetry.block(request)

                            override fun onReceivedError(view: WebView, request: WebResourceRequest, err: WebResourceError) {
                                if (request.isForMainFrame) error = "Couldn't load the page: ${err.description}. Tap reload."
                            }

                            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                                if (request.isForMainFrame && response.statusCode >= 400) error = "The site answered ${response.statusCode}. Tap reload."
                            }

                            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                                error = null
                                page = url
                                if (!early) view.evaluateJavascript(CAPTURE_JS, null)
                            }

                            override fun onPageFinished(view: WebView, url: String) {
                                page = url
                                if (!early) view.evaluateJavascript(CAPTURE_JS, null)
                                view.evaluateJavascript("window.__loopboxScroll && window.__loopboxScroll($autoScroll)", null)
                                if (auto && !drove && source == Source.TIKTOK) {
                                    drove = true
                                    view.evaluateJavascript("window.__loopboxDrive && window.__loopboxDrive('sounds')", null)
                                }
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
            if (progress.waiting > 0) LinearProgressIndicator(
                progress = { (progress.done + progress.failed).toFloat() / progress.queued.coerceAtLeast(1) },
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            )
            val (sounds, videos, skipped) = counts
            Text(
                if (sounds + videos == 0) howTo(source)
                else "Added $sounds sound${if (sounds == 1) "" else "s"}" +
                    (if (videos > 0) " and $videos video${if (videos == 1) "" else "s"}" else "") +
                    " · ${progress.done} of ${progress.queued} downloaded",
                color = Color.White, style = MaterialTheme.typography.bodyMedium,
            )
            if (pages > 0) Text(
                "Loading your whole list: page ${pages + 1}… You can leave the app, it keeps going.",
                color = Color.Gray, style = MaterialTheme.typography.bodySmall,
            )
            if (skipped > 0 && onlySaved) Text(
                "Skipped $skipped from feeds (not saved). Open your saved sounds or videos.",
                color = Color.Gray, style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.padding(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                FilterChip(selected = autoScroll, onClick = { autoScroll = !autoScroll }, label = { Text("Auto scroll") })
                FilterChip(selected = onlySaved, onClick = { onlySaved = !onlySaved }, label = { Text("Only saved") })
            }
        }
    }
}
