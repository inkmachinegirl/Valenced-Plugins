import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import { ScrollView } from 'react-native'

/**
 * Friend requests by the date they were sent, instead of by account age.
 *
 * Discord's Friend Requests screen (modules/main_tabs_v2/native/friends/screens/
 * FriendRequestsScreen.tsx) sorts both lists with a private `compareUserItems`, which calls
 * `SnowflakeUtils.compare(userIdA, userIdB)`, read off utils/SnowflakeUtils.tsx's default export
 * each time. That compare is wrapped: only when both ids are people with a pending request (a set
 * kept from RelationshipStore, so the check is one lookup) does it compare their request dates
 * (RelationshipStore.getSince); every other compare (messages, channels…) goes straight through.
 */

const SNOWFLAKE = 'utils/SnowflakeUtils.tsx'
const PENDING_INCOMING = 3
const PENDING_OUTGOING = 4

type Order = 'newest' | 'oldest' | 'discord'
interface Settings {
	order: Order
}
const DEFAULTS: Settings = { order: 'newest' }

const S = Stores as any
let storage: any
const order = (): Order => (storage?.cache?.order ?? DEFAULTS.order) as Order

let pending = new Set<string>()
function refresh() {
	const next = new Set<string>()
	try {
		const all: Map<string, number> | Record<string, number> | undefined =
			S.RelationshipStore?.getMutableRelationships?.() ?? S.RelationshipStore?.getRelationships?.()
		const entries = all instanceof Map ? all.entries() : Object.entries(all ?? {})
		for (const [id, type] of entries)
			if (type === PENDING_INCOMING || type === PENDING_OUTGOING) next.add(String(id))
	} catch {}
	pending = next
}

const when = (id: string): number => {
	const since = S.RelationshipStore?.getSince?.(id)
	const t = since ? Date.parse(since) : Number.NaN
	return Number.isFinite(t) ? t : 0
}

function SettingsPage() {
	const { TableRadioGroup, TableRadioRow, Text } = Design as any
	const s: Settings = { ...DEFAULTS, ...(storage?.use?.() ?? {}) }
	return (
		<ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
			<TableRadioGroup
				title="Friend requests order"
				defaultValue={s.order}
				value={s.order}
				onChange={(o: Order) => storage?.set?.({ ...s, order: o }, true)}
			>
				<TableRadioRow label="Newest request first" value="newest" />
				<TableRadioRow label="Oldest request first" value="oldest" />
				<TableRadioRow label="Discord's (by account age)" value="discord" />
			</TableRadioGroup>
			<Text variant="text-xs/medium" color="text-muted">
				Applies to Received and Sent in Friends › Requests. Reopen the screen to see a change.
			</Text>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage
		const store = S.RelationshipStore
		refresh()
		if (store?.addChangeListener) {
			store.addChangeListener(refresh)
			cleanup(() => store.removeChangeListener?.(refresh))
		}
		cleanup(
			getModuleWithImportedPath<any>(SNOWFLAKE, mod => {
				const utils = mod?.default
				if (typeof utils?.compare !== 'function') return
				cleanup(
					instead(utils, 'compare', function (this: unknown, args: any[], orig: (...a: any[]) => any) {
						const [a, b] = args
						if (pending.size && pending.has(a) && pending.has(b)) {
							const o = order()
							if (o !== 'discord') {
								const diff = o === 'newest' ? when(b) - when(a) : when(a) - when(b)
								if (diff) return diff < 0 ? -1 : 1
							}
						}
						return Reflect.apply(orig, this, args)
					}),
				)
			}),
			() => {
				storage = undefined
				pending = new Set()
			},
		)
	},
	SettingsComponent: SettingsPage,
})
