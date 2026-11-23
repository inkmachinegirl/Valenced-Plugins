/**
 * Satou: pull at the bottom of a chat to slide to the next unread channel in the same server.
 *
 * - Discord's message list is native. Its scroll-position events (`onChatScrollPosition`, with
 *   `isAtBottom` and `shouldShowJumpToPresent`) go through `handleScrollPosition` from
 *   modules/messages/native/hooks/useScrollHandlers.tsx; the hook's result is wrapped (no hooks
 *   added) to note, per channel, whether you're at the newest message.
 * - ChatView's render is wrapped in a sliding layer with a pan from Discord's gesture handler, which
 *   sees touches even over the native list. The pan only activates (manual activation) when the
 *   touch started while that chat was at the bottom, away from the chat bar (whose swipe up opens
 *   the drawer), and it moves mostly upward. Pull far enough and let go: the chat slides out to
 *   the left, the next unread channel in this server opens and slides in from the right, like
 *   switching apps. With no unread channel left, the same pull slides back to the channel you
 *   were in before (out to the right, in from the left).
 */

import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import React from 'react'
import * as Native from 'react-native'
import { motionPrefs } from './prefs'

const SCROLL = 'modules/messages/native/hooks/useScrollHandlers.tsx'
const CHAT_VIEW = 'modules/chat/native/ChatView.tsx'
const TRIGGER = 110
const START = 18

export const pullPrefs = { on: true }
/** Set by the chat-bar swipe while a touch is in its area. */
export const drawerTouch = { active: false }

const bottom = new Map<string, boolean>()
let previousChannel: string | undefined
let currentChannel: string | undefined
const slide = new Native.Animated.Value(0)
const S = Stores as any

function gestureModule(): any {
	try {
		return lookupModule((withProps as any)('Gesture', 'GestureDetector'))[0]
	} catch {
		return undefined
	}
}

function navigation(): any {
	try {
		return lookupModule((withProps as any)('transitionToChannel'))[0]
	} catch {
		return undefined
	}
}

function muted(guildId: string, id: string): boolean {
	const settings = S.UserGuildSettingsStore
	try {
		if (typeof settings?.isGuildOrCategoryOrChannelMuted === 'function')
			return !!settings.isGuildOrCategoryOrChannelMuted(guildId, id)
		return !!settings?.isChannelMuted?.(guildId, id)
	} catch {
		return false
	}
}

/** The next unread, unmuted channel after [id] in its server's channel order, or undefined. */
export function nextUnread(id: string): string | undefined {
	const channel = S.ChannelStore?.getChannel?.(id)
	const guildId = channel?.guild_id
	if (!guildId) return undefined
	const list: any[] = (S.GuildChannelStore?.getChannels?.(guildId)?.SELECTABLE ?? [])
		.map((e: any) => e?.channel ?? e)
		.filter((c: any) => c?.id)
	const pos = (c: any) => {
		const parent = c.parent_id ? S.ChannelStore?.getChannel?.(c.parent_id) : undefined
		return [parent ? (parent.position ?? 0) : -1, c.position ?? 0]
	}
	list.sort((a, b) => {
		const [pa, ca] = pos(a)
		const [pb, cb] = pos(b)
		return pa - pb || ca - cb
	})
	const at = list.findIndex(c => c.id === id)
	for (let step = 1; step < list.length; step++) {
		const c = list[(Math.max(at, 0) + step) % list.length]
		if (c.id === id) continue
		if (S.ReadStateStore?.hasUnread?.(c.id) && !muted(guildId, c.id)) return c.id
	}
	return undefined
}

function go(from: string) {
	const next = nextUnread(from)
	const target = next ?? previousChannel
	const nav = navigation()
	if (!target || target === from || typeof nav?.transitionToChannel !== 'function') {
		bounce()
		return
	}
	// Forward (next unread) slides left; back slides right.
	const dir = next ? -1 : 1
	const width = Native.Dimensions.get('window').width
	const open = () => {
		try {
			nav.transitionToChannel(target, {})
		} catch {}
	}
	if (!motionPrefs.animate) {
		slide.setValue(0)
		open()
		return
	}
	Native.Animated.timing(slide, {
		toValue: dir * width,
		duration: 140,
		useNativeDriver: true,
	}).start(() => {
		open()
		slide.setValue(-dir * width)
		requestAnimationFrame(() =>
			Native.Animated.timing(slide, {
				toValue: 0,
				duration: 190,
				useNativeDriver: true,
			}).start(),
		)
	})
}

function bounce() {
	if (!motionPrefs.animate) return slide.setValue(0)
	Native.Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start()
}

function makePull(g: any) {
	let armed = false
	let startX = 0
	let startY = 0
	let channel: string | undefined
	return g.Gesture.Pan()
		.manualActivation(true)
		.runOnJS(true)
		.onTouchesDown((e: any) => {
			const t = e?.allTouches?.[0]
			startX = t?.absoluteX ?? 0
			startY = t?.absoluteY ?? 0
			channel = currentChannel
			armed = pullPrefs.on && !!channel && bottom.get(channel) === true && (e?.numberOfTouches ?? 1) === 1
		})
		.onTouchesMove((e: any, manager: any) => {
			if (!armed || drawerTouch.active) return manager.fail()
			const t = e?.allTouches?.[0]
			const dx = (t?.absoluteX ?? 0) - startX
			const dy = (t?.absoluteY ?? 0) - startY
			if (dy > 8 || Math.abs(dx) > 40) return manager.fail()
			if (dy < -START && Math.abs(dy) > Math.abs(dx) * 1.5) manager.activate()
		})
		.onTouchesUp((_e: any, manager: any) => manager.end())
		.onTouchesCancelled((_e: any, manager: any) => manager.fail())
		.onUpdate((e: any) => {
			// Follow the finger: pulling up slides the chat left (a little, as a hint).
			const dy = Math.min(0, e?.translationY ?? 0)
			slide.setValue(Math.max(dy * 0.45, -Native.Dimensions.get('window').width * 0.4))
		})
		.onEnd((e: any) => {
			if (channel && (e?.translationY ?? 0) < -TRIGGER) go(channel)
			else bounce()
		})
}

export function patchUnreadPull(cleanup: (...fns: Array<() => unknown>) => unknown) {
	const selected = S.SelectedChannelStore
	if (selected?.getChannelId) {
		currentChannel = selected.getChannelId() ?? undefined
		const onChange = () => {
			const next = selected.getChannelId() ?? undefined
			if (next === currentChannel) return
			if (currentChannel) previousChannel = currentChannel
			currentChannel = next
		}
		selected.addChangeListener?.(onChange)
		cleanup(() => selected.removeChangeListener?.(onChange))
	}

	// Where each chat is: at the newest message or not.
	const wrapped = new WeakMap<Function, Function>()
	cleanup(
		getModuleWithImportedPath<any>(SCROLL, mod => {
			if (typeof mod?.default !== 'function') return
			cleanup(
				instead(mod, 'default', function (this: unknown, args: any[], orig: (...a: any[]) => any) {
					const result = Reflect.apply(orig, this, args)
					const id: string | undefined = args?.[0]?.channelId
					const handle = result?.handleScrollPosition
					if (!id || typeof handle !== 'function') return result
					let w = wrapped.get(handle)
					if (!w) {
						w = function (this: unknown, event: any) {
							const n = event?.nativeEvent
							if (n) bottom.set(id, !!n.isAtBottom && !n.shouldShowJumpToPresent)
							return Reflect.apply(handle, this, [event])
						}
						wrapped.set(handle, w)
					}
					result.handleScrollPosition = w
					return result
				}),
			)
		}),
	)

	// The sliding layer and the pull, around every chat.
	cleanup(
		getModuleWithImportedPath<any>(CHAT_VIEW, mod => {
			const memo = mod?.default
			const original = memo?.type
			if (typeof original !== 'function') return
			const g = gestureModule()
			if (!g?.GestureDetector || !g?.Gesture?.Pan) return
			const Detector = g.GestureDetector
			const pull = makePull(g)
			const wrapper = function (this: unknown, ...a: any[]) {
				const tree = Reflect.apply(original, this, a) as React.ReactNode
				return (
					<Native.Animated.View style={{ flex: 1, transform: [{ translateX: slide }] }}>
						<Detector gesture={pull}>
							<Native.View collapsable={false} style={{ flex: 1 }}>
								{tree}
							</Native.View>
						</Detector>
					</Native.Animated.View>
				)
			}
			Object.defineProperty(wrapper, 'name', { value: original.name })
			memo.type = wrapper
			cleanup(() => {
				if (memo.type === wrapper) memo.type = original
				slide.setValue(0)
			})
		}),
	)
}
