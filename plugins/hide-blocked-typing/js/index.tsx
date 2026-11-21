import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { instead } from '@valenced/patcher'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { bumpVersion, filterByGuild, filterUsers } from './typing'

interface Settings {
	/** Ignored people too, not only blocked. */
	ignored: boolean
}
const DEFAULTS: Settings = { ignored: true }
let storage: any
const settings = (): Settings => ({ ...DEFAULTS, ...(storage?.cache ?? {}) })
const S = () => Stores as any

function hidden(userId: string): boolean {
	const r = S().RelationshipStore
	try {
		if (r?.isBlocked?.(userId)) return true
		return settings().ignored && !!r?.isIgnored?.(userId)
	} catch {
		return false
	}
}
const options = { hidden }

/** Typing views re-read the store when it changes. */
const refresh = () => {
	bumpVersion()
	try {
		S().TypingStore?.emitChange?.()
	} catch {}
}

function SettingsPage() {
	const { TableRowGroup, TableSwitchRow } = Design as any
	const [s, setS] = useState(settings)
	return (
		<ScrollView contentContainerStyle={{ padding: 16 }}>
			<TableRowGroup title="Options">
				<TableSwitchRow
					label="Ignored people too"
					subLabel="Not only people you blocked"
					value={s.ignored}
					onValueChange={(ignored: boolean) => {
						const next = { ...s, ignored }
						storage?.set?.(next, true)
						setS(next)
						refresh()
					}}
				/>
			</TableRowGroup>
		</ScrollView>
	)
}

export default plugin({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }: any) {
		storage = jsonStorage
		const store = S().TypingStore
		if (!store) return
		const wrap = (
			method: string,
			fn: (out: unknown, args: any[]) => unknown,
		) => {
			if (typeof store[method] !== 'function') return
			cleanup(
				instead(
					store,
					method,
					function (this: unknown, args: any[], orig: any) {
						const out = Reflect.apply(orig, this, args)
						try {
							return fn(out, args)
						} catch {
							return out
						}
					},
				),
			)
		}
		wrap('getTypingUsers', out => filterUsers(out, options))
		wrap('getTypingUsersByGuild', out => filterByGuild(out, options))
		wrap('isTyping', (out, args) =>
			out && typeof args[1] === 'string' && hidden(args[1]) ? false : out,
		)

		// Blocking or ignoring someone while they type takes them out right away.
		const rel = S().RelationshipStore
		rel?.addChangeListener?.(refresh)
		cleanup(
			() => rel?.removeChangeListener?.(refresh),
			() => {
				storage = undefined
				refresh()
			},
		)
		refresh()
	},
	SettingsComponent: SettingsPage,
} as any)
