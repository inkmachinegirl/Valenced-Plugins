import { Design } from '@valenced/discord/design'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import { ScrollView } from 'react-native'

/**
 * Keep Commands Open: after Send on an app command's screen (the App Launcher's command view, e.g.
 * Mudae's /wa), stay on that screen so you can send it again, instead of closing.
 *
 * The screen (modules/app_launcher/native/screens/command_view/AppLauncherCommandViewScreen.tsx)
 * sends with AppLauncherUtils.executeAppLauncherCommand (read off the module each time, with
 * commandOrigin APP_LAUNCHER_APPLICATION_VIEW = 2) and then: on success, closes the keyboard after
 * 300 ms; on failure, turns Send back on, stops the sending animation and stays. So the command is
 * sent exactly as Discord sends it, and once it has gone through, the screen is answered the way a
 * failure is, which resets it in place. Real errors still reach the screen as they are.
 */

const UTILS = 'modules/app_launcher/utils/AppLauncherUtils.tsx'
const COMMAND_VIEW = 2

interface Settings {
	on: boolean
}
const DEFAULTS: Settings = { on: true }
let storage: any

/** What the screen receives instead of success: it resets for another send. */
class StayOpen extends Error {
	constructor() {
		super('Sent (Keep Commands Open keeps this screen open)')
		this.name = 'StayOpen'
	}
}

function SettingsPage() {
	const { TableRowGroup, TableSwitchRow } = Design as any
	const s: Settings = { ...DEFAULTS, ...(storage?.use?.() ?? {}) }
	return (
		<ScrollView contentContainerStyle={{ padding: 16 }}>
			<TableRowGroup>
				<TableSwitchRow
					label="Stay on the command after Send"
					subLabel="In the app command screen (like /wa), Send sends the command and keeps the screen open, ready to send again. Swipe it down or tap ✕ to close."
					value={s.on}
					onValueChange={(on: boolean) => storage?.set?.({ ...s, on }, true)}
				/>
			</TableRowGroup>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage
		cleanup(
			getModuleWithImportedPath<any>(UTILS, mod => {
				if (typeof mod?.executeAppLauncherCommand !== 'function') return
				cleanup(
					instead(mod, 'executeAppLauncherCommand', function (this: unknown, args: any[], orig: (...a: any[]) => any) {
						const result = Reflect.apply(orig, this, args)
						const on = (storage?.cache?.on ?? true) !== false
						if (!on || args?.[0]?.commandOrigin !== COMMAND_VIEW || typeof result?.then !== 'function') return result
						const kept = Promise.resolve(result).then(() => Promise.reject(new StayOpen()))
						// The screen also chains a second .then without a catch; keep that quiet.
						kept.catch(() => {})
						return kept
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
