import { getAssetIdByName } from '@valenced/assets'
import {
	ActionSheetActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import * as discordFinders from '@valenced/discord/utils/modules/finders'
import { Stores } from '@valenced/discord/flux'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { isValidElement, useEffect, useReducer, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { findModule } from './find'
import { badgeRow, voiceCounts, withoutVoice } from './voice'

/** RowManager classes already hooked (more than one module can hand out the same one). */
const badgeHooked = new WeakSet<object>()

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
	/** Servers where embeds (link previews) are hidden. */
	embedGuilds: string[]
	/** Servers (or DM channels) where voice messages are hidden. */
	voiceHidden: string[]
	/** The mic badge with this hour's voice message count. */
	voiceBadge: boolean
}
const DEFAULTS: Settings = {
	channels: [],
	ignored: true,
	embedGuilds: [],
	voiceHidden: [],
	voiceBadge: true,
}
let storage: any
let shown = new Set<string>()
let ignoredToo = true
let embedGuilds = new Set<string>()
let voiceHidden = new Set<string>()
const settings = (): Settings => ({ ...DEFAULTS, ...(storage?.cache ?? {}) })
function load() {
	const s = settings()
	shown = new Set(s.channels)
	ignoredToo = s.ignored
	embedGuilds = new Set(s.embedGuilds)
	voiceHidden = new Set(s.voiceHidden)
}

/** Where a voice-message choice applies: the server, or the DM itself. */
const voiceKey = (channelId: string) => guildOf(channelId) ?? channelId

function toggleVoice(channelId: string) {
	const key = voiceKey(channelId)
	const on = !voiceHidden.has(key)
	if (on) voiceHidden.add(key)
	else voiceHidden.delete(key)
	storage?.set?.({ ...settings(), voiceHidden: [...voiceHidden] }, true)
	for (const l of listeners) l()
	;(ToastActionCreators as any).open('blocked-toggle', {
		text: on ? 'Voice messages hidden here' : 'Voice messages shown here again',
	})
	try {
		// The chat list is built again when messages change.
		;(Stores as any).MessageStore?.emitChange?.()
	} catch {}
}

const guildOf = (channelId: string | undefined): string | undefined => {
	if (!channelId) return undefined
	try {
		return (
			(Stores as any).ChannelStore?.getChannel?.(channelId)?.guild_id ??
			undefined
		)
	} catch {
		return undefined
	}
}

/** Redraws whatever reads the embeds setting (see patchEmbeds). */
const embedListeners = new Set<() => void>()
function toggleEmbeds(guildId: string) {
	const on = !embedGuilds.has(guildId)
	if (on) embedGuilds.add(guildId)
	else embedGuilds.delete(guildId)
	storage?.set?.({ ...settings(), embedGuilds: [...embedGuilds] }, true)
	for (const l of embedListeners) l()
	;(ToastActionCreators as any).open('blocked-toggle', {
		text: on
			? 'Embeds hidden in this server'
			: 'Embeds shown in this server again',
	})
}

/**
 * Embeds per server: the chat reads Discord's "Show embeds" setting through
 * RenderEmbeds.useSetting() (Messages.tsx passes it to the renderer as renderEmbeds). Discord's
 * value is still read, and in a server you picked the answer is "off". A small hook keeps the chat
 * redrawn when you flip the switch.
 */
function patchEmbeds(mod: any): (() => void) | undefined {
	const setting = mod?.RenderEmbeds ?? mod?.default?.RenderEmbeds
	if (typeof setting?.useSetting !== 'function') return undefined
	status.embeds = true
	return instead(
		setting,
		'useSetting',
		function (this: unknown, args: any[], orig: any) {
			const value = Reflect.apply(orig, this, args)
			// Always the same hooks in the same order, whatever the answer.
			const [, redraw] = useReducer((n: number) => n + 1, 0)
			useEffect(() => {
				embedListeners.add(redraw)
				return () => {
					embedListeners.delete(redraw)
				}
			}, [])
			if (!embedGuilds.size || value === false) return value
			const guildId = guildOf(
				(Stores as any).SelectedChannelStore?.getChannelId?.(),
			)
			return guildId && embedGuilds.has(guildId) ? false : value
		},
	)
}

/** Never Talked's switch, when that plugin is installed and on. */
const neverTalked = ():
	| { isHidden(g: string): boolean; setHidden(g: string, on: boolean): void }
	| undefined => (globalThis as any).__neverTalked

/** The options sheet the eye opens. */
function OptionsSheet({ channelId }: { channelId: string }) {
	const {
		ActionSheet,
		BottomSheetTitleHeader,
		ActionSheetSwitchRow,
		TableRowGroup,
		TableSwitchRow,
	} = Design as any
	const [, redraw] = useReducer((n: number) => n + 1, 0)
	useEffect(() => {
		listeners.add(redraw)
		embedListeners.add(redraw)
		return () => {
			listeners.delete(redraw)
			embedListeners.delete(redraw)
		}
	}, [])
	const channel = (Stores as any).ChannelStore?.getChannel?.(channelId)
	const guildId = guildOf(channelId)
	const Row = ActionSheetSwitchRow ?? TableSwitchRow
	const rows = [
		<Row
			key="blocked"
			label="Show blocked & ignored messages"
			subLabel="In this channel"
			value={shown.has(channelId)}
			onValueChange={() => toggle(channelId)}
		/>,
		guildId ? (
			<Row
				key="embeds"
				label="Hide embeds"
				subLabel="Link previews, everywhere in this server"
				value={embedGuilds.has(guildId)}
				onValueChange={() => toggleEmbeds(guildId)}
			/>
		) : null,
		<Row
			key="voice"
			label="Hide voice messages"
			subLabel={guildId ? 'Everywhere in this server' : 'In this chat'}
			value={voiceHidden.has(voiceKey(channelId))}
			onValueChange={() => toggleVoice(channelId)}
		/>,
		guildId ? (
			<Row
				key="never-talked"
				label="Hide people who never talked"
				subLabel={
					neverTalked()
						? 'In the member list, everywhere in this server'
						: 'Needs the Never Talked plugin'
				}
				disabled={!neverTalked()}
				value={!!neverTalked()?.isHidden(guildId)}
				onValueChange={(on: boolean) => {
					neverTalked()?.setHidden(guildId, on)
					redraw()
				}}
			/>
		) : null,
	]
	return (
		<ActionSheet>
			{BottomSheetTitleHeader ? (
				<BottomSheetTitleHeader
					title={channel?.name ? `#${channel.name}` : 'This chat'}
				/>
			) : null}
			{TableRowGroup ? <TableRowGroup>{rows}</TableRowGroup> : rows}
		</ActionSheet>
	)
}

function openOptions(channelId: string) {
	try {
		;(ActionSheetActionCreators as any).openLazy(
			Promise.resolve({ default: OptionsSheet }),
			'blocked-toggle-options',
			{ channelId },
		)
	} catch {
		toggle(channelId)
	}
}

/** For Settings → Status. */
const status = {
	hooked: false,
	calls: 0,
	drawn: 0,
	icon: 'Not looked up yet',
	embeds: false,
}

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
	if (typeof eye === 'number') status.icon = 'Found'
	return on ? eye : eyeOff
}

/** The colour of the header's back arrow (and its icons). */
function iconColor(): string {
	try {
		const T = (Tokens as any).default ?? Tokens
		const v = T.internal.resolveSemanticColor(
			(Stores as any).ThemeStore?.theme,
			T.colors.INTERACTIVE_TEXT_DEFAULT ?? T.colors.INTERACTIVE_NORMAL,
		)
		if (typeof v === 'string') return v
	} catch {}
	return '#b5bac1'
}

/** A plain outlined eye (slashed when hidden), only when Discord's own eye icons aren't there. */
const eyeSvg = (c: string, slash: boolean) =>
	`<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>${slash ? '<path d="M4 4l16 16"/>' : ''}</svg>`

let svgXml: any
function MinimalEye({ on }: { on: boolean }) {
	const color = iconColor()
	// Discord's own icons first: the same line style as search, bell and settings.
	const Icon: any = on
		? lookupGeneratedIconComponent('EyeIcon' as any)
		: (lookupGeneratedIconComponent('EyeSlashIcon' as any) ??
			lookupGeneratedIconComponent('EyeIcon' as any))
	if (Icon) {
		status.icon = "Discord's eye icon"
		return <Icon size="md" color={color} />
	}
	if (svgXml === undefined)
		try {
			const [mod] = lookupModule((withProps as any)('SvgXml')) as any
			svgXml = mod?.SvgXml ?? mod?.default?.SvgXml ?? null
		} catch {
			svgXml = null
		}
	if (svgXml) {
		status.icon = 'Drawn eye'
		const Xml = svgXml
		return <Xml xml={eyeSvg(color, !on)} width={24} height={24} />
	}
	status.icon = 'No icon available'
	return <View style={{ width: 24, height: 24 }} />
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
				accessibilityLabel="Blocked messages and embeds"
				onPress={() => openOptions(channelId)}
				hitSlop={8}
				style={{ padding: 8 }}
			>
				<MinimalEye on={on} />
			</Pressable>
		)
	return (
		<IconButton
			icon={src}
			variant={variant ?? 'tertiary'}
			size={size ?? 'sm'}
			accessibilityLabel="Blocked messages and embeds"
			onPress={() => openOptions(channelId)}
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
				<TableSwitchRow
					label="Voice message badge"
					subLabel="A mic and how many voice messages someone sent this hour, next to their name"
					value={s.voiceBadge}
					onValueChange={(voiceBadge: boolean) => {
						const next = { ...s, voiceBadge }
						storage?.set?.(next, true)
						setS(next)
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
				<TableRow
					label="Embeds setting"
					subLabel={status.embeds ? 'Hooked' : 'Not found yet (open a chat)'}
				/>
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
			findModule(
				'modules/messages/native/createChannelStream.tsx',
				[],
				(mod: any) => {
					if (typeof mod?.default !== 'function') return
					cleanup(
						instead(
							mod,
							'default',
							function (this: unknown, args: any[], orig: any) {
								const out = Reflect.apply(orig, this, args)
								try {
									const id = args[0]?.channel?.id
									return id &&
										voiceHidden.size &&
										voiceHidden.has(voiceKey(String(id)))
										? withoutVoice(out)
										: out
								} catch {
									return out
								}
							},
						),
					)
				},
			),
			getModules(
				(withName as any)('RowManager'),
				(RowManager: any) => {
					const proto = RowManager?.prototype
					if (typeof proto?.generate !== 'function' || badgeHooked.has(proto))
						return
					badgeHooked.add(proto)
					cleanup(
						instead(
							proto,
							'generate',
							function (this: unknown, args: any[], orig: any) {
								const row = Reflect.apply(orig, this, args)
								try {
									if (!settings().voiceBadge) return row
									const m = args[0]?.message
									const channelId = m?.channel_id
									const author = m?.author?.id
									if (!channelId || !author) return row
									const list =
										(Stores as any).MessageStore?.getMessages?.(
											channelId,
										)?.toArray?.() ?? []
									const n =
										voiceCounts(String(channelId), list).get(String(author)) ??
										0
									return n
										? badgeRow(row, n, guildOf(String(channelId)) ?? null)
										: row
								} catch {
									return row
								}
							},
						),
					)
				},
				{ max: 5 } as any,
			) as any,
			findModule(
				'modules/user_settings/UserSettings.tsx',
				['RenderEmbeds'],
				(mod: any) => {
					const undo = patchEmbeds(mod)
					if (undo) cleanup(undo)
				},
			),
			() => {
				storage = undefined
				shown = new Set()
				embedGuilds = new Set()
				voiceHidden = new Set()
				for (const l of embedListeners) l()
				try {
					;(Stores as any).RelationshipStore?.emitChange?.()
				} catch {}
			},
		)
	},
	SettingsComponent: SettingsPage,
} as any)
