/**
 * Satou: a third option when holding a folder, "Mute folder" / "Unmute folder", next to Discord's
 * own two. It opens a sheet with the same choices as muting a server (15 minutes … until you turn
 * it back on) and applies it to every server in the folder, through Discord's own
 * updateGuildNotificationSettings, one server at a time.
 */

import { ActionSheetActionCreators, ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { showOverlay } from './chatswipe'
import type * as t from './types'

const S = Stores as any

const WINDOWS: [string, number][] = [
	['For 15 minutes', 900],
	['For 1 hour', 3600],
	['For 3 hours', 10800],
	['For 8 hours', 28800],
	['For 24 hours', 86400],
	['Until I turn it back on', -1],
]

function creators(): any {
	try {
		return lookupModule((withProps as any)('updateGuildNotificationSettings'))[0]
	} catch {
		return undefined
	}
}

function folderGuilds(id: number): string[] {
	try {
		return S.SortedGuildStore?.getGuildFolderById?.(id)?.guildIds ?? []
	} catch {
		return []
	}
}

const allMuted = (ids: string[]) =>
	ids.length > 0 && ids.every(g => !!S.UserGuildSettingsStore?.isMuted?.(g))

function toast(text: string) {
	try {
		;(ToastActionCreators as any).open('sdp-folder-mute', { text })
	} catch {}
}

async function apply(ids: string[], seconds: number | null) {
	const c = creators()
	if (typeof c?.updateGuildNotificationSettings !== 'function')
		return toast("Couldn't reach Discord's notification settings")
	const value =
		seconds === null
			? { muted: false, mute_config: null }
			: {
					muted: true,
					mute_config: {
						selected_time_window: seconds,
						end_time: seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null,
					},
				}
	let failed = 0
	for (const [i, id] of ids.entries()) {
		try {
			await c.updateGuildNotificationSettings(id, value)
		} catch {
			failed++
		}
		// Gentle on Discord's API: one server at a time.
		if (i < ids.length - 1) await new Promise(r => setTimeout(r, 250))
	}
	const what = seconds === null ? 'Unmuted' : 'Muted'
	toast(failed ? `${what} ${ids.length - failed} of ${ids.length} servers` : `${what} ${ids.length} servers`)
}

function FolderMuteSheet({ folderId, name }: { folderId: number; name: string }) {
	const { ActionSheet, BottomSheetTitleHeader, TableRowGroup, TableRow } = Design as any
	const ids = folderGuilds(folderId)
	const muted = allMuted(ids)
	const run = (seconds: number | null) => {
		ActionSheetActionCreators.hideActionSheet()
		void apply(ids, seconds)
	}
	return (
		<ActionSheet>
			<BottomSheetTitleHeader title={`${muted ? 'Unmute' : 'Mute'} ${name}`} />
			<TableRowGroup>
				{muted ? (
					<TableRow label="Unmute all servers" onPress={() => run(null)} />
				) : (
					WINDOWS.map(([label, seconds]) => (
						<TableRow key={label} label={label} onPress={() => run(seconds)} />
					))
				)}
			</TableRowGroup>
		</ActionSheet>
	)
}

const icon = (name: string) => {
	try {
		return lookupGeneratedIconComponent(name as any)
	} catch {
		return undefined
	}
}

/** The extra folder menu item. */
export function folderMuteItem(id: number): t.MenuItem | undefined {
	const ids = folderGuilds(id)
	if (!ids.length) return undefined
	const muted = allMuted(ids)
	const IconComponent = icon(muted ? 'BellIcon' : 'BellSlashIcon') ?? icon('BellIcon')
	const name = S.SortedGuildStore?.getGuildFolderById?.(id)?.folderName || 'folder'
	return {
		...(IconComponent ? { IconComponent } : {}),
		label: muted ? 'Unmute folder' : 'Mute folder',
		action() {
			// The swipe-up drawer sits above sheets; close it so the sheet is visible.
			showOverlay(false)
			ActionSheetActionCreators.openLazy(
				Promise.resolve({ default: FolderMuteSheet as any }),
				'sdp-folder-mute',
				{ folderId: id, name },
			)
		},
	} as t.MenuItem
}
