/** ChannelListGuildActionRow.GUILD_NEW_MEMBER_ACTIONS_PROGRESS_BAR, the "Get Started" bar. */
export const GET_STARTED = 'guild-new-member-actions-progress-bar'

const cache = new WeakMap<object, unknown[]>()

/**
 * The server's action rows (Server Guide, Channels & Roles, Boosts, …) without the Get Started
 * progress bar. The same filtered array is handed back for the same input, so the channel list
 * isn't rebuilt.
 */
export function withoutGetStarted(rows: unknown): unknown {
	if (!Array.isArray(rows) || !rows.includes(GET_STARTED)) return rows
	let out = cache.get(rows)
	if (!out) {
		out = rows.filter(r => r !== GET_STARTED)
		cache.set(rows, out)
	}
	return out
}
