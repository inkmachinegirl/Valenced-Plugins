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

/** Upward, long enough to mean it. */
export const isSwipeUp = (dx: number, dy: number) =>
	dy < -50 && Math.abs(dy) > Math.abs(dx) * 1.5

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
		return g.Gesture.Pan()
			.activeOffsetY(-24)
			.failOffsetX([-24, 24])
			.runOnJS(true)
			.onEnd((e: any) => {
				if (isSwipeUp(e?.translationX ?? 0, e?.translationY ?? 0))
					showOverlay(true)
			})
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
