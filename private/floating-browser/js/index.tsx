import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { useEffect, useState } from 'react'
import { Linking, ScrollView, View } from 'react-native'
import { chatbarStatus, installChatbar } from './chatbar'
import {
	bindStorage,
	DEFAULTS,
	type Settings,
	save,
	settings,
	type UserScript,
	useSettings,
} from './store'
import { counts, LISTS } from './filters'
import { filterStatus, loadFilters, onFilters, updateFilters } from './updater'
import { findWebView } from './webview'
import {
	browserReady,
	external,
	installWindow,
	openBrowser,
	toggleBrowser,
} from './window'

/**
 * A floating browser that stays over Discord while you chat, with "extensions" (scripts put into
 * pages): pop-up blocker, ad hider, dark pages, video focus, desktop site and your own user scripts.
 */

const isDiscordLink = (url: string) =>
	/^https?:\/\/([\w-]+\.)?(discord\.com|discord\.gg|discordapp\.com|discord\.media|discordapp\.net)\b/i.test(
		url,
	)

function ScriptEditor({ sc, onDone }: { sc: UserScript; onDone: () => void }) {
	const { Stack, TextInput, Button } = Design as any
	const [draft, setDraft] = useState(sc)
	const s = useSettings()
	const store = (scripts: UserScript[]) => save({ scripts })
	return (
		<Stack spacing={8}>
			<TextInput
				label="Name"
				value={draft.name}
				onChange={(name: string) => setDraft({ ...draft, name })}
			/>
			<TextInput
				label="Runs on"
				description="Part of the address, several separated by commas, or * for every site"
				value={draft.match}
				onChange={(match: string) => setDraft({ ...draft, match })}
				autoCapitalize="none"
			/>
			<TextInput
				label="JavaScript"
				value={draft.code}
				onChange={(code: string) => setDraft({ ...draft, code })}
				multiline
				autoCapitalize="none"
				autoCorrect={false}
				style={{ minHeight: 140, fontFamily: 'monospace' }}
			/>
			<View style={{ flexDirection: 'row', gap: 8 }}>
				<Button
					text="Save"
					onPress={() => {
						const others = s.scripts.filter(x => x.id !== draft.id)
						store([...others, draft])
						onDone()
					}}
				/>
				<Button
					text="Delete"
					variant="destructive"
					onPress={() => (
						store(s.scripts.filter(x => x.id !== draft.id)), onDone()
					)}
				/>
				<Button text="Cancel" variant="secondary" onPress={onDone} />
			</View>
		</Stack>
	)
}

function SettingsPage() {
	const {
		Stack,
		Text,
		TextInput,
		Button,
		TableRowGroup,
		TableRow,
		TableSwitchRow,
	} = Design as any
	const s = useSettings()
	const [editing, setEditing] = useState<UserScript | undefined>()
	const [, tick] = useState(0)
	useEffect(() => onFilters(() => tick(n => n + 1)), [])
	const c = counts()
	const sw = (k: keyof Settings, label: string, sub: string) => (
		<TableSwitchRow
			key={k}
			label={label}
			subLabel={sub}
			value={!!s[k]}
			onValueChange={(v: boolean) => save({ [k]: v } as any)}
		/>
	)
	return (
		<ScrollView
			contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
			keyboardShouldPersistTaps="handled"
		>
			<Stack spacing={16}>
				<Text variant="text-md/normal">
					A browser window that floats over Discord, so videos keep playing
					while you chat. Open it with the 🌐 button in the chat bar. Drag it by
					its bar, resize from ◢, ☰ for extensions, bookmarks and window sizes.
					Tap the title to type an address.
				</Text>
				<Button text="Open the browser" onPress={() => openBrowser()} />
				<TableRowGroup title="uBlock Origin filters">
					{sw(
						'uBlock',
						'Block ads with uBlock lists',
						"Uses uBlock Origin's filter lists: stops ad and tracker requests, hides ads, defuses pop-unders",
					)}
					{LISTS.map(l => (
						<TableSwitchRow
							key={l.id}
							label={l.name}
							disabled={!s.uBlock}
							value={s.lists[l.id] ?? l.defaultOn}
							onValueChange={(v: boolean) =>
								save({ lists: { ...s.lists, [l.id]: v } })
							}
						/>
					))}
					<TableRow
						label={
							filterStatus.updating ? filterStatus.state : 'Update filters now'
						}
						subLabel={
							filterStatus.error
								? `Last try: ${filterStatus.error}`
								: c
									? `${c.network.toLocaleString()} blocked hosts · ${c.cosmetic.toLocaleString()} hiding rules · ${c.scriptlets.toLocaleString()} scriptlets${s.filtersBuiltAt ? ` · updated ${new Date(s.filtersBuiltAt).toLocaleDateString()}` : ''}`
									: 'Not downloaded yet'
						}
						arrow
						disabled={filterStatus.updating}
						onPress={() => void updateFilters(true)}
					/>
				</TableRowGroup>
				<TableRowGroup title="Extensions">
					{sw(
						'popupBlock',
						'Pop-up blocker',
						'Stops pages opening windows and jumping to app stores',
					)}
					{sw(
						'inWindowFullscreen',
						'Fullscreen in the window',
						"A video's fullscreen button fills the floating window, so you can keep chatting",
					)}
					{sw(
						'fullscreenSideways',
						'Fullscreen turns the window sideways',
						'Also makes the window a full-width landscape box while a video is fullscreen',
					)}
					{sw('adHide', 'Hide ads', 'Hides common ad boxes')}
					{sw(
						'dark',
						'Dark pages',
						'Turns light pages dark (pictures and videos stay as they are)',
					)}
					{sw(
						'videoFocus',
						'Video focus',
						"The page's main video fills the window",
					)}
					{sw(
						'desktop',
						'Desktop site',
						'Asks sites for their computer version',
					)}
				</TableRowGroup>
				<TableRowGroup title="User scripts">
					{s.scripts.map(sc => (
						<TableRow
							key={sc.id}
							label={`${sc.on ? '●' : '○'} ${sc.name || 'Untitled'}`}
							subLabel={`Runs on ${sc.match || '*'}`}
							arrow
							onPress={() => setEditing(sc)}
						/>
					))}
					<TableRow
						label="Add a script"
						subLabel="Your own JavaScript, run on the sites you pick after each page loads"
						arrow
						onPress={() =>
							setEditing({
								id: String(Date.now()),
								name: '',
								match: '*',
								code: '',
								on: true,
							})
						}
					/>
				</TableRowGroup>
				{editing ? (
					<ScriptEditor
						key={editing.id}
						sc={editing}
						onDone={() => setEditing(undefined)}
					/>
				) : null}
				<TableRowGroup title="Bookmarks">
					{s.bookmarks.length ? (
						s.bookmarks.map(b => (
							<TableRow
								key={b.url}
								label={b.title}
								subLabel={b.url}
								onPress={() => openBrowser(b.url)}
								trailing={
									<Text
										variant="text-md/bold"
										color="text-muted"
										onPress={() =>
											save({
												bookmarks: s.bookmarks.filter(x => x.url !== b.url),
											})
										}
									>
										✕
									</Text>
								}
							/>
						))
					) : (
						<TableRow
							label="No bookmarks yet"
							subLabel="Add one from ☰ in the browser"
						/>
					)}
				</TableRowGroup>
				<TableRowGroup title="Options">
					{sw(
						'chatButton',
						'🌐 button in the chat bar',
						'Right before the emoji button',
					)}
					{sw(
						'linksInBrowser',
						'Open links in the floating browser',
						'Web links in chats open here instead of outside Discord',
					)}
				</TableRowGroup>
				<TextInput
					label="Search with"
					description="The address a search is added to"
					value={s.search}
					onChange={(search: string) => save({ search })}
					autoCapitalize="none"
				/>
				<TableRowGroup title="Status">
					<TableRow
						label="Window"
						subLabel={
							browserReady()
								? 'Ready'
								: 'Restart Discord once to finish setting up'
						}
					/>
					<TableRow
						label="Web view"
						subLabel={
							findWebView()
								? 'Found'
								: 'Not loaded yet (it loads when first opened)'
						}
					/>
					<TableRow
						label="Chat bar"
						subLabel={
							chatbarStatus.hooked ? 'Hooked' : 'Waiting for a chat to open'
						}
					/>
				</TableRowGroup>
			</Stack>
		</ScrollView>
	)
}

function take(url: unknown): boolean {
	if (external.skip || typeof url !== 'string' || !settings().linksInBrowser)
		return false
	if (!/^https?:\/\//i.test(url) || isDiscordLink(url)) return false
	openBrowser(url)
	return browserReady()
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		bindStorage(jsonStorage)
		void loadFilters()
		cleanup(
			installWindow(),
			installChatbar({
				onPress: () => toggleBrowser(),
				enabled: () => settings().chatButton,
			}),
			getModules((withProps as any)('handleClick'), (mod: any) => {
				if (typeof mod?.handleClick !== 'function') return
				cleanup(
					instead(
						mod,
						'handleClick',
						function (this: unknown, args: any[], orig: (...a: any[]) => any) {
							if (take(args[0]?.href)) return
							return orig.apply(this, args)
						},
					),
				)
			}) as any,
			instead(
				Linking,
				'openURL',
				function (args: any[], orig: (...a: any[]) => any) {
					if (take(args[0])) return Promise.resolve(true)
					return orig.apply(Linking, args)
				},
			),
			() => bindStorage(undefined),
		)
	},
	SettingsComponent: SettingsPage,
})
