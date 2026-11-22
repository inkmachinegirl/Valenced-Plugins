/**
 * Voice messages: hiding them per server (or DM), and a mic badge with how many each person sent
 * this hour, in the pill next to their name (the server-tag pill: clanTag + clanBadgeUrl).
 */

/** MessageFlags.IS_VOICE_MESSAGE */
const VOICE = 1 << 13
/** A 48 px white mic (drawn for this plugin). */
export const MIC =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAABU0lEQVR42u2ZURHDIAyGKwEJkYSESqiEOUACEiqhEpCABCSwPrBbjwMGNOnoNbnLy8aAr9DkTzZ576c7+8QADMAADBA77K52N/5rJnwGowPMuzufNxfGDAkw+3qbRwOAH08+dRIwEoDy7aZGAjAdAGYkgF5jAAZggAsAtsOC2wUANesxAAMwQCeAu0BKOGyAWKgJQjEnWgVfDcASTSoJ5bSMxi0YABBNqgkLGh2NA6xMbConPlNSQo/c7i0XV4Kifu0pO1t0h6WqaxMPyFKIOZm4EhJh86fmbV1MI3cYUi++ppTTIpO01sYuAyTu/OddEdT1gChkXh2OX2R+JzOn2LX5MwWNKGzkGDK34L+SnO7ZPEZFJhPRqcXs2UCAGQZbBJ3BCsMUneklJC0XXScVvkPtUFP27pt0PQM8FeBVcBtFm9LYvwFgGQM8FoD/J2aAuwO8AWFE9XMFOH0SAAAAAElFTkSuQmCC'

export const isVoice = (m: any): boolean => {
	try {
		if (typeof m?.hasFlag === 'function') return !!m.hasFlag(VOICE)
		return ((Number(m?.flags) || 0) & VOICE) !== 0
	} catch {
		return false
	}
}

const timeOf = (m: any) => {
	const t = m?.timestamp
	const n =
		typeof t?.valueOf === 'function'
			? Number(t.valueOf())
			: Date.parse(String(t))
	return Number.isFinite(n) ? n : Number.NaN
}

/**
 * The chat list without voice messages. When a hidden message was the first of someone's run
 * (the one with their name), their next message takes the name instead.
 */
export function withoutVoice(items: unknown): unknown {
	if (!Array.isArray(items)) return items
	const msgIdx: number[] = []
	for (let i = 0; i < items.length; i++)
		if (items[i]?.rowType === 1 && items[i]?.message) msgIdx.push(i)
	if (!msgIdx.some(i => isVoice(items[i].message))) return items
	// Oldest to newest, whichever way the list runs.
	const first = timeOf(items[msgIdx[0]!].message)
	const last = timeOf(items[msgIdx[msgIdx.length - 1]!].message)
	const ordered = first > last ? [...msgIdx].reverse() : msgIdx
	const drop = new Set<number>()
	const promote = new Set<number>()
	let pendingHeader: string | undefined
	for (const i of ordered) {
		const e = items[i]
		const author = String(e.message?.author?.id ?? '')
		if (isVoice(e.message)) {
			drop.add(i)
			if (e.isFirst) pendingHeader = author
			continue
		}
		if (pendingHeader !== undefined) {
			if (pendingHeader === author && !e.isFirst) promote.add(i)
			pendingHeader = undefined
		}
	}
	const out: unknown[] = []
	for (let i = 0; i < items.length; i++) {
		if (drop.has(i)) continue
		// Changeset.UPDATE, so the row is drawn again with the name.
		out.push(
			promote.has(i) ? { ...items[i], isFirst: true, changeType: 2 } : items[i],
		)
	}
	return out
}

/** Voice messages per author in a channel during the current clock hour. Cached per channel. */
const counts = new Map<string, { key: string; byAuthor: Map<string, number> }>()

export function voiceCounts(
	channelId: string,
	messages: any[],
): Map<string, number> {
	const now = new Date()
	const hourStart = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		now.getHours(),
	).getTime()
	const newest = messages.length
		? String(messages[messages.length - 1]?.id)
		: ''
	const key = `${hourStart}:${messages.length}:${newest}`
	const hit = counts.get(channelId)
	if (hit && hit.key === key) return hit.byAuthor
	const byAuthor = new Map<string, number>()
	for (const m of messages) {
		if (!isVoice(m) || timeOf(m) < hourStart) continue
		const a = String(m?.author?.id ?? '')
		if (a) byAuthor.set(a, (byAuthor.get(a) ?? 0) + 1)
	}
	counts.set(channelId, { key, byAuthor })
	return byAuthor
}

/** Puts the mic and count in the row's name pill. Returns the row unchanged when there's nothing to show. */
export function badgeRow(row: any, count: number, guildId: string | null): any {
	if (!count || !row?.message || typeof row.message !== 'object') return row
	return {
		...row,
		message: {
			...row.message,
			clanTag: String(count),
			clanBadgeUrl: MIC,
			clanTagGuildId: guildId,
		},
	}
}
