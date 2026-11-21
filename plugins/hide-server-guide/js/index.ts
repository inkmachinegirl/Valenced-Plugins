import { instead } from '@valenced/patcher'
import { findModule } from './find'
import { withoutGuide } from './rows'

/**
 * The channel list's top rows come from useGuildActionRows(guild), a list of row ids; Server
 * Guide is the "@home" row. It's taken out of that list, so the list has no Server Guide row at
 * all (no gap, and nothing else changes).
 */

const ROWS = 'modules/guild_sidebar/useGuildActionRows.tsx'

export default plugin({
	start({ cleanup }) {
		cleanup(
			findModule(ROWS, [], (mod: any) => {
				if (typeof mod?.default !== 'function') return
				cleanup(
					instead(
						mod,
						'default',
						function (this: unknown, args: any[], orig: (...a: any[]) => any) {
							return withoutGuide(Reflect.apply(orig, this, args))
						},
					),
				)
			}),
		)
	},
})
