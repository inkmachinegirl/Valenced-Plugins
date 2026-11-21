import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import * as discordFinders from '@valenced/discord/utils/modules/finders'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { before, instead } from '@valenced/patcher'
import { React, ReactJSXRuntime } from '@valenced/react'
import { cloneElement, isValidElement, useEffect } from 'react'
import { Pressable } from 'react-native'
import { findModule } from './find'

/**
 * Channels & Roles (ChannelBrowser) draws each category's header with an internal CategoryRow:
 * the category name, then a "Follow Category" checkbox. An "Unfollow all" link goes after it and
 * unticks every channel of the category with Discord's own bulkOptOutChannels (one request).
 *
 * CategoryRow isn't exported, so it's recognised by name as its elements are made, and only while
 * the Channels & Roles screen is open: the element hook goes on when it opens and off when it
 * closes, so nothing runs for the rest of the app.
 */

const BROWSER = 'modules/opt_in_channels/native/ChannelBrowser.tsx'
const ACTIONS = 'modules/opt_in_channels/OptInChannelsActionCreators.tsx'
const S = () => Stores as any
const toast = (text: string) =>
	(ToastActionCreators as any).open('unfollow-category', { text })

function bulkOptOut():
	| ((guildId: string, ids: string[], location?: string) => unknown)
	| undefined {
	try {
		const found = (discordFinders as any).lookupModuleWithImportedPath?.(
			ACTIONS,
		)
		let mod = Array.isArray(found) ? found[0] : undefined
		if (typeof mod?.bulkOptOutChannels !== 'function')
			[mod] = lookupModule((withProps as any)('bulkOptOutChannels')) as any
		const host =
			typeof mod?.bulkOptOutChannels === 'function' ? mod : mod?.default
		return typeof host?.bulkOptOutChannels === 'function'
			? (g, ids, l) => host.bulkOptOutChannels(g, ids, l)
			: undefined
	} catch {
		return undefined
	}
}

/** The category and every channel under it. */
export function channelsIn(guildId: string, categoryId: string): string[] {
	const ids = new Set<string>([categoryId])
	try {
		const g = S().GuildChannelStore?.getChannels?.(guildId) ?? {}
		for (const key of ['SELECTABLE', 'VOCAL'])
			for (const e of g[key] ?? [])
				if (e?.channel?.parent_id === categoryId) ids.add(String(e.channel.id))
	} catch {}
	if (ids.size === 1)
		for (const c of Object.values<any>(
			S().ChannelStore?.getMutableGuildChannelsForGuild?.(guildId) ?? {},
		))
			if (c?.parent_id === categoryId) ids.add(String(c.id))
	return [...ids]
}

function unfollowAll(channel: any) {
	const guildId = channel?.guild_id
	const id = channel?.id
	if (!guildId || !id || id === 'null') return
	const optOut = bulkOptOut()
	if (!optOut) return toast("Couldn't find Discord's unfollow action")
	const ids = channelsIn(guildId, String(id))
	try {
		optOut(guildId, ids, 'Channel Browser')
		toast(
			`Unfollowed ${ids.length - 1} channel${ids.length === 2 ? '' : 's'} in ${channel.name ?? 'this category'}`,
		)
	} catch (e: any) {
		toast(`Couldn't unfollow: ${e?.message ?? e}`)
	}
}

function UnfollowLink({ channel }: { channel: any }) {
	const { Text } = Design as any
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`Unfollow every channel in ${channel?.name ?? 'this category'}`}
			hitSlop={8}
			onPress={() => unfollowAll(channel)}
			style={{ marginLeft: 12 }}
		>
			<Text variant="text-xs/semibold" color="text-danger">
				Unfollow all
			</Text>
		</Pressable>
	)
}

/** The "Follow Category" part: a View whose children are the checkbox and its label. */
function addLink(node: any, channel: any, depth = 0): any {
	if (!isValidElement<any>(node) || depth > 6) return node
	const kids = node.props?.children
	if (
		Array.isArray(kids) &&
		kids.length === 2 &&
		isValidElement<any>(kids[1]) &&
		typeof (kids[1] as any).props?.children === 'string'
	) {
		return cloneElement(
			node,
			undefined,
			...kids,
			<UnfollowLink key="unfollow-all" channel={channel} />,
		)
	}
	if (kids == null || typeof kids !== 'object') return node
	const list = Array.isArray(kids) ? kids : [kids]
	const out = list.map(k => addLink(k, channel, depth + 1))
	return out.some((k, i) => k !== list[i])
		? cloneElement(node, undefined, ...out)
		: node
}

const isCategoryRow = (t: any) =>
	!!t &&
	typeof t === 'object' &&
	typeof t.type === 'function' &&
	(t.type.displayName ?? t.type.name) === 'CategoryRow'

/** One stand-in per CategoryRow (same component every time, so React keeps its state). */
const standIns = new WeakMap<object, any>()
function standIn(memo: any) {
	let made = standIns.get(memo)
	if (!made) {
		const inner = memo.type
		made = React.memo(function CategoryRowWithUnfollow(props: any) {
			const out = inner(props)
			try {
				return props?.channel?.id && props.channel.id !== 'null'
					? addLink(out, props.channel)
					: out
			} catch {
				return out
			}
		})
		standIns.set(memo, made)
	}
	return made
}

let open = 0
let hooks: Array<() => void> = []
function startWatching() {
	if (open++ > 0) return
	const hook = (args: any[]) => {
		if (isCategoryRow(args[0])) args[0] = standIn(args[0])
		return args
	}
	hooks = [
		before(ReactJSXRuntime as any, 'jsx', hook as never),
		before(ReactJSXRuntime as any, 'jsxs', hook as never),
		before(React as any, 'createElement', hook as never),
	]
}
function stopWatching() {
	if (--open > 0) return
	open = 0
	for (const h of hooks.splice(0)) h()
}

export default plugin({
	start({ cleanup }) {
		cleanup(
			findModule(BROWSER, [], (mod: any) => {
				if (typeof mod?.default !== 'function') return
				cleanup(
					instead(
						mod,
						'default',
						function (this: unknown, args: any[], orig: (...a: any[]) => any) {
							// Watch only while this screen is mounted (same hook every render).
							useEffect(() => {
								startWatching()
								return stopWatching
							}, [])
							return Reflect.apply(orig, this, args)
						},
					),
				)
			}),
			() => {
				open = 1
				stopWatching()
			},
		)
	},
})
