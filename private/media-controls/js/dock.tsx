import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { getModules, lookupModule } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	FilterScopes,
	withProps,
} from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import {
	Component,
	cloneElement,
	createElement,
	isValidElement,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
// No plain `View` import here: the bundler would rewrite the `.View` in `Animated.View` to it.
import { Animated, PanResponder, Pressable, StyleSheet } from 'react-native'
import { Player, useMedia } from './player'
import type { ReactNode } from 'react'
import type { LayoutRectangle } from 'react-native'

/** Name of a component: plain, memo, forwardRef, or memo(forwardRef(...)). */
const nameOf = (value: unknown, depth = 0): string => {
	const v = value as any
	if (!v || depth > 3) return ''
	if (typeof v === 'function') return v.displayName || v.name || ''
	if (typeof v !== 'object') return ''
	return (
		v.displayName ||
		nameOf(v.type, depth + 1) ||
		nameOf(v.render, depth + 1) ||
		''
	)
}

/** Modules that export a component with this name (as default or a named export). */
const withComponentName = createFilterGenerator<[name: string]>(
	([name], _id, exports) => {
		if (
			!exports ||
			(typeof exports !== 'object' && typeof exports !== 'function')
		)
			return false
		if (nameOf(exports) === name) return true
		if (typeof exports !== 'object') return false
		for (const key of Object.keys(exports)) {
			try {
				if (nameOf((exports as any)[key]) === name) return true
			} catch {}
		}
		return false
	},
	([name]) => `dev.ketsuyumi.media-controls.componentName(${name})`,
	FilterScopes.Initialized,
)

let marginsModule: Record<string, unknown> | null | undefined

/** Discord's own YouBar spacing hooks, when they exist (module looked up once). */
function useYouBarMargins() {
	if (marginsModule === undefined)
		marginsModule =
			(lookupModule(withProps('useYouBarBottomMargin'))[0] as unknown as
				| Record<string, unknown>
				| undefined) ?? null
	const m = marginsModule ?? undefined
	const num = (fn: unknown, fallback: number) => {
		if (typeof fn !== 'function') return fallback
		const value = (fn as () => unknown)()
		return typeof value === 'number' ? value : fallback
	}
	// Hooks: always called in the same order when the module exists, so this is stable.
	return {
		bottom: num(m?.useYouBarBottomMargin, 12),
		horizontal: num(m?.useYouBarHorizontalMargin, 12),
	}
}

/** Pixels of the card (its handle) left above the bar while tucked away. */
const PEEK = 22
/** Space between the open card and the top of the bar: none, it's attached to the bar. */
const GAP = 0
/** Bar height used until the real bar has been measured. */
const FALLBACK_BAR_HEIGHT = 64
const MAX_DEPTH = 12

export interface DockOptions {
	enabled(): boolean
	tucked(): boolean
	setTucked(tucked: boolean): void
	/** Whether the card springs open and shut; off, it jumps. */
	animations(): boolean
}

/** What the dock is doing, for the Diagnostics section. */
export const dockStatus = {
	patched: [] as string[],
	renders: 0,
	barMeasured: false,
	error: null as string | null,
}

type AnyFn = (...args: any[]) => any

/** The render function of a component: plain, memo (`type`) or forwardRef (`render`). */
function renderOf(type: any): AnyFn | undefined {
	if (typeof type === 'function') return type
	if (typeof type?.type === 'function') return type.type
	if (typeof type?.render === 'function') return type.render
	if (type?.type) return renderOf(type.type) // memo(forwardRef(...))
	return undefined
}

/** Shows Discord's original bar if anything in the player throws. */
class Guard extends Component<
	{ original: ReactNode; children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false }
	static getDerivedStateFromError() {
		return { failed: true }
	}
	componentDidCatch(error: unknown) {
		dockStatus.error = String((error as Error)?.message ?? error)
	}
	render() {
		return this.state.failed ? this.props.original : this.props.children
	}
}

/** Wrappers for `YouBar` that report the layout of the element it renders (one per type). */
const measuringWrappers = new WeakMap<object, AnyFn>()

function measuringWrapper(type: any): AnyFn | null {
	const cached = measuringWrappers.get(type)
	if (cached) return cached
	const render = renderOf(type)
	if (!render) return null
	const Measured = ({ __onBarLayout, ...props }: any, ref: unknown) => {
		const out = render(props, ref)
		if (!isValidElement<{ onLayout?: AnyFn }>(out)) return out
		return cloneElement(out, {
			onLayout: (e: any) => {
				out.props.onLayout?.(e)
				__onBarLayout?.(e.nativeEvent.layout)
			},
		})
	}
	const wrapper =
		typeof type === 'function'
			? Measured
			: (memo(Measured as any) as unknown as AnyFn)
	measuringWrappers.set(type, wrapper)
	return wrapper
}

/** Swaps the `YouBar` element inside the tree for a wrapper that reports its layout. */
function measureBar(
	node: ReactNode,
	onBar: (l: LayoutRectangle) => void,
	depth = 0,
): ReactNode {
	if (!node || depth > MAX_DEPTH) return node
	if (Array.isArray(node))
		return node.map(child => measureBar(child, onBar, depth + 1))
	if (!isValidElement<{ children?: ReactNode }>(node)) return node
	if (nameOf(renderOf(node.type)) === 'YouBar') {
		const wrapper = measuringWrapper(node.type)
		if (wrapper)
			return createElement(wrapper as any, {
				...(node.props as object),
				key: node.key,
				__onBarLayout: onBar,
			})
	}
	const children = node.props.children
	return children === undefined
		? node
		: cloneElement(node as any, {}, measureBar(children, onBar, depth + 1))
}

/** First Discord color token that exists in this version (names change between versions). */
function token(...names: string[]): unknown {
	const colors = (Tokens as any)?.default?.colors ?? (Tokens as any)?.colors
	for (const name of names) if (colors?.[name]) return colors[name]
	return undefined
}

/** How opaque the card's background is: the list behind shows through slightly, text stays readable. */
const BACKGROUND_OPACITY = 0.88

type CardLook = { background: object; border: object; handle: object }
let useCardStyles: (() => CardLook) | null = null

/**
 * The card's look from Discord's theme: the floating-panel background (solid, so the text stays
 * readable over the list behind it) and a subtle border. Falls back to fixed colors.
 */
function useCardLook() {
	if (!useCardStyles) {
		const background =
			token(
				'BACKGROUND_FLOATING',
				'BG_SURFACE_OVERLAY',
				'BACKGROUND_SURFACE_HIGHEST',
				'BACKGROUND_SECONDARY',
			) ?? '#232428'
		const border =
			token('BORDER_SUBTLE', 'BORDER_FAINT', 'BACKGROUND_MODIFIER_ACCENT') ??
			'rgba(255, 255, 255, 0.08)'
		const handle =
			token('INTERACTIVE_MUTED', 'TEXT_MUTED') ?? 'rgba(255, 255, 255, 0.35)'
		const styles = {
			background: { backgroundColor: background },
			border: { borderColor: border },
			handle: { backgroundColor: handle },
		}
		useCardStyles =
			typeof Design.createStyles === 'function'
				? (Design.createStyles(styles as any) as unknown as () => CardLook)
				: () => styles as any
	}
	return useCardStyles()
}

/** The grab handle: a small pill, like a bottom sheet's. */
function Handle() {
	const look = useCardLook()
	return (
		<Animated.View
			style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 10 }}
		>
			<Animated.View
				style={[
					{ width: 36, height: 4, borderRadius: 2, opacity: 0.7 },
					look.handle,
				]}
			/>
		</Animated.View>
	)
}

const sameLayout = (a: LayoutRectangle | null, b: LayoutRectangle) =>
	!!a &&
	a.x === b.x &&
	a.y === b.y &&
	a.width === b.width &&
	a.height === b.height

/**
 * Fills the YouBar's area. The card sits behind Discord's bar, its bottom edge on the bar's:
 * - open: it's tall enough to show the whole player above the bar;
 * - tucked: it's the bar's height plus the handle, so only the handle shows above the bar.
 * Drag the handle or card to resize it; it snaps open or tucked on release.
 */
function DockLayer({
	rendered,
	options,
}: {
	rendered: ReactNode
	options: DockOptions
}) {
	const { playback } = useMedia()
	const margins = useYouBarMargins()
	const look = useCardLook()
	const [bar, setBar] = useState<LayoutRectangle | null>(null)
	const [container, setContainer] = useState(0)
	const [content, setContent] = useState(0)
	const [tucked, setTuckedState] = useState(options.tucked)
	dockStatus.renders++

	const onBar = useCallback((l: LayoutRectangle) => {
		dockStatus.barMeasured = true
		setBar(prev =>
			sameLayout(prev, l)
				? prev
				: { x: l.x, y: l.y, width: l.width, height: l.height },
		)
	}, [])
	const measured = useMemo(() => measureBar(rendered, onBar), [rendered, onBar])

	const barHeight = bar?.height ?? FALLBACK_BAR_HEIGHT
	const closedHeight = barHeight + PEEK
	// Open: the whole player above the bar; the rest of the card stays behind the bar.
	const openHeight = Math.max(content + barHeight + GAP, closedHeight + 1)

	const height = useRef(new Animated.Value(closedHeight)).current
	const limits = useRef({ closed: closedHeight, open: openHeight })
	limits.current = { closed: closedHeight, open: openHeight }
	const tuckedRef = useRef(tucked)
	tuckedRef.current = tucked

	const snap = (next: boolean) => {
		tuckedRef.current = next
		setTuckedState(next)
		options.setTucked(next)
		const toValue = next ? limits.current.closed : limits.current.open
		if (!options.animations()) {
			height.stopAnimation()
			height.setValue(toValue)
			return
		}
		Animated.spring(height, {
			toValue,
			// Height can't use the native driver; the card is small, so this stays smooth.
			useNativeDriver: false,
			bounciness: 3,
			speed: 18,
		}).start()
	}

	// Rest at the right size when the content or bar is (re)measured.
	useEffect(() => {
		height.setValue(tuckedRef.current ? closedHeight : openHeight)
	}, [closedHeight, openHeight, height])

	const pan = useRef(
		PanResponder.create({
			// Only clearly vertical drags, so buttons and the seek bar keep working.
			onMoveShouldSetPanResponder: (_e, g) =>
				Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
			onPanResponderMove: (_e, g) => {
				const { closed, open } = limits.current
				const base = tuckedRef.current ? closed : open
				height.setValue(Math.min(Math.max(base - g.dy, closed), open))
			},
			onPanResponderRelease: (_e, g) => {
				const { closed, open } = limits.current
				const end = (tuckedRef.current ? closed : open) - g.dy
				snap(Math.abs(g.vy) > 0.5 ? g.vy > 0 : end < (closed + open) / 2)
			},
			onPanResponderTerminate: () => snap(tuckedRef.current),
		}),
	).current

	const show = options.enabled() && !!playback
	// The card's bottom edge on the bar's bottom edge, in this layer's coordinates.
	const frame =
		bar && container > 0
			? {
					left: bar.x,
					width: bar.width,
					bottom: container - bar.y - bar.height,
				}
			: {
					left: margins.horizontal,
					right: margins.horizontal,
					bottom: margins.bottom,
				}

	return (
		<Animated.View
			pointerEvents="box-none"
			style={StyleSheet.absoluteFill}
			onLayout={(e: any) => {
				const h = Math.round(e.nativeEvent.layout.height)
				if (h !== container) setContainer(h)
			}}
		>
			{show && playback ? (
				<Animated.View
					{...pan.panHandlers}
					style={[
						{
							position: 'absolute',
							...frame,
							height,
							overflow: 'hidden',
							borderRadius: 18,
							borderWidth: 1,
							opacity: content ? 1 : 0,
						},
						look.border,
					]}
				>
					{/* Background on its own layer, slightly see-through; content stays fully opaque. */}
					<Animated.View
						pointerEvents="none"
						style={[
							StyleSheet.absoluteFill,
							look.background,
							{ opacity: BACKGROUND_OPACITY },
						]}
					/>
					<Animated.View
						style={{ paddingHorizontal: 16, paddingBottom: 16 }}
						onLayout={(e: any) => {
							// + the border, so the open card fits its content exactly.
							const h = Math.round(e.nativeEvent.layout.height) + 2
							if (Math.abs(h - content) > 1) setContent(h)
						}}
					>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={tucked ? 'Show player' : 'Tuck player away'}
							onPress={() => snap(!tucked)}
							hitSlop={12}
						>
							<Handle />
						</Pressable>
						<Player p={playback} />
					</Animated.View>
				</Animated.View>
			) : null}
			{/* Discord's bar on top, always visible: the card's lower part stays behind it. */}
			<Animated.View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
				{measured}
			</Animated.View>
		</Animated.View>
	)
}

/** Shows the player above Discord's YouBar. Returns unpatch functions. */
export function patchYouBar(
	options: DockOptions,
	logger: { log(m: string): void; warn(m: string): void },
) {
	const unpatches: (() => void)[] = []
	const patched = new WeakSet<object>()
	let active = true

	const wrap = (rendered: unknown) =>
		active
			? createElement(Guard, {
					original: rendered as ReactNode,
					children: createElement(DockLayer, {
						rendered: rendered as ReactNode,
						options,
					}),
				})
			: rendered

	/** Patches the render function of a plain, memo or forwardRef component held at parent[key]. */
	const patchAt = (parent: any, key: string) => {
		const value = parent?.[key]
		let target: any
		let prop: string
		if (typeof value === 'function') [target, prop] = [parent, key]
		else if (typeof value?.type === 'function') [target, prop] = [value, 'type']
		else if (typeof value?.render === 'function')
			[target, prop] = [value, 'render']
		else if (typeof value?.type?.render === 'function')
			[target, prop] = [value.type, 'render']
		else return
		if (patched.has(target[prop])) return
		try {
			unpatches.push(after(target, prop as never, wrap as never))
			patched.add(target[prop])
			const kind =
				prop === key ? 'function' : prop === 'type' ? 'memo' : 'forwardRef'
			dockStatus.patched.push(`${key} (${kind})`)
			logger.log(`Docked player on YouBarThemed: ${key} (${kind})`)
		} catch (e) {
			dockStatus.error = `Couldn't patch ${key}: ${String((e as Error)?.message ?? e)}`
			logger.warn(dockStatus.error)
		}
	}

	const unsubscribe = getModules(
		withComponentName('YouBarThemed'),
		namespace => {
			const ns = namespace as any
			if (!ns || (typeof ns !== 'object' && typeof ns !== 'function')) return
			for (const key of Object.keys(ns))
				if (nameOf(ns[key]) === 'YouBarThemed') patchAt(ns, key)
		},
		{ returnNamespace: true, max: 10 },
	)

	return [
		unsubscribe,
		() => {
			active = false
			for (const u of unpatches.splice(0)) u()
			dockStatus.patched = []
		},
	]
}
