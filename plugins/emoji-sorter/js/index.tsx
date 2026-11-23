import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import { useState } from 'react'
import { ScrollView } from 'react-native'

/**
 * Sorting for the emoji picker (chat and reactions).
 *
 * Both pickers get their sections from `useEmojiCategories(intention, channel, options)` in
 * modules/emoji_picker/EmojiPickerUtils.tsx, read off the module on every render. It returns a
 * memoised list of categories: Favorites / Recent / Top server emoji ({ type, id, name, emojis,
 * emojisDisabled }), one { type: 'GUILD', guild, emojis, emojisDisabled, emojisHidden,
 * isNitroLocked } per server, then the Unicode ones. Discord's hook still runs (its hooks must,
 * every render); only the list it returns is reshaped, and cached per list so the picker's own
 * memos keep working.
 *
 * On Android the server sections are drawn natively from the server id, so emojis can't be
 * reordered inside one; sections can be reordered, hidden, or added (an added section is a list
 * of emojis, like Favorites).
 */

const UTILS = 'modules/emoji_picker/EmojiPickerUtils.tsx'

type Order = 'discord' | 'az' | 'most' | 'animated'
interface Settings {
	order: Order
	currentFirst: boolean
	hideLocked: boolean
	hideEmpty: boolean
	usedFirst: boolean
	openedFirst: boolean
	/** Server ids never shown in the picker. */
	hidden: string[]
	/** Discord's built-in emoji: where they go. */
	unicode: 'bottom' | 'above' | 'hide'
}
const DEFAULTS: Settings = {
	order: 'discord',
	currentFirst: true,
	hideLocked: false,
	hideEmpty: true,
	usedFirst: false,
	openedFirst: false,
	hidden: [],
	unicode: 'bottom',
}

let storage: any
let version = 0
const settings = (): Settings => ({ ...DEFAULTS, ...(storage?.cache ?? {}) })

const isGuild = (c: any) => c?.type === 'GUILD' && c.guild
const usable = (c: any) => (c.emojis ?? []).filter((e: any) => !c.emojisHidden?.has?.(e?.id))
const animatedOf = (c: any) => usable(c).filter((e: any) => e?.animated)


const S = Stores as any

/** Per server: how much you use its emojis (Discord's frequently-used list, top ranks weigh most). */
function emojiUse(): Map<string, number> {
	const out = new Map<string, number>()
	try {
		const list: any[] =
			S.EmojiStore?.getDisambiguatedEmojiContext?.(null)?.getFrequentlyUsedEmojisWithoutFetchingLatest?.() ?? []
		list.forEach((e, i) => {
			const g = e?.guildId ?? e?.guild_id
			if (g) out.set(g, (out.get(g) ?? 0) + (list.length - i))
		})
	} catch {}
	return out
}

/** Per server: how often you open it (Discord's own frecency of the server and its channels). */
function visits(): Map<string, number> {
	const out = new Map<string, number>()
	try {
		const store = S.FrecencyStore
		const items: any[] = store?.getFrequentlyWithoutFetchingLatest?.() ?? []
		for (const item of items) {
			const id = item?.id
			if (!id) continue
			const g = S.GuildStore?.getGuild?.(id) ? id : item?.guild_id ?? S.ChannelStore?.getChannel?.(id)?.guild_id
			if (!g) continue
			out.set(g, (out.get(g) ?? 0) + (Number(store.getScoreWithoutFetchingLatest?.(id)) || 0))
		}
	} catch {}
	return out
}

const cache = new WeakMap<object, { v: number; key: string; out: any[] }>()

function reshape(categories: any[], currentGuildId: string | undefined): any[] {
	const s = settings()
	const key = currentGuildId ?? ''
	const hit = cache.get(categories)
	if (hit && hit.v === version && hit.key === key) return hit.out

	const slots: number[] = []
	let guilds: any[] = []
	categories.forEach((c, i) => {
		if (isGuild(c)) {
			slots.push(i)
			guilds.push(c)
		}
	})
	if (guilds.length) {
		const hidden = new Set(s.hidden ?? [])
		if (hidden.size) guilds = guilds.filter(c => !hidden.has(c.guild.id))
		if (s.hideLocked) guilds = guilds.filter(c => !c.isNitroLocked)
		if (s.hideEmpty) guilds = guilds.filter(c => usable(c).length > 0)
		const name = (c: any) => String(c.guild?.name ?? '')
		if (s.order === 'az') guilds.sort((a, b) => name(a).localeCompare(name(b)))
		else if (s.order === 'most') guilds.sort((a, b) => usable(b).length - usable(a).length || name(a).localeCompare(name(b)))
		else if (s.order === 'animated')
			guilds.sort((a, b) => animatedOf(b).length - animatedOf(a).length || name(a).localeCompare(name(b)))
		if (s.usedFirst || s.openedFirst) {
			// Stable: ties keep the order chosen above.
			const used = s.usedFirst ? emojiUse() : undefined
			const opened = s.openedFirst ? visits() : undefined
			const id = (c: any) => c.guild.id
			guilds = guilds
				.map((c, i) => ({ c, i }))
				.sort(
					(a, b) =>
						(used ? (used.get(id(b.c)) ?? 0) - (used.get(id(a.c)) ?? 0) : 0) ||
						(opened ? (opened.get(id(b.c)) ?? 0) - (opened.get(id(a.c)) ?? 0) : 0) ||
						a.i - b.i,
				)
				.map(x => x.c)
		}
		if (s.currentFirst && currentGuildId) {
			const at = guilds.findIndex(c => c.guild.id === currentGuildId)
			if (at > 0) guilds.unshift(...guilds.splice(at, 1))
		}
	}
	// Put it back together: what was above the servers, the default emoji if moved up, the
	// servers, then what came after them (the default emoji stay there unless moved or hidden).
	const isUnicode = (c: any) => c?.type === 'UNICODE'
	const firstGuild = slots.length ? slots[0] : categories.length
	const head: any[] = []
	const tail: any[] = []
	const unicode: any[] = []
	categories.forEach((c, i) => {
		if (isGuild(c)) return
		if (isUnicode(c) && s.unicode !== 'bottom') unicode.push(c)
		else (i < firstGuild ? head : tail).push(c)
	})
	let out = [...head, ...(s.unicode === 'above' ? unicode : []), ...guilds, ...tail]
	if (out.length === categories.length && out.every((c, i) => c === categories[i])) out = categories
	cache.set(categories, { v: version, key, out })
	return out
}

/** Every server you're in, with a switch to hide it from the picker, and a search. */
function HiddenServers({ hidden, onChange }: { hidden: string[]; onChange: (ids: string[]) => void }) {
	const { TableRowGroup, TableSwitchRow, TextInput } = Design as any
	const [query, setQuery] = useState('')
	const ids: string[] = (() => {
		try {
			return S.SortedGuildStore?.getFlattenedGuildIds?.() ?? Object.keys(S.GuildStore?.getGuilds?.() ?? {})
		} catch {
			return []
		}
	})()
	const q = query.trim().toLowerCase()
	const rows = ids
		.map(id => ({ id, name: String(S.GuildStore?.getGuild?.(id)?.name ?? id) }))
		.filter(g => !q || g.name.toLowerCase().includes(q))
	const off = new Set(hidden)
	return (
		<>
			{TextInput ? (
				<TextInput placeholder="Search your servers" value={query} onChange={setQuery} isClearable size="sm" />
			) : null}
			<TableRowGroup title={`Hide servers from the picker${off.size ? ` (${off.size} hidden)` : ''}`}>
				{rows.map(g => (
					<TableSwitchRow
						key={g.id}
						label={g.name}
						value={off.has(g.id)}
						onValueChange={(on: boolean) =>
							onChange(on ? [...off, g.id] : hidden.filter(id => id !== g.id))
						}
					/>
				))}
			</TableRowGroup>
		</>
	)
}

function SettingsPage() {
	const { TableRowGroup, TableSwitchRow, TableRadioGroup, TableRadioRow, Text } = Design as any
	const s: Settings = { ...DEFAULTS, ...(storage?.use?.() ?? {}) }
	const set = (patch: Partial<Settings>) => {
		storage?.set?.({ ...s, ...patch }, true)
		version++
	}
	return (
		<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 16 }}>
			<TableRowGroup title="Sections">
				<TableSwitchRow
					label="Servers whose emojis you use most first"
					subLabel="From Discord's frequently-used emojis: the servers you pick emojis from most go to the top."
					value={s.usedFirst}
					onValueChange={(usedFirst: boolean) => set({ usedFirst })}
				/>
				<TableSwitchRow
					label="Servers you open most first"
					subLabel="From how often you visit each server (Discord's own count, synced across your devices)."
					value={s.openedFirst}
					onValueChange={(openedFirst: boolean) => set({ openedFirst })}
				/>
				<TableSwitchRow
					label="This server first"
					subLabel="Keep the server you're in at the top, whatever the order."
					value={s.currentFirst}
					onValueChange={(currentFirst: boolean) => set({ currentFirst })}
				/>
				<TableSwitchRow
					label="Hide servers you can't use"
					subLabel="Servers whose emojis all need Nitro here."
					value={s.hideLocked}
					onValueChange={(hideLocked: boolean) => set({ hideLocked })}
				/>
				<TableSwitchRow
					label="Hide empty servers"
					subLabel="Servers whose emojis are all hidden."
					value={s.hideEmpty}
					onValueChange={(hideEmpty: boolean) => set({ hideEmpty })}
				/>
			</TableRowGroup>
			<TableRadioGroup
				title="Default emoji"
				defaultValue={s.unicode}
				value={s.unicode}
				onChange={(unicode: Settings['unicode']) => set({ unicode })}
			>
				<TableRadioRow label="At the bottom (Discord's)" value="bottom" />
				<TableRadioRow label="Above your servers" value="above" />
				<TableRadioRow label="Hidden" value="hide" />
			</TableRadioGroup>
			<TableRadioGroup
				title="Server order"
				defaultValue={s.order}
				value={s.order}
				onChange={(order: Order) => set({ order })}
			>
				<TableRadioRow label="Discord's (your server list)" value="discord" />
				<TableRadioRow label="A to Z" value="az" />
				<TableRadioRow label="Most emojis first" value="most" />
				<TableRadioRow label="Most animated first" value="animated" />
			</TableRadioGroup>
			<HiddenServers hidden={s.hidden ?? []} onChange={hidden => set({ hidden })} />
			<Text variant="text-xs/medium" color="text-muted">
				Works in the chat emoji picker and the reaction picker. Changes show the next time the picker opens.
			</Text>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage
		version++
		cleanup(
			getModuleWithImportedPath<any>(UTILS, mod => {
				if (typeof mod?.useEmojiCategories !== 'function') return
				cleanup(
					instead(mod, 'useEmojiCategories', function (this: unknown, args: any[], orig: (...a: any[]) => any) {
						const result = Reflect.apply(orig, this, args)
						if (!Array.isArray(result)) return result
						try {
							const guildId = args[2]?.guildId ?? args[1]?.getGuildId?.() ?? args[1]?.guild_id
							return reshape(result, guildId ?? undefined)
						} catch {
							return result
						}
					}),
				)
			}),
			() => {
				storage = undefined
			},
		)
	},
	SettingsComponent: SettingsPage,
})
