import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { ScrollView } from 'react-native'
import { dockStatus, patchYouBar } from './dock'
import { Player, useMedia } from './player'
import { reconnect, startPolling } from './store'
import type { PluginApi } from '@valenced/plugins/types'

interface Settings {
	/** Show the player above the YouBar (the bar with your name at the bottom). */
	dock: boolean
	/** The docked player is swiped down behind the bar. */
	tucked: boolean
	/** The docked card springs open and shut. */
	animations: boolean
}

type Api = PluginApi<{ jsonStorage: Settings }>

const DEFAULTS: Settings = { dock: true, tucked: false, animations: true }

let readSettings: () => Settings = () => DEFAULTS

function Diagnostics() {
	const { TableRowGroup, TableRow } = Design
	const media = useMedia()
	const n = media.lastNative

	const bridgeText =
		media.nativeOk === false
			? "Can't check: the native part isn't working"
			: media.bridge === 'connected'
				? n?.access === false
					? 'Connected, but it has no notification access'
					: n?.active
						? `Connected, following ${n.app ?? n.package}`
						: 'Connected. Nothing is playing.'
				: media.bridge === 'checking'
					? 'Checking…'
					: 'No answer yet. Is Media Bridge installed, with notification access on?'

	const rows: [string, string][] = [
		[
			'Native part',
			media.nativeOk === null
				? 'Checking…'
				: media.nativeOk
					? 'Working'
					: `Not working: ${media.nativeError}`,
		],
		['Media Bridge app', bridgeText],
		['This Discord', media.discordPackage ?? 'unknown'],
		[
			'Commands (seek, shuffle, repeat)',
			n?.commandsReceived === undefined || n.commandsReceived < 0
				? `sent ${n?.commandsSent ?? 0}; Media Bridge doesn't report what it received (update it)`
				: `sent ${n.commandsSent ?? 0}, Media Bridge received ${n.commandsReceived}${n.lastCommand ? ` (last: ${n.lastCommand})` : ''}, via ${n.commandRoute ?? 'broadcast'}`,
		],
		[
			'Dock',
			dockStatus.error
				? `Error: ${dockStatus.error}`
				: dockStatus.patched.length
					? `Attached to YouBarThemed (${dockStatus.patched.join(', ')}); ${dockStatus.renders ? `drawn ${dockStatus.renders}×` : 'not drawn yet, open the server list'}; bar ${dockStatus.barMeasured ? 'measured' : 'not measured (using default spacing)'}`
					: "Not attached: couldn't find Discord's YouBarThemed",
		],
		[
			'Now playing',
			media.playback
				? `${media.playback.title} (${media.playback.app ?? media.playback.source}), ${media.playback.playing ? 'playing' : 'paused'}`
				: 'Nothing',
		],
	]
	const report = rows.map(([k, v]) => `${k}: ${v}`).join('\n')

	return (
		<TableRowGroup title="Diagnostics">
			{rows.map(([label, value]) => (
				<TableRow key={label} label={label} subLabel={value} />
			))}
			<TableRow label="Reconnect to Media Bridge" arrow onPress={reconnect} />
			<TableRow
				label="Copy diagnostics"
				arrow
				onPress={() => {
					Clipboard.setString(report)
					ToastActionCreators.open('media-controls', { text: 'Copied' })
				}}
			/>
		</TableRowGroup>
	)
}

function SettingsPage({ api }: { api: Api }) {
	const { Stack, Text, Card, TableRowGroup, TableSwitchRow } = Design
	const settings = { ...DEFAULTS, ...api.jsonStorage.use() }
	const { playback } = useMedia()

	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
			<Stack spacing={24}>
				<Card variant="secondary">
					{playback ? (
						<Player p={playback} />
					) : (
						<Text variant="text-md/medium" color="text-muted">
							Nothing is playing. Start something in any app.
						</Text>
					)}
				</Card>

				<TableRowGroup title="Player">
					<TableSwitchRow
						label="Show above the bottom bar"
						subLabel="A player card above the bar with your name while something plays. Swipe it down to tuck it behind the bar, up to bring it back."
						value={settings.dock}
						onValueChange={(dock: boolean) =>
							api.jsonStorage.set({ ...settings, dock }, true)
						}
					/>
					<TableSwitchRow
						label="Animations"
						subLabel="The card springs open and shut. Turn off for less load: it jumps instead."
						value={settings.animations !== false}
						onValueChange={(animations: boolean) =>
							api.jsonStorage.set({ ...settings, animations }, true)
						}
					/>
				</TableRowGroup>

				<Diagnostics />
			</Stack>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage, logger }) {
		readSettings = () => ({ ...DEFAULTS, ...jsonStorage.cache })
		cleanup(
			startPolling(),
			...patchYouBar(
				{
					enabled: () => readSettings().dock,
					tucked: () => readSettings().tucked,
					animations: () => readSettings().animations !== false,
					setTucked: tucked =>
						jsonStorage.set({ ...readSettings(), tucked }, true),
				},
				logger,
			),
			() => {
				readSettings = () => DEFAULTS
			},
		)
	},
	SettingsComponent: SettingsPage,
})
