import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { instead } from '@valenced/patcher'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { checkStatus, createChecker } from './check'
import { rework } from './list'

const S = () => Stores as any

interface Settings {
	/** `${guildId}:${userId}` → [1 talked / 0 never, checked at]. */
	answers: Record<string, [0 | 1, number]>
	/** Servers where never-talked people are hidden from the member list. */
	hideGuilds: string[]
}
const DEFAULTS: Settings = { answers: {}, hideGuilds: [] }
let storage: any
let answers: Record<string, [0 | 1, number]> = {}
let hideGuilds = new Set<string>()
let version = 0

let saveTimer: any
const save = () => {
	clearTimeout(saveTimer)
	saveTimer = setTimeout(
		() =>
			storage?.set?.(
				{
					...DEFAULTS,
					...(storage?.cache ?? {}),
					answers,
					hideGuilds: [...hideGuilds],
				},
				true,
			),
		5000,
	)
}

let redrawTimer: any
const redraw = () => {
	version++
	clearTimeout(redrawTimer)
	redrawTimer = setTimeout(() => {
		try {
			S().ChannelMemberStore?.emitChange?.()
		} catch {}
	}, 400)
}

const checker = () => current
let current: ReturnType<typeof createChecker> | undefined

/** For other plugins (Blocked Messages Toggle's eye menu). */
const api = {
	isHidden: (guildId: string) => hideGuilds.has(guildId),
	setHidden(guildId: string, on: boolean) {
		if (on) hideGuilds.add(guildId)
		else hideGuilds.delete(guildId)
		save()
		redraw()
	},
}

/** getProps hands out a new object each time around the same rows: reuse our answer for them. */
const cache = new WeakMap<object, { v: number; hide: boolean; out: any }>()

function SettingsPage() {
	const { TableRowGroup, TableRow } = Design as any
	const [, tick] = useState(0)
	const never = Object.values(answers).filter(a => a[0] === 0).length
	return (
		<ScrollView contentContainerStyle={{ padding: 16 }}>
			<TableRowGroup title="How it works">
				<TableRow
					label="People you see in member lists are checked"
					subLabel="One message search every few seconds (like typing from: them), only for people shown, newest first. Answers are kept: talked for good, never talked for a week"
				/>
				<TableRow
					label="Hide them in a server"
					subLabel="Chat Filters' eye menu on the member list has a switch for it"
				/>
			</TableRowGroup>
			<TableRowGroup title="Status">
				<TableRow
					label="Checked so far"
					subLabel={`${Object.keys(answers).length} people · ${never} never talked · ${checkStatus.searched} searches this session · ${checkStatus.waitingFor} waiting`}
				/>
				{checkStatus.lastError ? (
					<TableRow
						label="Last search problem"
						subLabel={checkStatus.lastError}
					/>
				) : null}
				<TableRow
					label="Forget all answers"
					onPress={() => {
						answers = {}
						save()
						redraw()
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
		const s = { ...DEFAULTS, ...(jsonStorage?.cache ?? {}) }
		answers = { ...s.answers }
		hideGuilds = new Set(s.hideGuilds)
		current = createChecker(
			{
				get: key => {
					const a = answers[key]
					return a ? { a: a[0], t: a[1] } : undefined
				},
				put: (key, a) => {
					answers[key] = [a, Date.now()]
					save()
				},
			},
			redraw,
		)
		;(globalThis as any).__neverTalked = api

		const store = S().ChannelMemberStore
		if (typeof store?.getProps === 'function')
			cleanup(
				instead(
					store,
					'getProps',
					function (this: unknown, args: any[], orig: any) {
						const out: any = Reflect.apply(orig, this, args)
						try {
							const guildId = String(args[0] ?? '')
							const rows = out?.rows
							if (!guildId || !Array.isArray(rows)) return out
							const hide = hideGuilds.has(guildId)
							const hit = cache.get(rows)
							if (hit && hit.v === version && hit.hide === hide)
								return { ...out, rows: hit.out.rows, groups: hit.out.groups }
							const c = checker()
							const next = rework(
								out,
								guildId,
								uid => c?.answer(guildId, uid),
								hide,
								uid => c?.seen(guildId, uid),
							)
							cache.set(rows, { v: version, hide, out: next })
							return next
						} catch {
							return out
						}
					},
				),
			)

		cleanup(() => {
			current?.stop()
			current = undefined
			delete (globalThis as any).__neverTalked
			clearTimeout(saveTimer)
			storage?.set?.(
				{
					...DEFAULTS,
					...(storage?.cache ?? {}),
					answers,
					hideGuilds: [...hideGuilds],
				},
				true,
			)
			storage = undefined
			redraw()
		})
	},
	SettingsComponent: SettingsPage,
} as any)
