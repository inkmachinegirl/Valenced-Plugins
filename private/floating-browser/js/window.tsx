import { ToastActionCreators } from '@valenced/discord/actions'
import { after } from '@valenced/patcher'
import { onBack } from './back'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
	Dimensions,
	Linking,
	PanResponder,
	Pressable,
	ScrollView,
	Text,
	TextInput,
	View,
} from 'react-native'
import {
	afterLoad,
	beforeLoad,
	blockedNav,
	DESKTOP_UA,
	pageFilters,
	tokensCss,
} from './ext'
import { blocksDocument, compiled, cosmeticForTokens } from './filters'
import { onFilters } from './updater'
import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { findModule } from './find'
import { hostOf, save, settings, toUrl, useSettings, type Win } from './store'
import { findWebView } from './webview'

/**
 * The floating browser: one window over the whole app (drawn beside Discord's toast container, as
 * Embed Playback's player is), so the page keeps playing while you scroll, switch chats and type.
 * Drag it by its bar, resize from the ◢ corner, or use the Big / Corner / 16:9 presets. Moving and
 * resizing only change the outer box, so the page is never reloaded.
 */

const BAR = 34
const MIN_W = 180
const MIN_H = 120

let open = false
let win: Win | undefined
let mounted = false
const listeners = new Set<() => void>()
const emit = () => {
	for (const l of listeners) l()
}
export const browserReady = () => mounted

/** Set right before handing a link to the system, so the link hook lets it through. */
export const external = { skip: false }

function toast(text: string) {
	try {
		ToastActionCreators.open('floating-browser', { text } as never)
	} catch {}
}

const screen = () => Dimensions.get('window')
/** The status bar's height (where the clock is). */
function topInset(): number {
	try {
		const top = (ReactNativeSafeAreaContext as any)?.initialWindowMetrics
			?.insets?.top
		if (typeof top === 'number' && top > 0) return Math.round(top) + 4
	} catch {}
	return 44
}

/** Move mode: the window shows a dim cover you drag it by (hold its middle, or long-press the title). */
let moving = false
function setMoving(on: boolean) {
	moving = on
	emit()
}
function clamp(w: Win): Win {
	const { width, height } = screen()
	const ww = Math.max(MIN_W, Math.min(width, Math.round(w.w)))
	const hh = Math.max(MIN_H + BAR, Math.min(height - 40, Math.round(w.h)))
	return {
		w: ww,
		h: hh,
		x: Math.max(0, Math.min(width - ww, Math.round(w.x))),
		// Never above the status bar, where the bar can't be grabbed.
		y: Math.max(topInset(), Math.min(height - hh, Math.round(w.y))),
	}
}
const presets = {
	big: (): Win => {
		const { width, height } = screen()
		return clamp({ x: 0, y: 90, w: width, h: Math.round(height * 0.62) })
	},
	corner: (): Win => {
		const { width, height } = screen()
		const w = Math.round(width * 0.62)
		const h = Math.round((w * 9) / 16) + BAR
		return clamp({ x: width - w - 10, y: height - h - 150, w, h })
	},
	video: (): Win => {
		const { width } = screen()
		return clamp({
			x: 0,
			y: 100,
			w: width,
			h: Math.round((width * 9) / 16) + BAR,
		})
	},
}
const isBig = () =>
	!!win && win.w >= screen().width * 0.9 && win.h > screen().height * 0.5

let saveTimer: any
/** Moves / resizes the window; saved right away when [now] (a drag ended, a preset), else shortly. */
function setWin(next: Win, now = false) {
	win = clamp(next)
	emit()
	clearTimeout(saveTimer)
	if (now) save({ win })
	else saveTimer = setTimeout(() => save({ win }), 600)
}
/** ⤢: big, remembering the size you had. ▁: back to that size. */
function grow() {
	if (win && !isBig()) save({ winSmall: win })
	setWin(presets.big(), true)
}
function shrink() {
	const back = settings().winSmall
	setWin(back ? back : presets.corner(), true)
}

// ── Tabs ─────────────────────────────────────────────────────────────

const MAX_TABS = 6
interface TabInfo {
	id: number
	/** What the tab was told to load (changing it, or `load`, reloads it). */
	url: string
	load: number
	page: Page
}
let tabs: TabInfo[] = []
let activeId = 0
let nextTabId = 1
const tabListeners = new Set<() => void>()
const onTabs = (fn: () => void): (() => void) => {
	tabListeners.add(fn)
	return () => {
		tabListeners.delete(fn)
	}
}
let tabsSaveTimer: any
function tabsChanged() {
	for (const fn of tabListeners) fn()
	clearTimeout(tabsSaveTimer)
	tabsSaveTimer = setTimeout(() => {
		const urls = tabs.map(t => t.page.url || t.url)
		save({
			tabs: urls,
			activeTab: Math.max(
				0,
				tabs.findIndex(t => t.id === activeId),
			),
			lastUrl: activeTab()?.page.url || activeTab()?.url || '',
		})
	}, 500)
}
const activeTab = () => tabs.find(t => t.id === activeId) ?? tabs[0]
function newTab(url: string) {
	const t: TabInfo = { id: nextTabId++, url, load: 0, page: blankPage(url) }
	tabs = [...tabs, t]
	activeId = t.id
	tabsChanged()
}
function switchTab(id: number) {
	activeId = id
	tabsChanged()
}
function closeTab(id: number) {
	const at = tabs.findIndex(t => t.id === id)
	tabs = tabs.filter(t => t.id !== id)
	if (!tabs.length) newTab('')
	else if (activeId === id) activeId = tabs[Math.max(0, at - 1)].id
	tabsChanged()
}
function loadInActive(url: string) {
	const t = activeTab()
	if (!t) return newTab(url)
	tabs = tabs.map(x =>
		x.id === t.id ? { ...x, url, load: x.load + 1, page: blankPage(url) } : x,
	)
	tabsChanged()
}
function updatePage(id: number, patch: Partial<Page>) {
	tabs = tabs.map(t =>
		t.id === id ? { ...t, page: { ...t.page, ...patch } } : t,
	)
	tabsChanged()
}

/** Minimized: the window is out of sight but still loaded (a video keeps playing). */
let minimized = false

/** The chat bar's 🌐: opens the browser, minimizes it when it's showing, brings it back when minimized. */
export function toggleBrowser() {
	if (!open) return openBrowser()
	minimized = !minimized
	if (minimized) moving = false
	emit()
}

export function openBrowser(url?: string) {
	if (!mounted)
		return toast(
			'Restart Discord once to finish setting up the floating browser',
		)
	minimized = false
	const s = settings()
	if (!tabs.length) {
		const saved = s.tabs.length ? s.tabs : [s.lastUrl || s.home]
		for (const u of saved.slice(0, MAX_TABS)) newTab(u)
		activeId = tabs[Math.min(s.activeTab, tabs.length - 1)]?.id ?? activeId
	}
	if (url) {
		// A link: its own tab, unless the one showing is empty or there's no room.
		const target = toUrl(url)
		if (activeTab()?.url && tabs.length < MAX_TABS) newTab(target)
		else loadInActive(target)
	}
	win = clamp(win ?? s.win ?? presets.big())
	open = true
	emit()
}
export function closeBrowser() {
	minimized = false
	if (beforePageBig) {
		win = beforePageBig
		beforePageBig = undefined
	}
	if (win) save({ win })
	moving = false
	// Reopening picks each tab up where it was, not at the address it first opened.
	tabs = tabs.map(t => ({ ...t, url: t.page.url || t.url }))
	open = false
	videoFull = false
	beforeFullscreen = undefined
	emit()
}

/** The window before a video went fullscreen in it, to go back to afterwards. */
let beforeFullscreen: Win | undefined
/** A video is filling the window (shows ⛶ in the bar to leave). */
let videoFull = false
/** ⛶ on a page with no video: the window is a big floating page; this is the size to go back to. */
let beforePageBig: Win | undefined
function togglePageBig() {
	if (beforePageBig) {
		setWin(beforePageBig, true)
		beforePageBig = undefined
		return
	}
	if (!win) return
	beforePageBig = { ...win }
	const { width, height } = screen()
	const top = topInset()
	const h = Math.round(height * 0.75)
	setWin(
		{
			x: 8,
			y: Math.max(top, Math.round(top + (height - top - h) / 2)),
			w: width - 16,
			h,
		},
		true,
	)
}
/** A video went fullscreen in the window: turn the window into a full-width landscape box, and back. */
function sideways(on: boolean) {
	videoFull = on
	emit()
	if (!settings().fullscreenSideways) return
	if (on) {
		if (!beforeFullscreen && win) beforeFullscreen = { ...win }
		const { width, height } = screen()
		const h = Math.round((width * 9) / 16) + BAR
		setWin({ x: 0, y: Math.max(60, Math.round((height - h) / 3)), w: width, h })
	} else if (beforeFullscreen) {
		setWin(beforeFullscreen)
		beforeFullscreen = undefined
	}
}

let dragStart: Win = { x: 0, y: 0, w: 0, h: 0 }
const dragger = PanResponder.create({
	onStartShouldSetPanResponder: () => false,
	onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
	onPanResponderGrant: () => {
		if (win) dragStart = { ...win }
	},
	onPanResponderMove: (_, g) =>
		setWin({ ...dragStart, x: dragStart.x + g.dx, y: dragStart.y + g.dy }),
	onPanResponderRelease: () => win && setWin(win, true),
})
/** The move-mode cover: drag to move; a tap without moving ends move mode. */
let moved = 0
const mover = PanResponder.create({
	onStartShouldSetPanResponder: () => true,
	onMoveShouldSetPanResponder: () => true,
	onPanResponderGrant: () => {
		moved = 0
		if (win) dragStart = { ...win }
	},
	onPanResponderMove: (_, g) => {
		moved = Math.max(moved, Math.abs(g.dx) + Math.abs(g.dy))
		setWin({ ...dragStart, x: dragStart.x + g.dx, y: dragStart.y + g.dy })
	},
	onPanResponderRelease: () => {
		if (moved < 6) setMoving(false)
		else if (win) setWin(win, true)
	},
})

const resizer = PanResponder.create({
	onStartShouldSetPanResponder: () => true,
	onMoveShouldSetPanResponder: () => true,
	onPanResponderGrant: () => {
		if (win) dragStart = { ...win }
	},
	onPanResponderMove: (_, g) =>
		setWin({ ...dragStart, w: dragStart.w + g.dx, h: dragStart.h + g.dy }),
	onPanResponderRelease: () => {
		if (!win) return
		setWin(win, true)
		if (!isBig()) save({ winSmall: win })
	},
})

function Btn({
	label,
	onPress,
	hint,
	off,
	on,
}: {
	label: string
	onPress: () => void
	hint: string
	off?: boolean
	on?: boolean
}) {
	return (
		<Pressable
			onPress={onPress}
			disabled={off}
			accessibilityLabel={hint}
			hitSlop={6}
			style={{
				paddingHorizontal: 8,
				height: BAR,
				justifyContent: 'center',
				opacity: off ? 0.35 : 1,
			}}
		>
			<Text
				style={{
					color: on ? '#8ea1ff' : '#ffffff',
					fontSize: 16,
					fontWeight: '700',
				}}
			>
				{label}
			</Text>
		</Pressable>
	)
}

function Toggle({
	label,
	on,
	onPress,
}: {
	label: string
	on: boolean
	onPress: () => void
}) {
	return (
		<Pressable
			onPress={onPress}
			style={{
				paddingHorizontal: 11,
				paddingVertical: 7,
				margin: 3,
				borderRadius: 14,
				backgroundColor: on ? '#5865F2' : 'rgba(255,255,255,0.08)',
			}}
		>
			<Text
				style={{
					color: '#ffffff',
					fontSize: 13,
					fontWeight: on ? '700' : '500',
				}}
			>
				{label}
			</Text>
		</Pressable>
	)
}

interface Page {
	url: string
	title: string
	back: boolean
	forward: boolean
	blocked: number
}
const blankPage = (url = ''): Page => ({
	url,
	title: '',
	back: false,
	forward: false,
	blocked: 0,
})

/** One tab: its own web view, kept loaded (and playing) while another tab shows. */
function TabView({
	tab,
	active,
	startScript,
	register,
	onPage,
	onGo,
}: {
	tab: TabInfo
	active: boolean
	startScript: string
	register: (id: number, ref: any) => void
	onPage: (id: number, patch: Partial<Page>) => void
	onGo: (text: string) => void
}) {
	const s = useSettings()
	const WebView = findWebView()
	const ref = useRef<any>(null)
	const pageUrl = useRef(tab.url)
	useEffect(() => {
		register(tab.id, ref)
		return () => register(tab.id, undefined)
	}, [])
	// A switch changed: apply it to the page that's open, no reload.
	useEffect(() => {
		if (pageUrl.current)
			ref.current?.injectJavaScript?.(afterLoad(s, pageUrl.current))
	}, [s.adHide, s.dark, s.videoFocus, s.scripts])
	const style = active ? { flex: 1 } : { display: 'none' as const }
	if (!tab.url)
		return (
			<View style={style}>
				<Home onGo={onGo} />
			</View>
		)
	if (!WebView)
		return (
			<View style={[style, { alignItems: 'center', justifyContent: 'center' }]}>
				<Text style={{ color: '#ffffff' }}>
					Couldn't start a web view on this Discord version.
				</Text>
			</View>
		)
	return (
		<View style={style}>
			<WebView
				ref={ref}
				key={`${tab.load}:${s.desktop ? 'desktop' : 'mobile'}:${s.inWindowFullscreen ? 'win' : 'os'}`}
				source={{ uri: tab.url }}
				userAgent={s.desktop ? DESKTOP_UA : undefined}
				originWhitelist={['*']}
				javaScriptEnabled
				domStorageEnabled
				allowsInlineMediaPlayback
				// Left on: with it off, players inside frames (where the in-window script may not reach)
				// decide fullscreen is impossible and hide their button.
				allowsFullscreenVideo
				injectedJavaScriptForMainFrameOnly={false}
				injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
				mediaPlaybackRequiresUserAction={false}
				setSupportMultipleWindows={false}
				javaScriptCanOpenWindowsAutomatically={!s.popupBlock}
				injectedJavaScriptBeforeContentLoaded={startScript}
				injectedJavaScript={afterLoad(s, tab.url)}
				onLoadStart={(e: any) => {
					const u = e?.nativeEvent?.url
					onPage(tab.id, { blocked: 0 })
					if (u && settings().uBlock && compiled())
						ref.current?.injectJavaScript?.(
							`(function(){${pageFilters(u)}})();true;`,
						)
				}}
				onMessage={(e: any) => {
					let data: any
					try {
						data = JSON.parse(e?.nativeEvent?.data ?? '')
					} catch {
						return
					}
					if (data?.fb === 'fs') return sideways(!!data.on)
					if (data?.fb === 'hold') return setMoving(true)
					if (data?.fb === 'fsnone') return togglePageBig()
					if (data?.fb === 'blocked' && typeof data.n === 'number')
						onPage(tab.id, { blocked: data.n })
					else if (
						data?.fb === 'tokens' &&
						Array.isArray(data.t) &&
						settings().uBlock
					) {
						const css = cosmeticForTokens(
							data.t.slice(0, 4000),
							String(data.h ?? ''),
						)
						if (css.length) ref.current?.injectJavaScript?.(tokensCss(css))
					}
				}}
				onLoadEnd={(e: any) => {
					const u = e?.nativeEvent?.url ?? pageUrl.current
					ref.current?.injectJavaScript?.(afterLoad(settings(), u))
				}}
				onShouldStartLoadWithRequest={(req: any) => {
					const next = String(req?.url ?? '')
					if (settings().popupBlock && blockedNav(next)) return false
					// uBlock's lists: don't leave the page for an ad or malware host (the usual pop-under trick).
					if (
						settings().uBlock &&
						/^https?:/i.test(next) &&
						hostOf(next) !== hostOf(pageUrl.current) &&
						blocksDocument(hostOf(next))
					) {
						onPage(tab.id, { blocked: (tab.page.blocked ?? 0) + 1 })
						return false
					}
					if (!/^(https?|about|data|blob):/i.test(next)) return false
					return true
				}}
				onNavigationStateChange={(n: any) => {
					if (n?.url) pageUrl.current = n.url
					onPage(tab.id, {
						url: n?.url ?? '',
						title: n?.title ?? '',
						back: !!n?.canGoBack,
						forward: !!n?.canGoForward,
					})
				}}
				style={{ flex: 1, backgroundColor: '#ffffff' }}
			/>
		</View>
	)
}

function Label({ children }: { children: string }) {
	return (
		<Text
			style={{
				color: '#80848e',
				fontSize: 11,
				marginLeft: 4,
				marginTop: 8,
				marginBottom: 2,
			}}
		>
			{children}
		</Text>
	)
}

function Browser({ box }: { box: Win }) {
	const s = useSettings()
	const [, tick] = useState(0)
	useEffect(() => onTabs(() => tick(n => n + 1)), [])
	const refs = useRef(new Map<number, any>())
	const register = (id: number, ref: any) => {
		if (ref) refs.current.set(id, ref)
		else refs.current.delete(id)
	}
	const tab = activeTab()
	const page = tab?.page ?? blankPage()
	const view = () => refs.current.get(tab?.id ?? -1)?.current
	const [address, setAddress] = useState<string | undefined>(
		tab?.url ? undefined : '',
	)
	const [panel, setPanel] = useState<'none' | 'menu' | 'tabs'>('none')
	const big = isBig()
	const [filtersVersion, setFiltersVersion] = useState(0)
	useEffect(() => onFilters(() => setFiltersVersion(v => v + 1)), [])
	// The start-of-page script only changes with these, so it isn't rebuilt (and resent) every render.
	const startScript = useMemo(
		() => beforeLoad(s),
		[s.popupBlock, s.uBlock, s.inWindowFullscreen, filtersVersion],
	)

	// Back: the page's history first, then shrink a big window.
	useEffect(() => {
		return onBack(() => {
			// Minimized: back belongs to Discord.
			if (minimized) return false
			if (page.back) {
				view()?.goBack?.()
				return true
			}
			if (big) {
				shrink()
				return true
			}
			return false
		})
	}, [page.back, big, tab?.id])

	const go = (text: string) => {
		const next = toUrl(text)
		if (!next) return
		loadInActive(next)
		setAddress(undefined)
		setPanel('none')
	}
	const bookmarked = !!page.url && s.bookmarks.some(b => b.url === page.url)
	const h = box.h - BAR
	const narrow = box.w < 300

	return (
		<View
			pointerEvents={minimized ? 'none' : 'auto'}
			style={{
				position: 'absolute',
				// Minimized: moved off screen rather than unmounted, so the pages keep running.
				left: minimized ? -10000 : box.x,
				opacity: minimized ? 0 : 1,
				top: box.y,
				width: box.w,
				height: box.h,
				borderRadius: big ? 0 : 12,
				overflow: 'hidden',
				backgroundColor: '#111214',
				elevation: 1000,
				zIndex: 1000,
				borderWidth: big ? 0 : 1,
				borderColor: 'rgba(255,255,255,0.12)',
			}}
		>
			<View
				{...dragger.panHandlers}
				style={{
					height: BAR,
					flexDirection: 'row',
					alignItems: 'center',
					backgroundColor: 'rgba(24,25,28,0.97)',
				}}
			>
				<Btn
					label="‹"
					hint="Back"
					off={!page.back}
					onPress={() => view()?.goBack?.()}
				/>
				<Pressable
					style={{ flex: 1, height: BAR, justifyContent: 'center' }}
					onPress={() => setAddress(page.url)}
					onLongPress={() => setMoving(true)}
					accessibilityLabel="Address"
				>
					<Text numberOfLines={1} style={{ color: '#c4c9ce', fontSize: 12 }}>
						⠿ {page.title || hostOf(page.url) || 'Floating Browser'}
					</Text>
				</Pressable>
				{page.url && s.inWindowFullscreen ? (
					<Btn
						label="⛶"
						hint={videoFull ? 'Leave fullscreen' : 'Video fills the window'}
						on={videoFull || !!beforePageBig}
						onPress={() => {
							if (beforePageBig && !videoFull) return togglePageBig()
							view()?.injectJavaScript?.(
								'(function(){try{window.__fbToggleFs&&window.__fbToggleFs()}catch(e){}})();true;',
							)
							if (videoFull) sideways(false)
						}}
					/>
				) : null}
				<Btn
					label={`❐${tabs.length > 1 ? tabs.length : ''}`}
					hint="Tabs"
					on={panel === 'tabs'}
					onPress={() => setPanel(p => (p === 'tabs' ? 'none' : 'tabs'))}
				/>
				{!narrow ? (
					<Btn label="↻" hint="Reload" onPress={() => view()?.reload?.()} />
				) : null}
				<Btn
					label="☰"
					hint="Extensions and bookmarks"
					on={panel === 'menu'}
					onPress={() => setPanel(p => (p === 'menu' ? 'none' : 'menu'))}
				/>
				<Btn
					label={big ? '▁' : '⤢'}
					hint={big ? 'Back to your size' : 'Big window'}
					onPress={() => (big ? shrink() : grow())}
				/>
				<Btn label="✕" hint="Close" onPress={closeBrowser} />
			</View>

			<View style={{ width: box.w, height: h }}>
				{tabs.map(t => (
					<TabView
						key={t.id}
						tab={t}
						active={t.id === tab?.id}
						startScript={startScript}
						register={register}
						onPage={updatePage}
						onGo={go}
					/>
				))}

				{address !== undefined ? (
					<View
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							right: 0,
							padding: 6,
							backgroundColor: 'rgba(24,25,28,0.98)',
							flexDirection: 'row',
							alignItems: 'center',
						}}
					>
						<TextInput
							value={address}
							onChangeText={setAddress}
							onSubmitEditing={() => go(address)}
							autoFocus
							autoCapitalize="none"
							autoCorrect={false}
							keyboardType="url"
							returnKeyType="go"
							selectTextOnFocus
							placeholder="Search or type an address"
							placeholderTextColor="#80848e"
							style={{
								flex: 1,
								color: '#ffffff',
								fontSize: 14,
								paddingHorizontal: 10,
								height: 36,
								borderRadius: 8,
								backgroundColor: 'rgba(255,255,255,0.08)',
							}}
						/>
						<Btn
							label="✕"
							hint="Close the address bar"
							onPress={() => setAddress(undefined)}
						/>
					</View>
				) : null}

				{panel === 'tabs' ? (
					<ScrollView
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							right: 0,
							maxHeight: h,
							backgroundColor: 'rgba(24,25,28,0.98)',
						}}
						contentContainerStyle={{ padding: 6 }}
					>
						{tabs.map(t => (
							<View
								key={t.id}
								style={{
									flexDirection: 'row',
									alignItems: 'center',
									borderRadius: 8,
									marginBottom: 3,
									backgroundColor:
										t.id === tab?.id
											? 'rgba(88,101,242,0.35)'
											: 'rgba(255,255,255,0.05)',
								}}
							>
								<Pressable
									style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 9 }}
									onPress={() => {
										switchTab(t.id)
										setPanel('none')
										setAddress(t.url ? undefined : '')
									}}
								>
									<Text
										numberOfLines={1}
										style={{
											color: '#ffffff',
											fontSize: 13,
											fontWeight: '600',
										}}
									>
										{t.page.title || hostOf(t.page.url || t.url) || 'New tab'}
									</Text>
									{t.page.url || t.url ? (
										<Text
											numberOfLines={1}
											style={{ color: '#80848e', fontSize: 11 }}
										>
											{hostOf(t.page.url || t.url)}
										</Text>
									) : null}
								</Pressable>
								<Btn
									label="✕"
									hint="Close tab"
									onPress={() => closeTab(t.id)}
								/>
							</View>
						))}
						{tabs.length < MAX_TABS ? (
							<Pressable
								onPress={() => {
									newTab('')
									setPanel('none')
									setAddress('')
								}}
								style={{
									paddingHorizontal: 10,
									paddingVertical: 10,
									borderRadius: 8,
									backgroundColor: 'rgba(255,255,255,0.05)',
								}}
							>
								<Text
									style={{ color: '#ffffff', fontSize: 13, fontWeight: '600' }}
								>
									＋ New tab
								</Text>
							</Pressable>
						) : (
							<Text style={{ color: '#80848e', fontSize: 11, padding: 6 }}>
								Up to {MAX_TABS} tabs.
							</Text>
						)}
					</ScrollView>
				) : null}

				{panel === 'menu' ? (
					<ScrollView
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							right: 0,
							maxHeight: h,
							backgroundColor: 'rgba(24,25,28,0.98)',
						}}
						contentContainerStyle={{ padding: 8 }}
					>
						<Label>EXTENSIONS</Label>
						<View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
							<Toggle
								label="Pop-up blocker"
								on={s.popupBlock}
								onPress={() => save({ popupBlock: !s.popupBlock })}
							/>
							<Toggle
								label={`uBlock${s.uBlock && page.blocked ? ` · ${page.blocked} blocked` : ''}`}
								on={s.uBlock}
								onPress={() => save({ uBlock: !s.uBlock })}
							/>
							<Toggle
								label="Fullscreen in window"
								on={s.inWindowFullscreen}
								onPress={() =>
									save({ inWindowFullscreen: !s.inWindowFullscreen })
								}
							/>
							<Toggle
								label="Hide ads"
								on={s.adHide}
								onPress={() => save({ adHide: !s.adHide })}
							/>
							<Toggle
								label="Dark pages"
								on={s.dark}
								onPress={() => save({ dark: !s.dark })}
							/>
							<Toggle
								label="Video focus"
								on={s.videoFocus}
								onPress={() => save({ videoFocus: !s.videoFocus })}
							/>
							<Toggle
								label="Desktop site"
								on={s.desktop}
								onPress={() => save({ desktop: !s.desktop })}
							/>
							{s.scripts.map(sc => (
								<Toggle
									key={sc.id}
									label={`⚙ ${sc.name || 'script'}`}
									on={sc.on}
									onPress={() =>
										save({
											scripts: s.scripts.map(x =>
												x.id === sc.id ? { ...x, on: !x.on } : x,
											),
										})
									}
								/>
							))}
						</View>
						<Label>WINDOW</Label>
						<View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
							<Toggle
								label="✥ Move window"
								on={false}
								onPress={() => {
									setPanel('none')
									setMoving(true)
								}}
							/>
							<Toggle label="Big" on={false} onPress={() => grow()} />
							<Toggle
								label="Corner"
								on={false}
								onPress={() => setWin(presets.corner(), true)}
							/>
							<Toggle
								label="16:9"
								on={false}
								onPress={() => setWin(presets.video(), true)}
							/>
						</View>
						<Label>PAGE</Label>
						<View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
							{page.url ? (
								<Toggle
									label={bookmarked ? '★ Bookmarked' : '☆ Bookmark'}
									on={bookmarked}
									onPress={() =>
										save({
											bookmarks: bookmarked
												? s.bookmarks.filter(b => b.url !== page.url)
												: [
														...s.bookmarks,
														{
															title: page.title || hostOf(page.url),
															url: page.url,
														},
													],
										})
									}
								/>
							) : null}
							<Toggle
								label="⌂ Home"
								on={false}
								onPress={() => {
									loadInActive('')
									setPanel('none')
								}}
							/>
							{page.forward ? (
								<Toggle
									label="Forward ›"
									on={false}
									onPress={() => view()?.goForward?.()}
								/>
							) : null}
							{page.url ? (
								<Toggle
									label="Open outside"
									on={false}
									onPress={() => {
										external.skip = true
										void Linking.openURL(page.url).catch(() => {})
										setTimeout(() => (external.skip = false), 1500)
									}}
								/>
							) : null}
						</View>
					</ScrollView>
				) : null}

				{moving ? (
					<View
						{...mover.panHandlers}
						accessibilityLabel="Drag to move the window, tap when done"
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: 'rgba(0,0,0,0.45)',
						}}
					>
						<View
							style={{
								paddingHorizontal: 14,
								paddingVertical: 9,
								borderRadius: 18,
								backgroundColor: 'rgba(88,101,242,0.9)',
							}}
						>
							<Text
								style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}
							>
								✥ Drag to move · tap when done
							</Text>
						</View>
					</View>
				) : null}
				<View
					{...resizer.panHandlers}
					accessibilityLabel="Resize"
					style={{
						position: 'absolute',
						right: 0,
						bottom: 0,
						width: 32,
						height: 32,
						alignItems: 'flex-end',
						justifyContent: 'flex-end',
						padding: 4,
					}}
				>
					<Text
						style={{
							color: 'rgba(128,128,128,0.9)',
							fontSize: 16,
							fontWeight: '700',
						}}
					>
						◢
					</Text>
				</View>
			</View>
		</View>
	)
}

function Home({ onGo }: { onGo: (text: string) => void }) {
	const s = useSettings()
	const [text, setText] = useState('')
	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: '#111214' }}
			contentContainerStyle={{ padding: 12 }}
			keyboardShouldPersistTaps="handled"
		>
			<TextInput
				value={text}
				onChangeText={setText}
				onSubmitEditing={() => onGo(text)}
				autoCapitalize="none"
				autoCorrect={false}
				keyboardType="url"
				returnKeyType="go"
				placeholder="Search or type an address"
				placeholderTextColor="#80848e"
				style={{
					color: '#ffffff',
					fontSize: 15,
					paddingHorizontal: 12,
					height: 42,
					borderRadius: 10,
					backgroundColor: 'rgba(255,255,255,0.08)',
				}}
			/>
			<View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
				{s.bookmarks.map(b => (
					<Pressable
						key={b.url}
						onPress={() => onGo(b.url)}
						style={{
							paddingHorizontal: 12,
							paddingVertical: 9,
							margin: 3,
							borderRadius: 10,
							backgroundColor: 'rgba(255,255,255,0.07)',
							maxWidth: '100%',
						}}
					>
						<Text numberOfLines={1} style={{ color: '#ffffff', fontSize: 13 }}>
							★ {b.title || hostOf(b.url)}
						</Text>
					</Pressable>
				))}
			</View>
			{!s.bookmarks.length ? (
				<Text style={{ color: '#80848e', fontSize: 12, marginTop: 8 }}>
					Bookmarks you add from ☰ show up here.
				</Text>
			) : null}
		</ScrollView>
	)
}

function Host() {
	const [, tick] = useState(0)
	useEffect(() => {
		mounted = true
		const on = () => tick(n => n + 1)
		listeners.add(on)
		return () => {
			listeners.delete(on)
			mounted = false
		}
	}, [])
	return (
		<View
			pointerEvents="box-none"
			style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
		>
			{open && win ? <Browser box={win} /> : null}
		</View>
	)
}

export function installWindow(): () => void {
	const undo: Array<() => void> = []
	undo.push(
		findModule(
			'modules/toast/native/AppToastContainer.tsx',
			['AppToastContainer'],
			(mod: any) => {
				if (typeof mod?.default !== 'function') return
				undo.push(
					after(mod, 'default', ((rendered: any) => (
						<>
							{rendered}
							<Host />
						</>
					)) as never),
				)
			},
		),
	)
	return () => {
		for (const u of undo.splice(0))
			try {
				u()
			} catch {}
		open = false
		mounted = false
		clearTimeout(saveTimer)
	}
}
