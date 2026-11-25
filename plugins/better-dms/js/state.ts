import { Stores } from '@valenced/discord/flux'

export const DM = 1
export const GROUP_DM = 3

/** What the user set for one DM (keyed by channel ID). */
export interface DmData {
	color?: string
	label?: string
	emoji?: string
	/** A server emoji instead of [emoji] (any server's, animated too; only drawn for you). */
	customEmoji?: { id: string; name: string; animated?: boolean }
	pinned?: boolean
	/** Ask before sending here. */
	careful?: boolean
	/** Shown instead of their name, only to you (1-on-1 DMs). */
	nickname?: string
}

export interface Features {
	colors: boolean
	labels: boolean
	emoji: boolean
	pins: boolean
	tabs: boolean
	groupTab: boolean
	groupLook: boolean
	mutuals: boolean
	lastActive: boolean
	unread: boolean
	banner: boolean
	guard: boolean
	nicknames: boolean
	friendMarker: boolean
	botLook: boolean
	notes: boolean
}

export interface Settings {
	dms: Record<string, DmData>
	features: Features
	/** Fade DMs with no messages for this many days (0 = never). */
	fadeAfterDays: number
	unreadColor: string
	/** Put the hints on a second line under the preview (may be cut off on some versions). */
	extraLine: boolean
	/** Tab keys in the order to show them ('first' is All / DMs); unknown tabs follow. */
	tabOrder: string[]
	/** Tab keys not shown ('first' is All / DMs). */
	hiddenTabs: string[]
	/** Which tabs show an unread count. */
	tabBadges: 'every' | 'unread' | 'categories' | 'none'
}

export const DEFAULTS: Settings = {
	dms: {},
	features: {
		colors: true,
		labels: true,
		emoji: true,
		pins: true,
		tabs: true,
		groupTab: true,
		groupLook: true,
		mutuals: false,
		lastActive: true,
		unread: true,
		banner: true,
		guard: true,
		nicknames: true,
		friendMarker: true,
		botLook: true,
		notes: false,
	},
	fadeAfterDays: 30,
	unreadColor: '#F23F42',
	extraLine: false,
	tabOrder: [],
	hiddenTabs: [],
	tabBadges: 'every',
}

export const PALETTE: [string, string][] = [
	['#F23F42', 'Red'],
	['#F0B232', 'Yellow'],
	['#23A55A', 'Green'],
	['#00A8FC', 'Blue'],
	['#5865F2', 'Blurple'],
	['#B07FE6', 'Purple'],
	['#EB459E', 'Pink'],
	['#E8743B', 'Orange'],
]

let read: () => Settings = () => DEFAULTS
let write: (s: Settings) => void = () => {}
const listeners = new Set<() => void>()

export function bindSettings(r: () => Settings, w: (s: Settings) => void) {
	read = r
	write = w
}
/**
 * The settings with defaults filled in. Built once per change (the storage hands back the same
 * object until something is saved), because Discord's list and nickname lookups read it thousands
 * of times a minute.
 */
let lastRaw: unknown
let lastMerged: Settings = DEFAULTS
export const settings = (): Settings => {
	const s = read()
	if (s === lastRaw) return lastMerged
	lastRaw = s
	lastMerged = {
		...DEFAULTS,
		...s,
		features: { ...DEFAULTS.features, ...s?.features },
		dms: s?.dms ?? {},
	}
	return lastMerged
}
export const on = (f: keyof Features) => settings().features[f]
export const dmData = (id: string): DmData => settings().dms[id] ?? {}
export function setDm(id: string, patch: Partial<DmData>) {
	const s = settings()
	const next = { ...s.dms[id], ...patch }
	for (const k of Object.keys(next) as (keyof DmData)[])
		if (next[k] === undefined || next[k] === '' || next[k] === false)
			delete next[k]
	const dms = { ...s.dms }
	if (Object.keys(next).length) dms[id] = next
	else delete dms[id]
	write({ ...s, dms })
	changed()
}
export function setSettings(patch: Partial<Settings>) {
	write({ ...settings(), ...patch })
	changed()
}
export function setFeature(f: keyof Features, value: boolean) {
	const s = settings()
	write({ ...s, features: { ...s.features, [f]: value } })
	changed()
}
export function onChange(fn: () => void): () => void {
	listeners.add(fn)
	return () => {
		listeners.delete(fn)
	}
}
export function changed() {
	lastRaw = undefined
	for (const fn of listeners) fn()
}

// ---------------------------------------------------------------------------------------------
// Discord data

const S = () => Stores as any
export const channel = (id: string): any => S().ChannelStore?.getChannel?.(id)
export const isDmChannel = (c: any) => c?.type === DM || c?.type === GROUP_DM
export const recipientOf = (c: any): string | undefined =>
	c?.type === DM ? (c.getRecipientId?.() ?? c.recipients?.[0]) : undefined
export const user = (id?: string): any =>
	id ? S().UserStore?.getUser?.(id) : undefined
export const myId = (): string | undefined =>
	S().UserStore?.getCurrentUser?.()?.id

export function nameOf(c: any): string {
	if (!c) return ''
	if (c.type === GROUP_DM)
		return (
			c.name ||
			(c.recipients ?? [])
				.map((id: string) => user(id)?.globalName || user(id)?.username || id)
				.join(', ') ||
			'Group'
		)
	const u = user(recipientOf(c))
	return dmData(c.id).nickname || u?.globalName || u?.username || 'DM'
}

export const idTime = (id?: string | null) => {
	if (!id || !/^\d+$/.test(id)) return 0
	try {
		return Number(BigInt(id) >> 22n) + 1420070400000
	} catch {
		return 0
	}
}

export function ago(ms: number): string {
	if (!ms) return ''
	const m = Math.max(0, Date.now() - ms) / 60000
	if (m < 60) return `${Math.max(1, Math.round(m))}m`
	if (m < 1440) return `${Math.round(m / 60)}h`
	if (m < 43200) return `${Math.round(m / 1440)}d`
	if (m < 525600) return `${Math.round(m / 43200)}mo`
	return `${Math.round(m / 525600)}y`
}

export const lastActive = (c: any) =>
	idTime(c?.lastMessageId ?? c?.last_message_id)

export const isUnread = (id: string): boolean => {
	try {
		return !!S().ReadStateStore?.hasUnread?.(id)
	} catch {
		return false
	}
}
export const mentionCount = (id: string): number => {
	try {
		return Number(S().ReadStateStore?.getMentionCount?.(id)) || 0
	} catch {
		return 0
	}
}
export const isFriend = (userId?: string) =>
	!!userId && S().RelationshipStore?.getRelationshipType?.(userId) === 1

/** Servers you share with them, as far as this device knows. */
export function mutualServers(userId?: string): number {
	if (!userId) return 0
	try {
		const fromProfile = S().UserProfileStore?.getMutualGuilds?.(userId)
		if (Array.isArray(fromProfile)) return fromProfile.length
		const guilds = Object.keys(S().GuildStore?.getGuilds?.() ?? {})
		const members = S().GuildMemberStore
		return guilds.filter(
			g => members?.isMember?.(g, userId) ?? !!members?.getMember?.(g, userId),
		).length
	} catch {
		return 0
	}
}

export function noteOf(userId?: string): string {
	if (!userId) return ''
	try {
		const n = S().NoteStore?.getNote?.(userId)
		const text = typeof n === 'string' ? n : (n?.note ?? '')
		return String(text).split('\n')[0].trim()
	} catch {
		return ''
	}
}

/** Labels in use, for the tabs. */
export const labels = (): string[] =>
	[
		...new Set(
			Object.values(settings().dms)
				.map(d => d.label?.trim())
				.filter(Boolean) as string[],
		),
	].sort()
