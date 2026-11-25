/**
 * Fork (Server Drawer+): swipe up on the chat bar (in a server or DM) to open the server drawer
 * right there, over the screen you're on, the way LaunchPad's swipe opens LaunchPad.
 *
 * - The swipe is a native pan from Discord's gesture handler (the same module the drawer uses):
 *   it only activates on a clear upward drag and fails on sideways ones, so taps and typing in
 *   the chat bar are untouched, and once active it wins over the text box.
 * - The drawer is a second copy of the drawer surface in an overlay at the app's root (where the
 *   toasts are drawn), opened at once; closing it, or picking a server or DM, takes it away.
 *   Nothing navigates, so you stay where you were.
 */

import { getModules, lookupModule } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	FilterScopes,
	withProps,
} from '@valenced/modules/finders/filters'
import {
	getModuleWithImportedPath,
	lookupModuleWithImportedPath,
} from '@valenced/discord/utils/modules/finders'
import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { after } from '@valenced/patcher'
import React from 'react'
import * as Native from 'react-native'
import type * as t from './types'
import { drawerTouch } from './unreadpull'

/** Upward and mostly vertical: a light swipe is enough (about 16 px), or a tiny quick flick. */
export const isSwipeUp = (dx: number, dy: number, vy = 0) =>
	(dy < -16 || (dy < -6 && vy < -250)) && Math.abs(dy) > Math.abs(dx) * 0.6

/** How far up from the bottom of the chat-bar component a swipe may start (the bar itself). */
const BAR_ZONE = 150

/** For the settings page: whether swipes reach the plugin. */
export const swipeStatus = { touches: 0, swipes: 0, opened: 0 }

// The overlay: one shared open flag, and the drawer surface component set by index.tsx.
const listeners = new Set<() => void>()
let shown = false
export const overlay: {
	Surface?: React.ComponentType<t.ServerDrawerSurfaceProps>
} = {}
/**
 * Whether the drawer in the overlay has actually opened. If it hasn't shortly after the overlay
 * appears (not measured yet, or an accidental swipe it ignored), the dark backdrop would stay on
 * screen with nothing on it, dimming the app until tapped; the timer below takes it away.
 */
let opened = false
let safety: ReturnType<typeof setTimeout> | undefined
export function overlayOpened() {
	opened = true
}

/** Lets other plugins (Folder Mute) close the swipe-up drawer before opening a sheet. */
;(globalThis as any)[Symbol.for('dev.ketsuyumi.server-drawer-plus.overlay')] = {
	close: () => showOverlay(false),
}

export function showOverlay(on: boolean) {
	if (shown === on) return
	shown = on
	opened = false
	if (safety) clearTimeout(safety)
	safety = on
		? setTimeout(() => {
				if (shown && !opened) showOverlay(false)
			}, 800)
		: undefined
	for (const l of listeners) l()
}

function gestureModule(): any {
	try {
		const [g] = lookupModule(
			(withProps as any)('Gesture', 'GestureDetector'),
		) as any
		return g
	} catch {
		return undefined
	}
}

function SwipeArea({ children }: { children: React.ReactNode }) {
	const g = gestureModule()
	// Satou: the chat-bar component also holds the emoji / mention suggestion list above the bar.
	// Swipes that start up there (scrolling that list) must not count: only the bar itself (reply
	// strip, text box) and the area below it, the bottom BAR_ZONE of the wrapped view.
	const height = React.useRef(0)
	const pan = React.useMemo(() => {
		if (!g?.Gesture?.Pan) return undefined
		let fired = false
		let blocked = false
		const fire = (e: any) => {
			if (
				fired ||
				blocked ||
				!isSwipeUp(
					e?.translationX ?? 0,
					e?.translationY ?? 0,
					e?.velocityY ?? 0,
				)
			)
				return
			fired = true
			swipeStatus.opened++
			showOverlay(true)
		}
		return (
			g.Gesture.Pan()
				// Takes over after a tiny upward move; sideways drift is allowed well before it gives up.
				.activeOffsetY(-4)
				.failOffsetX([-70, 70])
				// The area reaches all the way down below the chat bar (to the screen bottom; Android keeps
				// its own home-gesture strip at the very edge) and a bit above it.
				.hitSlop({ top: 36, bottom: 600 })
				.runOnJS(true)
				.onTouchesDown((e: any, manager: any) => {
					const y = e?.allTouches?.[0]?.y ?? e?.changedTouches?.[0]?.y
					if (typeof y === 'number' && height.current > BAR_ZONE && y < height.current - BAR_ZONE) {
						blocked = true
						manager?.fail?.()
					}
				})
				.onBegin(() => {
					fired = false
					drawerTouch.active = true
					swipeStatus.touches++
				})
				.onFinalize(() => {
					drawerTouch.active = false
					blocked = false
				})
				.onStart(() => {
					swipeStatus.swipes++
				})
				// Opens as soon as the swipe is clear, not only on lifting the finger.
				.onUpdate(fire)
				.onEnd(fire)
		)
	}, [g])
	if (!g?.GestureDetector || !pan) return <>{children}</>
	const Detector = g.GestureDetector
	return (
		<Detector gesture={pan}>
			<Native.View
				collapsable={false}
				onLayout={(e: any) => {
					height.current = e?.nativeEvent?.layout?.height ?? 0
				}}
			>
				{children}
			</Native.View>
		</Detector>
	)
}

/** Drawn at the app's root: the drawer over the current screen while shown. */
export function OverlayHost() {
	const [, tick] = React.useState(0)
	React.useEffect(() => {
		const l = () => tick(n => n + 1)
		listeners.add(l)
		return () => {
			listeners.delete(l)
		}
	}, [])
	const Surface = overlay.Surface
	if (!shown || !Surface) return null
	const bottom =
		(ReactNativeSafeAreaContext as any)?.initialWindowMetrics?.insets?.bottom ??
		0
	return (
		<Native.View
			style={[
				Native.StyleSheet.absoluteFill,
				{ zIndex: 9999, elevation: 9999 },
			]}
		>
			<Native.Pressable
				accessibilityLabel="Close the server drawer"
				style={[
					Native.StyleSheet.absoluteFill,
					{ backgroundColor: 'rgba(0,0,0,0.45)' },
				]}
				onPress={() => showOverlay(false)}
			/>
			<Surface
				overlay
				bottomInset={bottom}
				onWidthChange={() => {}}
				onFocusChange={() => {}}
				onCollapsed={() => showOverlay(false)}
				onExpanded={overlayOpened}
			/>
		</Native.View>
	)
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

const TOASTS = 'modules/toast/native/AppToastContainer.tsx'
/** The app-root toast container, now or once Discord loads it. */
function onToastContainer(cb: (mod: any) => void): () => void {
	const [now] = lookupModuleWithImportedPath(TOASTS) as any
	if (now) {
		cb(now)
		return () => {}
	}
	return (getModuleWithImportedPath as any)(TOASTS, cb) ?? (() => {})
}

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
		onToastContainer((mod: any) => {
			if (typeof mod?.default !== 'function') return
			cleanup(
				after(mod, 'default', (rendered: any) => (
					<>
						{rendered}
						<OverlayHost />
					</>
				)),
			)
		}),
		() => showOverlay(false),
	)
}
