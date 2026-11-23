import { Design } from '@valenced/discord/design'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
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
}
const DEFAULTS: Settings = {
	order: 'discord',
	currentFirst: true,
	hideLocked: false,
	hideEmpty: true,
}

let storage: any
let version = 0
const settings = (): Settings => ({ ...DEFAULTS, ...(storage?.cache ?? {}) })

const isGuild = (c: any) => c?.type === 'GUILD' && c.guild
const usable = (c: any) => (c.emojis ?? []).filter((e: any) => !c.emojisHidden?.has?.(e?.id))
const animatedOf = (c: any) => usable(c).filter((e: any) => e?.animated)

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
	let out = categories
	if (guilds.length) {
		const original = guilds.slice()
		if (s.hideLocked) guilds = guilds.filter(c => !c.isNitroLocked)
		if (s.hideEmpty) guilds = guilds.filter(c => usable(c).length > 0)
		const name = (c: any) => String(c.guild?.name ?? '')
		if (s.order === 'az') guilds.sort((a, b) => name(a).localeCompare(name(b)))
		else if (s.order === 'most') guilds.sort((a, b) => usable(b).length - usable(a).length || name(a).localeCompare(name(b)))
		else if (s.order === 'animated')
			guilds.sort((a, b) => animatedOf(b).length - animatedOf(a).length || name(a).localeCompare(name(b)))
		if (s.currentFirst && currentGuildId) {
			const at = guilds.findIndex(c => c.guild.id === currentGuildId)
			if (at > 0) guilds.unshift(...guilds.splice(at, 1))
		}
		const changed = guilds.length !== original.length || guilds.some((c, i) => c !== original[i])
		if (changed) {
			// Same slots as before; dropped servers leave theirs empty.
			out = []
			let g = 0
			const first = slots[0]
			categories.forEach((c, i) => {
				if (!isGuild(c)) out.push(c)
				else if (i === first) out.push(...guilds.slice(g, (g = guilds.length)))
			})
		}
	}
	cache.set(categories, { v: version, key, out })
	return out
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
