import * as discordFinders from '@valenced/discord/utils/modules/finders'
import { useState } from 'react'
import { Image } from 'react-native'

/**
 * An item's picture, moving: its animated version played by Discord's own FastImage (the
 * component Discord plays nameplates and decorations with), falling back to the still picture
 * when there's no animation or it can't be played.
 */
/** The Animated previews setting: off, items show their still picture. */
export const animPrefs = { on: true }

let fast: any
function fastImage(): any {
	if (fast !== undefined) return fast
	try {
		const found = (discordFinders as any).lookupModuleWithImportedPath?.(
			'components_native/common/FastImage.tsx',
		)
		const mod = Array.isArray(found) ? found[0] : undefined
		fast = mod?.default ?? null
	} catch {
		fast = null
	}
	return fast
}

export function AnimImage({
	animated,
	still,
	style,
	resizeMode,
}: {
	animated?: string
	still?: string
	style: any
	resizeMode: 'cover' | 'contain' | 'stretch'
}) {
	const [failed, setFailed] = useState(false)
	const Fast = fastImage()
	if (animated && animPrefs.on && !failed && Fast)
		return (
			<Fast
				source={{ uri: animated }}
				style={style}
				resizeMode={resizeMode}
				enableAnimation
				autoPlay
				onError={() => setFailed(true)}
			/>
		)
	if (!still) return null
	return <Image source={{ uri: still }} style={style} resizeMode={resizeMode} />
}
