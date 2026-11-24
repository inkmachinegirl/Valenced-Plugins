import { getConstants, readFile, writeFile } from '@valenced/modules/native/fs'
import { type Compiled, compile, LISTS, use } from './filters'
import { save, settings } from './store'

/**
 * Downloads the chosen lists on the phone, compiles them, and keeps the result in the app's cache
 * folder. Rebuilt every 4 days, when the chosen lists change, or from "Update filters now".
 */

const MAX_AGE = 4 * 24 * 3600 * 1000
export const filterStatus = {
	state: 'Not loaded yet',
	updating: false,
	error: '',
}
const listeners = new Set<() => void>()
export const onFilters = (fn: () => void): (() => void) => {
	listeners.add(fn)
	return () => {
		listeners.delete(fn)
	}
}
const changed = () => {
	for (const fn of listeners)
		try {
			fn()
		} catch {}
}

const enabled = () =>
	LISTS.filter(l => settings().lists[l.id] ?? l.defaultOn).map(l => l.id)

function path(): string {
	return `${getConstants().cache}/floating-browser-filters.json`
}

async function download(urls: string[]): Promise<string> {
	let last = ''
	for (const url of urls) {
		try {
			const res = await fetch(url, { headers: { Accept: 'text/plain' } })
			if (res.ok) {
				const text = await res.text()
				if (text.length > 1000) return text
			}
			last = `${res.status}`
		} catch (e: any) {
			last = String(e?.message ?? e)
		}
	}
	throw new Error(last || 'no answer')
}

export async function updateFilters(force = false): Promise<void> {
	if (filterStatus.updating) return
	filterStatus.updating = true
	filterStatus.error = ''
	filterStatus.state = 'Downloading lists…'
	changed()
	try {
		const ids = enabled()
		const texts: Array<[string, string]> = []
		const failed: string[] = []
		for (const id of ids) {
			const def = LISTS.find(l => l.id === id)!
			try {
				texts.push([id, await download(def.urls)])
			} catch {
				failed.push(def.name)
			}
			filterStatus.state = `Downloaded ${texts.length} of ${ids.length}…`
			changed()
		}
		if (!texts.length)
			throw new Error(
				`couldn't download any list${force ? '' : ' (will try again later)'}`,
			)
		filterStatus.state = 'Compiling…'
		changed()
		await new Promise(r => setTimeout(r, 30))
		const c = compile(texts)
		use(c)
		try {
			await writeFile(path(), JSON.stringify(c))
		} catch {}
		save({ filtersBuiltAt: c.builtAt, filterLists: c.lists.join(',') })
		filterStatus.state = failed.length
			? `Ready (couldn't get: ${failed.join(', ')})`
			: 'Ready'
	} catch (e: any) {
		filterStatus.error = String(e?.message ?? e)
		filterStatus.state = 'Not ready'
	} finally {
		filterStatus.updating = false
		changed()
	}
}

/** At start: the cached filters, then an update in the background when they're old. */
export async function loadFilters(): Promise<void> {
	const s = settings()
	const wanted = enabled().join(',')
	let fresh = false
	try {
		const c = JSON.parse(await readFile(path())) as Compiled
		if (c?.hosts) {
			use(c)
			filterStatus.state = 'Ready'
			fresh = Date.now() - c.builtAt < MAX_AGE && c.lists.join(',') === wanted
			changed()
		}
	} catch {}
	if (!s.uBlock) return
	if (!fresh) setTimeout(() => void updateFilters(), 4000)
}
