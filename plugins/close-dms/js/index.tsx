import {
	AlertActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { instead } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { getAssetIdByName } from '@valenced/assets'
import { cloneElement, isValidElement, useMemo, useState } from 'react'
import {
	FlatList,
	Image,
	Modal,
	Pressable,
	Text as RNText,
	View,
} from 'react-native'
import { closeAll, type Dm, listDms } from './dms'
import { findModule } from './find'

/**
 * On the Messages tab header (MessagesHeader: search, message requests, Add Friends, +):
 * - Add Friends stops filling the row, so it's only as wide as its icon and text.
 * - A select button goes in front of +: it opens your DMs to tick, then closes them.
 */

const HEADER = 'modules/main_tabs_v2/native/tabs/messages/MessagesHeader.tsx'
const toast = (text: string) =>
	(ToastActionCreators as any).open('close-dms', { text })

let selectIcon: number | undefined
const iconId = () => {
	selectIcon ??= [
		'CheckmarkLargeIcon',
		'CheckboxIcon',
		'ListBulletsIcon',
		'CircleCheckIcon',
	]
		.map(n => getAssetIdByName(n))
		.find((x): x is number => typeof x === 'number')
	return selectIcon
}

/** The theme's page colour, as Discord's own screens use. */
function pageColor(): string {
	try {
		const T = (Tokens as any).default ?? Tokens
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

let running = false
let cancel = false

function Picker({ onClose }: { onClose: () => void }) {
	const { Text, Button, TableCheckboxRow, TextInput } = Design as any
	const all = useMemo(listDms, [])
	const [picked, setPicked] = useState<Set<string>>(new Set())
	const [query, setQuery] = useState('')
	const [progress, setProgress] = useState<string>()
	const shown = useMemo(() => {
		const q = query.trim().toLowerCase()
		return q
			? all.filter(
					d =>
						d.name.toLowerCase().includes(q) ||
						d.username.toLowerCase().includes(q),
				)
			: all
	}, [all, query])
	const toggle = (id: string) =>
		setPicked(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	const confirm = () => {
		const ids = all.filter(d => picked.has(d.id)).map(d => d.id)
		if (!ids.length || running) return
		const { AlertModal, AlertActionButton } = Design as any
		;(AlertActionCreators as any).openAlert(
			'close-dms',
			<AlertModal
				title={`Close ${ids.length} DM${ids.length === 1 ? '' : 's'}?`}
				content="They leave your DM list. The messages aren't deleted: a DM comes back when either of you sends a message, or when you open it from their profile."
				actions={
					<>
						<AlertActionButton
							text="Close"
							variant="destructive"
							onPress={async () => {
								running = true
								cancel = false
								setProgress(`0 / ${ids.length}`)
								const r = await closeAll(
									ids,
									(d, f) => setProgress(`${d + f} / ${ids.length}`),
									() => cancel,
								)
								running = false
								setProgress(undefined)
								toast(
									`Closed ${r.done}${r.failed ? `, ${r.failed} failed (${r.lastError})` : ''}`,
								)
								onClose()
							}}
						/>
						<AlertActionButton text="Cancel" variant="secondary" />
					</>
				}
			/>,
		)
	}
	return (
		<View style={{ flex: 1, padding: 16, paddingTop: 48, gap: 10 }}>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
				<Text variant="heading-lg/bold" style={{ flex: 1 }}>
					Select DMs
				</Text>
				<Button text="Done" size="sm" variant="secondary" onPress={onClose} />
			</View>
			{TextInput ? (
				<TextInput
					value={query}
					onChange={setQuery}
					placeholder="Search"
					isClearable
				/>
			) : null}
			<View style={{ flexDirection: 'row', gap: 8 }}>
				<View style={{ flex: 1 }}>
					<Button
						text="Select all"
						size="sm"
						variant="secondary"
						onPress={() => setPicked(new Set(shown.map(d => d.id)))}
					/>
				</View>
				<View style={{ flex: 1 }}>
					<Button
						text="Clear"
						size="sm"
						variant="secondary"
						onPress={() => setPicked(new Set())}
					/>
				</View>
			</View>
			<FlatList
				style={{ flex: 1 }}
				data={shown}
				keyExtractor={(d: Dm) => d.id}
				initialNumToRender={20}
				windowSize={7}
				renderItem={({ item: d }: { item: Dm }) => (
					<TableCheckboxRow
						label={d.name}
						subLabel={d.username ? `@${d.username}` : undefined}
						icon={
							d.avatar ? (
								<Image
									source={{ uri: d.avatar }}
									style={{ width: 32, height: 32, borderRadius: 16 }}
								/>
							) : undefined
						}
						checked={picked.has(d.id)}
						value={d.id}
						onPress={() => toggle(d.id)}
					/>
				)}
			/>
			{progress ? (
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
					<Text variant="text-md/semibold" style={{ flex: 1 }}>
						Closing… {progress}
					</Text>
					<Button
						text="Stop"
						size="sm"
						variant="secondary"
						onPress={() => (cancel = true)}
					/>
				</View>
			) : (
				<Button
					text={`Close ${picked.size} DM${picked.size === 1 ? '' : 's'}`}
					variant="destructive"
					disabled={!picked.size}
					onPress={confirm}
				/>
			)}
		</View>
	)
}

/** The select button, hosting the picker as a Modal while it's open. */
function SelectButton({ variant, size }: { variant?: string; size?: string }) {
	const { IconButton } = Design as any
	const [open, setOpen] = useState(false)
	const icon = iconId()
	const Icon: any = lookupGeneratedIconComponent('CheckmarkLargeIcon' as any)
	return (
		<>
			{IconButton && typeof icon === 'number' ? (
				<IconButton
					icon={icon}
					variant={variant ?? 'secondary'}
					size={size ?? 'sm'}
					accessibilityLabel="Select DMs to close"
					onPress={() => setOpen(true)}
				/>
			) : (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Select DMs to close"
					onPress={() => setOpen(true)}
					style={{ padding: 8 }}
				>
					{Icon ? (
						<Icon size="sm" />
					) : (
						<RNText style={{ fontSize: 18 }}>✓</RNText>
					)}
				</Pressable>
			)}
			{open ? (
				<Modal
					visible
					animationType="slide"
					onRequestClose={() => setOpen(false)}
					statusBarTranslucent
				>
					<View style={{ flex: 1, backgroundColor: pageColor() }}>
						<Picker onClose={() => setOpen(false)} />
					</View>
				</Modal>
			) : null}
		</>
	)
}

/** The row of header buttons: an element whose children include a Button with text and grow. */
function rework(node: any, depth = 0): any {
	if (!isValidElement<any>(node) || depth > 8) return node
	const kids = node.props?.children
	if (Array.isArray(kids)) {
		const growIndex = kids.findIndex(
			(k: any) =>
				isValidElement<any>(k) &&
				k.props?.grow &&
				typeof k.props?.text === 'string',
		)
		if (
			growIndex >= 0 &&
			!kids.some((k: any) => k?.key === 'close-dms-select')
		) {
			const add = kids[growIndex] as any
			const last = kids[kids.length - 1] as any
			const next = [...kids]
			// Add Friends: as wide as its content, pushed right by a spacer.
			next[growIndex] = cloneElement(add, { grow: false, shrink: false })
			next.splice(
				growIndex,
				0,
				<View key="close-dms-spacer" style={{ flex: 1 }} />,
			)
			next.splice(
				next.length - 1,
				0,
				<SelectButton
					key="close-dms-select"
					variant={
						last?.props?.variant === 'primary'
							? 'secondary'
							: last?.props?.variant
					}
					size={last?.props?.size}
				/>,
			)
			return cloneElement(node, undefined, ...next)
		}
	}
	if (kids == null || typeof kids !== 'object') return node
	const list = Array.isArray(kids) ? kids : [kids]
	const out = list.map(k => rework(k, depth + 1))
	return out.some((k, i) => k !== list[i])
		? cloneElement(node, undefined, ...out)
		: node
}

export default plugin({
	start({ cleanup }) {
		cleanup(
			findModule(HEADER, [], (mod: any) => {
				const target = mod?.default
				const host =
					typeof target === 'function'
						? { o: mod, k: 'default' }
						: typeof target?.type === 'function'
							? { o: target, k: 'type' }
							: null
				if (!host) return
				cleanup(
					instead(
						host.o,
						host.k,
						function (this: unknown, args: any[], orig: (...a: any[]) => any) {
							const out = Reflect.apply(orig, this, args)
							try {
								return rework(out)
							} catch {
								return out
							}
						},
					),
				)
			}),
			() => {
				cancel = true
			},
		)
	},
})
