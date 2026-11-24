/// <reference types="@valenced/types/hidden" />
import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { exists, readFile, writeFile } from '@valenced/modules/native/fs'
import {
	disablePluginInActiveSlot,
	enablePluginInActiveSlot,
	getInternalPluginMeta,
	isPluginEnabledInActiveSlot,
	isPluginInternal,
	pList,
} from '@valenced/plugins/_'
import * as repositories from '@valenced/plugins/_/repositories'
import { pluginStorageDirFor } from '@valenced/plugins/constants'
import { useState } from 'react'
import { ScrollView, TurboModuleRegistry } from 'react-native'

/**
 * Plugin Exporter: back up your plugins and restore them, from this plugin's settings.
 *
 * A backup is one JSON file:
 * - your repositories (Valenced's own internal ones left out);
 * - every plugin you installed (built-in Valenced plugins left out): id, name, version, the repo
 *   and channel it came from, whether it's on, and its settings file (storage.json in its storage
 *   folder, pluginStorageDirFor(id)).
 *
 * Restoring adds missing repos, installs missing plugins from their repos (planInstall +
 * installFromRepo, as Valenced's own installer does), writes each plugin's settings back and turns
 * each one on or off as it was. Settings are read by plugins when they start, so reload after.
 */

interface Backup {
	format: 'plugin-exporter'
	version: 1
	createdAt: string
	repos: string[]
	plugins: {
		id: string
		name: string
		version: string
		enabled: boolean
		repo: string | null
		channel?: string
		settings?: unknown
	}[]
}

const native = (name: string): any => {
	try {
		return (TurboModuleRegistry as any).get(name)
	} catch {
		return undefined
	}
}

function toast(text: string) {
	try {
		;(ToastActionCreators as any).open('plugin-exporter', { text })
	} catch {}
}

const storagePath = (id: string) => `${pluginStorageDirFor(id)}/storage.json`

async function readSettings(id: string): Promise<unknown> {
	try {
		const path = storagePath(id)
		if (!(await exists(path))) return undefined
		return JSON.parse(await readFile(path))
	} catch {
		return undefined
	}
}

export async function makeBackup(): Promise<Backup> {
	const plugins: Backup['plugins'] = []
	for (const p of pList.values() as Iterable<any>) {
		const meta = getInternalPluginMeta(p)
		if (isPluginInternal(meta)) continue
		const id = p.manifest.id
		plugins.push({
			id,
			name: p.manifest.name,
			version: p.manifest.version,
			enabled: isPluginEnabledInActiveSlot(p),
			repo: meta.source?.repo ?? null,
			channel: meta.source?.channel,
			settings: await readSettings(id),
		})
	}
	plugins.sort((a, b) => a.name.localeCompare(b.name))
	let repos: string[] = []
	try {
		repos = (await repositories.listRepos()).filter(r => !r.internal).map(r => r.url)
	} catch {}
	return { format: 'plugin-exporter', version: 1, createdAt: new Date().toISOString(), repos, plugins }
}

const isCancel = (e: any) => /cancel/i.test(String(e?.code ?? e?.message ?? e))
const msg = (e: any) => String(e?.message ?? e)

async function saveFile(text: string, name: string): Promise<string> {
	const files = native('NativeFileModule')
	if (typeof files?.writeFile !== 'function') throw new Error("couldn't reach Discord's file writer")
	const path = String(await files.writeFile('cache', name, text, 'utf8'))
	const uri = `file://${encodeURI(path.replace(/^file:\/*/, '/'))}`
	let screenError: string | undefined
	// 1. Android's Save screen (you pick the folder).
	const picker = native('RNDocumentPicker')
	if (typeof picker?.saveDocument === 'function') {
		try {
			const picked = await picker.saveDocument({ sourceUris: [uri], fileName: name, mimeType: 'application/json', copy: true })
			const written = await picker.writeDocuments?.(picked)
			const err = (Array.isArray(written) ? written : []).find((r: any) => r?.error)?.error
			if (err) throw new Error(String(err))
			return `Saved ${name}`
		} catch (e: any) {
			if (isCancel(e)) throw new Error('cancelled')
			screenError = msg(e)
		}
	}
	// 2. Straight to Downloads, the way Discord saves media.
	const media = native('NativeMediaManagerModule')
	if (typeof media?.downloadMediaAssetWithContentType === 'function') {
		try {
			await media.downloadMediaAssetWithContentType(uri, 0, 'application/json')
			return `Saved ${name} to Downloads`
		} catch (e: any) {
			throw new Error(`Save screen: ${screenError ?? 'unavailable'}; Downloads: ${msg(e)}`)
		}
	}
	throw new Error(`Save screen: ${screenError ?? 'unavailable'}. Use Copy instead`)
}

async function pickFile(): Promise<string> {
	const picker = native('RNDocumentPicker')
	const files = native('NativeFileModule')
	if (typeof picker?.pick !== 'function' || typeof files?.readAsset !== 'function')
		throw new Error("the file picker isn't available; use Restore from clipboard instead")
	let picked: any
	let lastError: unknown
	// Simplest options last: some phones' pickers fail on the fuller ones.
	for (const options of [
		{ mode: 'open', type: ['*/*'], allowMultiSelection: false, requestLongTermAccess: false },
		{ type: ['*/*'] },
		{ type: ['application/json', 'text/plain', 'application/octet-stream'] },
	]) {
		try {
			picked = await picker.pick(options)
			break
		} catch (e: any) {
			if (isCancel(e)) throw new Error('cancelled')
			lastError = e
		}
	}
	if (!picked) throw new Error(`file picker: ${msg(lastError)}`)
	const uri = (Array.isArray(picked) ? picked[0] : picked)?.uri
	if (!uri) throw new Error('no file picked')
	try {
		return String(await files.readAsset(uri, 'utf8'))
	} catch (e: any) {
		throw new Error(`reading the file: ${msg(e)}`)
	}
}

/**
 * Android drops clipboard text that is too big (about 1 MB per transfer) without an error, so the
 * copy is read back to check it really landed.
 */
async function copy(text: string, what: string) {
	const kb = Math.round(text.length / 1024)
	Clipboard.setString(text)
	let back = ''
	try {
		back = String((await Clipboard.getString()) ?? '')
	} catch {}
	if (back.length === text.length) return toast(`${what} copied (${kb} KB)`)
	throw new Error(
		`${what} is ${kb} KB, too big for Android's clipboard. Use Save backup file, or Copy plugin list only`,
	)
}

function parse(text: string): Backup {
	const b = JSON.parse(text)
	if (b?.format !== 'plugin-exporter' || !Array.isArray(b?.plugins)) throw new Error("that isn't a Plugin Exporter backup")
	return b
}

export async function restore(b: Backup, log: (line: string) => void) {
	const api: any = repositories
	// 1. Repositories.
	try {
		const current = await api.listRepos()
		const have = new Set(current.map((r: any) => r.url))
		const missing = b.repos.filter(u => !have.has(u))
		if (missing.length) {
			await api.setRepos([
				...current.filter((r: any) => !r.internal).map((r: any) => ({ url: r.url, enabled: r.enabled })),
				...missing.map(url => ({ url, enabled: true })),
			])
			log(`Added ${missing.length} repo${missing.length === 1 ? '' : 's'}`)
		}
		for (const url of b.repos) await api.refreshRepo(url).catch(() => {})
	} catch (e: any) {
		log(`Repos: ${e?.message ?? e}`)
	}
	// 2. Missing plugins.
	let installed = 0
	for (const p of b.plugins) {
		if (pList.has(p.id)) continue
		if (!p.repo) {
			log(`${p.name}: was sideloaded, install its zip by hand`)
			continue
		}
		try {
			const plan = await api.planInstall(p.id, { targets: { [p.id]: { repo: p.repo, channel: p.channel } } })
			await api.installFromRepo(plan)
			installed++
		} catch (e: any) {
			log(`${p.name}: couldn't install (${e?.message ?? e})`)
		}
	}
	if (installed) log(`Installed ${installed} plugin${installed === 1 ? '' : 's'}`)
	// 3. Settings.
	let restored = 0
	for (const p of b.plugins) {
		if (p.settings === undefined || p.id === 'dev.ketsuyumi.plugin-exporter') continue
		try {
			await writeFile(storagePath(p.id), JSON.stringify(p.settings))
			restored++
		} catch (e: any) {
			log(`${p.name}: settings not restored (${e?.message ?? e})`)
		}
	}
	if (restored) log(`Restored settings of ${restored} plugin${restored === 1 ? '' : 's'}`)
	// 4. On / off.
	let switched = 0
	for (const p of b.plugins) {
		const plugin = pList.get(p.id)
		if (!plugin || p.id === 'dev.ketsuyumi.plugin-exporter') continue
		try {
			if (isPluginEnabledInActiveSlot(plugin) === p.enabled) continue
			if (p.enabled) await enablePluginInActiveSlot(plugin, true)
			else await disablePluginInActiveSlot(plugin)
			switched++
		} catch {}
	}
	if (switched) log(`Turned ${switched} plugin${switched === 1 ? '' : 's'} on or off`)
	log(
		installed
			? 'Done. Reload Discord, then run this restore once more so the newly installed plugins get switched on or off too.'
			: 'Done. Reload Discord so every plugin picks up its settings.',
	)
}

function SettingsPage() {
	const { Stack, Text, TableRowGroup, TableRow } = Design as any
	const [busy, setBusy] = useState(false)
	const [lines, setLines] = useState<string[]>([])
	const [summary, setSummary] = useState<string>()
	const log = (line: string) => setLines(l => [...l, line])
	const run = (fn: () => Promise<void>) => async () => {
		if (busy) return
		setBusy(true)
		try {
			await fn()
		} catch (e: any) {
			const m = e?.message ?? String(e)
			if (m !== 'cancelled') {
				toast(`Failed: ${m}`)
				log(`Failed: ${m}`)
			}
		} finally {
			setBusy(false)
		}
	}
	const name = () => `valenced-plugins-${new Date().toISOString().slice(0, 10)}.json`
	const restoreFrom = (text: string) => {
		const b = parse(text)
		setLines([`Backup from ${b.createdAt.slice(0, 10)}: ${b.plugins.length} plugins, ${b.repos.length} repos`])
		return restore(b, log)
	}
	return (
		<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
			<Stack spacing={16}>
				<Text variant="text-md/normal">
					Back up every plugin you installed, with its repo, version, on/off state and settings, to one file.
					Restore it on any phone: missing repos and plugins are added, settings put back.
				</Text>
				<TableRowGroup title="Back up">
					<TableRow
						label="Save backup file"
						subLabel="Pick where to save it (Downloads, Drive…)"
						disabled={busy}
						onPress={run(async () => {
							const b = await makeBackup()
							setSummary(`${b.plugins.length} plugins, ${b.repos.length} repos`)
							toast(await saveFile(JSON.stringify(b, null, 2), name()))
						})}
					/>
					<TableRow
						label="Copy backup"
						subLabel="Plugins, repos and settings, to paste somewhere safe (a note, a DM to yourself)"
						disabled={busy}
						onPress={run(async () => {
							const b = await makeBackup()
							setSummary(`${b.plugins.length} plugins, ${b.repos.length} repos`)
							await copy(JSON.stringify(b), 'Backup')
						})}
					/>
					<TableRow
						label="Copy plugin list only"
						subLabel="Without settings: much smaller, fits the clipboard when the full backup doesn't"
						disabled={busy}
						onPress={run(async () => {
							const b = await makeBackup()
							for (const p of b.plugins) delete p.settings
							setSummary(`${b.plugins.length} plugins, ${b.repos.length} repos (no settings)`)
							await copy(JSON.stringify(b), 'Plugin list')
						})}
					/>
				</TableRowGroup>
				{summary ? (
					<Text variant="text-sm/medium" color="text-muted">
						Last backup: {summary}
					</Text>
				) : null}
				<TableRowGroup title="Restore">
					<TableRow label="Restore from file" disabled={busy} onPress={run(async () => restoreFrom(await pickFile()))} />
					<TableRow
						label="Restore from clipboard"
						subLabel="After copying a backup"
						disabled={busy}
						onPress={run(async () => restoreFrom(await Clipboard.getString()))}
					/>
				</TableRowGroup>
				{lines.length ? (
					<TableRowGroup title="Log">
						{lines.map((l, i) => (
							<TableRow key={i} label={l} />
						))}
					</TableRowGroup>
				) : null}
			</Stack>
		</ScrollView>
	)
}

export default plugin({
	start() {},
	SettingsComponent: SettingsPage,
})
