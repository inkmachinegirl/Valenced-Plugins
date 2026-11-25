/**
 * Satou: let other plugins' server options show in the drawer's long-press menu.
 *
 * Plugins that add rows to a server's long-press menu (Download Emojis & Stickers, Ignore by Role,
 * Quick Folders…) patch ContextMenuState.showContextMenu and recognise the server menu by its key,
 * which Discord's server list sets to the server id. The drawer opens its menu through the
 * <ContextMenu> component, which uses a random key, so they didn't see it. Each drawer menu item is
 * remembered with its server here, and a `before` hook (always run before other plugins' `instead`
 * hooks) gives the menu the server id as its key.
 */

import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { before } from '@valenced/patcher'

const STATE = 'design/components/ContextMenu/native/ContextMenuState.native.tsx'

/** Drawer menu item → the server it's for. */
export const guildOfItem = new WeakMap<object, string>()

export function patchMenuKey(cleanup: (...fns: Array<() => unknown>) => unknown) {
	cleanup(
		getModuleWithImportedPath<any>(STATE, mod => {
			if (typeof mod?.showContextMenu !== 'function') return
			cleanup(
				before(mod, 'showContextMenu', ((args: any[]) => {
					const menu = args?.[0]
					const first = Array.isArray(menu?.items) ? menu.items[0] : undefined
					const id = first && typeof first === 'object' ? guildOfItem.get(first) : undefined
					if (id) args[0] = { ...menu, key: id, items: menu.items }
					return args
				}) as never),
			)
		}),
	)
}
