import { animPrefs } from './anim'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { useEffect, useMemo, useState } from 'react'
import {
	ActivityIndicator,
	FlatList,
	Image,
	Pressable,
	Text as RNText,
	ScrollView,
	useWindowDimensions,
	View,
} from 'react-native'
import { ToastActionCreators } from '@valenced/discord/actions'
import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { RootNavigationRef } from '@valenced/discord/modules/main_tabs_v2'
import { after } from '@valenced/patcher'
import { findModule } from './find'
import { fitCard, FrameView } from './frame'
import { OnMe } from './onme'
import {
	canOpenSheet,
	openDiscordSheet,
	openItemSheet,
	previewStatus,
	setRouteStore,
	setShopRoute,
} from './preview'
import {
	activeCount,
	applyFilters,
	collabIds,
	DEFAULT_FILTERS,
	errorText,
	formatPrice,
	loadShop,
	hasPopularity,
	SWATCHES,
	THEMES,
	TYPES,
	toRows,
} from './shop'
import type { Filters, Product, Shop, Swatch } from './shop'

const GAP = 8
const PAD = 12
const ACCENT = '#5865F2'

let cached: Shop | undefined

/** The theme's main text colour. Some colour names (like `text-default`) don't exist on every Discord version, and Text then falls back to black. */
function textColor(): string {
	try {
		const T = (Tokens as any).default
		const theme = (Stores as any).ThemeStore?.theme
		for (const name of [
			'TEXT_DEFAULT',
			'TEXT_NORMAL',
			'HEADER_PRIMARY',
			'TEXT_PRIMARY',
		]) {
			const token = T?.colors?.[name]
			if (!token) continue
			const value = T.internal.resolveSemanticColor(theme, token)
			if (typeof value === 'string' && value) return value
		}
		return theme === 'light' ? '#060607' : '#f2f3f5'
	} catch {
		return '#f2f3f5'
	}
}

function Chip({
	label,
	on,
	onPress,
	onLongPress,
}: {
	label: string
	on: boolean
	onPress: () => void
	onLongPress?: () => void
}) {
	const { Text } = Design as any
	return (
		<Pressable
			onPress={onPress}
			onLongPress={onLongPress}
			accessibilityRole="button"
			accessibilityState={{ selected: on }}
			style={{
				paddingHorizontal: 12,
				paddingVertical: 6,
				borderRadius: 16,
				marginRight: 6,
				backgroundColor: on ? ACCENT : 'rgba(127,127,127,0.18)',
			}}
		>
			<Text
				variant="text-sm/semibold"
				style={{ color: on ? '#ffffff' : textColor() }}
			>
				{label}
			</Text>
		</Pressable>
	)
}

function ChipRow<T extends string>({
	options,
	value,
	onChange,
}: {
	options: [T, string][]
	value: T
	onChange: (v: T) => void
}) {
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={{ paddingHorizontal: PAD }}
		>
			{options.map(([v, label]) => (
				<Chip
					key={v}
					label={label}
					on={v === value}
					onPress={() => onChange(v)}
				/>
			))}
		</ScrollView>
	)
}

function priceLine(p: Product): string {
	const parts = [
		formatPrice(p.money),
		p.orbs != null ? `${p.orbs} Orbs` : undefined,
	].filter(Boolean)
	return parts.join(' · ') || '—'
}

/**
 * Discord's own item sheet, with the item on your profile (and Redeem / Buy). Opened through
 * Discord's details action when one of its usual names is found, else through the item's Shop link,
 * which the app opens itself. The Browse layer steps aside first so the sheet isn't under it;
 * Browse brings it back as it was.
 */
function previewOnProfile(p: Product) {
	if (tab === 'browse') {
		tab = 'featured'
		layerDetail = undefined
		tabsChanged()
	}
	setTimeout(() => {
		// Discord's own call first; what was learned from a tap only if that isn't there.
		void openDiscordSheet(p).then(done => {
			if (!done) openItemSheet(p)
		})
	}, 250)
}

function openDetail(p: Product, owned: boolean) {
	// Over the Shop's Browse layer, Discord's alerts can open underneath it: show it in the layer.
	if (tab === 'browse' && tabsStatus.onShop) {
		layerDetail = { p, owned }
		tabsChanged()
		return
	}
	const { AlertModal, AlertActionButton, Text, Stack } = Design as any
	const key = `shop-browser-${p.sku}`
	const close = () => (AlertActionCreators as any).dismissAlert(key)
	;(AlertActionCreators as any).openAlert(
		key,
		<AlertModal
			title={p.name}
			content={
				<Stack spacing={10}>
					{p.image ? (
						<Image
							source={{ uri: p.image }}
							resizeMode="contain"
							style={{ width: '100%', height: 160, borderRadius: 12 }}
						/>
					) : null}
					<Text variant="text-sm/medium" color="text-muted">
						{[TYPES[p.type as keyof typeof TYPES] ?? 'Item', p.category]
							.filter(Boolean)
							.join(' · ')}
					</Text>
					{p.summary ? (
						<Text variant="text-md/normal" style={{ color: textColor() }}>
							{p.summary}
						</Text>
					) : null}
					<Text variant="text-md/semibold" style={{ color: textColor() }}>
						{priceLine(p)}
						{p.nitro ? `  (Nitro: ${formatPrice(p.nitro)})` : ''}
					</Text>
					{owned ? (
						<Text variant="text-sm/semibold" color="text-feedback-positive">
							You own this
						</Text>
					) : null}
				</Stack>
			}
			actions={
				<>
					<AlertActionButton
						text={owned ? 'Preview on my profile' : 'Preview & Buy'}
						variant="primary"
						onPress={() => {
							close()
							previewOnProfile(p)
						}}
					/>
					<AlertActionButton text="Close" variant="secondary" onPress={close} />
				</>
			}
		/>,
	)
}

function Card({
	p,
	size,
	h,
	owned,
	compact,
}: {
	p: Product
	size: number
	/** Height, when not square (nameplates are long, effects tall). */
	h?: number
	owned: boolean
	compact?: boolean
}) {
	const height = h ?? size
	const fill = p.type === 2
	const { Text } = Design as any
	return (
		<Pressable
			onPress={() => openDetail(p, owned)}
			style={{ width: size, marginBottom: GAP }}
			accessibilityLabel={p.name}
		>
			<View
				style={{
					width: size,
					height,
					borderRadius: 12,
					overflow: 'hidden',
					backgroundColor: 'rgba(127,127,127,0.14)',
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				{p.frame ? (
					(() => {
						const { cardW, cardH } = fitCard(p.frame, size * 0.9, height * 0.9)
						return (
							<FrameView frame={p.frame} cardW={cardW} cardH={cardH}>
								<View
									style={{
										flex: 1,
										borderRadius: 8,
										backgroundColor: 'rgba(0,0,0,0.35)',
									}}
								/>
							</FrameView>
						)
					})()
				) : p.image ? (
					<Image
						source={{ uri: p.image }}
						resizeMode={fill ? 'cover' : 'contain'}
						style={
							fill
								? { width: size, height }
								: { width: size * 0.92, height: height * 0.92 }
						}
					/>
				) : (
					<Text variant="text-xs/medium" color="text-muted">
						{TYPES[p.type as keyof typeof TYPES] ?? 'Item'}
					</Text>
				)}
				{owned ? (
					<View
						style={{
							position: 'absolute',
							top: 4,
							right: 4,
							borderRadius: 8,
							paddingHorizontal: 5,
							paddingVertical: 1,
							backgroundColor: '#23A55A',
						}}
					>
						<Text variant="text-xxs/bold" style={{ color: '#ffffff' }}>
							{compact ? '✓' : 'Owned'}
						</Text>
					</View>
				) : null}
			</View>
			<Text
				variant={compact ? 'text-xxs/semibold' : 'text-xs/semibold'}
				numberOfLines={1}
				style={{ marginTop: 4, color: textColor() }}
			>
				{p.name}
			</Text>
			{compact ? null : (
				<Text variant="text-xxs/medium" color="text-muted" numberOfLines={1}>
					{priceLine(p)}
				</Text>
			)}
		</Pressable>
	)
}

interface Settings {
	/** Categories the user marked as collab (true) or not (false), overriding detection. */
	collabMarks: Record<string, boolean>
	/** Animated previews (off: still pictures). */
	animations?: boolean
	/** Grid columns: 3, 4 or 5. */
	columns?: 3 | 4 | 5
	/** Discord's Shop → Shop All opens the browser (older setting). */
	inShop?: boolean
	/** How Discord opens an item's screen, learned from a tap in its Shop (for Preview & Buy). */
	previewRoute2?: { name: string; params: any }
	/** Where it shows in Discord's Shop: a Featured | Browse switch, a pop-up from Shop All, or not at all. */
	shopMode?: 'tab' | 'inline' | 'popup' | 'off'
}
type Storage = {
	use(): Partial<Settings> | undefined
	set(value: Settings, save?: boolean): void
}

function toast(text: string) {
	try {
		ToastActionCreators.open('shop-browser', { text } as never)
	} catch {}
}

/** A tick box row, like the desktop Shop's filter list. */
function Check({
	label,
	on,
	onPress,
}: {
	label: string
	on: boolean
	onPress: () => void
}) {
	const { Text } = Design as any
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="checkbox"
			accessibilityState={{ checked: on }}
			style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }}
		>
			<View
				style={{
					width: 20,
					height: 20,
					borderRadius: 5,
					borderWidth: 2,
					borderColor: on ? ACCENT : 'rgba(127,127,127,0.6)',
					backgroundColor: on ? ACCENT : 'transparent',
					alignItems: 'center',
					justifyContent: 'center',
					marginRight: 10,
				}}
			>
				{on ? (
					<Text
						style={{
							color: '#ffffff',
							fontSize: 12,
							lineHeight: 14,
							fontWeight: '800',
						}}
					>
						✓
					</Text>
				) : null}
			</View>
			<Text
				variant="text-sm/semibold"
				style={{ color: textColor(), flexShrink: 1 }}
			>
				{label}
			</Text>
		</Pressable>
	)
}

function Heading({ children }: { children: string }) {
	const { Text } = Design as any
	return (
		<Text
			variant="text-sm/bold"
			style={{ color: textColor(), marginTop: 14, marginBottom: 2 }}
		>
			{children}
		</Text>
	)
}

const toggle = <T,>(list: T[], v: T) =>
	list.includes(v) ? list.filter(x => x !== v) : [...list, v]

/** The filter panel, laid out like the desktop Shop's (Item Type, Show Only, Colour, Theme…). */
function FilterPanel({
	shop,
	f,
	set,
	collabs,
	toggleCollab,
	cols,
	setCols,
	close,
	inline,
	top = 0,
}: {
	shop: Shop
	f: Filters
	set: (patch: Partial<Filters>) => void
	collabs: Set<string>
	toggleCollab: (id: string, name: string) => void
	cols: number
	setCols: (n: 3 | 4 | 5) => void
	close: () => void
	/** In the Shop page itself: laid out in the page instead of sliding over it. */
	inline?: boolean
	/** Where the panel starts: under the page's title row, so it covers only the items. */
	top?: number
}) {
	const { Text } = Design as any
	const Wrap: any = inline ? View : ScrollView
	const wrapProps = inline
		? { style: { padding: 12 } }
		: { contentContainerStyle: { padding: 14, paddingBottom: 60 } }
	return (
		<View
			style={
				inline
					? {
							borderRadius: 12,
							marginBottom: 8,
							backgroundColor: 'rgba(127,127,127,0.10)',
						}
					: {
							position: 'absolute',
							top,
							right: 0,
							bottom: 0,
							width: '74%',
							maxWidth: 360,
							backgroundColor: panelColor(),
							borderLeftWidth: 1,
							borderColor: 'rgba(127,127,127,0.25)',
							elevation: 20,
							zIndex: 20,
						}
			}
		>
			<Wrap {...wrapProps}>
				<View style={{ flexDirection: 'row', alignItems: 'center' }}>
					<Text
						variant="heading-md/bold"
						style={{ color: textColor(), flex: 1 }}
					>
						Filters
					</Text>
					<Pressable
						onPress={() =>
							set({ ...DEFAULT_FILTERS, query: f.query, sort: f.sort })
						}
						hitSlop={8}
						style={{ marginRight: 14 }}
					>
						<Text variant="text-sm/semibold" color="text-link">
							Reset
						</Text>
					</Pressable>
					<Pressable onPress={close} hitSlop={10}>
						<Text
							style={{ color: textColor(), fontSize: 20, fontWeight: '700' }}
						>
							✕
						</Text>
					</Pressable>
				</View>

				<Heading>Item Type</Heading>
				{(
					[
						[0, 'Avatar Decorations'],
						[2, 'Nameplates'],
						[1, 'Profile Effects'],
						[3, 'Profile Frames'],
						[1000, 'Bundles'],
					] as [number, string][]
				).map(([t, label]) => (
					<Check
						key={t}
						label={label}
						on={f.types.includes(t)}
						onPress={() => set({ types: toggle(f.types, t) })}
					/>
				))}

				<Heading>Show Only</Heading>
				<Check
					label="Orbs Eligible"
					on={f.pay === 'orbs'}
					onPress={() => set({ pay: f.pay === 'orbs' ? 'all' : 'orbs' })}
				/>
				<Check
					label="Paid with money"
					on={f.pay === 'money'}
					onPress={() => set({ pay: f.pay === 'money' ? 'all' : 'money' })}
				/>
				<Check
					label="Collabs"
					on={f.collab === 'collab'}
					onPress={() =>
						set({ collab: f.collab === 'collab' ? 'all' : 'collab' })
					}
				/>
				<Check
					label="Non-collab"
					on={f.collab === 'non-collab'}
					onPress={() =>
						set({ collab: f.collab === 'non-collab' ? 'all' : 'non-collab' })
					}
				/>
				<Check
					label="Owned"
					on={f.owned === 'owned'}
					onPress={() => set({ owned: f.owned === 'owned' ? 'all' : 'owned' })}
				/>
				<Check
					label="Not owned"
					on={f.owned === 'not-owned'}
					onPress={() =>
						set({ owned: f.owned === 'not-owned' ? 'all' : 'not-owned' })
					}
				/>

				<Heading>Colour</Heading>
				<View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
					{(Object.entries(SWATCHES) as [Swatch, string][]).map(
						([name, hex]) => {
							const on = f.swatches.includes(name)
							return (
								<Pressable
									key={name}
									accessibilityRole="checkbox"
									accessibilityLabel={name}
									accessibilityState={{ checked: on }}
									onPress={() => set({ swatches: toggle(f.swatches, name) })}
									style={{
										width: 34,
										height: 34,
										borderRadius: 17,
										margin: 4,
										backgroundColor: hex,
										borderWidth: on ? 3 : 1,
										borderColor: on ? ACCENT : 'rgba(127,127,127,0.5)',
										alignItems: 'center',
										justifyContent: 'center',
									}}
								>
									{on ? (
										<Text
											style={{
												color:
													name === 'white' || name === 'yellow'
														? '#000'
														: '#fff',
												fontWeight: '800',
											}}
										>
											✓
										</Text>
									) : null}
								</Pressable>
							)
						},
					)}
				</View>

				<Heading>Theme</Heading>
				<View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
					{THEMES.map(([t, icon]) => (
						<View key={t} style={{ marginBottom: 6 }}>
							<Chip
								label={`${icon} ${t}`}
								on={f.tags.includes(t)}
								onPress={() => set({ tags: toggle(f.tags, t) })}
							/>
						</View>
					))}
				</View>

				<Heading>Grid (decorations and bundles)</Heading>
				<View style={{ flexDirection: 'row', marginTop: 4 }}>
					{([3, 4, 5] as const).map(n => (
						<Chip
							key={n}
							label={`${n} × ${n}`}
							on={cols === n}
							onPress={() => setCols(n)}
						/>
					))}
				</View>
				<Pressable
					onPress={() =>
						set({ ...DEFAULT_FILTERS, query: f.query, sort: f.sort })
					}
					style={{
						marginTop: 18,
						height: 44,
						borderRadius: 10,
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: 'rgba(127,127,127,0.2)',
					}}
				>
					<Text variant="text-md/semibold" style={{ color: textColor() }}>
						Clear all filters
					</Text>
				</Pressable>
			</Wrap>
		</View>
	)
}

/** The sheet / panel colour of the theme. */
function panelColor(): string {
	try {
		const T = (Tokens as any).default
		const theme = (Stores as any).ThemeStore?.theme
		for (const name of [
			'BACKGROUND_FLOATING',
			'BACKGROUND_SECONDARY',
			'BG_SURFACE_OVERLAY',
		]) {
			const token = T?.colors?.[name]
			if (!token) continue
			const v = T.internal.resolveSemanticColor(theme, token)
			if (typeof v === 'string' && v) return v
		}
	} catch {}
	return '#2b2d31'
}

let storage: Storage | undefined

/** What the browser had last (filters, sort), so coming back to it keeps them. */
let lastFilters: Filters | undefined
let appliedPreset = 0

const SORTS: [Filters['sort'], string][] = [
	['newest', 'Recently Added'],
	['cheap', 'Price: Low to High'],
	['pricey', 'Price: High to Low'],
	['popular', 'Popular'],
]

/** The page's title, like the desktop Shop's ("Nameplates (53)"). */
function titleOf(f: Filters, count: number): string {
	const names: Record<number, string> = {
		0: 'Avatar Decorations',
		1: 'Profile Effects',
		2: 'Nameplates',
		3: 'Profile Frames',
		1000: 'Bundles',
	}
	const name =
		f.types.length === 1
			? names[f.types[0]]
			: f.collab === 'collab' && !f.types.length
				? 'Collabs'
				: 'Shop All'
	return `${name} (${count})`
}

function ShopPage({
	onClose,
	preset,
	presetKey,
}: {
	onClose?: () => void
	preset?: Partial<Filters>
	presetKey?: number
}) {
	const stored = storage?.use()
	const marks = stored?.collabMarks ?? {}
	const { Text, TextInput, Button } = Design as any
	const [shop, setShop] = useState<Shop | undefined>(cached)
	const [error, setError] = useState<string>()
	// Coming back to Browse picks up where you were; a section from Browse ▾ starts from it.
	const [f, setF] = useState<Filters>(() =>
		presetKey && presetKey !== appliedPreset
			? { ...DEFAULT_FILTERS, sort: lastFilters?.sort ?? 'newest', ...preset }
			: (lastFilters ?? { ...DEFAULT_FILTERS, ...preset }),
	)
	const [panel, setPanel] = useState(false)
	const [sortOpen, setSortOpen] = useState(false)
	const [headerH, setHeaderH] = useState(0)
	useEffect(() => {
		if (presetKey && presetKey !== appliedPreset) {
			appliedPreset = presetKey
			setF(prev => ({ ...DEFAULT_FILTERS, sort: prev.sort, ...preset }))
		}
	}, [presetKey])
	useEffect(() => {
		lastFilters = f
	}, [f])
	const { width } = useWindowDimensions()
	const cols = stored?.columns ?? 3
	const size = Math.floor((width - PAD * 2 - GAP * (cols - 1)) / cols)
	const rowsOf = (list: Product[]) => toRows(list, cols)
	const save = (patch: Partial<Settings>) =>
		storage?.set({ collabMarks: marks, ...stored, ...patch } as Settings, true)

	const load = () => {
		setError(undefined)
		loadShop()
			.then(s => {
				cached = s
				setShop(s)
			})
			.catch(e => setError(errorText(e)))
	}
	useEffect(() => {
		if (!cached) load()
	}, [])

	const items = useMemo(
		() => (shop ? applyFilters(shop, f, marks) : []),
		[shop, f, marks],
	)
	const rows = useMemo(() => rowsOf(items), [items, cols])
	const collabs = useMemo(
		() => (shop ? collabIds(shop, marks) : new Set<string>()),
		[shop, marks],
	)
	const toggleCollab = (id: string, name: string) => {
		const now = !collabs.has(id)
		save({ collabMarks: { ...marks, [id]: now } })
		toast(now ? `${name} marked as a collab` : `${name} marked as not a collab`)
	}
	const set = (patch: Partial<Filters>) => setF(prev => ({ ...prev, ...patch }))
	const active = activeCount(f)

	const top = (
		<View
			style={{ paddingTop: 8, paddingBottom: 6, gap: 8 }}
			onLayout={(e: any) =>
				setHeaderH(Math.round(e?.nativeEvent?.layout?.height ?? 0))
			}
		>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					paddingHorizontal: PAD,
					gap: 8,
				}}
			>
				{onClose ? (
					<Pressable
						onPress={onClose}
						hitSlop={10}
						accessibilityLabel="Close"
						style={{ paddingRight: 4 }}
					>
						<Text
							style={{ color: textColor(), fontSize: 22, fontWeight: '700' }}
						>
							✕
						</Text>
					</Pressable>
				) : null}
				<View style={{ flex: 1 }}>
					<TextInput
						placeholder="Search the Shop"
						value={f.query}
						onChange={(query: string) => set({ query })}
						isClearable
					/>
				</View>
				<Pressable
					onPress={() => setPanel(p => !p)}
					accessibilityLabel="Filters"
					style={{
						paddingHorizontal: 12,
						height: 40,
						borderRadius: 10,
						justifyContent: 'center',
						backgroundColor:
							panel || active ? ACCENT : 'rgba(127,127,127,0.18)',
					}}
				>
					<Text
						variant="text-sm/semibold"
						style={{ color: panel || active ? '#ffffff' : textColor() }}
					>
						{panel ? 'Hide Filters' : `Filters${active ? ` · ${active}` : ''}`}
					</Text>
				</Pressable>
			</View>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					paddingHorizontal: PAD,
					gap: 8,
				}}
			>
				<Text
					variant="heading-lg/bold"
					style={{ color: textColor(), flex: 1 }}
					numberOfLines={1}
				>
					{shop ? titleOf(f, items.length) : 'Shop'}
				</Text>
				<Text variant="text-sm/semibold" color="text-muted">
					Sort by
				</Text>
				<Pressable
					onPress={() => setSortOpen(o => !o)}
					accessibilityLabel="Sort by"
					style={{
						flexDirection: 'row',
						alignItems: 'center',
						height: 36,
						paddingHorizontal: 10,
						borderRadius: 8,
						borderWidth: 1,
						borderColor: 'rgba(127,127,127,0.35)',
					}}
				>
					<Text variant="text-sm/semibold" style={{ color: textColor() }}>
						{SORTS.find(([v]) => v === f.sort)?.[1] ?? 'Recently Added'}{' '}
						{sortOpen ? '▴' : '▾'}
					</Text>
				</Pressable>
			</View>
			{sortOpen ? (
				<View
					style={{
						alignSelf: 'flex-end',
						marginRight: PAD,
						borderRadius: 10,
						paddingVertical: 4,
						backgroundColor: panelColor(),
						borderWidth: 1,
						borderColor: 'rgba(127,127,127,0.3)',
					}}
				>
					{SORTS.map(([v, label]) => (
						<Pressable
							key={v}
							onPress={() => {
								set({ sort: v })
								setSortOpen(false)
							}}
							style={{
								paddingHorizontal: 16,
								paddingVertical: 9,
								backgroundColor:
									f.sort === v ? 'rgba(88,101,242,0.3)' : 'transparent',
							}}
						>
							<Text variant="text-sm/semibold" style={{ color: textColor() }}>
								{label}
								{f.sort === v ? '  ✓' : ''}
							</Text>
						</Pressable>
					))}
				</View>
			) : null}
			{f.sort === 'popular' && shop && !hasPopularity(shop) ? (
				<Text
					variant="text-xxs/medium"
					color="text-muted"
					style={{ paddingHorizontal: PAD }}
				>
					Discord's app doesn't get popularity numbers, so Popular shows
					Discord's own featured order.
				</Text>
			) : null}
		</View>
	)

	return (
		<View style={{ flex: 1 }}>
			{top}
			{error ? (
				<View style={{ padding: 16, gap: 12 }}>
					<Text variant="text-md/semibold" color="text-feedback-critical">
						Couldn't load the shop: {error}
					</Text>
					<Button text="Try again" onPress={load} />
				</View>
			) : !shop ? (
				<View style={{ padding: 32, alignItems: 'center' }}>
					<ActivityIndicator />
				</View>
			) : (
				<FlatList
					style={{ flex: 1 }}
					data={rows}
					keyExtractor={r => r.key}
					contentContainerStyle={{ paddingBottom: 32, paddingTop: 4 }}
					keyboardShouldPersistTaps="handled"
					initialNumToRender={18}
					windowSize={7}
					refreshing={false}
					onRefresh={load}
					ListEmptyComponent={
						<Text
							variant="text-sm/medium"
							color="text-muted"
							style={{ padding: PAD }}
						>
							No items match these filters.
						</Text>
					}
					renderItem={({ item: row }) => (
						<View
							style={{ flexDirection: 'row', gap: GAP, paddingHorizontal: PAD }}
						>
							{row.items.map(p => {
								const full = width - PAD * 2
								const w =
									row.shape === 'wide'
										? full
										: row.shape === 'tall'
											? Math.floor((full - GAP) / 2)
											: size
								const h =
									row.shape === 'wide'
										? Math.round(full * 0.22)
										: row.shape === 'tall'
											? Math.round(w * 1.35)
											: size
								return (
									<Card
										key={p.sku}
										p={p}
										size={w}
										h={h}
										owned={shop.owned.has(p.sku)}
										compact={row.shape === 'grid' && cols >= 5}
									/>
								)
							})}
						</View>
					)}
				/>
			)}
			{panel && shop ? (
				<FilterPanel
					shop={shop}
					f={f}
					set={set}
					collabs={collabs}
					toggleCollab={toggleCollab}
					cols={cols}
					setCols={n => save({ columns: n })}
					close={() => setPanel(false)}
					top={headerH}
				/>
			) : null}
		</View>
	)
}

function pageColor(): string {
	try {
		const T = (Tokens as any).default
		const theme = (Stores as any).ThemeStore?.theme
		for (const name of ['BACKGROUND_BASE_LOWER', 'BACKGROUND_PRIMARY']) {
			const token = T?.colors?.[name]
			if (!token) continue
			const v = T.internal.resolveSemanticColor(theme, token)
			if (typeof v === 'string' && v) return v
		}
	} catch {}
	return '#1e1f22'
}

function topInset(): number {
	try {
		const top = (ReactNativeSafeAreaContext as any)?.initialWindowMetrics
			?.insets?.top
		if (typeof top === 'number' && top > 0) return top
	} catch {}
	return 40
}

/** The setting, with older values mapped (the in-page version became the switch). */
function modeOf(st: Partial<Settings>): 'tab' | 'off' {
	const m = st.shopMode ?? (st.inShop === false ? 'off' : 'tab')
	return m === 'off' ? 'off' : 'tab'
}

// ── Featured | Browse, at the top of Discord's Shop ─────────────────────────

/**
 * A switch floating over the Shop's top bar, like the desktop Shop's tabs: Browse covers the Shop
 * (below its top bar) with this browser, Featured shows Discord's page again. It's drawn beside
 * Discord's toast container (over the whole app) and only while the screen open is the Shop
 * (its route name says shop / collectibles), so it doesn't depend on anything inside the Shop page.
 */
export const tabsStatus = { route: '', onShop: false }
let tab: 'featured' | 'browse' = 'featured'
let layerDetail: { p: Product; owned: boolean } | undefined
/** Browse ▾'s menu, and the section it last opened (the browser starts from it). */
let browseMenu = false
let preset: Partial<Filters> = {}
let presetKey = 0
const SECTIONS: [string, Partial<Filters>][] = [
	['Avatar Decorations', { types: [0] }],
	['Nameplates', { types: [2] }],
	['Profile Effects', { types: [1] }],
	['Profile Frames', { types: [3] }],
	['Bundles', { types: [1000] }],
	['Collabs', { collab: 'collab' }],
	['Shop All', {}],
]

/** An item's details inside the Browse layer. */
function LayerDetail({ p, owned }: { p: Product; owned: boolean }) {
	const { Text, Button } = Design as any
	const [hint, setHint] = useState(false)
	const close = () => {
		layerDetail = undefined
		tabsChanged()
	}
	return (
		<Pressable
			onPress={close}
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				backgroundColor: 'rgba(0,0,0,0.55)',
				alignItems: 'center',
				justifyContent: 'center',
				padding: 20,
			}}
		>
			<Pressable
				onPress={() => {}}
				style={{
					width: '100%',
					maxWidth: 420,
					borderRadius: 16,
					padding: 16,
					gap: 10,
					backgroundColor: panelColor(),
				}}
			>
				<Text variant="heading-lg/bold" style={{ color: textColor() }}>
					{p.name}
				</Text>
				<OnMe p={p} text={textColor()} />
				<Text variant="text-sm/medium" color="text-muted">
					{[TYPES[p.type as keyof typeof TYPES] ?? 'Item', p.category]
						.filter(Boolean)
						.join(' · ')}
				</Text>
				{p.summary ? (
					<Text variant="text-md/normal" style={{ color: textColor() }}>
						{p.summary}
					</Text>
				) : null}
				<Text variant="text-md/semibold" style={{ color: textColor() }}>
					{priceLine(p)}
					{p.nitro ? `  (Nitro: ${formatPrice(p.nitro)})` : ''}
				</Text>
				{owned ? (
					<Text variant="text-sm/semibold" color="text-feedback-positive">
						You own this
					</Text>
				) : null}
				{!owned ? (
					<Button
						text="Buy in Discord"
						onPress={() => {
							if (!canOpenSheet()) return setHint(true)
							close()
							previewOnProfile(p)
						}}
					/>
				) : null}
				{hint ? (
					<Text variant="text-xs/medium" color="text-muted">
						{`Discord's buy sheet couldn't be opened (${previewStatus.last}). Tap any item in Discord's own Featured page once, then Buy in Discord works for every item.`}
					</Text>
				) : null}
				<Button text="Close" variant="secondary" onPress={close} />
			</Pressable>
		</Pressable>
	)
}
const tabListeners = new Set<() => void>()
const tabsChanged = () => {
	for (const l of tabListeners) l()
}

function routeName(): string {
	try {
		const nav: any = RootNavigationRef.getRootNavigationRef()
		let r = nav?.getCurrentRoute?.()
		return String(r?.name ?? '')
	} catch {
		return ''
	}
}
const SHOP_ROUTE = /shop|collectible/i

function ShopTabs() {
	const [, tick] = useState(0)
	const { width } = useWindowDimensions()
	useEffect(() => {
		const l = () => tick(n => n + 1)
		tabListeners.add(l)
		return () => {
			tabListeners.delete(l)
		}
	}, [])
	const st: any = storage?.use?.() ?? {}
	if (!tabsStatus.onShop || modeOf(st) !== 'tab') return null
	const top = topInset()
	// The Shop's top bar: ✕ Shop on the left, Orbs / ♡ / ☰ on the right. The switch sits between
	// them when there's room, else just under the bar.
	const BAR = 56
	const gap = width - 120 - 170
	const inBar = gap >= 150
	const pill = (
		<View
			style={{
				flexDirection: 'row',
				padding: 3,
				borderRadius: 18,
				backgroundColor: 'rgba(0,0,0,0.35)',
				borderWidth: 1,
				borderColor: 'rgba(255,255,255,0.12)',
			}}
		>
			{(
				[
					['featured', 'Featured'],
					['browse', browseMenu ? 'Browse ▴' : 'Browse ▾'],
				] as const
			).map(([t, label]) => (
				<Pressable
					key={t}
					accessibilityRole="tab"
					accessibilityState={{ selected: tab === t }}
					onPress={() => {
						// Browse goes back to where you were; the first time (or ▾) it opens the sections.
						if (t === 'browse') {
							if (tab === 'featured' && appliedPreset) {
								tab = 'browse'
								browseMenu = false
							} else browseMenu = !browseMenu
						} else {
							tab = 'featured'
							browseMenu = false
						}
						tabsChanged()
					}}
					style={{
						paddingHorizontal: 12,
						height: 28,
						borderRadius: 14,
						justifyContent: 'center',
						backgroundColor: tab === t ? ACCENT : 'transparent',
					}}
				>
					<RNText style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>
						{label}
					</RNText>
				</Pressable>
			))}
		</View>
	)
	return (
		<View
			pointerEvents="box-none"
			style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
		>
			{tab === 'browse' ? (
				<View
					style={{
						position: 'absolute',
						top: top + BAR,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: pageColor(),
					}}
				>
					<View style={{ height: inBar ? 0 : 40 }} />
					<ShopPage preset={preset} presetKey={presetKey} />
				</View>
			) : null}
			<View
				pointerEvents="box-none"
				style={
					inBar
						? {
								position: 'absolute',
								top: top + (BAR - 34) / 2,
								left: 120,
								width: gap,
								alignItems: 'center',
							}
						: {
								position: 'absolute',
								top: top + BAR + 4,
								left: 0,
								right: 0,
								alignItems: 'center',
							}
				}
			>
				{pill}
			</View>
			{browseMenu ? (
				<View
					style={{
						position: 'absolute',
						top: inBar ? top + BAR - 4 : top + BAR + 40,
						left: inBar ? 120 + Math.max(0, gap / 2 - 30) : width / 2 - 20,
						minWidth: 200,
						paddingVertical: 6,
						borderRadius: 12,
						backgroundColor: panelColor(),
						borderWidth: 1,
						borderColor: 'rgba(127,127,127,0.3)',
						elevation: 30,
						zIndex: 30,
					}}
				>
					{SECTIONS.map(([label, filters]) => (
						<Pressable
							key={label}
							onPress={() => {
								preset = filters
								presetKey++
								tab = 'browse'
								browseMenu = false
								tabsChanged()
							}}
							style={({ pressed }: { pressed: boolean }) => ({
								paddingHorizontal: 16,
								paddingVertical: 11,
								backgroundColor: pressed
									? 'rgba(127,127,127,0.2)'
									: 'transparent',
							})}
						>
							<RNText
								style={{ color: textColor(), fontSize: 15, fontWeight: '600' }}
							>
								{label}
							</RNText>
						</Pressable>
					))}
				</View>
			) : null}
			{tab === 'browse' && layerDetail ? (
				<LayerDetail p={layerDetail.p} owned={layerDetail.owned} />
			) : null}
		</View>
	)
}

function installTabs(): () => void {
	const undo: Array<() => void> = []
	// Which screen is open: from navigation changes, and a light check every 1.5 s as a backstop.
	const check = () => {
		const name = routeName()
		const onShop = SHOP_ROUTE.test(name)
		if (name === tabsStatus.route && onShop === tabsStatus.onShop) return
		tabsStatus.route = name
		tabsStatus.onShop = onShop
		if (!onShop) {
			tab = 'featured'
			browseMenu = false
			layerDetail = undefined
		}
		tabsChanged()
	}
	try {
		const nav: any = RootNavigationRef.getRootNavigationRef()
		const off = nav?.addListener?.('state', check)
		if (typeof off === 'function') undo.push(off)
		else throw 0
	} catch {
		// No navigation events to listen to: a light check every 1.5 s instead.
		const timer = setInterval(check, 1500)
		undo.push(() => clearInterval(timer))
	}
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
							<ShopTabs />
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
		tab = 'featured'
	}
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: { collabMarks: {}, columns: 3, inShop: true },
	},
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage as unknown as Storage
		animPrefs.on = (jsonStorage as any).cache?.animations !== false
		setRouteStore(
			() => (storage as any)?.cache?.previewRoute2,
			previewRoute2 =>
				storage?.set(
					{ ...((storage as any)?.cache ?? {}), previewRoute2 } as Settings,
					true,
				),
		)
		setShopRoute(() => (tabsStatus.onShop ? tabsStatus.route : ''))
		cleanup(installTabs(), () => {
			storage = undefined
		})
	},
	SettingsComponent: () => <SettingsPage />,
})

function SettingsPage() {
	const stored = storage?.use() as any
	const { TableRowGroup, TableSwitchRow, Text } = Design as any
	return (
		<ScrollView contentContainerStyle={{ padding: PAD }}>
			<TableRowGroup>
				<TableSwitchRow
					label="Featured | Browse in the Shop"
					subLabel="A switch at the top of Discord's Shop: Browse shows every item with filters and sorting, Featured goes back"
					value={modeOf(stored ?? {}) !== 'off'}
					onValueChange={(on: boolean) =>
						storage?.set(
							{
								collabMarks: {},
								...stored,
								shopMode: on ? 'tab' : 'off',
							} as Settings,
							true,
						)
					}
				/>
				<TableSwitchRow
					label="Animated previews"
					subLabel="Decorations, effects and nameplates play their animation in the grid and the preview. Turn off for less load: they show a still picture."
					value={stored?.animations !== false}
					onValueChange={(on: boolean) => {
						animPrefs.on = on
						storage?.set(
							{ collabMarks: {}, ...stored, animations: on } as Settings,
							true,
						)
					}}
				/>
			</TableRowGroup>
			<Text
				variant="text-xs/medium"
				color="text-muted"
				style={{ marginTop: 8 }}
			>
				Open it from Discord's Shop. Shop detected:{' '}
				{tabsStatus.onShop ? 'yes' : 'no'} · Buy in Discord:{' '}
				{previewStatus.last}
			</Text>
		</ScrollView>
	)
}
