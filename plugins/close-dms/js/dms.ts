import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

const S = () => Stores as any
const DM = 1

export interface Dm {
	id: string
	name: string
	username: string
	avatar: string | undefined
}

/** Your 1-on-1 DMs, in the DM list's order. Group DMs are left out: closing one leaves the group. */
export function listDms(): Dm[] {
	let ids: string[] = []
	try {
		ids = S().PrivateChannelSortStore?.getPrivateChannelIds?.() ?? []
	} catch {}
	if (!ids.length)
		ids = Object.keys(S().ChannelStore?.getMutablePrivateChannels?.() ?? {})
	const out: Dm[] = []
	for (const id of ids) {
		const c = S().ChannelStore?.getChannel?.(id)
		if (!c || c.type !== DM) continue
		const uid = c.recipients?.[0] ?? c.rawRecipients?.[0]?.id
		const u = uid ? S().UserStore?.getUser?.(uid) : undefined
		let avatar: string | undefined
		try {
			avatar = u?.getAvatarURL?.(undefined, 64, false)
		} catch {}
		out.push({
			id: String(id),
			name: String(
				u?.globalName ?? u?.global_name ?? u?.username ?? c.name ?? id,
			),
			username: String(u?.username ?? ''),
			avatar,
		})
	}
	return out
}

let closer: ((id: string) => unknown) | undefined
function closeFn(): ((id: string) => unknown) | undefined {
	if (closer) return closer
	try {
		const [mod] = lookupModule((withProps as any)('closePrivateChannel')) as any
		const host =
			typeof mod?.closePrivateChannel === 'function' ? mod : mod?.default
		if (typeof host?.closePrivateChannel === 'function')
			closer = id => host.closePrivateChannel(id)
	} catch {}
	return closer
}
export const canClose = () => !!closeFn()

/**
 * Closes each DM with Discord's own "Close DM" (closePrivateChannel), a moment apart so it reads
 * like tapping them one by one. Waits when Discord asks to slow down.
 */
export async function closeAll(
	ids: string[],
	onProgress: (done: number, failed: number) => void,
	cancelled: () => boolean,
): Promise<{ done: number; failed: number; lastError?: string }> {
	const close = closeFn()
	if (!close)
		return {
			done: 0,
			failed: ids.length,
			lastError: "Couldn't find Discord's Close DM",
		}
	let done = 0
	let failed = 0
	let lastError: string | undefined
	for (const id of ids) {
		if (cancelled()) break
		try {
			await close(id)
			done++
		} catch (e: any) {
			failed++
			lastError = e?.body?.message ?? e?.message ?? String(e)
			const wait = Number(e?.body?.retry_after)
			if (wait > 0) await new Promise(r => setTimeout(r, wait * 1000 + 250))
		}
		onProgress(done, failed)
		await new Promise(r => setTimeout(r, 900 + Math.random() * 600))
	}
	return { done, failed, lastError }
}
