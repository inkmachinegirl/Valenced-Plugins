import { View } from 'react-native'

export type Status = 'online' | 'idle' | 'dnd' | 'invisible'

export const COLORS: Record<Status, string> = {
	online: '#3ba55c',
	idle: '#faa81a',
	dnd: '#ed4245',
	invisible: '#747f8d',
}

/** Discord's status shapes, drawn: a dot, a moon, a dot with a bar, a ring. [bg] cuts the holes. */
export function StatusShape({
	status,
	size,
	bg,
}: {
	status: Status
	size: number
	bg: string
}) {
	const c = COLORS[status]
	const round = { width: size, height: size, borderRadius: size / 2 }
	if (status === 'online')
		return <View style={{ ...round, backgroundColor: c }} />
	if (status === 'idle')
		return (
			<View style={{ ...round, overflow: 'hidden' }}>
				<View style={{ ...round, backgroundColor: c }} />
				<View
					style={{
						position: 'absolute',
						width: size * 0.62,
						height: size * 0.62,
						borderRadius: size,
						top: -size * 0.04,
						left: -size * 0.04,
						backgroundColor: bg,
					}}
				/>
			</View>
		)
	if (status === 'dnd')
		return (
			<View
				style={{
					...round,
					backgroundColor: c,
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<View
					style={{
						width: size * 0.66,
						height: size * 0.24,
						borderRadius: size,
						backgroundColor: bg,
					}}
				/>
			</View>
		)
	return (
		<View
			style={{
				...round,
				backgroundColor: c,
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			<View
				style={{
					width: size * 0.46,
					height: size * 0.46,
					borderRadius: size,
					backgroundColor: bg,
				}}
			/>
		</View>
	)
}
