import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { after } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { cloneElement, isValidElement } from 'react'
import { View } from 'react-native'
import { findModule } from './find'
import type { ReactElement } from 'react'

/**
 * A select button in the chat's top bar, beside Discord's own (search, call, ...).
 *
 * The DM header's buttons are `PrivateChannelButtons` (the file Hide Call Buttons patches). The
 * server channel and thread headers have their own button components in the same folder; their
 * file names aren't confirmed, so the likely names are all asked for and whichever exist get the
 * button. `headerStatus()` lists where it attached.
 *
 * The button is a copy of the row's last button (same size and style) with the icon and action
 * swapped, the way Quick Access adds its bar buttons. If the copy can't be made, a plain
 * IconButton is used.
 */

const FOLDER = 'modules/main_tabs_v2/native/channel/header/'
const FILES: [file: string, label: string][] = [
	['PrivateChannelButtons.tsx', 'DMs'],
	['GuildChannelButtons.tsx', 'Server channels'],
	['ChannelButtons.tsx', 'Channels'],
	['ChannelHeaderButtons.tsx', 'Channels'],
	['GuildChannelHeaderButtons.tsx', 'Server channels'],
	['ThreadChannelButtons.tsx', 'Threads'],
	['ThreadButtons.tsx', 'Threads'],
	['ForumPostButtons.tsx', 'Forum posts'],
]
const ICONS = ['CircleCheckIcon', 'CheckmarkLargeIcon', 'CheckmarkSmallIcon']
const KEY = 'multi-select-header'
const ACTIONS = 'modules/main_tabs_v2/native/channel/ChannelActions.tsx'

const attached = new Set<string>()
const shown = new Set<string>()
export const headerStatus = () =>
	!attached.size
		? 'Not found in this Discord version'
		: `Hooked: ${[...new Set([...attached])].join(', ')}${shown.size ? ` · shown in ${[...shown].join(', ')}` : ' · open a chat to show it'}`

interface Options {
	enabled: () => boolean
	active: () => boolean
	onPress: () => void
}

let iconId: number | undefined | null = null
function icon(): number | undefined {
	if (iconId === null)
		iconId =
			ICONS.map(name => getAssetIdByName(name)).find(
				(id): id is number => typeof id === 'number',
			) ?? undefined
	return iconId
}

const isNode = (node: unknown): node is ReactElement<any> =>
	isValidElement(node) ||
	(!!node &&
		typeof node === 'object' &&
		(node as any).$$typeof !== undefined &&
		typeof (node as any).props === 'object' &&
		(node as any).props !== null)

function pathToPressable(node: unknown, depth = 0): ReactElement<any>[] | null {
	if (depth > 8 || !isNode(node)) return null
	if (typeof node.props.onPress === 'function') return [node]
	const children = node.props.children
	for (const child of Array.isArray(children) ? children : [children]) {
		const path = pathToPressable(child, depth + 1)
		if (path) return [node, ...path]
	}
	return null
}

/** The button row: the first children array (breadth first) holding at least one button. */
function findRow(
	root: unknown,
): { path: number[]; children: unknown[] } | null {
	const queue: [unknown, number[]][] = [[root, []]]
	while (queue.length) {
		const [node, path] = queue.shift()!
		if (path.length > 5 || !isNode(node)) continue
		const children = node.props.children
		if (Array.isArray(children)) {
			if (children.some(child => pathToPressable(child)))
				return { path, children }
			children.forEach((child, i) => queue.push([child, [...path, i]]))
		} else if (children != null) queue.push([children, [...path, -1]])
	}
	return null
}

/** A copy of [root] whose children at [path] are [children], cloning only along the way. */
function replaceAt(root: any, path: number[], children: unknown[]): any {
	if (!path.length) return cloneElement(root, undefined, ...(children as any[]))
	const [head, ...rest] = path
	const current = root.props.children
	if (head === -1)
		return cloneElement(root, undefined, replaceAt(current, rest, children))
	const next = [...current]
	next[head] = replaceAt(current[head], rest, children)
	return cloneElement(root, undefined, ...next)
}

function copyButton(template: unknown, options: Options): ReactElement | null {
	const path = pathToPressable(template)
	const id = icon()
	if (!path) return null
	const button = path[path.length - 1]
	const props = button.props
	const active = options.active()
	let swapped: Record<string, unknown> | null = null
	if (typeof props.icon === 'number' && id !== undefined) swapped = { icon: id }
	else if (props.IconComponent) {
		const Icon = ICONS.map(name =>
			lookupGeneratedIconComponent(name as never),
		).find(Boolean)
		if (Icon) swapped = { IconComponent: Icon }
	} else if (props.source !== undefined && id !== undefined)
		swapped = { source: id }
	if (!swapped) return null
	let copy: ReactElement = cloneElement(button, {
		...swapped,
		onPress: options.onPress,
		disabled: false,
		accessibilityLabel: active ? 'Stop selecting' : 'Select messages',
		ref: null,
	} as any)
	for (let i = path.length - 2; i >= 0; i--)
		copy = cloneElement(path[i], { ref: null } as any, copy)
	return cloneElement(copy, { key: KEY })
}

function fallbackButton(options: Options): ReactElement | null {
	const { IconButton } = Design as any
	const id = icon()
	if (!IconButton || id === undefined) return null
	return (
		<IconButton
			key={KEY}
			icon={id}
			variant={options.active() ? 'primary' : 'tertiary'}
			size="sm"
			accessibilityLabel={
				options.active() ? 'Stop selecting' : 'Select messages'
			}
			onPress={options.onPress}
		/>
	)
}

export function withHeaderButton(
	rendered: unknown,
	options: Options,
	label: string,
) {
	if (!options.enabled() || !isNode(rendered)) return rendered
	const row = findRow(rendered)
	if (!row) return rendered
	if (row.children.some(child => isNode(child) && child.key === KEY))
		return rendered
	const template = [...row.children]
		.reverse()
		.find(child => pathToPressable(child))
	const button = copyButton(template, options) ?? fallbackButton(options)
	if (!button) return rendered
	shown.add(label)
	// First in the row, so it sits left of Discord's buttons and the overflow stays at the edge.
	return replaceAt(rendered, row.path, [button, ...row.children])
}

/** Where a module keeps the render React calls: `default.type` for a memo, else `default`. */
function renderTarget(mod: any): { host: any; key: 'type' | 'default' } | null {
	const target = mod?.default
	if (target && typeof target === 'object' && typeof target.type === 'function')
		return { host: target, key: 'type' }
	if (typeof target === 'function') return { host: mod, key: 'default' }
	return null
}

export function installHeader(options: Options): () => void {
	const undo: Array<() => void> = []
	const hooked = new WeakSet<object>()
	for (const [file, label] of FILES) {
		const name = file.replace('.tsx', '')
		undo.push(
			// The props fallback is the component's name, which only matches unminified builds.
			findModule(FOLDER + file, [name], (mod: any) => {
				const target = renderTarget(mod)
				if (!target || hooked.has(target.host[target.key])) return
				hooked.add(target.host[target.key])
				attached.add(label)
				undo.push(
					after(target.host, target.key, ((rendered: unknown) => {
						try {
							return withHeaderButton(rendered, options, label)
						} catch {
							return rendered
						}
					}) as never),
				)
			}),
		)
	}
	// Server channels and threads: their buttons are built inside ChannelActions (the header's
	// right side) by components that aren't exported, so the button goes in front of them in
	// ChannelActions' own row. DMs are left to the PrivateChannelButtons hook above.
	undo.push(
		findModule(ACTIONS, ['ChannelActions'], (mod: any) => {
			const target = renderTarget(mod)
			if (!target || hooked.has(target.host[target.key])) return
			hooked.add(target.host[target.key])
			attached.add('Server channels')
			undo.push(
				after(target.host, target.key, ((rendered: any) => {
					try {
						if (!options.enabled() || !isNode(rendered)) return rendered
						const child = rendered.props.children
						const id = isNode(child) ? child.props?.channelId : undefined
						const channel = id ? (Stores as any).ChannelStore?.getChannel?.(id) : undefined
						if (!channel || channel.isPrivate?.()) return rendered
						const button = fallbackButton(options)
						if (!button) return rendered
						shown.add('Server channels')
						return cloneElement(
							rendered,
							undefined,
							<View key="multi-select-row" style={{ flexDirection: 'row', alignItems: 'center' }}>
								{button}
								{child}
							</View>,
						)
					} catch {
						return rendered
					}
				}) as never),
			)
		}),
	)
	return () => {
		for (const fn of undo.splice(0))
			try {
				fn()
			} catch {}
		attached.clear()
		shown.clear()
	}
}
