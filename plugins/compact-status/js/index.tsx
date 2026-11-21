import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Tokens } from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'
import * as discordFinders from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import { cloneElement, isValidElement, useEffect, useState } from 'react'
import { Image, Pressable, View } from 'react-native'
import { findModule } from './find'
import { COLORS, type Status, StatusShape } from './icons'

/**
 * Discord's status sheet (YouAccountActionSheet; "Change Online Status" is its status-only mode)
 * gets its four-row status list swapped for one row of big status icons under your avatar. The
 * status is set with Discord's own setUserStatus, as its list does; the rest of the sheet (custom
 * status, focus mode, accounts) is Discord's, just closer together.
 */

const SHEET = 'modules/main_tabs_v2/native/tabs/you/YouAccountActionSheet.tsx'
const S = () => Stores as any
const ORDER: Status[] = ['online', 'idle', 'dnd', 'invisible']
const LABEL: Record<Status, string> = {
	online: 'Online',
	idle: 'Idle',
	dnd: 'Do Not Disturb',
	invisible: 'Invisible',
}

function currentStatus(): Status {
	try {
		const v =
			S().UserSettingsProtoStore?.settings?.status?.status?.value ??
			S().SelfPresenceStore?.getStatus?.()
		if (ORDER.includes(v)) return v
	} catch {}
	return 'online'
}

function setStatus(prev: Status, next: Status) {
	try {
		const found = (discordFinders as any).lookupModuleWithImportedPath?.(
			'modules/multi_account/setUserStatus.tsx',
		)
		const mod = Array.isArray(found) ? found[0] : undefined
		const fn = mod?.default ?? mod?.setUserStatus
		if (typeof fn === 'function')
			return fn({ prevStatus: prev, nextStatus: next })
	} catch {}
	// Fallback: Discord's settings action, as older versions did it.
	S().UserSettingsActionCreators?.updateRemoteSettings?.({ status: next })
}

function sheetColor(): string {
	try {
		const T = (Tokens as any).default
		const v = T.internal.resolveSemanticColor(
			S().ThemeStore?.theme,
			T.colors.BACKGROUND_SURFACE_HIGH ?? T.colors.BACKGROUND_SECONDARY,
		)
		if (typeof v === 'string') return v
	} catch {}
	return '#2b2d31'
}

function avatarUrl(): string | undefined {
	try {
		const u = S().UserStore?.getCurrentUser?.()
		return u?.getAvatarURL?.(undefined, 128, true)
	} catch {
		return undefined
	}
}

function CompactStatus() {
	const [status, set] = useState(currentStatus)
	useEffect(() => {
		const stores = [S().UserSettingsProtoStore, S().SelfPresenceStore]
		const fn = () => set(currentStatus())
		for (const s of stores) s?.addChangeListener?.(fn)
		return () => {
			for (const s of stores) s?.removeChangeListener?.(fn)
		}
	}, [])
	const bg = sheetColor()
	const avatar = avatarUrl()
	return (
		<View style={{ alignItems: 'center', gap: 18, paddingTop: 8 }}>
			{avatar ? (
				<View
					style={{
						width: 76,
						height: 76,
						borderRadius: 38,
						borderWidth: 3,
						borderColor: COLORS[status],
						padding: 2,
					}}
				>
					<Image
						source={{ uri: avatar }}
						style={{ width: '100%', height: '100%', borderRadius: 40 }}
					/>
				</View>
			) : null}
			<View style={{ flexDirection: 'row', gap: 22, alignItems: 'center' }}>
				{ORDER.map(s => {
					const on = s === status
					return (
						<Pressable
							key={s}
							accessibilityRole="radio"
							accessibilityLabel={LABEL[s]}
							accessibilityState={{ selected: on }}
							onPress={() => {
								if (!on) {
									setStatus(status, s)
									set(s)
								}
								;(ActionSheetActionCreators as any).hideActionSheet?.()
							}}
							hitSlop={8}
							style={{
								width: 52,
								height: 52,
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							<StatusShape status={s} size={on ? 50 : 40} bg={bg} />
						</Pressable>
					)
				})}
			</View>
		</View>
	)
}

const typeName = (t: any) => t?.displayName ?? t?.name ?? t?.type?.name ?? ''

/** Swaps the status list for the compact row and tightens the spacing. */
function rework(node: any, depth = 0): any {
	if (!isValidElement<any>(node) || depth > 6) return node
	if (typeName(node.type) === 'YouStatusRadioGroup')
		return <CompactStatus key="compact-status" />
	const p: any = node.props
	const patch: any = {}
	// The sheet's title ("Change Online Status"): the avatar and icons say it.
	if (p.header != null && 'startExpanded' in p) patch.header = null
	if (typeof p.spacing === 'number' && p.spacing > 12) patch.spacing = 12
	const kids = p.children
	if (kids != null && typeof kids === 'object') {
		const list = Array.isArray(kids) ? kids : [kids]
		const next = list.map(k => rework(k, depth + 1))
		if (next.some((k, i) => k !== list[i]))
			return cloneElement(node, patch, ...next)
	}
	return Object.keys(patch).length ? cloneElement(node, patch) : node
}

export default plugin({
	start({ cleanup }) {
		cleanup(
			findModule(SHEET, [], (mod: any) => {
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
							const out = orig.apply(this, args)
							try {
								return rework(out)
							} catch {
								return out
							}
						},
					),
				)
			}),
		)
	},
})
