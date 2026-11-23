import { ToastActionCreators } from '@valenced/discord/actions'
import { Tokens } from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'
import { Design } from '@valenced/discord/design'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
	Animated,
	Dimensions,
	Keyboard,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	View,
} from 'react-native'
import { textColor } from './color'
import { addToMessage, send } from './input'
import { TABS } from './meows'

const KEY = 'meow-picker'

export interface PickerOptions {
	/** Whether the sheet slides up; off, it just appears. */
	animations?: () => boolean
	recent: () => string[]
	remember: (text: string) => void
	tapSends: () => boolean
	keepOpen: () => boolean
	size: () => 'small' | 'medium' | 'large'
}

function toast(text: string) {
	try {
		ToastActionCreators.open(KEY, { text } as never)
	} catch {}
}

function pick(text: string, sendNow: boolean, opts: PickerOptions) {
	opts.remember(text)
	const done = sendNow ? send(text) : addToMessage(text) || send(text)
	if (!done) return toast('Open a chat first')
	if (!opts.keepOpen()) closePicker()
}

function Chip({
	text,
	opts,
	color,
}: {
	text: string
	opts: PickerOptions
	color: string
}) {
	const { Text } = Design as any
	return (
		<Pressable
			onPress={() => pick(text, opts.tapSends(), opts)}
			onLongPress={() => pick(text, true, opts)}
			delayLongPress={350}
			accessibilityRole="button"
			accessibilityLabel={text}
			style={({ pressed }: { pressed: boolean }) => ({
				paddingHorizontal: 8,
				paddingVertical: 4,
				margin: 2,
				borderRadius: 14,
				maxWidth: '100%',
				backgroundColor: pressed
					? 'rgba(255,255,255,0.16)'
					: 'rgba(255,255,255,0.06)',
			})}
		>
			<Text variant="text-xs/medium" style={{ color }} numberOfLines={2}>
				{text}
			</Text>
		</Pressable>
	)
}

function MeowPanel({ opts }: { opts: PickerOptions }) {
	const { Text, TextInput } = Design as any
	const recent = opts.recent()
	const tabs = useMemo(
		() => [
			...(recent.length
				? [['Recent', '🕘', recent] as [string, string, string[]]]
				: []),
			...TABS,
		],
		[],
	)
	const [tab, setTab] = useState(0)
	const [query, setQuery] = useState('')
	const color = textColor()
	const q = query.trim().toLowerCase()
	const shown = q
		? [
				...new Set(
					TABS.flatMap(([, , list]) => list).filter(m =>
						m.toLowerCase().includes(q),
					),
				),
			]
		: tabs[tab][2]
	return (
		<View style={{ flex: 1 }}>
			<View style={{ paddingHorizontal: 8, paddingTop: 2 }}>
				{TextInput ? (
					<TextInput
						placeholder={
							q
								? `${shown.length} found`
								: `Search meows · tap adds, hold sends`
						}
						value={query}
						onChange={setQuery}
						isClearable
						size="sm"
					/>
				) : null}
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					style={{ marginTop: 6, flexGrow: 0 }}
					keyboardShouldPersistTaps="handled"
				>
					{tabs.map(([name, icon], i) => {
						const on = i === tab && !q
						return (
							<Pressable
								key={name}
								onPress={() => {
									setQuery('')
									setTab(i)
								}}
								accessibilityRole="tab"
								accessibilityLabel={name}
								accessibilityState={{ selected: on }}
								style={{
									width: 32,
									height: 28,
									margin: 2,
									borderRadius: 10,
									alignItems: 'center',
									justifyContent: 'center',
									backgroundColor: on
										? 'rgba(88,101,242,0.35)'
										: 'rgba(255,255,255,0.05)',
								}}
							>
								<Text variant="text-sm/bold" style={{ color }}>
									{icon}
								</Text>
							</Pressable>
						)
					})}
				</ScrollView>
			</View>
			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{
					flexDirection: 'row',
					flexWrap: 'wrap',
					padding: 6,
					paddingBottom: 32,
				}}
				keyboardShouldPersistTaps="handled"
			>
				{shown.length ? (
					shown.map(m => <Chip key={m} text={m} opts={opts} color={color} />)
				) : (
					<Text
						variant="text-sm/medium"
						color="text-muted"
						style={{ padding: 8 }}
					>
						No meows match that.
					</Text>
				)}
			</ScrollView>
		</View>
	)
}

/**
 * The picker is drawn by the plugin itself, over the chat: Discord's own bottom sheet opened it at
 * its lowest resting height, cut off, whatever size it was given. It is mounted beside Discord's
 * toast container (AppToastContainer's `default`, over the whole app), as Forum Grid's grid is.
 */
let openWith: PickerOptions | undefined
const listeners = new Set<() => void>()
const notify = () => {
	for (const fn of listeners) fn()
}
/** Read by key: the build tool rewrote `Animated.View` into `Animated.<the View import>`. */
const AnimatedView: any = (Animated as any)['View']

export function closePicker() {
	openWith = undefined
	notify()
}

/**
 * Rendered by the cat button (and by the settings page): a React Native Modal opens as its own
 * full-screen layer from wherever it sits in the tree. Only the newest one on screen opens, so the
 * settings page's copy and the chat bar's underneath don't both show.
 */
const hosts: number[] = []
let nextHost = 0

export function PickerHost() {
	const { Text } = Design as any
	const [, tick] = useState(0)
	const [keyboard, setKeyboard] = useState(0)
	const slide = useRef(new Animated.Value(0)).current
	const me = useRef(-1)
	if (me.current === -1) me.current = nextHost++
	useEffect(() => {
		hosts.push(me.current)
		const on = () => tick(n => n + 1)
		listeners.add(on)
		notify()
		return () => {
			listeners.delete(on)
			const i = hosts.indexOf(me.current)
			if (i !== -1) hosts.splice(i, 1)
			notify()
		}
	}, [])
	const open = !!openWith && hosts[hosts.length - 1] === me.current
	useEffect(() => {
		if (!open) return
		if (openWith?.animations?.() === false) slide.setValue(1)
		else {
			slide.setValue(0)
			Animated.timing(slide, {
				toValue: 1,
				duration: 180,
				useNativeDriver: true,
			}).start()
		}
		const show = Keyboard.addListener(
			Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
			(e: any) => setKeyboard(e?.endCoordinates?.height ?? 0),
		)
		const hide = Keyboard.addListener(
			Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
			() => setKeyboard(0),
		)
		return () => {
			show.remove()
			hide.remove()
			setKeyboard(0)
		}
	}, [open])
	if (!open || !openWith) return null
	const screen = Dimensions.get('window').height
	const share =
		{ small: 0.38, medium: 0.5, large: 0.62 }[openWith.size()] ?? 0.38
	const height = Math.min(Math.round(screen * share), screen - keyboard - 80)
	return (
		<Modal
			visible
			transparent
			animationType="none"
			statusBarTranslucent
			onRequestClose={closePicker}
		>
			<View
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					zIndex: 1000,
					elevation: 1000,
				}}
			>
				<Pressable
					accessibilityLabel="Close meows"
					onPress={closePicker}
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: 'rgba(0,0,0,0.15)',
					}}
				/>
				<AnimatedView
					style={{
						position: 'absolute',
						left: 8,
						right: 8,
						bottom: keyboard ? keyboard + 4 : 12,
						height,
						paddingTop: 4,
						paddingBottom: 4,
						borderRadius: 18,
						overflow: 'hidden',
						backgroundColor: panelColor(),
						borderWidth: 1,
						borderColor: 'rgba(255,255,255,0.08)',
						transform: [
							{
								translateY: slide.interpolate({
									inputRange: [0, 1],
									outputRange: [height, 0],
								}),
							},
						],
					}}
				>
					<Pressable
						onPress={closePicker}
						accessibilityLabel="Close"
						style={{ alignItems: 'center', paddingBottom: 6 }}
					>
						<View
							style={{
								width: 40,
								height: 5,
								borderRadius: 3,
								backgroundColor: 'rgba(255,255,255,0.3)',
							}}
						/>
					</Pressable>
					{Text ? <MeowPanel opts={openWith} /> : null}
				</AnimatedView>
			</View>
		</Modal>
	)
}

/** The theme's sheet colour, so it matches Discord (a dark fallback). */
function panelColor(): string {
	try {
		const T = (Tokens as any).default
		const theme = (Stores as any).ThemeStore?.theme
		for (const name of [
			'BACKGROUND_FLOATING',
			'BG_SURFACE_OVERLAY',
			'BACKGROUND_SECONDARY',
		]) {
			const token = T?.colors?.[name]
			if (!token) continue
			const v = T.internal.resolveSemanticColor(theme, token)
			if (typeof v === 'string' && v) return v
		}
	} catch {}
	return '#2b2d31'
}

export function openPicker(opts: PickerOptions) {
	if (!hosts.length) return toast('Open a chat first')
	try {
		Keyboard.dismiss()
	} catch {}
	openWith = opts
	notify()
}
