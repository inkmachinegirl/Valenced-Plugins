import { Design } from '@valenced/discord/design'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { ScrollView } from 'react-native'

/**
 * Reduced motion for Launch Pad only. Every Launch Pad animation (the panel sliding in, the dimmed
 * backdrop, the chat shrinking behind it, the pull tab) is a Reanimated spring with one shared
 * config, LaunchPadConstants.LAUNCH_PAD_SPRING_CONFIG ({ damping 20, stiffness 280, mass 0.5 }),
 * and they pass 'animate-always', so Android's own reduce-motion setting is ignored. The other
 * modules keep a reference to that same object, so changing its numbers in place changes all of
 * them: a critically damped, very stiff spring that lands in a few milliseconds, i.e. no motion.
 * Nothing else in Discord uses it, so the rest of the app keeps its animations.
 */

const CONSTANTS = 'modules/launchpad/native/LaunchPadConstants.tsx'
const INSTANT = {
	mass: 0.5,
	stiffness: 100000,
	// Critical damping (2·√(k·m)): straight to the end, no bounce.
	damping: 2 * Math.sqrt(100000 * 0.5),
	overshootClamping: true,
	restDisplacementThreshold: 0.5,
	restSpeedThreshold: 5,
}

interface Settings {
	reduced: boolean
}
const DEFAULTS: Settings = { reduced: true }

let config: Record<string, unknown> | undefined
let original: Record<string, unknown> | undefined
let storage: any

function apply() {
	if (!config || !original) return
	const on = (storage?.cache?.reduced ?? DEFAULTS.reduced) !== false
	try {
		for (const key of Object.keys(INSTANT)) delete config[key]
		Object.assign(config, on ? INSTANT : original)
	} catch {
		/* a frozen config: nothing to do */
	}
}

function SettingsPage() {
	const { TableRowGroup, TableSwitchRow, Text } = Design as any
	const s = { ...DEFAULTS, ...(storage?.use?.() ?? {}) }
	return (
		<ScrollView contentContainerStyle={{ padding: 16 }}>
			<TableRowGroup>
				<TableSwitchRow
					label="Reduced motion in Launch Pad"
					subLabel="Launch Pad opens and closes without sliding, fading or bouncing. The rest of Discord keeps its animations, and Android's animation setting is not touched."
					value={s.reduced}
					onValueChange={(reduced: boolean) => {
						storage?.set?.({ ...s, reduced }, true)
						Promise.resolve().then(apply)
					}}
				/>
			</TableRowGroup>
			<Text variant="text-xs/medium" color="text-muted" style={{ marginTop: 8 }}>
				Takes effect the next time Launch Pad is drawn; if it still animates, reload Discord.
			</Text>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage
		cleanup(
			getModuleWithImportedPath<any>(CONSTANTS, mod => {
				const found = mod?.LAUNCH_PAD_SPRING_CONFIG
				if (!found || typeof found !== 'object') return
				config = found
				original ??= { ...found }
				apply()
			}),
			() => {
				if (config && original) {
					try {
						for (const key of Object.keys(INSTANT)) delete config[key]
						Object.assign(config, original)
					} catch {}
				}
				config = undefined
				storage = undefined
			},
		)
	},
	SettingsComponent: SettingsPage,
})
