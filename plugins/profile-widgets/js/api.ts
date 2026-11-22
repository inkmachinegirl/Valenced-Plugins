import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

/**
 * Discord's profile widget API, as documented by Discord Userdoccers (resources/widgets):
 *
 *   GET  /users/{id}/profile        → { widgets: [{ id, data: { type, games?, application_id? } }] }
 *   PUT  /users/@me/widgets         { widgets: [...] }  replaces them all (max 1 per type)
 *   GET  /users/@me/widgets/suggested-games
 *
 * Game widgets hold `games: [{ game_id, comment?, tags? }]`. Requests go through Discord's own REST
 * helper, which adds the account's auth itself, so the plugin never touches the token.
 */

export type GameType =
	| 'favorite_games'
	| 'current_games'
	| 'played_games'
	| 'want_to_play_games'

export interface WidgetGame {
	game_id: string
	comment?: string | null
	tags?: string[]
}

export interface Widget {
	id?: string
	data: {
		type: string
		games?: WidgetGame[]
		application_id?: string
		[key: string]: unknown
	}
}

export const GAME_TYPES: {
	type: GameType
	label: string
	max: number
	detailed: boolean
}[] = [
	{ type: 'favorite_games', label: 'Favorite Game', max: 1, detailed: true },
	{ type: 'current_games', label: 'Games in Rotation', max: 5, detailed: true },
	{ type: 'played_games', label: 'Games I Like', max: 20, detailed: false },
	{
		type: 'want_to_play_games',
		label: 'Want to Play',
		max: 20,
		detailed: false,
	},
]

/** Skill tags: only one of these at a time. */
export const SKILL_TAGS: [string, string][] = [
	['noob', 'Noob'],
	['learning_the_ropes', 'Learning the Ropes'],
	['casual', 'Casual'],
	['getting_good', 'Getting Good'],
	['intermediate', 'Intermediate'],
	['expert', 'Expert'],
	['better_than_you', 'Better Than You'],
]
export const FEELING_TAGS: [string, string][] = [
	['obsessed', 'Obsessed'],
	['love_it', 'Love It'],
	['kind_of_love_it', 'Kind of Love It'],
	['like_it', 'Like It'],
	['kind_of_hate_it', 'Kind of Hate It'],
	['frustrated', 'Frustrated'],
	['rage_quitting', 'Rage Quitting'],
	['too_easy', 'Too Easy'],
	['looking_for_group', 'Looking for Group'],
	['open_to_play', 'Open to Play'],
	['looking_for_tips', 'Looking for Tips'],
	['open_to_teach', 'Open to Teach'],
	['looking_to_discuss', 'Looking to Discuss'],
]
const SKILL = new Set(SKILL_TAGS.map(([t]) => t))
export const isSkillTag = (tag: string) => SKILL.has(tag)

interface Http {
	get(req: { url: string; oldFormErrors?: boolean }): Promise<{ body?: any }>
	put(req: {
		url: string
		body?: unknown
		oldFormErrors?: boolean
	}): Promise<{ body?: any }>
}

function http(): Http {
	const [found] = lookupModule(
		(withProps as any)('getAPIBaseURL', 'get', 'put', 'del'),
	) as unknown as [Http | undefined]
	if (!found) throw new Error("Couldn't find Discord's request helper")
	return found
}

export const myId = (): string | undefined =>
	(Stores as any).UserStore?.getCurrentUser?.()?.id

export function errorText(error: unknown): string {
	const e = error as { body?: any; status?: number; message?: string }
	const body = e?.body
	if (body?.errors) {
		// First nested field error, e.g. widgets.0.data.games.0.comment
		const walk = (node: any, path: string[]): string | undefined => {
			if (node?._errors?.[0]?.message)
				return `${path.join('.')}: ${node._errors[0].message}`
			for (const [k, v] of Object.entries(node ?? {})) {
				if (k === '_errors') continue
				const found = walk(v, [...path, k])
				if (found) return found
			}
		}
		const detail = walk(body.errors, [])
		if (detail) return detail
	}
	if (body?.message) return body.message
	if (e?.status) return `HTTP ${e.status}`
	return e?.message ?? String(error)
}

export async function loadWidgets(): Promise<Widget[]> {
	const id = myId()
	if (!id) throw new Error('Not logged in')
	const { body } = await http().get({ url: `/users/${id}/profile` })
	return Array.isArray(body?.widgets) ? body.widgets : []
}

/** Saves [widgets], dropping empty game widgets. Returns what Discord stored. */
export async function saveWidgets(widgets: Widget[]): Promise<Widget[]> {
	const clean = widgets
		.filter(
			w =>
				!GAME_TYPES.some(g => g.type === w.data.type) ||
				(w.data.games?.length ?? 0) > 0,
		)
		.map(w => {
			const out: Widget = { data: { ...w.data } }
			if (w.id) out.id = w.id
			if (out.data.games)
				out.data.games = out.data.games.map(g => {
					const game: WidgetGame = { game_id: g.game_id }
					const comment = g.comment?.trim()
					if (comment) game.comment = comment
					if (g.tags?.length) game.tags = g.tags
					return game
				})
			return out
		})
	const { body } = await http().put({
		url: '/users/@me/widgets',
		body: { widgets: clean },
	})
	refreshProfile()
	return Array.isArray(body)
		? body
		: Array.isArray(body?.widgets)
			? body.widgets
			: clean
}

/** Asks Discord to fetch the profile again so the Board tab shows the change. */
function refreshProfile() {
	try {
		const id = myId()
		const [actions] = lookupModule(
			(withProps as any)('fetchProfile'),
		) as unknown as [any]
		if (id && typeof actions?.fetchProfile === 'function')
			void Promise.resolve(actions.fetchProfile(id)).catch(() => {})
	} catch {}
}

export interface GameInfo {
	id: string
	name: string
	icon?: string | null
	aliases?: string[]
	/** Where it was found, when not Discord's PC game list: e.g. "played by friends". */
	source?: string
}

const info = new Map<string, GameInfo>()
export const gameInfo = (id: string) => info.get(id)
export const iconUrl = (game?: GameInfo) =>
	game?.icon
		? `https://cdn.discordapp.com/app-icons/${game.id}/${game.icon}.png?size=64`
		: undefined

/** Names and icons for game IDs not known yet (25 at a time). */
export async function loadInfo(ids: string[]): Promise<void> {
	const missing = [...new Set(ids)].filter(id => !info.has(id))
	for (let i = 0; i < missing.length; i += 25) {
		const chunk = missing.slice(i, i + 25)
		const query = chunk.map(id => `application_ids=${id}`).join('&')
		try {
			const { body } = await http().get({
				url: `/applications/public?${query}`,
			})
			for (const app of Array.isArray(body) ? body : [])
				if (app?.id)
					info.set(String(app.id), {
						id: String(app.id),
						name: app.name,
						icon: app.icon,
					})
		} catch {}
		for (const id of chunk)
			if (!info.has(id)) info.set(id, { id, name: `Game ${id}` })
	}
}

let detectable: GameInfo[] | undefined
let detectableLoading: Promise<GameInfo[]> | undefined

/** Discord's list of detectable games (names and aliases), loaded once. */
export function loadDetectable(): Promise<GameInfo[]> {
	if (detectable) return Promise.resolve(detectable)
	detectableLoading ??= http()
		.get({ url: '/games/detectable' })
		.then(({ body }) => {
			const list: GameInfo[] = (Array.isArray(body) ? body : [])
				.filter((g: any) => g?.id && g?.name)
				.map((g: any) => ({
					id: String(g.id),
					name: String(g.name),
					icon: g.icon_hash ?? g.icon ?? null,
					aliases: Array.isArray(g.aliases) ? g.aliases : [],
				}))
			for (const g of list) if (!info.has(g.id)) info.set(g.id, g)
			detectable = list
			return list
		})
		.catch(error => {
			detectableLoading = undefined
			throw error
		})
	return detectableLoading
}

/**
 * Games this device already knows that aren't in Discord's PC game list: what you and your friends
 * are playing right now (mobile games with Discord activity show up here), and applications Discord
 * has loaded. Read from Discord's stores, so nothing is requested.
 */
export function knownGames(): GameInfo[] {
	const S = Stores as any
	const found = new Map<string, GameInfo>()
	const add = (id: unknown, name: unknown, source: string, icon?: unknown) => {
		if (!id || !name || found.has(String(id))) return
		found.set(String(id), {
			id: String(id),
			name: String(name),
			icon: typeof icon === 'string' ? icon : null,
			aliases: [],
			source,
		})
	}
	try {
		const me = myId()
		const ids = new Set<string>(me ? [me] : [])
		const rel =
			S.RelationshipStore?.getMutableRelationships?.() ??
			S.RelationshipStore?.getRelationships?.() ??
			{}
		for (const [id, v] of rel instanceof Map ? rel : Object.entries(rel))
			if ((typeof v === 'number' ? v : (v as any)?.type) === 1)
				ids.add(String(id))
		for (const id of ids)
			for (const a of S.PresenceStore?.getActivities?.(id) ?? [])
				if (a?.application_id && (a.type === 0 || a.type === undefined))
					add(
						a.application_id,
						a.name,
						id === me ? 'you played' : 'friends play',
					)
	} catch {}
	try {
		const apps =
			S.ApplicationStore?.getApplications?.() ??
			S.ApplicationStore?.applications
		const list: any[] =
			apps instanceof Map
				? [...apps.values()]
				: Array.isArray(apps)
					? apps
					: Object.values(apps ?? {})
		for (const app of list)
			if (app?.id && app?.name)
				add(app.id, app.name, 'known to Discord', app.icon)
	} catch {}
	for (const g of found.values()) if (!info.has(g.id)) info.set(g.id, g)
	return [...found.values()]
}

/** Words of a name or query, lower case, without punctuation (so "Call of Duty: Mobile" → call, of, duty, mobile). */
const words = (text: string) =>
	text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean)

/**
 * Best matches for [query]: exact, then starts-with, then contains, then by words (most of the
 * query's words in the name, in any order), over names and aliases. Shorter names win ties.
 */
export function searchGames(
	list: GameInfo[],
	query: string,
	limit = 30,
): GameInfo[] {
	const q = query.trim().toLowerCase()
	if (!q) return []
	const qWords = words(q)
	const scored: [number, GameInfo][] = []
	for (const game of list) {
		const names = [game.name, ...(game.aliases ?? [])].map(n => n.toLowerCase())
		let score = 0
		for (const n of names) {
			if (n === q) score = Math.max(score, 3)
			else if (n.startsWith(q)) score = Math.max(score, 2)
			else if (n.includes(q)) score = Math.max(score, 1)
			else if (qWords.length > 1) {
				const nameWords = words(n)
				const hits = qWords.filter(w =>
					nameWords.some(nw => nw.startsWith(w)),
				).length
				if (hits >= Math.ceil(qWords.length * 0.6))
					score = Math.max(score, 0.5 * (hits / qWords.length))
			}
		}
		if (score) scored.push([score, game])
	}
	scored.sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length)
	return scored.slice(0, limit).map(([, g]) => g)
}

export async function suggestedGames(): Promise<string[]> {
	try {
		const { body } = await http().get({
			url: '/users/@me/widgets/suggested-games',
		})
		return [
			...(body?.suggested_games ?? []),
			...(body?.suggested_wishlist_games ?? []),
		].map(String)
	} catch {
		return []
	}
}

/** A pasted application ID. */
export const parseId = (text: string) =>
	/^\d{17,20}$/.test(text.trim()) ? text.trim() : null
