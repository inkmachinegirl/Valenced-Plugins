/**
 * Fork (Server Drawer+): swipe up on the chat bar to open the server drawer, the way LaunchPad's
 * swipe opens LaunchPad. The drawer lives in the server/channel list panel, so the chat is first
 * slid away with the same back action Android's back gesture uses there (only while a chat is
 * open, so it can never close the app), then the drawer opens.
 */

import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	FilterScopes,
} from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import React from 'react'
import * as Native from 'react-native'
import { drawerControl } from './control'

const S = () => Stores as any

/** Upward, clearly vertical, long enough. */
const MIN_DY = 50
export const isSwipeUp = (dx: number, dy: number) =>
	dy < -MIN_DY && Math.abs(dy) > Math.abs(dx) * 1.5

function inChat(): boolean {
	try {
		const { SelectedChannelStore } = S()
		return !!SelectedChannelStore?.getChannelId?.()
	} catch {
		return false
	}
}

export function openFromChat() {
	if (!inChat()) return drawerControl.open?.()
	try {
		// The chat's own back handling slides back to the server/channel list.
		Native.DeviceEventEmitter.emit('hardwareBackPress', {})
	} catch {}
	setTimeout(() => drawerControl.open?.(), 320)
}

const responder = Native.PanResponder.create({
	// Never on touch down: taps and typing stay the chat bar's.
	onStartShouldSetPanResponder: () => false,
	onMoveShouldSetPanResponderCapture: (_e, g) =>
		g.dy < -20 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
	onPanResponderRelease: (_e, g) => {
		if (isSwipeUp(g.dx, g.dy)) openFromChat()
	},
	onPanResponderTerminationRequest: () => true,
})

function SwipeArea({ children }: { children: React.ReactNode }) {
	return <Native.View {...responder.panHandlers}>{children}</Native.View>
}

const withChatInput = createFilterGenerator<[]>(
	(_args, _id, exports) => {
		const t = (exports as any)?.default ?? exports
		return (
			typeof t?.type === 'function' &&
			(t.type.displayName ?? t.type.name) === 'ChatInput'
		)
	},
	() => 'dev.ketsuyumi.server-drawer-plus.ChatInput',
	FilterScopes.Initialized,
)

export function patchChatSwipe(
	cleanup: (...fns: Array<() => unknown>) => unknown,
) {
	cleanup(
		getModules(withChatInput(), (exports: any) => {
			const memo = exports?.default ?? exports
			if (typeof memo?.type !== 'function') return
			cleanup(
				after(memo, 'type', (tree: any) =>
					tree ? <SwipeArea>{tree}</SwipeArea> : tree,
				),
			)
		}),
	)
}
