import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import { ScrollView } from 'react-native'

/**
 * Sort Friends: your friends list by when you became friends, instead of A to Z.
 *
 * Discord's friends list (and the other people lists) come from useUserListData in
 * modules/main_tabs_v2/native/shared_components/user_list/useUserListData.tsx, which returns a list
 * of sections: its fixed ones (suggestions, requests…) first, then the friends in letter sections
 * (A, B, C… or one untitled section). Discord's hook still runs as it is; only its result is
 * reshaped: the letter sections become one list ordered by RelationshipStore.getSince (the date
 * you became friends). While you type a search, Discord's best-match order is kept.
 */

const LIST = 'modules/main_tabs_v2/native/shared_components/user_list/useUserListData.tsx'
const FIXED_SECTIONS = 8

type Order = 'newest' | 'oldest' | 'off'
interface Settings {
	order: Order
}
const DEFAULTS: Settings = { order: 'newest' }

const S = Stores as any
let storage: any
let version = 0
const order = (): Order => (storage?.cache?.order ?? DEFAULTS.order) as Order

const when = (id: string | undefined): number => {
	const since = id ? S.RelationshipStore?.getSince?.(id) : undefined
	const t = since ? Date.parse(since) : Number.NaN
	return Number.isFinite(t) ? t : 0
}

const isLetterSection = (s: any, i: number) =>
	i >= FIXED_SECTIONS && Array.isArray(s?.items) && (s.title == null || String(s.title).length <= 2)

const cache = new WeakMap<object, { v: number; out: any[] }>()

function reshape(sections: any[]): any[] {
	const o = order()
	if (o === 'off') return sections
	const hit = cache.get(sections)
	if (hit && hit.v === version) return hit.out
	const friends: any[] = []
	let first = -1
	sections.forEach((s, i) => {
		if (!isLetterSection(s, i)) return
		if (first < 0) first = i
		friends.push(...s.items)
	})
	let out = sections
	if (first >= 0 && friends.length) {
		const sorted = friends
			.map((item, i) => ({ item, i, t: when(item?.user?.id ?? item?.id) }))
			.sort((a, b) => (o === 'newest' ? b.t - a.t : a.t - b.t) || a.i - b.i)
			.map(x => x.item)
		out = [
			...sections.slice(0, first),
			{ title: null, items: sorted },
			...sections.filter((s, i) => i > first && !isLetterSection(s, i)),
		]
	}
	cache.set(sections, { v: version, out })
	return out
}

function SettingsPage() {
	const { TableRadioGroup, TableRadioRow, Text } = Design as any
	const s: Settings = { ...DEFAULTS, ...(storage?.use?.() ?? {}) }
	return (
		<ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
			<TableRadioGroup
				title="Friends order"
				defaultValue={s.order}
				value={s.order}
				onChange={(o: Order) => {
					storage?.set?.({ ...s, order: o }, true)
					version++
				}}
			>
				<TableRadioRow label="Newest friends first" value="newest" />
				<TableRadioRow label="Oldest friends first" value="oldest" />
				<TableRadioRow label="A to Z (Discord's)" value="off" />
			</TableRadioGroup>
			<Text variant="text-xs/medium" color="text-muted">
				By the date you became friends. While you search, the best matches stay first. Reopen the Friends tab
				to see a change.
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
			getModuleWithImportedPath<any>(LIST, mod => {
				if (typeof mod?.default !== 'function') return
				cleanup(
					instead(mod, 'default', function (this: unknown, args: any[], orig: (...a: any[]) => any) {
						const result = Reflect.apply(orig, this, args)
						const q = args?.[0]
						if (!Array.isArray(result) || !q?.withFriends || String(q?.query ?? '').trim()) return result
						try {
							return reshape(result)
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
