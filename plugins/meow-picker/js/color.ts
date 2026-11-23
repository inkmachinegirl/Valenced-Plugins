import { Tokens } from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'

/**
 * Colours from the current theme (Discord's, or a custom theme that recolours Discord's semantic
 * colours), tried by name in order since names differ between Discord versions.
 */
function themed(names: string[], dark: string, light: string): string {
	let theme: string | undefined
	try {
		const T = (Tokens as any).default
		theme = (Stores as any).ThemeStore?.theme
		for (const name of names) {
			const token = T?.colors?.[name]
			if (!token) continue
			const value = T.internal.resolveSemanticColor(theme, token)
			if (typeof value === 'string' && value) return value
		}
	} catch {}
	return theme === 'light' ? light : dark
}

/** All the picker's colours, read once per draw. */
export function palette() {
	return {
		text: themed(
			['TEXT_DEFAULT', 'TEXT_NORMAL', 'HEADER_PRIMARY'],
			'#f2f3f5',
			'#060607',
		),
		muted: themed(['TEXT_MUTED', 'INTERACTIVE_MUTED'], '#949ba4', '#5c5e66'),
		panel: themed(
			[
				'BACKGROUND_SURFACE_HIGH',
				'BACKGROUND_BASE_LOWER',
				'BACKGROUND_FLOATING',
				'BACKGROUND_SECONDARY',
			],
			'#2b2d31',
			'#ffffff',
		),
		chip: themed(
			['BACKGROUND_MOD_SUBTLE', 'BACKGROUND_MOD_MUTED'],
			'rgba(255,255,255,0.06)',
			'rgba(0,0,0,0.05)',
		),
		chipPressed: themed(
			['BACKGROUND_MOD_STRONG', 'BACKGROUND_MOD_NORMAL'],
			'rgba(255,255,255,0.16)',
			'rgba(0,0,0,0.12)',
		),
		tabOn: themed(
			['BACKGROUND_BRAND', 'CONTROL_BRAND_FOREGROUND'],
			'#5865f2',
			'#5865f2',
		),
		tabOnText: themed(['WHITE', 'TEXT_ON_BRAND'], '#ffffff', '#ffffff'),
		border: themed(
			['BORDER_SUBTLE', 'BACKGROUND_MOD_NORMAL'],
			'rgba(255,255,255,0.08)',
			'rgba(0,0,0,0.08)',
		),
		handle: themed(
			['INTERACTIVE_MUTED', 'ICON_MUTED'],
			'rgba(255,255,255,0.3)',
			'rgba(0,0,0,0.25)',
		),
	}
}

/** The theme's main text colour. */
export const textColor = () => palette().text

/** The theme's icon colour, for the chat bar's cat when Discord doesn't pass one. */
export const iconColor = () =>
	themed(['ICON_DEFAULT', 'INTERACTIVE_NORMAL'], '#b5bac1', '#4e5058')
