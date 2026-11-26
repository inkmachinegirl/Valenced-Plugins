package dev.ketsuyumi.loopbox.sync

import android.content.Context
import android.view.View
import android.webkit.WebView
import dev.ketsuyumi.loopbox.data.Library
import dev.ketsuyumi.loopbox.data.Source

/**
 * What a request is for, from its path only ("embedded" stays as it is). The query can't be
 * used: TikTok's For You request has data_collection_enabled=true in it, which looked "saved".
 */
fun requestPath(from: String): String =
    if (from.startsWith("http")) runCatching { java.net.URI(from).path.orEmpty() }.getOrDefault(from.substringBefore('?')).lowercase()
    else from.lowercase()

/** Whether [url] is your profile (TikTok /@name, Instagram /name/saved): where background syncs start. */
fun isProfilePage(source: Source, url: String): Boolean {
    val p = requestPath(url)
    return when (source) {
        Source.TIKTOK -> p.startsWith("/@") && "/video/" !in p
        Source.INSTAGRAM -> "/saved" in p
    }
}

/** Saved videos taken in one sync at most (TikTok favorites can be tens of thousands). */
const val VIDEO_CAP = 1000

/**
 * Whether video posts from [from] on [page] are the user's saved ones: TikTok's Favorites
 * ("collect" requests), Instagram's Saved. Liked videos and feeds aren't.
 */
fun isSavedVideos(source: Source, page: String, from: String): Boolean {
    val f = requestPath(from)
    return when (source) {
        Source.TIKTOK -> "collect" in f
        Source.INSTAGRAM -> "/saved" in page.lowercase() || Regex("saved|collection").containsMatchIn(f)
    }
}

/**
 * Takes what a sync page found and adds it to the library: saved sounds (queued for download)
 * and saved videos. Remembers the list requests for background syncs. Called on the browser's
 * bridge thread. [take] answers whether to keep loading that list.
 */
class Importer(private val context: Context, private val source: Source, private val onlySaved: () -> Boolean = { true }) {
    @Volatile var sounds = 0; private set
    @Volatile var videos = 0; private set
    @Volatile var skipped = 0; private set
    private val hadVideos = Library.state.value.sounds.any { it.video && it.source == source }

    fun take(text: String, page: String, from: String): Boolean {
        val (s, v) = Extractor.extractAll(source, text, page)
        var go = true
        if (s.isNotEmpty()) {
            if (onlySaved() && !isSavedList(source, page, from)) skipped += s.size
            else {
                // Remember the first page's request: background syncs start from it.
                if (from.startsWith("http") && SyncLog.firstPage(from)) Library.setSyncApi(source, from)
                val fresh = Library.addAll(s)
                sounds += fresh.size
                SyncLog.add("${s.size} sounds, ${fresh.size} new (${SyncLog.short(from)})")
                SyncService.addFound(fresh.size)
                SyncService.enqueue(context, fresh.map { it.key })
            }
        }
        if (v.isNotEmpty()) {
            if (onlySaved() && !isSavedVideos(source, page, from)) skipped += v.size
            else {
                // Remember the first page's request: background syncs start from it.
                if (from.startsWith("http") && SyncLog.firstPage(from)) Library.setVideoApi(source, from)
                val fresh = Library.addAll(v)
                videos += fresh.size
                SyncLog.add("${v.size} videos, ${fresh.size} new (${SyncLog.short(from)})")
                SyncService.addFound(fresh.size)
                // Newest first: a page with nothing new means the rest is known already.
                if ((fresh.isEmpty() && hadVideos) || videos >= VIDEO_CAP) go = false
            }
        }
        return go
    }
}

/**
 * A WebView that keeps working when the app is in the background or has no window: Chromium
 * otherwise treats it as hidden and stops loading the list.
 */
class SyncWebView(context: Context) : WebView(context) {
    override fun onWindowVisibilityChanged(visibility: Int) = super.onWindowVisibilityChanged(View.VISIBLE)
}
