/// <reference types="@valenced/types/hidden" />
import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { pList } from '@valenced/plugins/_'
import * as repositories from '@valenced/plugins/_/repositories'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { type SyncResult, type SyncState, syncOnce } from './sync'

interface Settings extends SyncState {
	update: boolean
	installNew: boolean
	/** Minutes between checks. */
	every: number
}
const DEFAULTS: Settings = { update: true, installNew: true, every: 5 }
let storage: any
const settings = (): Settings => ({ ...DEFAULTS, ...(storage?.cache ?? {}) })
const toast = (text: string) =>
	(ToastActionCreators as any).open('repo-autoupdate', { text })

const status = { last: 'Not checked yet', at: 0, running: false }

const nameOf = (id: string) => {
	try {
		return (pList.get(id) as any)?.manifest?.name ?? id
	} catch {
		return id
	}
}

async function check(manual = false) {
	if (status.running) return
	status.running = true
	try {
		const s = settings()
		const { result, state } = await syncOnce(repositories as any, s, {
			update: s.update,
			installNew: s.installNew,
			isInstalled: id => pList.has(id),
		})
		storage?.set?.({ ...settings(), known: state.known }, true)
		status.at = Date.now()
		status.last = describe(result)
		const changed = result.updated.length + result.installed.length
		if (changed) {
			const names = [...result.updated, ...result.installed]
				.map(nameOf)
				.join(', ')
			toast(
				result.pending.length
					? `Updated ${names}. Restart Discord to finish`
					: `Updated ${names}`,
			)
		} else if (manual) toast(result.errors[0] ?? 'Everything is up to date')
	} catch (e: any) {
		status.last = `Check failed: ${e?.message ?? e}`
		if (manual) toast(status.last)
	} finally {
		status.running = false
	}
}

function describe(r: SyncResult): string {
	const parts = [
		r.updated.length ? `updated ${r.updated.map(nameOf).join(', ')}` : '',
		r.installed.length ? `installed ${r.installed.map(nameOf).join(', ')}` : '',
		r.pending.length ? 'restart Discord to finish' : '',
		...r.errors,
	].filter(Boolean)
	return parts.length ? parts.join(' · ') : 'Up to date'
}

function SettingsPage() {
	const { TableRowGroup, TableSwitchRow, TableRow } = Design as any
	const [s, setS] = useState(settings)
	const [, tick] = useState(0)
	const set = (patch: Partial<Settings>) => {
		const next = { ...s, ...patch }
		storage?.set?.(next, true)
		setS(next)
	}
	return (
		<ScrollView contentContainerStyle={{ padding: 16 }}>
			<TableRowGroup title="What to do">
				<TableSwitchRow
					label="Install updates"
					subLabel="Plugins from Satou's repository you have installed"
					value={s.update}
					onValueChange={(update: boolean) => set({ update })}
				/>
				<TableSwitchRow
					label="Install new plugins"
					subLabel="Ones published after this plugin was set up. Plugins already there, or ones you removed, aren't installed"
					value={s.installNew}
					onValueChange={(installNew: boolean) => set({ installNew })}
				/>
			</TableRowGroup>
			<TableRowGroup title="How often">
				{[5, 15, 60].map(m => (
					<TableSwitchRow
						key={m}
						label={`Every ${m} minutes`}
						value={s.every === m}
						onValueChange={(on: boolean) => on && set({ every: m })}
					/>
				))}
			</TableRowGroup>
			<TableRowGroup title="Status">
				<TableRow
					label="Last check"
					subLabel={`${status.at ? new Date(status.at).toLocaleTimeString() : 'never'} · ${status.last}`}
				/>
				<TableRow
					label="Check now"
					arrow
					onPress={async () => {
						await check(true)
						tick(n => n + 1)
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
		let timer: any
		const loop = () => {
			timer = setTimeout(async () => {
				await check()
				loop()
			}, Math.max(1, settings().every) * 60_000)
		}
		// A little after Discord starts, then on the chosen interval.
		const first = setTimeout(() => void check().then(loop), 20_000)
		cleanup(() => {
			clearTimeout(first)
			clearTimeout(timer)
			storage = undefined
		})
	},
	SettingsComponent: SettingsPage,
} as any)
