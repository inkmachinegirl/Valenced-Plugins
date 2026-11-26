package dev.ketsuyumi.loopbox.sync

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import dev.ketsuyumi.loopbox.data.Library
import dev.ketsuyumi.loopbox.data.Source
import org.json.JSONObject

/**
 * "Sync now" without a screen: a hidden browser, logged in with the same cookies as the sync
 * page, opens the site and loads the saved sounds, then the saved videos.
 *
 * Each list: if its request is remembered from an earlier sync, it's asked for from the first page
 * and followed page by page. If there's none yet, or the site stops answering, the page clicks
 * Favorites › Sounds / Posts itself and keeps scrolling, so the site loads the list on its own.
 * A list ends when it says there's no more, or nothing has come for a minute.
 */
class BackgroundSync(
    private val context: Context,
    private val source: Source,
    private val onPages: (Int) -> Unit,
    private val onEnd: (ok: Boolean, sounds: Int, videos: Int) -> Unit,
) {
    private enum class Phase(val drive: String) { SOUNDS("sounds"), VIDEOS("videos") }

    private val main = Handler(Looper.getMainLooper())
    private val importer = Importer(context, source)
    private var web: WebView? = null
    private var phase = Phase.SOUNDS
    private var drove = false
    private var pages = 0
    private var lastNews = System.currentTimeMillis()
    private var ended = false

    private val bridge = object {
        @JavascriptInterface
        fun found(text: String, url: String, from: String): Boolean {
            val before = importer.sounds + importer.videos
            val go = importer.take(text, url, from)
            if (importer.sounds + importer.videos > before) main.post { lastNews = System.currentTimeMillis() }
            return go
        }

        @JavascriptInterface
        fun paging(n: Int) {
            main.post { pages++; lastNews = System.currentTimeMillis(); onPages(pages) }
        }

        @JavascriptInterface
        fun done(why: String) {
            main.post { listEnded(stuck = why.startsWith("stuck")) }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    fun start() {
        val w = SyncWebView(context.applicationContext)
        web = w
        // No window: give it a phone-sized page so the site lays out and scrolls.
        w.measure(View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(2400, View.MeasureSpec.EXACTLY))
        w.layout(0, 0, 1080, 2400)
        w.settings.javaScriptEnabled = true
        w.settings.domStorageEnabled = true
        w.settings.databaseEnabled = true
        w.settings.useWideViewPort = true
        w.settings.loadWithOverviewMode = true
        w.settings.userAgentString = when (source) {
            Source.TIKTOK -> DESKTOP_UA
            Source.INSTAGRAM -> chromeUa(w.settings.userAgentString)
        }
        Downloader.userAgent = w.settings.userAgentString
        CookieManager.getInstance().setAcceptCookie(true)
        w.addJavascriptInterface(bridge, "LoopboxBridge")
        val early = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        if (early) WebViewCompat.addDocumentStartJavaScript(w, CAPTURE_JS, setOf("*"))
        var begun = false
        w.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) = Telemetry.block(request)

            override fun onPageFinished(view: WebView, url: String) {
                if (!early) view.evaluateJavascript(CAPTURE_JS, null)
                if (begun) return
                begun = true
                // Give the site's own scripts a moment to load (they sign the requests).
                main.postDelayed({ beginList() }, 4000)
            }
        }
        val home = Library.state.value.syncPages[source] ?: when (source) {
            Source.TIKTOK -> "https://www.tiktok.com/profile"
            Source.INSTAGRAM -> "https://www.instagram.com/"
        }
        w.loadUrl(home)
        watchdog()
    }

    private fun beginList() {
        if (ended) return
        drove = false
        lastNews = System.currentTimeMillis()
        val apis = Library.state.value.let { if (phase == Phase.SOUNDS) it.syncApis else it.videoApis }
        val api = apis[source]
        if (api != null) js("window.__loopboxList && window.__loopboxList(${JSONObject.quote(api)})")
        else drive()
    }

    private fun drive() {
        drove = true
        lastNews = System.currentTimeMillis()
        js("window.__loopboxDrive && window.__loopboxDrive('${phase.drive}')")
    }

    private fun listEnded(stuck: Boolean) {
        if (ended) return
        if (stuck && !drove) { drive(); return }
        js("window.__loopboxScroll && window.__loopboxScroll(false)")
        if (phase == Phase.SOUNDS) { phase = Phase.VIDEOS; beginList() } else finish()
    }

    private fun js(code: String) = web?.evaluateJavascript(code, null)

    private fun watchdog() {
        main.postDelayed({
            if (ended) return@postDelayed
            // Nothing new for a minute: this list is done (or can't be loaded).
            // If the remembered request went quiet, try clicking through first.
            if (System.currentTimeMillis() - lastNews > 60_000) { if (!drove) drive() else listEnded(stuck = false) }
            watchdog()
        }, 5000)
    }

    fun finish() {
        if (ended) return
        ended = true
        web?.stopLoading()
        web?.destroy()
        web = null
        onEnd(importer.sounds + importer.videos > 0 || Library.state.value.syncApis[source] != null, importer.sounds, importer.videos)
    }
}
