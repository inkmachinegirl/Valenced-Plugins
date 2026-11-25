import {
	ActionSheetActionCreators,
	AlertActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { after, before } from '@valenced/patcher'
import {
	cloneElement,
	createElement,
	isValidElement,
	useEffect,
	useState,
} from 'react'
import { processColor, ScrollView } from 'react-native'
import { barAvailable, installBar } from './bar'
import { findModule } from './find'
import {
	handlerStatus,
	installHandlers,
	noteTap,
	tapSeen,
	targetOf,
} from './handlers'
import { chatbarStatus, installChatbar } from './chatbar'
import { headerStatus, installHeader } from './header'
import type { Side } from './chatbar'
import {
	canDelete,
	canDeleteAtAll,
	deleteAll,
	deleting,
	stopDeleting,
	watchActions,
} from './remove'
import {
	activate,
	channelCount,
	clear,
	forget,
	isSelected,
	onSelectionChange,
	selection,
	setKeepWhenEmpty,
	start,
	toggle,
	watchChannelMessages,
} from './selection'
import type { PluginApi } from '@valenced/plugins/types'
import type { Picked } from './selection'

interface Settings {
	/** Highlight colour of selected messages. */
	color: string
	/**
	 * Double-tap selects and deselects while selecting. A new key in 1.1.0 (was `doubleTap`, on by
	 * default) so it starts off for everyone.
	 */
	doubleTapSelect: boolean
	/** A plain tap selects and deselects while selecting (1.3.0). */
	tapSelect: boolean
	/** A select button in the chat's top bar (1.3.0). */
	headerButton: boolean
	/** A select toggle in the chat input bar (1.4.0). */
	chatButton: Side
	/** "Select messages" in the message long-press menu (1.6.0). */
	menuRow: boolean
}
type Api = PluginApi<{ jsonStorage: Settings }>

const DEFAULTS: Settings = {
	color: '#5865F2',
	doubleTapSelect: false,
	tapSelect: true,
	headerButton: true,
	chatButton: 'left',
	menuRow: true,
}
const COLORS: [string, string][] = [
	['#5865F2', 'Blurple'],
	['#23A55A', 'Green'],
	['#F0B232', 'Yellow'],
	['#EB459E', 'Pink'],
	['#F23F42', 'Red'],
]

let enabled = false
let settings: () => Settings = () => DEFAULTS

function toast(text: string) {
	try {
		ToastActionCreators.open('multi-select', { text } as never)
	} catch {}
}

function hint() {
	const n = selection.items.size
	const channels = channelCount()
	const where = channels > 1 ? ` in ${channels} channels` : ''
	const how =
		tapSeen && settings().tapSelect
			? 'tap messages to add or remove them'
			: 'long-press messages to add or remove them'
	toast(
		n
			? barAvailable()
				? `${n} selected${where} · ${how}`
				: `${n} selected${where} · long-press for Delete`
			: selection.active
				? `Selecting · ${how}`
				: 'Selection cleared',
	)
}

// ---------------------------------------------------------------------------------------------
// The options: ⋮ in the bar (or long-press, when the bar can't be shown).

/** The message an option is about, when opened from a long-press. */
interface Here {
	channelId: string
	messageId: string
	authorId?: string
}

/** Rough time for [n] deletes at 3 to 5 seconds apart (4 on average). */
function howLong(n: number): string {
	if (n < 2) return ''
	const minutes = Math.ceil(((n - 1) * 4) / 60)
	return ` Takes about ${minutes > 1 ? `${minutes} minutes` : 'a minute or less'} (3 to 5 seconds each).`
}

function openOptions(here?: Here) {
	const { AlertModal, AlertActionButton } = Design as any
	const key = `multi-select-${Date.now()}`
	const close = () => (AlertActionCreators as any).dismissAlert(key)
	const items = [...selection.items.values()]
	const deletable = items.filter(canDelete)
	const blocked = items.length - deletable.length
	const channels = channelCount()
	const selectedHere = here ? isSelected(here.channelId, here.messageId) : false
	;(AlertActionCreators as any).openAlert(
		key,
		<AlertModal
			title={`${items.length} message${items.length === 1 ? '' : 's'} selected${channels > 1 ? ` in ${channels} channels` : ''}`}
			content={
				blocked
					? `${deletable.length} can be deleted. ${blocked} ${blocked === 1 ? "isn't yours" : "aren't yours"}, in a place where you can't delete other people's messages.`
					: `Deleting removes them for everyone. This cannot be undone.${howLong(deletable.length)}`
			}
			actions={
				<>
					{deletable.length ? (
						<AlertActionButton
							text={`Delete ${deletable.length}`}
							variant="destructive"
							onPress={() => {
								close()
								void runDelete(deletable)
							}}
						/>
					) : null}
					{here ? (
						<AlertActionButton
							text={
								selectedHere ? 'Deselect this message' : 'Select this message'
							}
							variant="secondary"
							onPress={() => {
								close()
								toggle(here.channelId, here.messageId, here.authorId)
								hint()
							}}
						/>
					) : null}
					<AlertActionButton
						text="Clear selection"
						variant="secondary"
						onPress={() => {
							close()
							clear()
							hint()
						}}
					/>
					<AlertActionButton
						text="Keep selecting"
						variant="secondary"
						onPress={close}
					/>
				</>
			}
		/>,
	)
}

async function runDelete(items: Picked[]) {
	if (!canDeleteAtAll()) {
		toast("Couldn't find Discord's delete action")
		return
	}
	if (deleting) {
		toast('Already deleting · tap ✕ to stop')
		return
	}
	const { deleted, failed, skipped } = await deleteAll(items, (n, total) =>
		toast(
			total > 1
				? `Deleting ${n} of ${total}… · ✕ stops`
				: 'Deleting…',
		),
	)
	forget(deleted)
	if (!failed.length && !skipped.length) clear()
	toast(
		skipped.length
			? `Stopped · deleted ${deleted.length}, ${skipped.length} left selected`
			: failed.length
				? `Deleted ${deleted.length}, ${failed.length} failed (still selected)`
				: `Deleted ${deleted.length} message${deleted.length === 1 ? '' : 's'}`,
	)
}

// ---------------------------------------------------------------------------------------------
// "Select messages" in the message long-press menu (the HideMessages technique: remember the
// message when the sheet opens, then add a row shaped like the sheet's last row).

const SHEET_KEY = 'MessageLongPressActionSheet'
let pending: { message: any } | null = null

const isRow = (c: any) =>
	!!c && typeof c === 'object' && !!c.props && typeof c.props.label === 'string'

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

function withSelectRow(rendered: any) {
	const message = pending?.message
	if (!enabled || settings().menuRow === false || !message?.id) return rendered
	const rows = lastRowArray(rendered)
	if (!rows) return rendered
	const at = rows.reduce(
		(last: number, c: any, i: number) => (isRow(c) ? i : last),
		-1,
	)
	const template = rows[at]
	if (!template?.type) return rendered
	const channelId = message.channel_id ?? message.channelId
	const selected = isSelected(channelId, message.id)
	rows.splice(
		at + 1,
		0,
		createElement(template.type, {
			key: 'multi-select',
			label: selected ? 'Deselect message' : 'Select messages',
			icon: template.props?.icon,
			onPress: () => {
				try {
					;(ActionSheetActionCreators as any).hideActionSheet?.()
				} catch {}
				if (selected) toggle(channelId, message.id)
				else start(channelId, message.id, message.author?.id)
				hint()
			},
		}),
	)
	return rendered
}

// ---------------------------------------------------------------------------------------------

function SettingsPage({ api }: { api: Api }) {
	const {
		Stack,
		Text,
		TableRowGroup,
		TableRow,
		TableSwitchRow,
		TableRadioGroup,
		TableRadioRow,
	} = Design as any
	const s = { ...DEFAULTS, ...api.jsonStorage.use() }
	const set = (patch: Partial<Settings>) =>
		api.jsonStorage.set({ ...s, ...patch }, true)
	const [, tick] = useState(0)
	useEffect(() => onSelectionChange(() => tick(n => n + 1)), [])
	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
			<Stack spacing={24}>
				<TableRowGroup title="How to use">
					<TableRow
						label="1. Start selecting"
						subLabel="Tap the ✓ button in the chat bar or the top bar, or long-press a message and choose Select messages. A bar shows at the top."
					/>
					<TableRow
						label="2. Tap messages"
						subLabel="Each one is highlighted. Tap again to remove it. Long-press works too."
					/>
					<TableRow
						label="3. Tap ⋮ in the bar"
						subLabel="Delete them or clear the selection. ✕ stops selecting."
					/>
				</TableRowGroup>
				<TableRowGroup title="Options">
					<TableSwitchRow
						label="Select button in the top bar"
						subLabel="A ✓ button next to search in chats that starts (or stops) selecting."
						value={s.headerButton}
						onValueChange={(headerButton: boolean) => set({ headerButton })}
					/>
					<TableSwitchRow
						label="Select messages in the long-press menu"
						subLabel="The row this plugin adds when you hold a message. Turn off to keep that menu as Discord's; start selecting from the ✓ buttons instead."
						value={s.menuRow !== false}
						onValueChange={(menuRow: boolean) => set({ menuRow })}
					/>
					<TableSwitchRow
						label="Tap to select"
						subLabel="While selecting, a single tap adds or removes a message instead of opening it."
						value={s.tapSelect}
						onValueChange={(tapSelect: boolean) => set({ tapSelect })}
					/>
					<TableSwitchRow
						label="Double-tap to select"
						subLabel="Double-tap also adds or removes messages while selecting. Leave off if another plugin uses double-tap."
						value={s.doubleTapSelect}
						onValueChange={(doubleTapSelect: boolean) =>
							set({ doubleTapSelect })
						}
					/>
				</TableRowGroup>
				<TableRadioGroup
					title="Chat bar button"
					defaultValue={s.chatButton}
					value={s.chatButton}
					onChange={(chatButton: Side) => set({ chatButton })}
				>
					<TableRadioRow label="Left (after +)" value="left" />
					<TableRadioRow label="Right (before emoji)" value="right" />
					<TableRadioRow label="Hidden" value="off" />
				</TableRadioGroup>
				<TableRadioGroup
					title="Highlight colour"
					defaultValue={s.color}
					value={s.color}
					onChange={(color: string) => set({ color })}
				>
					{COLORS.map(([value, label]) => (
						<TableRadioRow key={value} label={label} value={value} />
					))}
				</TableRadioGroup>
				<TableRowGroup title="Status">
					<TableRow label="Chat gestures" subLabel={handlerStatus} />
					<TableRow
						label="Taps"
						subLabel={
							tapSeen
								? 'Working'
								: "No tap seen yet. Start selecting and tap a message; if it still says this, Discord doesn't pass taps here, so use long-press."
						}
					/>
					<TableRow label="Top bar button" subLabel={headerStatus()} />
					<TableRow label="Chat bar button" subLabel={chatbarStatus()} />
					<TableRow
						label="Selected now"
						subLabel={
							selection.active
								? `${selection.items.size} message(s) in ${channelCount()} channel(s)`
								: 'Nothing'
						}
					/>
					{selection.active ? (
						<TableRow label="Clear selection" arrow onPress={() => clear()} />
					) : null}
				</TableRowGroup>
				<Text variant="text-sm/medium" color="text-muted">
					You can always delete your own messages. Other people's can only be
					deleted in servers where you have Manage Messages. Messages are
					deleted one at a time, 3 to 5 seconds apart (like Discrub), to
					stay well within Discord's limits. Tap ✕ to stop part-way.
				</Text>
			</Stack>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		enabled = true
		settings = () => ({ ...DEFAULTS, ...jsonStorage.cache })
		cleanup(() => {
			enabled = false
			pending = null
			if (selection.active) clear()
		})
		cleanup(watchChannelMessages(), watchActions())
		setKeepWhenEmpty(barAvailable)
		cleanup(() => setKeepWhenEmpty(() => false))
		const toggleSelecting = () => {
			if (selection.active) clear()
			else activate()
			hint()
		}
		cleanup(
			installChatbar({
				side: () => (enabled ? settings().chatButton : 'off'),
				onPress: toggleSelecting,
			}),
		)
		cleanup(
			installHeader({
				enabled: () => enabled && settings().headerButton,
				active: () => selection.active,
				onPress: toggleSelecting,
			}),
		)
		cleanup(
			installBar({
				options: () => {
					openOptions()
				},
				cancel: () => {
					// While deleting, ✕ stops the delete and keeps what's left selected.
					if (deleting) {
						stopDeleting()
						toast('Stopping after this one…')
						return
					}
					clear()
					hint()
				},
			}),
		)

		// Highlight selected rows. The row descriptor Discord draws from carries
		// `backgroundHighlight: { backgroundColor, gutterColor }` (ARGB numbers), the same field
		// mentions and Ghost Log's deleted messages use.
		const patched = new WeakSet<object>()
		cleanup(
			getModules(
				withName<any>('RowManager'),
				(RowManager: any) => {
					const proto = RowManager?.prototype
					if (typeof proto?.generate !== 'function' || patched.has(proto))
						return
					patched.add(proto)
					cleanup(
						after(proto, 'generate', ((row: any) => {
							try {
								const message = row?.message
								if (!selection.active || !message) return row
								if (!isSelected(message.channelId, message.id)) return row
								const color = settings().color || DEFAULTS.color
								row.backgroundHighlight = {
									backgroundColor: processColor(`${color}40`),
									gutterColor: processColor(color),
								}
							} catch {}
							return row
						}) as never),
					)
				},
				{ max: 10 },
			),
		)

		// Gestures while selecting.
		cleanup(
			installHandlers({
				// Discord routes plain taps on a message through here (it acts only on a few special
				// messages and ignores the rest), so while selecting a tap can toggle instead.
				handleTapMessage: (instance, original) =>
					function (this: unknown, ...args: any[]) {
						try {
							noteTap()
							if (enabled && selection.active && settings().tapSelect) {
								const { messageId, message, channel } = targetOf(
									instance,
									args[0],
								)
								if (messageId && channel?.id) {
									toggle(channel.id, messageId, message?.author?.id)
									hint()
									return
								}
							}
						} catch {}
						return original.apply(this, args)
					},
				handleDoubleTapMessage: (instance, original) =>
					function (this: unknown, ...args: any[]) {
						try {
							if (enabled && selection.active && settings().doubleTapSelect) {
								const { messageId, message, channel } = targetOf(
									instance,
									args[0],
								)
								if (messageId && channel?.id) {
									toggle(channel.id, messageId, message?.author?.id)
									hint()
									return
								}
							}
						} catch {}
						return original.apply(this, args)
					},
				handleLongPressMessage: (instance, original) =>
					function (this: unknown, ...args: any[]) {
						try {
							if (enabled && selection.active) {
								const { messageId, message, channel } = targetOf(
									instance,
									args[0],
								)
								// Any channel: a selection can span several (1.2.0).
								if (channel?.id && messageId) {
									const authorId = message?.author?.id
									// With the bar up, long-press adds or removes, like a chat app; the
									// options are behind ⋮. Without it, long-press opens the options.
									if (barAvailable()) {
										toggle(channel.id, messageId, authorId)
										hint()
									} else
										openOptions({ channelId: channel.id, messageId, authorId })
									return
								}
							}
						} catch {}
						return original.apply(this, args)
					},
			}),
		)

		// "Select messages" in the long-press menu.
		cleanup(
			findModule(
				'modules/action_sheet/native/ActionSheetActionCreators.tsx',
				['openLazy', 'hideActionSheet'],
				(mod: any) => {
					const host = typeof mod?.openLazy === 'function' ? mod : mod?.default
					if (typeof host?.openLazy !== 'function') return
					cleanup(
						before(host, 'openLazy', ((args: any[]) => {
							const [, key, props] = args ?? []
							if (key === SHEET_KEY && props?.message)
								pending = { message: props.message }
							else if (key === SHEET_KEY) pending = null
							return args
						}) as never),
					)
				},
			),
			findModule(
				'modules/messages/native/long_press/LongPressMessageActionSheet.tsx',
				['LongPressMessageActionSheet'],
				(mod: any) => {
					if (typeof mod?.default !== 'function') return
					cleanup(
						after(mod, 'default', ((rendered: any) => {
							try {
								return isValidElement(rendered) || Array.isArray(rendered)
									? withSelectRow(rendered)
									: rendered
							} catch {
								return rendered
							}
						}) as never),
					)
				},
			),
		)
	},
	SettingsComponent: SettingsPage,
})
