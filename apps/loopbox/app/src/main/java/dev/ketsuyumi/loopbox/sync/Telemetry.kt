package dev.ketsuyumi.loopbox.sync

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import dev.ketsuyumi.loopbox.data.Settings
import java.io.ByteArrayInputStream

/**
 * Settings › Privacy › Block telemetry: TikTok's (and Instagram's) logging, monitoring and
 * analytics requests from Loopbox's own pages get an empty answer instead of being sent.
 */
object Telemetry {
    private val hosts = Regex(
        """(^|\.)(mon|mon-va|mcs|mcs-va|log|log16|analytics|ads|business-api)[\w-]*\.(tiktok|tiktokv|tiktokw|byteoversea|ibytedtos|ttwstatic)\.(com|us)$""" +
            """|(^|\.)(graph|connect)\.facebook\.(com|net)$|(^|\.)google-analytics\.com$|(^|\.)doubleclick\.net$""",
    )
    private val paths = Regex("""/(web/report|monitor_browser|log/sentry|api/v1/report|ajax/bz|logging_client_events|falco|ads/)""")

    fun block(request: WebResourceRequest): WebResourceResponse? {
        if (!Settings.blockTelemetry) return null
        val url = request.url
        val host = url.host ?: return null
        if (!hosts.containsMatchIn(host) && !paths.containsMatchIn(url.path ?: "")) return null
        return WebResourceResponse("text/plain", "utf-8", 204, "No Content", emptyMap(), ByteArrayInputStream(ByteArray(0)))
    }
}
