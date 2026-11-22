import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import { patchBoard } from './board'
import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, ScrollView, View } from 'react-native'
import {
	errorText,
	FEELING_TAGS,
	GAME_TYPES,
	gameInfo,
	iconUrl,
	knownGames,
	isSkillTag,
	loadDetectable,
	loadInfo,
	loadWidgets,
	parseId,
	SKILL_TAGS,
	saveWidgets,
	searchGames,
	suggestedGames,
} from './api'
import type { GameInfo, GameType, Widget, WidgetGame } from './api'

function toast(text: string) {
	try {
		ToastActionCreators.open('profile-widgets', { text } as never)
	} catch {}
}

const typeInfo = (type: GameType) => GAME_TYPES.find(t => t.type === type)!
const gamesOf = (widgets: Widget[], type: GameType) =>
	widgets.find(w => w.data.type === type)?.data.games ?? []

/** A copy of [widgets] with [type]'s games replaced (creating the widget if needed). */
function withGames(
	widgets: Widget[],
	type: GameType,
	games: WidgetGame[],
): Widget[] {
	const at = widgets.findIndex(w => w.data.type === type)
	if (at === -1) return [...widgets, { data: { type, games } }]
	const next = [...widgets]
	next[at] = { ...next[at], data: { ...next[at].data, games } }
	return next
}

const tagLabel = (tag: string) =>
	[...SKILL_TAGS, ...FEELING_TAGS].find(([t]) => t === tag)?.[1] ?? tag

function GameIcon({ game }: { game?: GameInfo }) {
	const uri = iconUrl(game)
	return uri ? (
		<Image
			source={{ uri }}
			style={{ width: 32, height: 32, borderRadius: 8 }}
		/>
	) : (
		<View
			style={{
				width: 32,
				height: 32,
				borderRadius: 8,
				backgroundColor: '#ffffff1a',
			}}
		/>
	)
}

type View_ =
	| { name: 'list' }
	| { name: 'search'; type: GameType }
	| { name: 'edit'; type: GameType; index: number }

function SettingsPage() {
	const { Stack, Text, Button, TableRowGroup, TableRow } = Design as any
	const [saved, setSaved] = useState<Widget[] | null>(null)
	const [draft, setDraft] = useState<Widget[] | null>(null)
	const [error, setError] = useState<string>()
	const [busy, setBusy] = useState(false)
	const [view, setView] = useState<View_>({ name: 'list' })
	const [, setInfoTick] = useState(0)

	const reload = async () => {
		setError(undefined)
		setSaved(null)
		setDraft(null)
		try {
			const widgets = await loadWidgets()
			await loadInfo(
				widgets.flatMap(w => w.data.games?.map(g => g.game_id) ?? []),
			)
			setSaved(widgets)
			setDraft(widgets)
		} catch (e) {
			setError(errorText(e))
		}
	}
	useEffect(() => {
		void reload()
	}, [])

	const dirty = useMemo(
		() => JSON.stringify(saved) !== JSON.stringify(draft),
		[saved, draft],
	)

	if (error)
		return (
			<ScrollView contentContainerStyle={{ padding: 16 }}>
				<Stack spacing={12}>
					<Text variant="text-md/semibold" color="text-feedback-critical">
						Couldn't load your widgets: {error}
					</Text>
					<Button text="Try again" onPress={reload} />
				</Stack>
			</ScrollView>
		)
	if (!draft)
		return (
			<View style={{ padding: 32, alignItems: 'center' }}>
				<ActivityIndicator />
			</View>
		)

	if (view.name === 'search')
		return (
			<SearchView
				type={view.type}
				taken={gamesOf(draft, view.type).map(g => g.game_id)}
				onBack={() => setView({ name: 'list' })}
				onPick={game => {
					const games = [...gamesOf(draft, view.type), { game_id: game.id }]
					setDraft(withGames(draft, view.type, games))
					setView(
						typeInfo(view.type).detailed
							? { name: 'edit', type: view.type, index: games.length - 1 }
							: { name: 'list' },
					)
				}}
			/>
		)

	if (view.name === 'edit') {
		const games = gamesOf(draft, view.type)
		const game = games[view.index]
		if (!game) {
			setView({ name: 'list' })
			return null
		}
		return (
			<EditView
				type={view.type}
				game={game}
				index={view.index}
				count={games.length}
				onChange={next => {
					const copy = [...games]
					copy[view.index] = next
					setDraft(withGames(draft, view.type, copy))
				}}
				onMove={delta => {
					const to = view.index + delta
					if (to < 0 || to >= games.length) return
					const copy = [...games]
					;[copy[view.index], copy[to]] = [copy[to], copy[view.index]]
					setDraft(withGames(draft, view.type, copy))
					setView({ ...view, index: to })
				}}
				onRemove={() => {
					setDraft(
						withGames(
							draft,
							view.type,
							games.filter((_, i) => i !== view.index),
						),
					)
					setView({ name: 'list' })
				}}
				onBack={() => setView({ name: 'list' })}
			/>
		)
	}

	const others = draft.filter(
		w => !GAME_TYPES.some(g => g.type === w.data.type),
	)

	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
			<Stack spacing={24}>
				{GAME_TYPES.map(({ type, label, max, detailed }) => {
					const games = gamesOf(draft, type)
					return (
						<TableRowGroup
							key={type}
							title={`${label} · ${games.length}/${max}`}
							description={
								detailed
									? 'Shown big on your profile, with your comment and tags.'
									: undefined
							}
						>
							{games.map((g, i) => {
								const meta = gameInfo(g.game_id)
								const extra = [g.comment, ...(g.tags ?? []).map(tagLabel)]
									.filter(Boolean)
									.join(' · ')
								return (
									<TableRow
										key={`${g.game_id}-${i}`}
										label={meta?.name ?? g.game_id}
										subLabel={extra || undefined}
										icon={<GameIcon game={meta} />}
										arrow
										onPress={() => setView({ name: 'edit', type, index: i })}
									/>
								)
							})}
							{games.length < max ? (
								<TableRow
									label="Add a game"
									arrow
									onPress={() => setView({ name: 'search', type })}
								/>
							) : null}
						</TableRowGroup>
					)
				})}
				{others.length ? (
					<Text variant="text-sm/medium" color="text-muted">
						{others.length} other widget{others.length === 1 ? '' : 's'} (like
						custom app widgets) stay as they are.
					</Text>
				) : null}
				<Stack spacing={8}>
					<Button
						text={busy ? 'Saving…' : 'Save to profile'}
						disabled={!dirty || busy}
						onPress={async () => {
							setBusy(true)
							try {
								const stored = await saveWidgets(draft)
								await loadInfo(
									stored.flatMap(w => w.data.games?.map(g => g.game_id) ?? []),
								)
								setSaved(stored)
								setDraft(stored)
								toast('Widgets saved')
							} catch (e) {
								toast(`Couldn't save: ${errorText(e)}`)
							} finally {
								setBusy(false)
								setInfoTick(n => n + 1)
							}
						}}
					/>
					{dirty ? (
						<Button
							text="Discard changes"
							variant="secondary"
							disabled={busy}
							onPress={() => setDraft(saved)}
						/>
					) : null}
				</Stack>
				<Text variant="text-xs/medium" color="text-muted">
					Saving replaces your game widgets with what's above. Empty ones are
					removed from your profile.
				</Text>
			</Stack>
		</ScrollView>
	)
}

function SearchView({
	type,
	taken,
	onPick,
	onBack,
}: {
	type: GameType
	taken: string[]
	onPick: (game: GameInfo) => void
	onBack: () => void
}) {
	const { Stack, Text, TextInput, TableRowGroup, TableRow } = Design as any
	const [query, setQuery] = useState('')
	const [list, setList] = useState<GameInfo[] | null>(null)
	const [failed, setFailed] = useState<string>()
	const [suggested, setSuggested] = useState<GameInfo[]>([])

	useEffect(() => {
		const extra = knownGames()
		loadDetectable()
			.then(pc => {
				const ids = new Set(pc.map(g => g.id))
				setList([...pc, ...extra.filter(g => !ids.has(g.id))])
			})
			.catch(e => {
				setFailed(errorText(e))
				setList(extra)
			})
		suggestedGames().then(async ids => {
			await loadInfo(ids)
			setSuggested(ids.map(id => gameInfo(id)!).filter(Boolean))
		})
	}, [])

	const pasted = parseId(query)
	const results = list ? searchGames(list, query) : []
	const shown = (query.trim() ? results : suggested).filter(
		g => !taken.includes(g.id),
	)

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ padding: 16 }}
			keyboardShouldPersistTaps="handled"
		>
			<Stack spacing={16}>
				<TableRowGroup>
					<TableRow label="Back" onPress={onBack} />
				</TableRowGroup>
				<TextInput
					label={`Add to ${typeInfo(type).label}`}
					placeholder="Search games, or paste a game ID"
					value={query}
					onChange={setQuery}
					isClearable
				/>
				{failed ? (
					<Text variant="text-sm/medium" color="text-feedback-critical">
						Couldn't load the game list ({failed}). You can still paste a game
						ID.
					</Text>
				) : !list && query.trim() ? (
					<ActivityIndicator />
				) : null}
				{pasted && !taken.includes(pasted) ? (
					<TableRowGroup title="Game ID">
						<TableRow
							label={gameInfo(pasted)?.name ?? `Add game ${pasted}`}
							arrow
							onPress={async () => {
								await loadInfo([pasted])
								onPick(gameInfo(pasted) ?? { id: pasted, name: pasted })
							}}
						/>
					</TableRowGroup>
				) : null}
				{shown.length ? (
					<TableRowGroup title={query.trim() ? 'Results' : 'Suggested for you'}>
						{shown.map(game => (
							<TableRow
								key={game.id}
								label={game.name}
								subLabel={
									game.source
										? `Not in Discord's PC list · ${game.source}`
										: undefined
								}
								icon={<GameIcon game={game} />}
								arrow
								onPress={() => onPick(game)}
							/>
						))}
					</TableRowGroup>
				) : query.trim() && list && !pasted ? (
					<Text variant="text-sm/medium" color="text-muted">
						No games match "{query.trim()}". Search covers Discord's PC game
						list plus games you and your friends are playing right now, so a
						mobile-only game shows up once someone is playing it, or paste its
						game ID.
					</Text>
				) : !query.trim() ? (
					<Text variant="text-sm/medium" color="text-muted">
						{list ? 'No suggested games. ' : ''}Type a game's name. Mobile games
						are found when you or a friend is playing them with Discord activity
						on; you can also paste a game ID.
					</Text>
				) : null}
			</Stack>
		</ScrollView>
	)
}

function EditView({
	type,
	game,
	index,
	count,
	onChange,
	onMove,
	onRemove,
	onBack,
}: {
	type: GameType
	game: WidgetGame
	index: number
	count: number
	onChange: (game: WidgetGame) => void
	onMove: (delta: number) => void
	onRemove: () => void
	onBack: () => void
}) {
	const {
		Stack,
		Text,
		TextInput,
		TableRowGroup,
		TableRow,
		TableSwitchRow,
		TableRadioGroup,
		TableRadioRow,
	} = Design as any
	const meta = gameInfo(game.game_id)
	const detailed = typeInfo(type).detailed
	const tags = game.tags ?? []
	const skill = tags.find(isSkillTag) ?? 'none'
	const setTags = (next: string[]) => onChange({ ...game, tags: next })

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ padding: 16 }}
			keyboardShouldPersistTaps="handled"
		>
			<Stack spacing={20}>
				<TableRowGroup>
					<TableRow label="Done" onPress={onBack} />
				</TableRowGroup>
				<TableRowGroup title={typeInfo(type).label}>
					<TableRow
						label={meta?.name ?? game.game_id}
						subLabel={game.game_id}
						icon={<GameIcon game={meta} />}
					/>
				</TableRowGroup>
				{detailed ? (
					<>
						<TextInput
							label="Comment"
							placeholder="Best game ever!"
							value={game.comment ?? ''}
							onChange={(comment: string) => onChange({ ...game, comment })}
							maxLength={100}
							isClearable
						/>
						<TableRadioGroup
							title="Skill"
							defaultValue={skill}
							value={skill}
							onChange={(value: string) =>
								setTags([
									...(value === 'none' ? [] : [value]),
									...tags.filter(t => !isSkillTag(t)),
								])
							}
						>
							<TableRadioRow label="None" value="none" />
							{SKILL_TAGS.map(([value, label]) => (
								<TableRadioRow key={value} label={label} value={value} />
							))}
						</TableRadioGroup>
						<TableRowGroup title="Tags">
							{FEELING_TAGS.map(([value, label]) => (
								<TableSwitchRow
									key={value}
									label={label}
									value={tags.includes(value)}
									onValueChange={(on: boolean) =>
										setTags(
											on ? [...tags, value] : tags.filter(t => t !== value),
										)
									}
								/>
							))}
						</TableRowGroup>
					</>
				) : (
					<Text variant="text-sm/medium" color="text-muted">
						Comments and tags only show on Favorite Game and Games in Rotation.
					</Text>
				)}
				<TableRowGroup>
					{count > 1 ? (
						<>
							<TableRow
								label="Move up"
								disabled={index === 0}
								onPress={() => onMove(-1)}
							/>
							<TableRow
								label="Move down"
								disabled={index === count - 1}
								onPress={() => onMove(1)}
							/>
						</>
					) : null}
					<TableRow
						label="Remove from this widget"
						variant="danger"
						onPress={onRemove}
					/>
				</TableRowGroup>
			</Stack>
		</ScrollView>
	)
}

/**
 * Discord ships its own mobile widget editor (add widgets, games, comments and tags right on your
 * profile's Board tab and in Edit Profile) behind the "2026-10-mobile-widget-editing" experiment.
 * Its only switch is this hook; the original still runs (it calls React hooks itself, so skipping
 * it would change the hook count of screens already open) and its answer is replaced with true.
 * That editor exists from Discord 354.1; on older builds board.tsx adds an Edit widgets button.
 */
const EXPERIMENT =
	'modules/user_profile/experiments/MobileWidgetEditingExperiment.tsx'

export default plugin({
	start({ cleanup }) {
		patchBoard(cleanup, SettingsPage)
		cleanup(
			getModuleWithImportedPath<any>(EXPERIMENT, mod => {
				if (typeof mod?.useIsMobileWidgetEditingEnabled !== 'function') return
				cleanup(
					instead(
						mod,
						'useIsMobileWidgetEditingEnabled',
						function (this: unknown, args: any[], orig: (...a: any[]) => any) {
							Reflect.apply(orig, this, args)
							return true
						},
					),
				)
			}),
		)
	},
	SettingsComponent: SettingsPage,
})
