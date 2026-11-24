import * as discordFinders from '@valenced/discord/utils/modules/finders'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { BackHandler } from 'react-native'

/**
 * Listen for Android's back button / gesture. Discord's app only hands back presses to its
 * JavaScript while it knows something there wants them (its addBackPressListener tells the native
 * side so; Android's predictive back otherwise closes or minimizes the app). So this goes through
 * Discord's own addBackPressListener, and plain BackHandler only if that isn't found.
 */
type Sub = { remove(): void }
let tracker: ((fn: () => boolean) => Sub) | null | undefined

function discordTracker(): ((fn: () => boolean) => Sub) | null {
	if (tracker !== undefined) return tracker
	tracker = null
	try {
		const found = (discordFinders as any).lookupModuleWithImportedPath?.(
			'modules/routing/native/BackPressTracking.android.tsx',
		)
		let mod = Array.isArray(found) ? found[0] : undefined
		if (typeof mod?.addBackPressListener !== 'function')
			[mod] = lookupModule((withProps as any)('addBackPressListener')) as any
		if (typeof mod?.addBackPressListener === 'function')
			tracker = fn => mod.addBackPressListener(fn)
	} catch {}
	return tracker
}

export function onBack(fn: () => boolean): () => void {
	let sub: Sub | undefined
	try {
		const add = discordTracker()
		sub = add ? add(fn) : BackHandler.addEventListener('hardwareBackPress', fn)
	} catch {
		sub = BackHandler.addEventListener('hardwareBackPress', fn)
	}
	return () => {
		try {
			sub?.remove()
		} catch {}
	}
}
