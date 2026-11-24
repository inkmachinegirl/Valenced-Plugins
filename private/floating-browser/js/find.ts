import * as discordFinders from '@valenced/discord/utils/modules/finders'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

/**
 * A Discord module by its source path: asked synchronously first (already loaded), then waited
 * for (loads later), then by its export names (the path moved). Calls back once.
 *
 * The same three steps UI Tweaks uses on 350.x builds: the path subscription alone does not report
 * modules that loaded before it subscribed.
 */
export function findModule(
	path: string,
	props: string[],
	callback: (mod: any) => void,
): () => void {
	let done = false
	const unsubs: Array<() => void> = []
	const stop = () => {
		for (const unsub of unsubs.splice(0))
			try {
				unsub()
			} catch {}
	}
	const run = (mod: any) => {
		const found = mod?.['0'] ?? mod
		if (done || !found) return
		done = true
		Promise.resolve().then(stop)
		try {
			callback(found)
		} catch {}
	}
	try {
		const finders = discordFinders as any
		const mod = finders.lookupModuleWithImportedPath?.(path)
		const loaded = Array.isArray(mod)
			? mod.length > 0 && mod[0] != null
			: mod != null
		if (loaded) run(mod)
	} catch {}
	if (!done)
		try {
			unsubs.push(
				(discordFinders as any).getModuleWithImportedPath(path, (mod: any) =>
					run(mod),
				),
			)
		} catch {}
	if (!done && props.length)
		try {
			unsubs.push(
				getModules((withProps as any)(...props), (mod: any) => run(mod)),
			)
		} catch {}
	return () => {
		done = true
		stop()
	}
}
