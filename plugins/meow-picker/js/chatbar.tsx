import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { findModule } from './find'
import { PickerHost } from './sheet'
import { iconColor } from './color'

/**
 * The cat button in the chat bar, right before the emoji button: `after` on
 * `ChatInputRightActions`, putting one reused element first in its row (the Silent Typing
 * pattern, also used by Multi Select). The button is Discord's own `ChatInputActionButton`.
 */

const BUTTON_PATH =
	'modules/chat_input/native/action_buttons/ChatInputActionButton.tsx'
const RIGHT =
	'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx'

let onPress: (() => void) | undefined
let ActionButton: any
export const chatbarStatus = { hooked: false }

/** A cat head drawn in the bar's icon colour: outlined face, two ears, two eyes. */
function CatIcon({
	color = iconColor(),
	size,
}: {
	color?: string
	size?: any
}) {
	const s =
		typeof size === 'number'
			? size / 24
			: size === 'sm'
				? 0.75
				: size === 'lg'
					? 1.2
					: 1
	const ear = (left: boolean) => (
		<View
			style={{
				position: 'absolute',
				top: 2 * s,
				[left ? 'left' : 'right']: 3 * s,
				width: 0,
				height: 0,
				borderLeftWidth: 4 * s,
				borderRightWidth: 4 * s,
				borderBottomWidth: 8 * s,
				borderLeftColor: 'transparent',
				borderRightColor: 'transparent',
				borderBottomColor: color,
				transform: [{ rotate: left ? '-12deg' : '12deg' }],
			}}
		/>
	)
	const eye = (left: boolean) => (
		<View
			style={{
				position: 'absolute',
				top: 13.5 * s,
				[left ? 'left' : 'right']: 8 * s,
				width: 2.6 * s,
				height: 2.6 * s,
				borderRadius: 2 * s,
				backgroundColor: color,
			}}
		/>
	)
	return (
		<View style={{ width: 24 * s, height: 24 * s }}>
			{ear(true)}
			{ear(false)}
			<View
				style={{
					position: 'absolute',
					top: 7 * s,
					left: 3 * s,
					width: 18 * s,
					height: 15 * s,
					borderRadius: 8 * s,
					borderWidth: 2 * s,
					borderColor: color,
				}}
			/>
			{eye(true)}
			{eye(false)}
		</View>
	)
}

function CatButton() {
	const [Button, setButton] = useState<any>(() => ActionButton)
	useEffect(() => {
		if (Button) return
		return findModule(BUTTON_PATH, ['ChatInputActionButton'], (mod: any) => {
			const found = mod?.default ?? mod?.ChatInputActionButton
			if (typeof found !== 'function' && typeof found !== 'object') return
			ActionButton = found
			setButton(() => found)
		})
	}, [Button])
	const Icon: any =
		lookupGeneratedIconComponent('CatIcon' as any) ??
		lookupGeneratedIconComponent('PawIcon' as any) ??
		CatIcon
	if (!Button || !onPress) return null
	return (
		<>
			<Button
				accessibilityLabel="Meows"
				IconComponent={Icon}
				onPress={() => onPress?.()}
			/>
			<PickerHost />
		</>
	)
}

const button = <CatButton key="meow-picker-button" />

function findChildrenArray(node: any, depth = 0): any[] | null {
	if (!node || typeof node !== 'object' || depth > 8) return null
	const children = node.props?.children
	if (Array.isArray(children)) return children
	return findChildrenArray(children, depth + 1)
}

export function installChatbar(next: {
	onPress: () => void
	enabled: () => boolean
}): () => void {
	onPress = next.onPress
	const undo: Array<() => void> = []
	undo.push(
		findModule(RIGHT, [], (mod: any) => {
			const target = mod?.default
			if (typeof target?.type !== 'function') return
			chatbarStatus.hooked = true
			undo.push(
				after(target, 'type', ((tree: any) => {
					try {
						const children = findChildrenArray(tree)
						if (!children) return tree
						const i = children.indexOf(button)
						if (i !== -1) children.splice(i, 1)
						if (next.enabled()) children.unshift(button)
					} catch {}
					return tree
				}) as never),
			)
		}),
	)
	try {
		undo.push(
			getModuleWithImportedPath(BUTTON_PATH, (mod: any) => {
				ActionButton ??= mod?.default
			}) as any,
		)
	} catch {}
	return () => {
		for (const fn of undo.splice(0))
			try {
				fn?.()
			} catch {}
		onPress = undefined
		chatbarStatus.hooked = false
	}
}
