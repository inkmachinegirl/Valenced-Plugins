/** ChannelListGuildActionRow.GUILD_HOME, the Server Guide row. */
export const GUILD_HOME = '@home'

const cache = new WeakMap<object, unknown[]>()

/**
 * The server's action rows (Server Guide, Channels & Roles, Boosts, …) without Server Guide. The
 * same filtered array is handed back for the same input, so the channel list isn't rebuilt.
 */
export function withoutGuide(rows: unknown): unknown {
	if (!Array.isArray(rows) || !rows.includes(GUILD_HOME)) return rows
	let out = cache.get(rows)
	if (!out) {
		out = rows.filter(r => r !== GUILD_HOME)
		cache.set(rows, out)
	}
	return out
}
