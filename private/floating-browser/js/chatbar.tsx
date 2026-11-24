import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { useEffect, useState } from 'react'
import { Text } from 'react-native'
import { findModule } from './find'

/**
 * The globe button in the chat bar, right before the emoji button: `after` on
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

/** A globe, when Discord's own icon can't be found. */
function GlobeIcon({ size }: { size?: any }) {
	const px = typeof size === 'number' ? size : size === 'sm' ? 18 : 22
	return <Text style={{ fontSize: px - 2, lineHeight: px + 2 }}>🌐</Text>
}

function GlobeButton() {
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
		lookupGeneratedIconComponent('GlobeEarthIcon' as any) ??
		lookupGeneratedIconComponent('GlobeIcon' as any) ??
		GlobeIcon
	if (!Button || !onPress) return null
	return (
		<Button
			accessibilityLabel="Floating browser"
			IconComponent={Icon}
			onPress={() => onPress?.()}
		/>
	)
}

const button = <GlobeButton key="floating-browser-button" />

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
