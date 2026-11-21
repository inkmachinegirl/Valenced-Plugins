import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

/**
 * Discord's relationship type for a blocked user.
 * (0 = none, 1 = friend, 2 = blocked, 3 = incoming request, 4 = outgoing request)
 */
export const RELATIONSHIP_BLOCKED = 2

/** Discord IDs (snowflakes) are 17 to 20 digit numbers. */
const SNOWFLAKE = /^\d{17,20}$/

/** Analytics context Discord expects alongside relationship changes. */
const CONTEXT = { location: 'ContextMenu' }

interface RelationshipActionCreators {
	addRelationship(options: {
		userId: string
		context?: { location: string }
		type?: number
	}): Promise<unknown>
	removeRelationship(
		userId: string,
		context?: { location: string },
	): Promise<unknown>
	/** Discord's "Ignore" (hide messages, mute notifications without blocking). */
	ignoreUser?(userId: string, location?: string): Promise<unknown>
	unignoreUser?(userId: string, location?: string): Promise<unknown>
}

interface HttpRequest {
	url: string
	body?: unknown
	oldFormErrors?: boolean
}

interface HttpModule {
	get(request: HttpRequest): Promise<{ body?: any }>
	put(request: HttpRequest): Promise<unknown>
	del(request: HttpRequest): Promise<unknown>
}

interface RelationshipStore {
	isBlocked(userId: string): boolean
	isIgnored?(userId: string): boolean
	getRelationshipType(userId: string): number
}

interface User {
	id: string
	username: string
	globalName?: string | null
	avatar?: string | null
	discriminator?: string
}

interface UserStore {
	getUser(userId: string): User | undefined
	getCurrentUser(): User | undefined
}

/** Normalises user input: trims spaces and strips a `<@id>` / `<@!id>` mention. */
export function parseUserId(input: string): string | null {
	const id = input.trim().replace(/^<@!?(\d+)>$/, '$1')
	return SNOWFLAKE.test(id) ? id : null
}

function getRelationshipActions() {
	const [actions] = lookupModule(
		withProps<RelationshipActionCreators>(
			'addRelationship',
			'removeRelationship',
		),
	)
	return actions as RelationshipActionCreators | undefined
}

/**
 * Discord's REST helper. It adds the account's auth headers itself,
 * so this plugin never touches the token.
 */
export function getHttp() {
	const [http] = lookupModule(
		withProps<HttpModule & { getAPIBaseURL(): string }>(
			'getAPIBaseURL',
			'get',
			'put',
			'del',
		),
	)
	return http as HttpModule | undefined
}

const relationshipUrl = (userId: string) => `/users/@me/relationships/${userId}`

function relationshipStore() {
	return Stores.RelationshipStore as unknown as RelationshipStore | undefined
}

function userStore() {
	return Stores.UserStore as unknown as UserStore | undefined
}

export function isBlocked(userId: string): boolean {
	return relationshipStore()?.isBlocked?.(userId) ?? false
}

export function isCurrentUser(userId: string): boolean {
	return userStore()?.getCurrentUser?.()?.id === userId
}

/** Calls `listener` whenever Discord's block/friend list changes (including account switches). */
export function subscribeRelationships(listener: () => void): () => void {
	const store = relationshipStore() as any
	store?.addChangeListener?.(listener)
	return () => store?.removeChangeListener?.(listener)
}

/** ID of the account currently logged in. */
export function currentUserId(): string | undefined {
	return userStore()?.getCurrentUser?.()?.id
}

/** IDs of every account signed in on this device (the account switcher). */
export function ownAccountIds(): string[] {
	const store = Stores.MultiAccountStore as any
	const users = store?.getUsers?.() ?? store?.getValidUsers?.() ?? []
	const list: any[] = Array.isArray(users) ? users : Object.values(users ?? {})
	return list
		.map(u => u?.id)
		.filter((id): id is string => typeof id === 'string')
}

/** Relationship type 1 is "friend". */
export function isFriend(userId: string): boolean {
	return relationshipStore()?.getRelationshipType?.(userId) === 1
}

export async function blockUser(userId: string): Promise<void> {
	const actions = getRelationshipActions()
	if (actions) {
		await actions.addRelationship({
			userId,
			context: CONTEXT,
			type: RELATIONSHIP_BLOCKED,
		})
		return
	}

	const http = getHttp()
	if (!http)
		throw new Error("Couldn't find Discord's relationship or HTTP module")

	await http.put({
		url: relationshipUrl(userId),
		body: { type: RELATIONSHIP_BLOCKED },
		oldFormErrors: true,
	})
}

export async function unblockUser(userId: string): Promise<void> {
	const actions = getRelationshipActions()
	if (actions) {
		await actions.removeRelationship(userId, CONTEXT)
		return
	}

	const http = getHttp()
	if (!http)
		throw new Error("Couldn't find Discord's relationship or HTTP module")

	await http.del({ url: relationshipUrl(userId), oldFormErrors: true })
}

export function isIgnored(userId: string): boolean {
	return relationshipStore()?.isIgnored?.(userId) ?? false
}

/** Discord's Ignore: their messages are hidden and notifications muted, without blocking. */
export async function ignoreUser(userId: string): Promise<void> {
	const actions = getRelationshipActions()
	if (typeof actions?.ignoreUser === 'function') {
		await actions.ignoreUser(userId, CONTEXT.location)
		return
	}
	const http = getHttp()
	if (!http) throw new Error("Couldn't find Discord's Ignore action")
	await http.put({
		url: `${relationshipUrl(userId)}/ignore`,
		oldFormErrors: true,
	})
}

export async function unignoreUser(userId: string): Promise<void> {
	const actions = getRelationshipActions()
	if (typeof actions?.unignoreUser === 'function') {
		await actions.unignoreUser(userId, CONTEXT.location)
		return
	}
	const http = getHttp()
	if (!http) throw new Error("Couldn't find Discord's Ignore action")
	await http.del({
		url: `${relationshipUrl(userId)}/ignore`,
		oldFormErrors: true,
	})
}

/** Pulls a readable message out of Discord's HTTP errors. */
export function errorMessage(error: unknown): string {
	const e = error as {
		body?: { message?: string }
		status?: number
		message?: string
	}
	if (e?.body?.message) return e.body.message
	if (e?.status === 404) return 'No user exists with that ID'
	return e?.message ?? String(error)
}

export interface UserInfo {
	id: string
	/** Display name, falling back to the username. */
	name: string
	username: string
	avatarUrl: string
}

const CDN = 'https://cdn.discordapp.com'

/** Discord's default avatar index, used when a user has no profile picture. */
function defaultAvatarIndex(id: string, discriminator?: string): number {
	if (discriminator && discriminator !== '0') return Number(discriminator) % 5
	if (typeof BigInt === 'function') return Number((BigInt(id) >> 22n) % 6n)
	return 0
}

function toUserInfo(raw: {
	id: string
	username: string
	global_name?: string | null
	globalName?: string | null
	avatar?: string | null
	discriminator?: string
}): UserInfo {
	const globalName = raw.globalName ?? raw.global_name
	const avatarUrl = raw.avatar
		? `${CDN}/avatars/${raw.id}/${raw.avatar}.${raw.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`
		: `${CDN}/embed/avatars/${defaultAvatarIndex(raw.id, raw.discriminator)}.png`
	return {
		id: raw.id,
		name: globalName || raw.username,
		username: raw.username,
		avatarUrl,
	}
}

const userCache = new Map<string, Promise<UserInfo | null>>()

/** A user's name and avatar, already cached, or fetched from Discord once. */
export function fetchUserInfo(userId: string): Promise<UserInfo | null> {
	const known = userCache.get(userId)
	if (known) return known

	const request = (async () => {
		const cached = userStore()?.getUser?.(userId)
		if (cached?.username) return toUserInfo(cached)

		const http = getHttp()
		if (!http) return null
		try {
			const { body } = await http.get({ url: `/users/${userId}` })
			if (body?.username) return toUserInfo(body)
		} catch {}
		try {
			const { body } = await http.get({ url: `/users/${userId}/profile` })
			if (body?.user?.username) return toUserInfo(body.user)
		} catch {}
		return null
	})()

	// Retry later instead of caching a failure forever.
	request.then(info => info ?? userCache.delete(userId))
	userCache.set(userId, request)
	return request
}
