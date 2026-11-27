import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { useState } from 'react'
import { Dimensions, Pressable, ScrollView, Text as RNText, Vibration, View } from 'react-native'
import { findModule } from './find'
import { handlerStatus, installHandlers, targetOf } from './handlers'

/**
 * Tap to React: one tap on a message adds a reaction (❤️ by default), like a like; tapping a
 * message you already reacted to takes it off.
 *
 * Taps reach Discord's chat handlers (MessagesHandlers: handleTapMessage, handleDoubleTapMessage,
 * handleLongPressMessage; see handlers.ts). Discord's own tap still runs first. The reaction waits
 * a moment: if a second tap, a double tap or a long press comes, it's dropped, so a double tap to
 * reply (or anything else on double tap) keeps working. Reactions go through Discord's own
 * ReactionActionCreators, so they look and sync exactly like ones from the picker.
 */

const REACTIONS = 'modules/reactions/ReactionActionCreators.tsx'

interface Settings {
	on: boolean
	/** The emoji: a character (❤️) or a custom one as <:name:id> / <a:name:id>. */
	emoji: string
	/** A second tap on a message you reacted to takes the reaction off. */
	toggle: boolean
	/** Not on your own messages. */
	skipOwn: boolean
	/** How long to wait for a double tap before reacting (ms). */
	wait: number
	/** Only taps on the right side of the screen (when Discord says where you tapped). */
	rightSide: boolean
	vibrate: boolean
}
const DEFAULTS: Settings = { on: true, emoji: '❤️', toggle: true, skipOwn: false, wait: 280, rightSide: false, vibrate: true }
const PRESETS = ['❤️', '👍', '😂', '🔥', '😭', '💀', '✨', '🫶']

let storage: any
const settings = (): Settings => ({ ...DEFAULTS, ...(storage?.cache ?? {}) })
let creators: any
/** For the settings page: what the last tap told us. */
let lastTap = 'No tap seen yet'
let whereKnown: boolean | undefined

function parseEmoji(text: string) {
	const t = text.trim()
	const custom = t.match(/^<(a?):(\w+):(\d+)>$/)
	if (custom) return { id: custom[3], name: custom[2], animated: !!custom[1] }
	return { id: null, name: t || '❤️', animated: false }
}

function react(channelId: string, messageId: string) {
	const s = settings()
	const S = Stores as any
	const emoji = parseEmoji(s.emoji)
	const message = S.MessageStore?.getMessage?.(channelId, messageId)
	const me = S.UserStore?.getCurrentUser?.()?.id
	if (s.skipOwn && me && message?.author?.id === me) return
	const mine = (message?.reactions ?? []).find((r: any) =>
		emoji.id ? r?.emoji?.id === emoji.id : r?.emoji?.name === emoji.name,
	)
	if (mine?.me) {
		if (s.toggle) creators?.removeReaction?.(channelId, messageId, emoji, 'Message')
	} else creators?.addReaction?.(channelId, messageId, emoji, 'Message')
	if (s.vibrate) Vibration.vibrate(12)
}

/** Reactions waiting to see whether a double tap follows, by message. */
const pending = new Map<string, ReturnType<typeof setTimeout>>()
function cancel(messageId?: string) {
	if (!messageId) return
	const t = pending.get(messageId)
	if (t) clearTimeout(t)
	pending.delete(messageId)
}

function numberOf(...values: unknown[]) {
	for (const v of values) if (typeof v === 'number' && Number.isFinite(v)) return v
	return undefined
}

function onTap(instance: any, event: any) {
	const s = settings()
	if (!s.on) return
	const raw = event?.nativeEvent ?? event
	const { messageId, channel } = targetOf(instance, event)
	const x = numberOf(raw?.pageX, raw?.x, raw?.locationX, raw?.absoluteX)
	whereKnown = x != null
	lastTap = `Last tap: ${Object.keys(raw ?? {}).join(', ') || 'no details'}${x != null ? ` · x = ${Math.round(x)}` : ''}`
	if (!messageId || !channel?.id) return
	if (s.rightSide && x != null && x < Dimensions.get('window').width * 0.6) return
	// A second tap on the same message before the wait is over: that's a double tap, not two likes.
	if (pending.has(messageId)) return cancel(messageId)
	pending.set(
		messageId,
		setTimeout(() => {
			pending.delete(messageId)
			try {
				react(channel.id, messageId)
			} catch {}
		}, Math.max(0, s.wait)),
	)
}

function SettingsPage() {
	const { Stack, Text, TextInput, TableRow, TableRowGroup, TableSwitchRow } = Design as any
	const s: Settings = { ...DEFAULTS, ...(storage?.use?.() ?? {}) }
	const set = (patch: Partial<Settings>) => storage?.set?.({ ...s, ...patch }, true)
	const [, refresh] = useState(0)
	return (
		<ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
			<Stack spacing={24}>
				<TableRowGroup>
					<TableSwitchRow
						label="Tap a message to react"
						subLabel="One tap adds the emoji below. Double tap and long press still do what they did."
						value={s.on}
						onValueChange={(on: boolean) => set({ on })}
					/>
				</TableRowGroup>

				<Stack spacing={10}>
					<Text variant="text-md/semibold">Emoji</Text>
					<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
						{PRESETS.map(e => (
							<Pressable
								key={e}
								onPress={() => set({ emoji: e })}
								style={{
									width: 46,
									height: 46,
									borderRadius: 23,
									alignItems: 'center',
									justifyContent: 'center',
									backgroundColor: s.emoji === e ? 'rgba(255,79,209,0.35)' : 'rgba(127,127,127,0.18)',
								}}
							>
								<RNText style={{ fontSize: 24 }}>{e}</RNText>
							</Pressable>
						))}
					</View>
					{TextInput ? (
						<TextInput
							placeholder="Any emoji, or a server emoji as <:name:id>"
							value={s.emoji}
							onChange={(emoji: string) => set({ emoji })}
						/>
					) : null}
					<Text variant="text-xs/medium" color="text-muted">
						For a server emoji, send \:name: in a chat to see its code, like {'<:blobheart:123456789>'}.
					</Text>
				</Stack>

				<TableRowGroup title="How it reacts">
					<TableSwitchRow
						label="Tap again to remove"
						subLabel="Tapping a message you already reacted to takes your reaction off"
						value={s.toggle}
						onValueChange={(toggle: boolean) => set({ toggle })}
					/>
					<TableSwitchRow
						label="Not on my own messages"
						value={s.skipOwn}
						onValueChange={(skipOwn: boolean) => set({ skipOwn })}
					/>
					<TableSwitchRow
						label="Vibrate"
						subLabel="A short buzz when it reacts"
						value={s.vibrate}
						onValueChange={(vibrate: boolean) => set({ vibrate })}
					/>
				</TableRowGroup>

				<TableRowGroup title="Taps">
					<TableSwitchRow
						label="Only taps on the right side"
						subLabel={
							whereKnown === false
								? 'Your Discord doesn\'t say where on the message you tapped, so taps anywhere react.'
								: 'Taps on the right side of the screen react; others do nothing.'
						}
						value={s.rightSide}
						onValueChange={(rightSide: boolean) => set({ rightSide })}
					/>
					{[
						[180, 'Quick (180 ms)'],
						[280, 'Normal (280 ms)'],
						[400, 'Relaxed (400 ms)'],
					].map(([ms, label]) => (
						<TableRow
							key={ms}
							label={`Wait for double tap: ${label}`}
							subLabel={s.wait === ms ? 'Selected' : undefined}
							onPress={() => set({ wait: ms as number })}
						/>
					))}
					<TableRow
						label="Status"
						subLabel={`${handlerStatus}\n${lastTap}`}
						onPress={() => refresh(n => n + 1)}
					/>
				</TableRowGroup>
				<Text variant="text-xs/medium" color="text-muted">
					The wait is how long it holds the reaction back in case a second tap is coming. If your double tap
					sometimes adds a reaction too, choose Relaxed.
				</Text>
			</Stack>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage
		cleanup(
			findModule(REACTIONS, ['addReaction', 'removeReaction'], (mod: any) => {
				creators = typeof mod?.addReaction === 'function' ? mod : (mod?.default ?? mod)
			}),
			installHandlers({
				handleTapMessage: (instance, original) =>
					function (this: unknown, ...args: any[]) {
						const result = original.apply(this, args)
						try {
							onTap(instance, args[0])
						} catch {}
						return result
					},
				// A double tap or a long press: whatever it does, the tap's reaction is dropped.
				handleDoubleTapMessage: (instance, original) =>
					function (this: unknown, ...args: any[]) {
						try {
							cancel(targetOf(instance, args[0]).messageId)
						} catch {}
						return original.apply(this, args)
					},
				handleLongPressMessage: (instance, original) =>
					function (this: unknown, ...args: any[]) {
						try {
							cancel(targetOf(instance, args[0]).messageId)
						} catch {}
						return original.apply(this, args)
					},
			}),
			() => {
				for (const t of pending.values()) clearTimeout(t)
				pending.clear()
				storage = undefined
				creators = undefined
			},
		)
	},
	SettingsComponent: SettingsPage,
})
