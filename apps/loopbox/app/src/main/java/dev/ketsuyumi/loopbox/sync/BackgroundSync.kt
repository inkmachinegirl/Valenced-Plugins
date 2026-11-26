package dev.ketsuyumi.loopbox.sync

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import dev.ketsuyumi.loopbox.data.Library
import dev.ketsuyumi.loopbox.data.Source

/**
 * "Sync now" without a screen: a hidden browser, logged in with the same cookies as the sync
 * page, opens the site and asks for the saved list with the request remembered from the last
 * sync; the page script follows it page by page. New sounds go to the library and the download
 * queue. Ends when the list says there's no more, or nothing has come for a while.
 */
class BackgroundSync(
    private val context: Context,
    private val source: Source,
    private val api: String,
    private val onFound: (added: Int, pages: Int) -> Unit,
    private val onEnd: (ok: Boolean) -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())
    private var web: WebView? = null
    private var pages = 0
    private var lastNews = System.currentTimeMillis()
    private var ended = false
    private var gotAny = false

    private val bridge = object {
        @JavascriptInterface
        fun found(text: String, url: String, from: String) {
            val sounds = Extractor.extract(source, text, url)
            if (sounds.isEmpty() || !isSavedList(source, url, from)) return
            main.post {
                gotAny = true
                lastNews = System.currentTimeMillis()
                val fresh = Library.addAll(sounds)
                SyncService.enqueue(context, fresh.map { it.key })
                onFound(fresh.size, pages)
            }
        }

        @JavascriptInterface
        fun paging(n: Int) {
            main.post { pages = n; lastNews = System.currentTimeMillis(); onFound(0, n) }
        }

        @JavascriptInterface
        fun done() {
            main.post { finish(gotAny) }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    fun start() {
        val w = WebView(context.applicationContext)
        web = w
        w.settings.javaScriptEnabled = true
        w.settings.domStorageEnabled = true
        w.settings.userAgentString = when (source) {
            Source.TIKTOK -> DESKTOP_UA
            Source.INSTAGRAM -> chromeUa(w.settings.userAgentString)
        }
        Downloader.userAgent = w.settings.userAgentString
        CookieManager.getInstance().setAcceptCookie(true)
        w.addJavascriptInterface(bridge, "LoopboxBridge")
        val early = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        if (early) WebViewCompat.addDocumentStartJavaScript(w, CAPTURE_JS, setOf("*"))
        var asked = false
        w.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                if (!early) view.evaluateJavascript(CAPTURE_JS, null)
                if (asked) return
                asked = true
                // Give the site's own scripts a moment to load (they sign the requests).
                main.postDelayed({
                    view.evaluateJavascript("window.__loopboxList && window.__loopboxList(${org.json.JSONObject.quote(api)})", null)
                }, 4000)
            }
        }
        val home = Library.state.value.syncPages[source] ?: when (source) {
            Source.TIKTOK -> "https://www.tiktok.com/"
            Source.INSTAGRAM -> "https://www.instagram.com/"
        }
        w.loadUrl(home)
        watchdog()
    }

    private fun watchdog() {
        main.postDelayed({
            if (ended) return@postDelayed
            // Nothing new for 45 s (or never started): stop.
            if (System.currentTimeMillis() - lastNews > 45_000) finish(gotAny) else watchdog()
        }, 5000)
    }

    fun finish(ok: Boolean) {
        if (ended) return
        ended = true
        web?.stopLoading()
        web?.destroy()
        web = null
        onEnd(ok)
    }
}
