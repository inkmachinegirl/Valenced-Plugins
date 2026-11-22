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

/** Upward and mostly vertical: a short drag is enough, or a quick flick. */
export const isSwipeUp = (dx: number, dy: number, vy = 0) =>
	(dy < -32 || (dy < -12 && vy < -450)) && Math.abs(dy) > Math.abs(dx) * 0.8

/** For the settings page: whether swipes reach the plugin. */
export const swipeStatus = { touches: 0, swipes: 0, opened: 0 }

// The overlay: one shared open flag, and the drawer surface component set by index.tsx.
const listeners = new Set<() => void>()
let shown = false
export const overlay: {
	Surface?: React.ComponentType<t.ServerDrawerSurfaceProps>
} = {}
export function showOverlay(on: boolean) {
	if (shown === on) return
	shown = on
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
	const pan = React.useMemo(() => {
		if (!g?.Gesture?.Pan) return undefined
		let fired = false
		const fire = (e: any) => {
			if (
				fired ||
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
				// Takes over after a small upward move; sideways drift is allowed well before it gives up.
				.activeOffsetY(-10)
				.failOffsetX([-70, 70])
				// The area reaches all the way down below the chat bar (to the screen bottom; Android keeps
				// its own home-gesture strip at the very edge) and a bit above it.
				.hitSlop({ top: 36, bottom: 600 })
				.runOnJS(true)
				.onBegin(() => {
					fired = false
					swipeStatus.touches++
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
			<Native.View collapsable={false}>{children}</Native.View>
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
