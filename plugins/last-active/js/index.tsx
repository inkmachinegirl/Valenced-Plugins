import { ActionSheetActionCreators, ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, before } from '@valenced/patcher'
import { createElement, isValidElement } from 'react'
import { ScrollView } from 'react-native'

/**
 * Last Active: jump to someone's last message (or your own) in this channel or the whole server,
 * from the message long-press menu.
 *
 * - The menu: the sheet's message is remembered when ActionSheetActionCreators.openLazy opens
 *   'MessageLongPressActionSheet', and rows shaped like the sheet's own last row are added to what
 *   LongPressMessageActionSheet renders (the Multi Select technique).
 * - Finding it: Discord's message search (newest first), with author_id and, for "here",
 *   channel_id; DMs search the DM itself. One request per tap.
 * - Jumping: open the channel if it's another one, then MessageActionCreators.jumpToMessage with
 *   flash, as tapping a reply does.
 */

const SHEET_KEY = 'MessageLongPressActionSheet'
const S = Stores as any

interface Settings {
	theirs: boolean
	server: boolean
	mine: boolean
}
const DEFAULTS: Settings = { theirs: true, server: true, mine: true }
let storage: any
const settings = (): Settings => ({ ...DEFAULTS, ...(storage?.cache ?? {}) })

let pending: { message: any } | null = null

function toast(text: string) {
	try {
		;(ToastActionCreators as any).open('last-active', { text })
	} catch {}
}

function find(...props: string[]): any {
	try {
		const [mod] = lookupModule((withProps as any)(...props)) as any
		return mod?.[props[0]!] ? mod : mod?.default
	} catch {
		return undefined
	}
}

async function search(userId: string, channel: any, wholeServer: boolean) {
	const http = find('getAPIBaseURL', 'get')
	if (typeof http?.get !== 'function') throw new Error("couldn't reach Discord")
	const guildId = channel?.guild_id
	const res = await http.get(
		guildId
			? {
					url: `/guilds/${guildId}/messages/search`,
					query: { author_id: userId, include_nsfw: true, ...(wholeServer ? {} : { channel_id: channel.id }) },
					retries: 1,
				}
			: { url: `/channels/${channel.id}/messages/search`, query: { author_id: userId }, retries: 1 },
	)
	if (res?.status === 202) throw new Error('Discord is still indexing this, try again in a moment')
	const hit = res?.body?.messages?.[0]
	return (Array.isArray(hit) ? hit[0] : hit) as { id: string; channel_id: string } | undefined
}

async function jump(userId: string, channel: any, wholeServer: boolean, who: string) {
	toast(`Looking for ${who} last message…`)
	try {
		const hit = await search(userId, channel, wholeServer)
		if (!hit?.id) return toast(`No messages from ${who === 'your' ? 'you' : 'them'} ${wholeServer ? 'in this server' : 'here'}`)
		const current = S.SelectedChannelStore?.getChannelId?.()
		if (hit.channel_id !== current) {
			find('transitionToChannel')?.transitionToChannel?.(hit.channel_id, {})
			await new Promise(r => setTimeout(r, 350))
		}
		const actions = find('jumpToMessage')
		if (typeof actions?.jumpToMessage !== 'function') throw new Error("couldn't jump")
		actions.jumpToMessage({ channelId: hit.channel_id, messageId: hit.id, flash: true })
	} catch (e: any) {
		toast(`Couldn't find it: ${e?.body?.message ?? e?.message ?? e}`)
	}
}

const isRow = (c: any) => !!c && typeof c === 'object' && !!c.props && typeof c.props.label === 'string'

function lastRowArray(node: any, depth = 0): any[] | null {
	if (!node || typeof node !== 'object' || depth > 24) return null
	let found: any[] | null = null
	if (Array.isArray(node)) {
		if (node.some(isRow)) found = node
		for (const child of node) found = lastRowArray(child, depth + 1) ?? found
		return found
	}
	return node.props ? lastRowArray(node.props.children, depth + 1) : null
}

function withRows(rendered: any) {
	const message = pending?.message
	const author = message?.author
	const channel = S.ChannelStore?.getChannel?.(message?.channel_id ?? message?.channelId)
	if (!author?.id || !channel) return rendered
	const rows = lastRowArray(rendered)
	if (!rows) return rendered
	const at = rows.reduce((last: number, c: any, i: number) => (isRow(c) ? i : last), -1)
	const template = rows[at]
	if (!template?.type) return rendered
	const me = S.UserStore?.getCurrentUser?.()?.id
	const mine = author.id === me
	const name = mine ? 'My' : `${author.globalName ?? author.global_name ?? author.username}'s`
	const s = settings()
	const row = (key: string, label: string, run: () => void) =>
		createElement(template.type, {
			key: `last-active-${key}`,
			label,
			icon: template.props?.icon,
			onPress: () => {
				try {
					;(ActionSheetActionCreators as any).hideActionSheet?.()
				} catch {}
				run()
			},
		})
	const extra: any[] = []
	const who = mine ? 'your' : 'their'
	if (s.theirs) extra.push(row('here', `${name} last message here`, () => jump(author.id, channel, false, who)))
	if (s.server && channel.guild_id)
		extra.push(row('server', `${name} last message in this server`, () => jump(author.id, channel, true, who)))
	if (s.mine && !mine && me) extra.push(row('mine', 'My last message here', () => jump(me, channel, false, 'your')))
	rows.splice(at + 1, 0, ...extra)
	return rendered
}

function SettingsPage() {
	const { TableRowGroup, TableSwitchRow, Text } = Design as any
	const s: Settings = { ...DEFAULTS, ...(storage?.use?.() ?? {}) }
	const set = (patch: Partial<Settings>) => storage?.set?.({ ...s, ...patch }, true)
	return (
		<ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
			<Text variant="text-md/normal">
				Long-press any message for these. Each tap does one Discord search, then jumps to the message and
				highlights it.
			</Text>
			<TableRowGroup title="Rows in the message menu">
				<TableSwitchRow
					label="Their last message here"
					value={s.theirs}
					onValueChange={(theirs: boolean) => set({ theirs })}
				/>
				<TableSwitchRow
					label="Their last message in this server"
					value={s.server}
					onValueChange={(server: boolean) => set({ server })}
				/>
				<TableSwitchRow
					label="My last message here"
					subLabel="On other people's messages (on yours, the rows above are already about you)."
					value={s.mine}
					onValueChange={(mine: boolean) => set({ mine })}
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
			getModuleWithImportedPath<any>('modules/action_sheet/native/ActionSheetActionCreators.tsx', mod => {
				const host = typeof mod?.openLazy === 'function' ? mod : mod?.default
				if (typeof host?.openLazy !== 'function') return
				cleanup(
					before(host, 'openLazy', ((args: any[]) => {
						const [, key, props] = args ?? []
						if (key === SHEET_KEY) pending = props?.message ? { message: props.message } : null
						return args
					}) as never),
				)
			}),
			getModuleWithImportedPath<any>('modules/messages/native/long_press/LongPressMessageActionSheet.tsx', mod => {
				if (typeof mod?.default !== 'function') return
				cleanup(
					after(mod, 'default', ((rendered: any) => {
						try {
							return isValidElement(rendered) || Array.isArray(rendered) ? withRows(rendered) : rendered
						} catch {
							return rendered
						}
					}) as never),
				)
			}),
			() => {
				pending = null
				storage = undefined
			},
		)
	},
	SettingsComponent: SettingsPage,
})
