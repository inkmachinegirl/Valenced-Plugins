import { instead } from '@valenced/patcher'
import { findModule } from './find'
import { withoutGetStarted } from './rows'

/**
 * The channel list's top rows come from useGuildActionRows(guild), a list of row ids; the
 * "Get Started" new-member progress bar is 'guild-new-member-actions-progress-bar'. It's taken out
 * of that list, so there's no bar and no gap. Your onboarding steps themselves are untouched.
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
							return withoutGetStarted(Reflect.apply(orig, this, args))
						},
					),
				)
			}),
		)
	},
})
