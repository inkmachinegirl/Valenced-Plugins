import { Stores } from '@valenced/discord/flux'
import * as discordFinders from '@valenced/discord/utils/modules/finders'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { getHttp, ignoreUser, isIgnored, unignoreUser } from './relationships'

const S = () => Stores as any

export interface Role {
	id: string
	name: string
	color: string | undefined
	count: number | undefined
}

export interface Person {
	id: string
	name: string
	username: string
	avatar: string | undefined
	ignored: boolean
	bot: boolean
}

/** The server's roles, highest first, without @everyone and managed (bot/integration) roles. */
export function rolesOf(guildId: string): Role[] {
	let list: any[] = []
	try {
		const store = S().GuildRoleStore
		list =
			store?.getSortedRoles?.(guildId) ??
			Object.values(
				store?.getRolesSnapshot?.(guildId) ?? store?.getRoles?.(guildId) ?? {},
			)
	} catch {}
	if (!list.length) {
		const g = S().GuildStore?.getGuild?.(guildId)
		list = Object.values(g?.roles ?? S().GuildStore?.getRoles?.(guildId) ?? {})
	}
	const counts = (() => {
		try {
			return S().GuildRoleMemberCountStore?.getRoleMemberCount?.(guildId) ?? {}
		} catch {
			return {}
		}
	})()
	return list
		.filter(r => r?.id && r.id !== guildId && !r.managed)
		.sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
		.map(r => ({
			id: String(r.id),
			name: String(r.name ?? 'Role'),
			color:
				r.colorString ??
				(r.color
					? `#${Number(r.color).toString(16).padStart(6, '0')}`
					: undefined),
			count: typeof counts?.[r.id] === 'number' ? counts[r.id] : undefined,
		}))
}

/** Discord's role member counts (as its role settings show them), fetched once per server. */
export function fetchCounts(guildId: string) {
	try {
		const found = (discordFinders as any).lookupModuleWithImportedPath?.(
			'modules/guild_settings/GuildRoleMemberActionCreators.tsx',
		)
		const mod = Array.isArray(found) ? found[0] : undefined
		mod?.fetchMemberCounts?.(guildId)
	} catch {}
}

/**
 * Asks Discord for everyone with the role, as its role settings do (requestMembersForRole: the
 * role's member IDs, then those members): they arrive in GuildMemberStore.
 */
export async function loadRole(
	guildId: string,
	roleId: string,
): Promise<string | undefined> {
	try {
		const found = (discordFinders as any).lookupModuleWithImportedPath?.(
			'modules/guild_settings/GuildRoleMemberActionCreators.tsx',
		)
		const mod = Array.isArray(found) ? found[0] : undefined
		if (typeof mod?.requestMembersForRole === 'function') {
			await mod.requestMembersForRole(guildId, roleId, false)
			return undefined
		}
	} catch {}
	// The same two steps, done here.
	try {
		const http: any = getHttp()
		const res = await http?.get?.({
			url: `/guilds/${guildId}/roles/${roleId}/member-ids`,
		})
		const ids: string[] = Array.isArray(res?.body) ? res.body.map(String) : []
		const [actions] = lookupModule(
			(withProps as any)('requestMembersById'),
		) as any
		if (ids.length) actions?.requestMembersById?.(guildId, ids, false)
		return undefined
	} catch (e: any) {
		return e?.body?.message ?? e?.message ?? 'Discord did not send the members'
	}
}

function avatarOf(u: any): string | undefined {
	try {
		return u?.getAvatarURL?.(undefined, 64, false)
	} catch {
		return undefined
	}
}

/** Everyone Discord has loaded with the role, you left out. */
export function peopleWith(guildId: string, roleId: string): Person[] {
	const me = S().UserStore?.getCurrentUser?.()?.id
	let members: any[] = []
	try {
		members = S().GuildMemberStore?.getMembers?.(guildId) ?? []
	} catch {}
	const out: Person[] = []
	for (const m of members) {
		const id = String(m?.userId ?? m?.user?.id ?? '')
		if (!id || id === me || !m?.roles?.includes?.(roleId)) continue
		const u = S().UserStore?.getUser?.(id)
		out.push({
			id,
			name: String(
				m.nick ?? u?.globalName ?? u?.global_name ?? u?.username ?? id,
			),
			username: String(u?.username ?? ''),
			avatar: avatarOf(u),
			ignored: isIgnored(id),
			bot: !!u?.bot,
		})
	}
	return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Ignores (or unignores) each person in turn, a moment apart, since Discord limits how fast
 * relationship changes can be made. Stops when [cancelled] says so.
 */
export async function applyAll(
	ids: string[],
	ignore: boolean,
	onProgress: (done: number, failed: number) => void,
	cancelled: () => boolean,
): Promise<{ done: number; failed: number; lastError?: string }> {
	let done = 0
	let failed = 0
	let lastError: string | undefined
	for (const id of ids) {
		if (cancelled()) break
		try {
			if (ignore) await ignoreUser(id)
			else await unignoreUser(id)
			done++
		} catch (e: any) {
			failed++
			lastError = e?.body?.message ?? e?.message ?? String(e)
			// Rate limited: wait as long as Discord asks before going on.
			const wait = Number(e?.body?.retry_after)
			if (wait > 0) await new Promise(r => setTimeout(r, wait * 1000 + 250))
		}
		onProgress(done, failed)
		await new Promise(r => setTimeout(r, 1200))
	}
	return { done, failed, lastError }
}
