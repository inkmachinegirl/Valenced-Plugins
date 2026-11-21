import { getAssetIdByName } from '@valenced/assets'
import { ToastActionCreators } from '@valenced/discord/actions'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import * as discordFinders from '@valenced/discord/utils/modules/finders'
import { Stores } from '@valenced/discord/flux'
import { instead } from '@valenced/patcher'
import { isValidElement, useEffect, useState } from 'react'
import { Pressable, ScrollView, Text } from 'react-native'
import { findModule } from './find'

/**
 * An eye button in the channel details header that shows blocked and ignored people's messages
 * in that channel (instead of Discord's "blocked message" bars), or hides them again.
 *
 * - The header draws one button per entry of ChannelDetailsUtils.getChannelDetailsButtons()
 *   (search, mute, settings) by mapping that list; the list gets one more element at the end of
 *   that map, styled like its neighbours.
 * - RelationshipStore.isBlockedForMessage / isIgnoredForMessage: Discord is asked first, and only
 *   a message it would hide is checked against the channels you opened, so the other messages
 *   (nearly all of them) cost nothing extra.
 */

const UTILS =
	'modules/main_tabs_v2/native/sidebar/details/ChannelDetailsUtils.tsx'

interface Settings {
	/** Channels where blocked / ignored messages are shown. */
	channels: string[]
	/** Ignored people too (not only blocked). */
	ignored: boolean
}
const DEFAULTS: Settings = { channels: [], ignored: true }
let storage: any
let shown = new Set<string>()
let ignoredToo = true
const settings = (): Settings => ({ ...DEFAULTS, ...(storage?.cache ?? {}) })
function load() {
	const s = settings()
	shown = new Set(s.channels)
	ignoredToo = s.ignored
}

/** For Settings → Status. */
const status = { hooked: false, calls: 0, drawn: 0, icon: 'Not looked up yet' }

const listeners = new Set<() => void>()
function toggle(channelId: string) {
	const on = !shown.has(channelId)
	if (on) shown.add(channelId)
	else shown.delete(channelId)
	storage?.set?.({ ...settings(), channels: [...shown] }, true)
	for (const l of listeners) l()
	// Messages re-check whether they're blocked when the store changes.
	try {
		;(Stores as any).RelationshipStore?.emitChange?.()
	} catch {}
	;(ToastActionCreators as any).open('blocked-toggle', {
		text: on
			? 'Showing blocked and ignored messages here'
			: 'Hiding blocked and ignored messages here',
	})
}

const channelOf = (m: any): string | undefined =>
	m?.channel_id ?? m?.channelId ?? undefined

let eye: number | undefined
let eyeOff: number | undefined
const icon = (on: boolean) => {
	const first = (names: string[]) =>
		names
			.map(n => getAssetIdByName(n))
			.find((id): id is number => typeof id === 'number')
	eye ??= first([
		'EyeIcon',
		'EyeOpenIcon',
		'VisibilityIcon',
		'ic_eye',
		'ic_visibility',
	])
	eyeOff ??=
		first([
			'EyeSlashIcon',
			'EyeClosedIcon',
			'EyeOffIcon',
			'ic_eye_slash',
			'ic_visibility_off',
		]) ?? eye
	status.icon =
		typeof eye === 'number' ? 'Found' : 'Not found (an emoji is drawn instead)'
	return on ? eye : eyeOff
}

/** Discord's useToken hook, which the header's own buttons read their size and look from. */
function useTokenHook(): ((token: unknown) => unknown) | undefined {
	try {
		const found = (discordFinders as any).lookupModuleWithImportedPath?.(
			'design/tokens/native/useToken.tsx',
		)
		const mod = Array.isArray(found) ? found[0] : undefined
		return mod?.useToken ?? mod?.default
	} catch {
		return undefined
	}
}
const useToken = useTokenHook()
const navToken = (name: string) =>
	(Tokens as any)?.default?.modules?.mobile?.[name] ??
	(Tokens as any)?.modules?.mobile?.[name]

function EyeButton({ channelId }: { channelId: string }) {
	const { IconButton } = Design as any
	// As Discord's MuteButton: size and variant from the header's tokens.
	const sizeToken = navToken('CHANNEL_DETAILS_NAV_ICON_BUTTON_SIZE')
	const variantToken = navToken('CHANNEL_DETAILS_NAV_ICON_BUTTON_VARIANT')
	const size = useToken && sizeToken ? useToken(sizeToken) : undefined
	const variant = useToken && variantToken ? useToken(variantToken) : undefined
	const [on, set] = useState(shown.has(channelId))
	useEffect(() => {
		const l = () => set(shown.has(channelId))
		listeners.add(l)
		return () => {
			listeners.delete(l)
		}
	}, [channelId])
	const src = icon(on)
	if (!IconButton || typeof src !== 'number')
		return (
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={
					on ? 'Hide blocked messages' : 'Show blocked messages'
				}
				onPress={() => toggle(channelId)}
				style={{ padding: 8, opacity: on ? 1 : 0.6 }}
			>
				<Text style={{ fontSize: 20 }}>{on ? '👁' : '🙈'}</Text>
			</Pressable>
		)
	return (
		<IconButton
			icon={src}
			variant={variant ?? 'tertiary'}
			size={size ?? 'sm'}
			accessibilityLabel={
				on
					? 'Hide blocked and ignored messages'
					: 'Show blocked and ignored messages'
			}
			onPress={() => toggle(channelId)}
		/>
	)
}

function SettingsPage() {
	const { TableRowGroup, TableSwitchRow, TableRow } = Design as any
	const [s, setS] = useState(settings)
	return (
		<ScrollView contentContainerStyle={{ padding: 16 }}>
			<TableRowGroup title="Options">
				<TableSwitchRow
					label="Ignored people too"
					subLabel="The eye also shows messages from people you ignored, not only blocked"
					value={s.ignored}
					onValueChange={(ignored: boolean) => {
						const next = { ...s, ignored }
						storage?.set?.(next, true)
						setS(next)
						load()
					}}
				/>
				<TableRow
					label="Channels showing them"
					subLabel={`${s.channels.length}. Tap the eye in a channel's details to change one`}
				/>
				<TableRow
					label="Hide them everywhere again"
					onPress={() => {
						const next = { ...s, channels: [] }
						storage?.set?.(next, true)
						setS(next)
						load()
						try {
							;(Stores as any).RelationshipStore?.emitChange?.()
						} catch {}
					}}
				/>
			</TableRowGroup>
			<TableRowGroup title="Status">
				<TableRow
					label="Member list top bar"
					subLabel={
						status.hooked
							? `Hooked · asked ${status.calls}× · eye added ${status.drawn}×`
							: "Not found yet (open a channel's member list)"
					}
				/>
				<TableRow label="Eye icon" subLabel={status.icon} />
			</TableRowGroup>
		</ScrollView>
	)
}

export default plugin({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }: any) {
		storage = jsonStorage
		load()
		const rel = (Stores as any).RelationshipStore
		for (const [method, alsoIgnored] of [
			['isBlockedForMessage', false],
			['isIgnoredForMessage', true],
		] as const)
			if (typeof rel?.[method] === 'function')
				cleanup(
					instead(
						rel,
						method,
						function (this: unknown, args: any[], orig: any) {
							const hidden = Reflect.apply(orig, this, args)
							if (!hidden || !shown.size || (alsoIgnored && !ignoredToo))
								return hidden
							const id = channelOf(args[0])
							return id && shown.has(id) ? false : hidden
						},
					),
				)

		cleanup(
			findModule(UTILS, ['getChannelDetailsButtons'], (mod: any) => {
				const host =
					typeof mod?.getChannelDetailsButtons === 'function'
						? mod
						: mod?.default
				if (typeof host?.getChannelDetailsButtons !== 'function') return
				status.hooked = true
				cleanup(
					// `instead`, not `after`: Valenced's after hooks get only the result, and the
					// channel is in the arguments.
					instead(
						host,
						'getChannelDetailsButtons',
						function (this: unknown, args: any[], orig: (...a: any[]) => any) {
							const ret = Reflect.apply(orig, this, args)
							status.calls++
							const channelId = args?.[0]?.id
							if (
								!Array.isArray(ret) ||
								!ret.length ||
								typeof channelId !== 'string'
							)
								return ret
							// The header maps this list to buttons: the eye is added to that map's result.
							const list: any = [...ret]
							list.map = function (fn: any, self?: unknown) {
								const out = Array.prototype.map.call(this, fn, self) as any[]
								if (!out.some(el => isValidElement(el))) return out
								status.drawn++
								out.push(
									<EyeButton key="blocked-toggle" channelId={channelId} />,
								)
								return out
							}
							return list
						},
					),
				)
			}),
			() => {
				storage = undefined
				shown = new Set()
				try {
					;(Stores as any).RelationshipStore?.emitChange?.()
				} catch {}
			},
		)
	},
	SettingsComponent: SettingsPage,
} as any)
