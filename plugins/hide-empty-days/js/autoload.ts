import { lookupModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

/**
 * Loading past hidden stretches: when the oldest loaded messages are (nearly) all ones that
 * aren't shown (ignored, blocked or hidden by another plugin), the next older page is loaded the
 * way Discord's own "Load more messages" does (MessageActionCreators.fetchMessages with `before`
 * the oldest loaded message), and again after that, until something visible turns up.
 */

const WINDOW = 50
const MIN_VISIBLE = 2
const MAX_IN_A_ROW = 20
const PAGE = 50

export const autoStatus = { loads: 0 }

let fetcher: ((opts: any) => unknown) | undefined
function fetchMessages(): ((opts: any) => unknown) | undefined {
	if (fetcher) return fetcher
	try {
		for (const [mod] of lookupModules(
			(withProps as any)('fetchMessages'),
			{} as any,
		) as any) {
			const host = typeof mod?.fetchMessages === 'function' ? mod : mod?.default
			// The message action creators also have sendMessage; other modules' fetchMessages aren't these.
			if (
				typeof host?.fetchMessages === 'function' &&
				typeof host?.sendMessage === 'function'
			) {
				fetcher = opts => host.fetchMessages(opts)
				break
			}
		}
	} catch {}
	return fetcher
}

/** Consecutive automatic loads per channel, and the oldest message each was asked for. */
const streak = new Map<string, { count: number; before?: string }>()

function oldestMessages(messages: any): any[] {
	let list: any[] = []
	try {
		list = messages?.toArray?.() ?? messages?._array ?? []
		if (!list.length && typeof messages?.forEach === 'function')
			messages.forEach((m: any) => list.push(m))
	} catch {}
	if (list.length < 2) return list.slice(0, WINDOW)
	// Oldest first, whatever order the store keeps.
	const t = (m: any) =>
		Number(m?.timestamp?.valueOf?.() ?? Date.parse(String(m?.timestamp)))
	if (t(list[0]) > t(list[list.length - 1])) list = [...list].reverse()
	return list.slice(0, WINDOW)
}

export function maybeLoadMore(props: any, stream: unknown[]) {
	const messages = props?.messages
	const channelId: string | undefined =
		props?.channel?.id ?? messages?.channelId
	if (!channelId || !messages?.hasMoreBefore || messages.loadingMore) return
	const visible = new Set<string>()
	for (const e of stream as any[])
		if (e?.rowType === 1 && e?.message?.id) visible.add(String(e.message.id))
	const oldest = oldestMessages(messages)
	if (!oldest.length) return
	const seen = oldest.filter(m => visible.has(String(m?.id))).length
	if (seen >= MIN_VISIBLE) {
		streak.delete(channelId)
		return
	}
	const before = String(oldest[0]?.id ?? '')
	const s = streak.get(channelId) ?? { count: 0 }
	// Already asked for this page, or loaded enough in a row.
	if (!before || s.before === before || s.count >= MAX_IN_A_ROW) return
	const fetch = fetchMessages()
	if (!fetch) return
	streak.set(channelId, { count: s.count + 1, before })
	autoStatus.loads++
	// Not in the middle of building the list.
	setTimeout(() => {
		try {
			fetch({ channelId, before, limit: PAGE })
		} catch {}
	}, 0)
}

export function resetAutoLoad() {
	streak.clear()
}
