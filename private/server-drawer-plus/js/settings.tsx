import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { ServerDrawerPreferences } from './types'
import { swipeStatus } from './chatswipe'
import { motionPrefs } from './prefs'
import { pullPrefs } from './unreadpull'

export const DefaultSettings: ServerDrawerPreferences = {
	dmOrder: [],
	layout: 'grid',
	dmLayout: 'grid',
	preferFriendNicknames: true,
	pullToMarkRead: false,
	softDockGestures: false,
	haptics: false,
	carousel: false,
	animateAvatars: true,
	animations: true,
	pullNextUnread: true,
}

export default function Settings({
	api: { jsonStorage, plugin },
}: ComponentProps<
	PluginSettingsComponent<{ jsonStorage: ServerDrawerPreferences }>
>) {
	const {
		pullToMarkRead,
		softDockGestures = false,
		haptics = false,
		carousel = false,
		animateAvatars = true,
		animations = true,
		pullNextUnread = true,
		preferFriendNicknames = true,
	} = jsonStorage.use() ?? DefaultSettings
	return (
		<ScrollView style={{ flex: 1 }}>
			<Page>
				<Design.TableRowGroup title="Appearance">
					<Design.TableSwitchRow
						label="Animations"
						subLabel="Slide, spring and fold animations in the drawer and dock. Turn off for less load: everything jumps straight to where it goes."
						value={animations}
						onValueChange={value => {
							motionPrefs.animate = value
							jsonStorage.set({ animations: value })
						}}
					/>
					<Design.TableSwitchRow
						label="Animate drawer avatars"
						subLabel="Play animated server icons and DM avatars when the drawer is idle. Turn off for smoother performance."
						value={animateAvatars}
						onValueChange={value => jsonStorage.set({ animateAvatars: value })}
					/>
					<Design.TableSwitchRow
						label="Prefer friend nicknames"
						subLabel="Show the nicknames you gave your friends instead of their display names in direct messages."
						value={preferFriendNicknames}
						onValueChange={value =>
							jsonStorage.set({ preferFriendNicknames: value })
						}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Gestures">
					<Design.TableSwitchRow
						label="Pull for next unread channel"
						subLabel="At the bottom of a chat, keep pulling up: it slides to the next unread channel in this server. With none left, the same pull goes back to the channel you were in before."
						value={pullNextUnread}
						onValueChange={value => {
							pullPrefs.on = value
							jsonStorage.set({ pullNextUnread: value })
						}}
					/>
					<Design.TableSwitchRow
						label="Soft dock gestures"
						subLabel="Lift the dock with gentle resistance, bounce back on short pulls, and expand on release after a longer pull. Requires reload."
						value={softDockGestures}
						onValueChange={value => {
							jsonStorage.set({ softDockGestures: value })
							plugin.requireReload()
						}}
					/>
					<Design.TableSwitchRow
						label="Carousel"
						subLabel="Swipe left or right through servers and folders in the collapsed dock, looping back around at either end."
						value={carousel}
						onValueChange={value => jsonStorage.set({ carousel: value })}
					/>
					<Design.TableSwitchRow
						label="Haptics"
						subLabel="Light feedback when opening or closing the drawer and opening a focused context menu."
						value={haptics}
						onValueChange={value => jsonStorage.set({ haptics: value })}
					/>
					<Design.TableSwitchRow
						label="Pull down to mark all as read"
						subLabel="Pull the collapsed dock down until it is flat, then release to mark all servers and DMs as read."
						value={pullToMarkRead}
						onValueChange={value => jsonStorage.set({ pullToMarkRead: value })}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Chat bar swipe (Server Drawer+)">
					<Design.TableRow
						label="Swipe up on the chat bar to open the drawer"
						subLabel={`Since Discord started: ${swipeStatus.touches} touches on the chat bar, ${swipeStatus.swipes} swipes up, opened ${swipeStatus.opened} times`}
					/>
				</Design.TableRowGroup>
			</Page>
		</ScrollView>
	)
}
