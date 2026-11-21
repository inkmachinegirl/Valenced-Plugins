import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { View } from 'react-native'

export type Status = 'online' | 'idle' | 'dnd' | 'invisible'

export const COLORS: Record<Status, string> = {
	online: '#3ba55c',
	idle: '#faa81a',
	dnd: '#ed4245',
	invisible: '#747f8d',
}

/** Discord's status shapes as SVG, with real holes (see-through on any theme). */
const SVG: Record<Status, (c: string) => string> = {
	online: c =>
		`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="${c}"/></svg>`,
	idle: c =>
		`<svg viewBox="0 0 24 24"><path fill="${c}" d="M12.73 0.02A12 12 0 1 1 0.02 12.73A9 9 0 0 0 12.73 0.02Z"/></svg>`,
	dnd: c =>
		`<svg viewBox="0 0 24 24"><path fill="${c}" fill-rule="evenodd" d="M12 0a12 12 0 1 0 0 24a12 12 0 1 0 0-24ZM6 9h12a3 3 0 0 1 0 6H6a3 3 0 0 1 0-6Z"/></svg>`,
	invisible: c =>
		`<svg viewBox="0 0 24 24"><path fill="${c}" fill-rule="evenodd" d="M12 0a12 12 0 1 0 0 24a12 12 0 1 0 0-24ZM12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12Z"/></svg>`,
}

/** Discord's react-native-svg SvgXml (the app ships it). */
let xml: any
function svgXml(): any {
	if (xml) return xml
	try {
		const [mod] = lookupModule((withProps as any)('SvgXml')) as any
		const X = mod?.SvgXml ?? mod?.default?.SvgXml
		if (X) xml = X
	} catch {}
	return xml
}

/** Fallback when SvgXml isn't there, drawn: a dot, a moon, a dot with a bar, a ring. [bg] cuts the holes. */
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
	const Xml = svgXml()
	if (Xml) return <Xml xml={SVG[status](c)} width={size} height={size} />
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
