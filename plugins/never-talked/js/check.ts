import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import type { Answer } from './list'

/**
 * Whether someone ever talked in a server: Discord's server message search with author_id
 * (what "from: them" does), which reports total_results. One search at a time, a few seconds
 * apart with some randomness, people seen most recently first, and answers kept: "talked" for
 * good, "never" for a week.
 */

const GAP_MS = 3000
const JITTER_MS = 1500
const NEVER_TTL = 7 * 864e5
const QUEUE_MAX = 200

export interface Store {
	get(key: string): { a: 0 | 1; t: number } | undefined
	put(key: string, a: 0 | 1): void
}

let http: any
function getHttp() {
	if (http) return http
	try {
		const [mod] = lookupModule(
			(withProps as any)('getAPIBaseURL', 'get'),
		) as any
		http = mod?.get ? mod : mod?.default
	} catch {}
	return http
}

export const checkStatus = { searched: 0, waitingFor: 0, lastError: '' }

export function createChecker(store: Store, onAnswer: () => void) {
	const queue: string[] = []
	const queued = new Set<string>()
	let timer: any
	let busy = false
	let stopped = false
	let pauseUntil = 0

	const answer = (guildId: string, userId: string): Answer => {
		const hit = store.get(`${guildId}:${userId}`)
		if (!hit) return undefined
		if (hit.a === 1) return 'talked'
		// A week-old "never" still shows while it's being checked again.
		return 'never'
	}
	const fresh = (guildId: string, userId: string) => {
		const hit = store.get(`${guildId}:${userId}`)
		return !!hit && (hit.a === 1 || Date.now() - hit.t < NEVER_TTL)
	}

	const schedule = (ms: number) => {
		if (timer || stopped || !queue.length) return
		timer = setTimeout(run, ms)
	}

	async function run() {
		timer = undefined
		if (busy || stopped) return
		const wait = pauseUntil - Date.now()
		if (wait > 0) return schedule(wait)
		// Most recently seen first: that's who is on screen.
		const key = queue.pop()
		checkStatus.waitingFor = queue.length
		if (!key) return
		queued.delete(key)
		const [guildId, userId] = key.split(':')
		if (fresh(guildId!, userId!)) return schedule(0)
		busy = true
		try {
			const res = await getHttp()?.get?.({
				url: `/guilds/${guildId}/messages/search`,
				query: { author_id: userId, include_nsfw: true },
				retries: 0,
			})
			if (res?.status === 202 || res?.body?.total_results === undefined) {
				// The search index is still building: try this one later.
				pauseUntil = Date.now() + 15000
			} else {
				checkStatus.searched++
				store.put(key, res.body.total_results > 0 ? 1 : 0)
				onAnswer()
			}
		} catch (e: any) {
			checkStatus.lastError = e?.body?.message ?? e?.message ?? String(e)
			const retry = Number(e?.body?.retry_after)
			pauseUntil = Date.now() + (retry > 0 ? retry * 1000 + 500 : 30000)
			// No permission to search there: never mark anyone for it.
			if (e?.status === 403) store.put(key, 1)
		} finally {
			busy = false
			schedule(GAP_MS + Math.random() * JITTER_MS)
		}
	}

	return {
		answer,
		/** Someone appeared in a member list: check them when it's their turn. */
		seen(guildId: string, userId: string) {
			const key = `${guildId}:${userId}`
			if (fresh(guildId, userId) || queued.has(key)) return
			queued.add(key)
			queue.push(key)
			while (queue.length > QUEUE_MAX) queued.delete(queue.shift()!)
			checkStatus.waitingFor = queue.length
			schedule(GAP_MS)
		},
		stop() {
			stopped = true
			clearTimeout(timer)
			queue.length = 0
			queued.clear()
		},
	}
}
