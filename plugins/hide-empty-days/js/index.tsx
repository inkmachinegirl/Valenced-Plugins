import { Design } from '@valenced/discord/design'
import { instead } from '@valenced/patcher'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { autoStatus, maybeLoadMore, resetAutoLoad } from './autoload'
import { withoutEmptyDays } from './days'
import { findModule } from './find'

const STREAM = 'modules/messages/native/createChannelStream.tsx'

interface Settings {
	/** Also drop days whose only rows are "N blocked / ignored messages" bars. */
	hideBarsOnly: boolean
	/** Load older messages by itself while the oldest loaded ones are all hidden. */
	autoLoad: boolean
}
const DEFAULTS: Settings = { hideBarsOnly: false, autoLoad: true }
let storage: any
const settings = (): Settings => ({ ...DEFAULTS, ...(storage?.cache ?? {}) })
const status = { hooked: false, removed: 0 }

function SettingsPage() {
	const { TableRowGroup, TableSwitchRow, TableRow } = Design as any
	const [s, setS] = useState(settings)
	return (
		<ScrollView contentContainerStyle={{ padding: 16 }}>
			<TableRowGroup title="Options">
				<TableSwitchRow
					label="Also hide days with only blocked or ignored messages"
					subLabel={
						'Days whose only rows are "N blocked messages" bars. Reopen the chat to see it change'
					}
					value={s.hideBarsOnly}
					onValueChange={(hideBarsOnly: boolean) => {
						const next = { ...s, hideBarsOnly }
						storage?.set?.(next, true)
						setS(next)
					}}
				/>
				<TableSwitchRow
					label="Load past hidden messages"
					subLabel="Keeps enough shown messages loaded above you: older pages load in the background while the oldest ones are mostly hidden (ignored, blocked or hidden by another plugin), so you don't reach Load more messages. Up to 20 pages in a row"
					value={s.autoLoad}
					onValueChange={(autoLoad: boolean) => {
						const next = { ...s, autoLoad }
						storage?.set?.(next, true)
						setS(next)
					}}
				/>
			</TableRowGroup>
			<TableRowGroup title="Status">
				<TableRow
					label="Chat list"
					subLabel={
						status.hooked
							? `Hooked · ${status.removed} empty date lines removed so far`
							: 'Not found yet (open a chat)'
					}
				/>
				<TableRow
					label="Pages loaded past hidden messages"
					subLabel={String(autoStatus.loads)}
				/>
			</TableRowGroup>
		</ScrollView>
	)
}

export default plugin({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }: any) {
		storage = jsonStorage
		cleanup(
			findModule(STREAM, [], (mod: any) => {
				const host = typeof mod?.default === 'function' ? mod : null
				if (!host) return
				status.hooked = true
				cleanup(
					instead(
						host,
						'default',
						function (this: unknown, args: any[], orig: (...a: any[]) => any) {
							const out = Reflect.apply(orig, this, args)
							try {
								const s = settings()
								if (s.autoLoad && Array.isArray(out))
									maybeLoadMore(args[0], out)
								const next = withoutEmptyDays(out, s.hideBarsOnly)
								if (next !== out && Array.isArray(out) && Array.isArray(next))
									status.removed += out.length - next.length
								return next
							} catch {
								return out
							}
						},
					),
				)
			}),
			() => {
				storage = undefined
				resetAutoLoad()
			},
		)
	},
	SettingsComponent: SettingsPage,
} as any)
