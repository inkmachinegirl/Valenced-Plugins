/// <reference types="@valenced/types/hidden" />
import { getAssetIdByName } from '@valenced/assets'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { before } from '@valenced/patcher'
import { isPluginEnabled } from '@valenced/plugins/_'
import { ScrollView } from 'react-native'

/**
 * More ways to sort and filter Settings > Plugins, by how much each plugin costs.
 *
 * Valenced's Plugins screen keeps its sort and filter choices in two objects (`Sorts`, `Filters`)
 * and hands those same objects to the Filter & Sort sheet when it opens
 * (`ActionSheetActionCreators.openLazy(…, 'filter-and-sort-plugins', { sorts, filters, … })`).
 * The list sorts with `Sorts[choice]`, so entries added to them here are real options. They are
 * added the first time the sheet opens and kept for the session (taking them out while one is
 * selected would break the list); while this plugin is off they just sort by name.
 *
 * The numbers come from dariuss's Performance Monitor, which keeps them on a shared global
 * (`stats`: per plugin id, total ms, calls, longest call, calls over 16 ms, startup ms, hooks).
 * Without it running, the cost sorts fall back to name.
 */

const SHEET = 'filter-and-sort-plugins'
const PM = Symbol.for('dariuss.performance-monitor.state')

interface Stat {
	calls: number
	ms: number
	max: number
	slow: number
	startup: number
	hooks: number
}

let active = false

function stats(): Map<string, Stat> | undefined {
	if (!active) return undefined
	const state = (globalThis as any)[PM]
	return state?.stats instanceof Map ? state.stats : undefined
}

const idOf = (p: any): string => p?.manifest?.id ?? ''
const nameOf = (p: any): string => p?.manifest?.name ?? ''
const byName = (a: any, b: any) => nameOf(a).localeCompare(nameOf(b))

/** Biggest first; ties and plugins with no numbers by name. */
function byStat(pick: (s: Stat) => number) {
	return (a: any, b: any) => {
		const all = stats()
		if (!all) return byName(a, b)
		const va = pick(all.get(idOf(a)) ?? ({} as Stat)) || 0
		const vb = pick(all.get(idOf(b)) ?? ({} as Stat)) || 0
		return vb - va || byName(a, b)
	}
}

function icon(...names: string[]): number | undefined {
	for (const name of names) {
		try {
			const id = getAssetIdByName(name)
			if (typeof id === 'number') return id
		} catch {}
	}
	return undefined
}

const enabled = (p: any) => {
	try {
		return isPluginEnabled(p)
	} catch {
		return true
	}
}

function extend(props: any) {
	const sorts = props?.sorts
	const filters = props?.filters
	if (!sorts || typeof sorts !== 'object' || sorts['Most resource use']) return
	const speed = icon('ClockIcon', 'TimerIcon', 'StopwatchIcon', 'IdIcon')
	const heavy = icon('BoltIcon', 'LightningIcon', 'FireIcon', 'WarningIcon', 'IdIcon')
	const add = (label: string, ico: number | undefined, fn: (a: any, b: any) => number) => {
		if (ico !== undefined) sorts[label] = [ico, fn]
	}
	add('Most resource use', heavy, byStat(s => s.ms))
	add('Longest call (stutters)', speed, byStat(s => s.max))
	add('Most calls', icon('RefreshIcon', 'RetryIcon', 'IdIcon'), byStat(s => s.calls))
	add('Slowest startup', icon('RocketIcon', 'ClockIcon', 'IdIcon'), byStat(s => s.startup))
	add('Most hooks', icon('LinkIcon', 'ChainIcon', 'IdIcon'), byStat(s => s.hooks))

	if (filters && typeof filters === 'object') {
		const warn = icon('WarningIcon', 'CircleErrorIcon', 'IdIcon')
		const idle = icon('MoonIcon', 'SleepIcon', 'CircleXIcon', 'IdIcon')
		if (warn !== undefined)
			filters['Causes stutters'] = {
				icon: warn,
				desc: 'Had a call over 16 ms (one dropped frame) since Performance Monitor last reset.',
				filter: (p: any) => (stats()?.get(idOf(p))?.slow ?? 0) > 0,
			}
		if (idle !== undefined)
			filters['Unused this session'] = {
				icon: idle,
				desc: 'Turned on but none of its hooks ran since Performance Monitor last reset: maybe not needed.',
				filter: (p: any) => {
					const all = stats()
					return !!all && enabled(p) && !(all.get(idOf(p))?.calls ?? 0)
				},
			}
	}
}

function SettingsPage() {
	const { TableRowGroup, TableRow, Text } = Design as any
	const all = stats()
	const top = all
		? [...all.values()]
				.filter((s: any) => s?.id && s.ms > 0)
				.sort((a, b) => b.ms - a.ms)
				.slice(0, 10)
		: []
	return (
		<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
			<Text variant="text-md/normal" style={{ marginBottom: 12 }}>
				Open Settings › Plugins › the filter button next to search. New sorts: Most resource use,
				Longest call, Most calls, Slowest startup, Most hooks. New filters: Causes stutters,
				Unused this session.
			</Text>
			<TableRowGroup title={all ? 'Heaviest right now' : 'Performance Monitor'}>
				{all ? (
					top.length ? (
						top.map((s: any) => (
							<TableRow
								key={s.id}
								label={(globalThis as any)[PM]?.names?.get?.(s.id) ?? s.id}
								subLabel={`${Math.round(s.ms)} ms in ${s.calls} calls · longest ${s.max.toFixed(1)} ms · ${s.slow} over 16 ms`}
							/>
						))
					) : (
						<TableRow label="Nothing measured yet" subLabel="Use Discord for a bit, then come back." />
					)
				) : (
					<TableRow
						label="Not running"
						subLabel="The cost sorts need dariuss's Performance Monitor turned on; without it they sort by name."
					/>
				)}
			</TableRowGroup>
		</ScrollView>
	)
}

export default plugin({
	start({ cleanup }) {
		active = true
		cleanup(
			before(ActionSheetActionCreators as any, 'openLazy', (args: any[]) => {
				if (args?.[1] === SHEET) {
					try {
						extend(args[2])
					} catch {}
				}
				return args
			}),
			() => {
				active = false
			},
		)
	},
	SettingsComponent: SettingsPage,
})
