/**
 * Discord's own "…is typing" line already skips blocked and ignored people
 * (useTypingUserIds checks RelationshipStore.isBlockedOrIgnored), but the typing data itself still
 * has them, so anything reading TypingStore directly (the DM list's dots, other plugins' typing
 * bubbles) shows them. This takes them out of TypingStore's answers.
 */

export interface Options {
	hidden: (userId: string) => boolean
}

/** Bumped when who is blocked or ignored changes, so cached answers are redone. */
let version = 0
export const bumpVersion = () => {
	version++
}

const cache = new WeakMap<
	object,
	{ version: number; out: Record<string, unknown> }
>()

/** The typing users of one channel ({ userId: timestamp }) without hidden people. Same object when nothing is removed. */
export function filterUsers(users: unknown, o: Options): unknown {
	if (!users || typeof users !== 'object') return users
	const hit = cache.get(users)
	if (hit && hit.version === version) return hit.out
	const record = users as Record<string, unknown>
	let out: Record<string, unknown> = record
	for (const id of Object.keys(record))
		if (o.hidden(id)) {
			if (out === record) out = { ...record }
			delete out[id]
		}
	cache.set(users, { version, out })
	return out
}

/** By server: { channelId: { userId: timestamp } }. */
export function filterByGuild(byChannel: unknown, o: Options): unknown {
	if (!byChannel || typeof byChannel !== 'object') return byChannel
	const hit = cache.get(byChannel)
	if (hit && hit.version === version) return hit.out
	const record = byChannel as Record<string, unknown>
	let out: Record<string, unknown> = record
	for (const [channelId, users] of Object.entries(record)) {
		const next = filterUsers(users, o)
		if (next !== users) {
			if (out === record) out = { ...record }
			if (next && typeof next === 'object' && Object.keys(next).length)
				out[channelId] = next
			else delete out[channelId]
		}
	}
	cache.set(byChannel, { version, out })
	return out
}
