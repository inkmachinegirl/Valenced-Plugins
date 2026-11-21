/**
 * The chat list is built by createChannelStream as one entry per row: messages, the
 * "N blocked / ignored messages" bars, and separators whose rowType is a SeparatorType string
 * ("day", "unread", "summary", "conversation"). A day's date line is added when the day changes at
 * a message, even a message that ends up not shown, so days nobody visible talked on still get a
 * line. This keeps a date line only if its day has something drawn under it.
 */

/** RowGeneratorConstants.RowType */
const MESSAGE = 1
const BLOCKED_GROUP = 2
const EMBEDDED_ACTIVITY = 5
const IGNORED_GROUP = 6
const SUSPENDED_USER_GROUP = 7
const HIDDEN_BARS = new Set([
	BLOCKED_GROUP,
	IGNORED_GROUP,
	SUSPENDED_USER_GROUP,
])

export const isDay = (e: any) => e?.rowType === 'day'

/** Whether an entry shows something that was said. */
function isContent(e: any, barsCount: boolean): boolean {
	const t = e?.rowType
	if (t === MESSAGE || t === EMBEDDED_ACTIVITY) return true
	if (HIDDEN_BARS.has(t)) return barsCount
	// Unknown kinds with a message on them count as content, to be safe.
	return typeof t !== 'string' && !!e?.message && !HIDDEN_BARS.has(t)
}

const timeOf = (e: any): number => {
	const ts = e?.message?.timestamp
	const n =
		typeof ts?.valueOf === 'function'
			? Number(ts.valueOf())
			: Date.parse(String(ts))
	return Number.isFinite(n) ? n : Number.NaN
}

/**
 * True when the list runs newest first (a date line then comes after its day's rows), false when
 * oldest first (before them). Undefined when there are fewer than two dated messages.
 */
export function newestFirst(items: any[]): boolean | undefined {
	let first = Number.NaN
	let last = Number.NaN
	for (const e of items) {
		const t = timeOf(e)
		if (Number.isNaN(t)) continue
		if (Number.isNaN(first)) first = t
		last = t
	}
	if (Number.isNaN(first) || first === last) return undefined
	return first > last
}

export function withoutEmptyDays(
	items: unknown,
	hideBarsOnly: boolean,
): unknown {
	if (!Array.isArray(items) || !items.some(isDay)) return items
	const newest = newestFirst(items)
	if (newest === undefined) return items
	const barsCount = !hideBarsOnly
	const drop = new Set<number>()
	if (newest) {
		// A day's rows come before its line.
		let seen = false
		for (let i = 0; i < items.length; i++) {
			if (isDay(items[i])) {
				if (!seen) drop.add(i)
				seen = false
			} else if (isContent(items[i], barsCount)) seen = true
		}
	} else {
		// A day's rows come after its line.
		let seen = false
		for (let i = items.length - 1; i >= 0; i--) {
			if (isDay(items[i])) {
				if (!seen) drop.add(i)
				seen = false
			} else if (isContent(items[i], barsCount)) seen = true
		}
	}
	return drop.size ? items.filter((_, i) => !drop.has(i)) : items
}
