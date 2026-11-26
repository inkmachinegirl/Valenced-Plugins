package dev.ketsuyumi.loopbox.sync

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import dev.ketsuyumi.loopbox.MainActivity
import dev.ketsuyumi.loopbox.R
import dev.ketsuyumi.loopbox.data.Library
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentLinkedQueue

/** What the sync is doing, for the sync screen and the notification. */
data class SyncProgress(
    val listing: String? = null, // "TikTok" / "Instagram" while a sync page is open
    val found: Int = 0,          // sounds added to the library during this sync
    val queued: Int = 0,         // downloads asked for since the service started
    val done: Int = 0,
    val failed: Int = 0,
    val pages: Int = 0,
    val note: String? = null,   // how the last background sync ended
) {
    val waiting get() = (queued - done - failed).coerceAtLeast(0)
}

/**
 * Downloads sounds in the background with a notification showing progress, so a big sync keeps
 * going when you leave the app. It also keeps the app alive while the sync page is open, so the
 * page can keep loading your list behind other apps.
 */
class SyncService : Service() {
    companion object {
        private const val CHANNEL = "sync"
        private const val ID = 2
        private const val WORKERS = 4

        private val queue = ConcurrentLinkedQueue<String>()
        private val _progress = MutableStateFlow(SyncProgress())
        val progress: StateFlow<SyncProgress> = _progress.asStateFlow()

        @Volatile private var running = false

        /** Queue [keys] for download, starting the service if it isn't running. */
        fun enqueue(context: Context, keys: List<String>) {
            if (keys.isEmpty()) return
            queue.addAll(keys)
            _progress.update { it.copy(queued = it.queued + keys.size) }
            start(context)
        }

        /** Called when sounds are added by a sync (counts them in the notification). */
        fun addFound(n: Int) = _progress.update { it.copy(found = it.found + n) }

        /** The sync page opened ([source]) or closed (null). Opening starts the service. */
        fun listing(context: Context, source: String?) {
            _progress.update {
                when {
                    source == null || it.listing != null -> it.copy(listing = source)
                    // A new sync: fresh counts, but keep counting downloads still running.
                    it.waiting > 0 -> it.copy(listing = source, found = 0, pages = 0, note = null)
                    else -> SyncProgress(listing = source)
                }
            }
            if (source != null) start(context)
        }

        /**
         * "Sync now" in the background. Returns false when the sync page hasn't been used yet
         * (you have to log in there first).
         */
        fun syncNow(context: Context, source: dev.ketsuyumi.loopbox.data.Source): Boolean {
            val s = Library.state.value
            if (s.syncApis[source] == null && s.syncPages[source] == null) return false
            if (progress.value.listing != null) return true
            listing(context, if (source == dev.ketsuyumi.loopbox.data.Source.TIKTOK) "TikTok" else "Instagram")
            pendingSync = source
            context.startService(Intent(context, SyncService::class.java).setAction(ACTION_SYNC))
            return true
        }

        private const val ACTION_SYNC = "sync"
        @Volatile private var pendingSync: dev.ketsuyumi.loopbox.data.Source? = null

        private fun start(context: Context) {
            if (running) return
            running = true
            runCatching { ContextCompat.startForegroundService(context, Intent(context, SyncService::class.java)) }
                .onFailure { running = false }
        }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var busy = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Sync", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Progress while saved sounds are synced and downloaded"
            },
        )
        ServiceCompat.startForeground(
            this, ID, notification(progress.value),
            if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0,
        )
        repeat(WORKERS) { scope.launch { work() } }
        scope.launch { watch() }
    }

    private var background: BackgroundSync? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val source = pendingSync
        if (intent?.action == ACTION_SYNC && source != null && background == null) {
            pendingSync = null
            background = BackgroundSync(
                this, source,
                onPages = { n -> _progress.update { it.copy(pages = n) } },
                onEnd = { ok, sounds, videos ->
                    background = null
                    _progress.update {
                        it.copy(
                            listing = null,
                            note = if (!ok) "Couldn't load your lists. Open the sync page and log in again."
                            else "$sounds new sound${if (sounds == 1) "" else "s"}" +
                                if (videos > 0) ", $videos new video${if (videos == 1) "" else "s"}" else "",
                        )
                    }
                },
            ).also { it.start() }
        }
        return START_NOT_STICKY
    }

    private suspend fun work() {
        while (true) {
            val key = queue.poll()
            if (key == null) { delay(300); continue }
            synchronized(this) { busy++ }
            val sound = Library.sound(key)
            val ok = sound != null && (sound.file != null || Downloader.download(sound).isSuccess)
            _progress.update { if (ok) it.copy(done = it.done + 1) else it.copy(failed = it.failed + 1) }
            synchronized(this) { busy-- }
        }
    }

    /** Updates the notification, and stops once nothing is left to do. */
    private suspend fun watch() {
        val nm = getSystemService(NotificationManager::class.java)
        var idle = 0
        while (true) {
            delay(700)
            val p = progress.value
            val working = p.listing != null || queue.isNotEmpty() || synchronized(this) { busy } > 0
            idle = if (working) 0 else idle + 1
            if (idle >= 3) {
                // Leave a "finished" notification that can be swiped away.
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
                if (p.queued > 0 || p.note != null) nm.notify(ID + 1, notification(p, done = true))
                stopSelf()
                return
            }
            nm.notify(ID, notification(p))
        }
    }

    private fun notification(p: SyncProgress, done: Boolean = false): android.app.Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val title = when {
            p.listing != null -> "Syncing ${p.listing} · ${p.found} found"
            p.waiting > 0 -> "Downloading sounds · ${p.found} new"
            else -> "Sync finished" + (p.note?.let { " · $it" } ?: "")
        }
        val text = buildString {
            if (p.listing != null && p.pages > 0) append("Page ${p.pages + 1} · ")
            append("${p.done} of ${p.queued} downloaded")
            if (p.failed > 0) append(" · ${p.failed} failed")
        }
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_sync)
            .setContentTitle(title)
            .setContentText(text)
            .setOnlyAlertOnce(true)
            .setOngoing(!done)
            .setAutoCancel(done)
            .setSilent(true)
            .setContentIntent(open)
            .apply { if (!done) setProgress(p.queued.coerceAtLeast(1), p.done + p.failed, p.queued == 0) }
            .build()
    }

    override fun onDestroy() {
        background?.finish()
        running = false
        scope.cancel()
        super.onDestroy()
    }
}
