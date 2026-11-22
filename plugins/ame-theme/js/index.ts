/// <reference types="@valenced/themes-api" />

import { lazyColors } from './theme-kit'
import type { Look, Palette, Tone } from './theme-kit'

/**
 * Ame-chan, from NEEDY STREAMER OVERLOAD: plum surfaces from the art's background, her red vest
 * for buttons and toggles, and the gold of her heart charm and hairpin for links and mentions.
 * Text stays near-white on plum (about 13:1), so chat reads like Discord's own dark theme.
 */

const cherry = '#c93c51' // her vest, brightened a little to read on plum
const gold = '#e8c98b'

const tone: Tone = {
	greys: [
		['#000000', '#0a0710'],
		['#2c2d32', '#17111f'],
		['#323339', '#1f1729'],
		['#393a41', '#2a1f35'],
		['#41434a', '#33273f'],
		['#595a63', '#55456a'],
		['#81828a', '#85739c'],
		['#97979f', '#9d8bb4'],
		['#abacb2', '#b4a3cb'],
		['#c5c6ca', '#ccbedf'],
		['#efeff1', '#f1eaf8'],
		['#f3f3f4', '#f6f0fb'],
		['#fbfbfb', '#fcf9fe'],
		['#ffffff', '#ffffff'],
	],
	hues: {
		red: '#ef5a6f',
		orange: '#f0a070',
		yellow: gold,
		green: '#7fd3a8',
		teal: '#86d6cf',
		blue: '#8aa2ee',
		blurple: '#9a82e0',
		purple: '#a77ad6',
		pink: '#ff8fb0',
	},
}

const night: Palette = {
	rail: '#17111f',
	floor: '#1f1729',
	panel: '#1b1424',
	page: '#241a30',
	card: '#2d2239',
	popup: '#342842',
	input: '#2a1f35',
	control: '#3b2d4b',
	pressed: '#47375b',

	heading: '#ffffff',
	strong: '#f6f0fb',
	text: '#e6dcf0',
	subtle: '#c4b3da',
	muted: '#a08cb9',
	faint: '#6e5d86',

	divider: '#c9a7ff1a',
	border: '#c9a7ff2e',
	borderStrong: '#c9a7ff52',

	accent: cherry,
	accentPress: '#b5334a',
	onAccent: '#ffffff',
	accentSoft: '#d6455a33',
	accentText: '#ff8f9e',
	brand: '#b8364b',
	rowIcon: '#ff8f9e',
	selection: '#9d7fd033',

	link: gold,
	mentionText: '#f6e2b8',
	mentionPill: '#e8c98b33',
	mentionBg: '#e8c98b14',
	replyBg: '#ffffff0d',
	keyword: '#d6455a40',
	code: '#140e1b',
	codeText: gold,
	spoiler: '#3e2f4d',
	spoilerRevealed: '#2d2239',

	positive: '#7fd3a8',
	warning: gold,
	danger: '#ff7d8f',
	dangerFill: cherry,
	scrim: '#0c0812cc',
}

const day: Palette = {
	rail: '#e9e0f2',
	floor: '#fcf9fd',
	panel: '#f3ecf8',
	page: '#f3ecf8',
	card: '#ffffff',
	popup: '#ffffff',
	input: '#eee5f6',
	control: '#e4d9ef',
	pressed: '#d6c7e7',

	heading: '#1c1222',
	strong: '#22172b',
	text: '#382b45',
	subtle: '#594a6b',
	muted: '#76688a',
	faint: '#a395b6',

	divider: '#22172b14',
	border: '#22172b21',
	borderStrong: '#22172b40',

	accent: '#c23a4f',
	accentPress: '#a93044',
	onAccent: '#ffffff',
	accentSoft: '#c23a4f26',
	accentText: '#a93044',
	brand: '#b8364b',
	rowIcon: '#a93044',
	selection: '#9d7fd02e',

	link: '#8a5f12',
	mentionText: '#7a540f',
	mentionPill: '#e8c98b59',
	mentionBg: '#e8c98b2e',
	replyBg: '#22172b0a',
	keyword: '#c23a4f40',
	code: '#f0e8f6',
	codeText: '#8a5f12',
	spoiler: '#c9bad9',
	spoilerRevealed: '#e4d9ef',

	positive: '#1f7a55',
	warning: '#8a5f12',
	danger: '#b5304a',
	dangerFill: '#c23a4f',
	scrim: '#22172b59',
}

// Online and voice stay green so they don't look like errors; do-not-disturb is her red.
const states = {
	STATUS_ONLINE: '#7fd3a8',
	ICON_STATUS_ONLINE: '#7fd3a8',
	TEXT_STATUS_ONLINE: '#7fd3a8',
	STATUS_SPEAKING: '#7fd3a8',
	ICON_VOICE_SPEAKING: '#7fd3a8',
	ICON_STATUS_DND: '#ef5a6f',
	TEXT_STATUS_DND: '#ef5a6f',
	BADGE_NOTIFICATION_BACKGROUND: cherry,
}

const dark: Look = { palette: night, extra: states }
const light: Look = { palette: day, extra: states }
const colors = lazyColors(tone, { dark, darker: dark, midnight: dark, light })


// ---------------------------------------------------------------------------------------------
// Monochrome: the greyscale sketch. Slate surfaces with the art's periwinkle as the only colour.

const peri = '#9c9ed0'

const monoTone: Tone = {
	greys: [
		['#000000', '#08080d'],
		['#2c2d32', '#15151d'],
		['#323339', '#1c1c26'],
		['#393a41', '#262633'],
		['#41434a', '#2f2f3e'],
		['#595a63', '#4e4f63'],
		['#81828a', '#7d7f95'],
		['#97979f', '#9799ad'],
		['#abacb2', '#b0b2c6'],
		['#c5c6ca', '#c9cadb'],
		['#efeff1', '#ececf3'],
		['#f3f3f4', '#f3f3f8'],
		['#fbfbfb', '#fbfbfd'],
		['#ffffff', '#ffffff'],
	],
	hues: {
		red: '#e8798a',
		orange: '#e0a585',
		yellow: '#dcc98e',
		green: '#8fcfb4',
		teal: '#9cc9d6',
		blue: '#9aaee6',
		blurple: peri,
		purple: '#aa9ad6',
		pink: '#d6a0c8',
	},
}

const monoNight: Palette = {
	...night,
	rail: '#15151d',
	floor: '#1c1c26',
	panel: '#191922',
	page: '#21212c',
	card: '#292936',
	popup: '#30303e',
	input: '#252531',
	control: '#363646',
	pressed: '#424256',
	strong: '#f3f3f8',
	text: '#e2e2ec',
	subtle: '#bdbed2',
	muted: '#9798ae',
	faint: '#66677d',
	divider: '#b8baff17',
	border: '#b8baff29',
	borderStrong: '#b8baff4a',
	accent: peri,
	accentPress: '#8a8cc2',
	onAccent: '#14141c',
	accentSoft: '#9c9ed033',
	accentText: '#c3c5f0',
	brand: '#5e60a0',
	rowIcon: peri,
	selection: '#9c9ed02e',
	link: '#c3c5f0',
	mentionText: '#e0e1fb',
	mentionPill: '#9c9ed040',
	mentionBg: '#9c9ed017',
	keyword: '#9c9ed040',
	code: '#111118',
	codeText: '#c3c5f0',
	spoiler: '#363646',
	spoilerRevealed: '#292936',
	positive: '#8fcfb4',
	warning: '#dcc98e',
	danger: '#e8798a',
	dangerFill: '#c25468',
	scrim: '#08080dcc',
}

const monoDay: Palette = {
	...day,
	rail: '#e1e1ec',
	floor: '#fafafd',
	panel: '#efeff6',
	page: '#efeff6',
	input: '#e9e9f2',
	control: '#dedee9',
	pressed: '#cfd0e0',
	heading: '#16161e',
	strong: '#1c1c26',
	text: '#33333f',
	subtle: '#53546a',
	muted: '#707187',
	faint: '#9fa0b3',
	divider: '#1c1c2614',
	border: '#1c1c2621',
	borderStrong: '#1c1c2640',
	accent: '#6f71b0',
	accentPress: '#5f61a0',
	onAccent: '#ffffff',
	accentSoft: '#6f71b026',
	accentText: '#4f5194',
	brand: '#5e60a0',
	rowIcon: '#4f5194',
	selection: '#6f71b026',
	link: '#4547a0',
	mentionText: '#3d3f92',
	mentionPill: '#6f71b033',
	mentionBg: '#6f71b01f',
	keyword: '#6f71b040',
	code: '#ececf4',
	codeText: '#4547a0',
	spoiler: '#c4c5d6',
	spoilerRevealed: '#dedee9',
	positive: '#24745a',
	warning: '#7a6418',
	danger: '#b0364c',
	dangerFill: '#c25468',
}

const monoStates = {
	...states,
	STATUS_ONLINE: '#8fcfb4',
	ICON_STATUS_ONLINE: '#8fcfb4',
	TEXT_STATUS_ONLINE: '#8fcfb4',
	STATUS_SPEAKING: '#8fcfb4',
	ICON_VOICE_SPEAKING: '#8fcfb4',
	ICON_STATUS_DND: '#e8798a',
	TEXT_STATUS_DND: '#e8798a',
	BADGE_NOTIFICATION_BACKGROUND: '#c25468',
}
const monoColors = lazyColors(monoTone, {
	dark: { palette: monoNight, extra: monoStates },
	darker: { palette: monoNight, extra: monoStates },
	midnight: { palette: monoNight, extra: monoStates },
	light: { palette: monoDay, extra: monoStates },
})

// ---------------------------------------------------------------------------------------------
// Glitch: the stream-glitch art. Deep magenta surfaces, hot pink accents and the glitch's cyan
// for links and mentions.

const hot = '#c2407f'
const cyan = '#7fe3ec'

const glitchTone: Tone = {
	greys: [
		['#000000', '#0c050b'],
		['#2c2d32', '#1b0d1b'],
		['#323339', '#231223'],
		['#393a41', '#2e182f'],
		['#41434a', '#381e39'],
		['#595a63', '#5c3b5c'],
		['#81828a', '#8c6a8b'],
		['#97979f', '#a685a4'],
		['#abacb2', '#bd9fbb'],
		['#c5c6ca', '#d6bfd4'],
		['#efeff1', '#f6e9f4'],
		['#f3f3f4', '#f9eff7'],
		['#fbfbfb', '#fdf8fc'],
		['#ffffff', '#ffffff'],
	],
	hues: {
		red: '#ff6b7d',
		orange: '#f39a76',
		yellow: '#f0d080',
		green: '#7fe0b4',
		teal: cyan,
		blue: '#88aaf5',
		blurple: '#b07fe6',
		purple: '#c47ae0',
		pink: '#ff8fc6',
	},
}

const glitchNight: Palette = {
	...night,
	rail: '#1b0d1b',
	floor: '#231223',
	panel: '#1f0f1f',
	page: '#2a162b',
	card: '#331b35',
	popup: '#3b203d',
	input: '#2e1830',
	control: '#45254a',
	pressed: '#532c58',
	strong: '#f9eff7',
	text: '#f0e1ee',
	subtle: '#d2b5cf',
	muted: '#ad8daa',
	faint: '#755a74',
	divider: '#ff8fc61a',
	border: '#ff8fc62e',
	borderStrong: '#ff8fc652',
	accent: hot,
	accentPress: '#ad366f',
	onAccent: '#ffffff',
	accentSoft: '#c2407f33',
	accentText: '#ff9ccc',
	brand: '#a8336b',
	rowIcon: '#ff9ccc',
	selection: '#c2407f2e',
	link: cyan,
	mentionText: '#c6f6fa',
	mentionPill: '#7fe3ec33',
	mentionBg: '#7fe3ec14',
	keyword: '#c2407f40',
	code: '#140814',
	codeText: cyan,
	spoiler: '#45254a',
	spoilerRevealed: '#331b35',
	positive: '#7fe0b4',
	warning: '#f0d080',
	danger: '#ff6b7d',
	dangerFill: '#c8384e',
	scrim: '#0c050bcc',
}

const glitchDay: Palette = {
	...day,
	rail: '#f1dfee',
	floor: '#fdf8fc',
	panel: '#f7ecf5',
	page: '#f7ecf5',
	input: '#f3e4f0',
	control: '#ead6e6',
	pressed: '#dfc3da',
	heading: '#200f1f',
	strong: '#271426',
	text: '#3e2a3d',
	subtle: '#62485f',
	muted: '#80677d',
	faint: '#ad97ab',
	divider: '#27142614',
	border: '#27142621',
	borderStrong: '#27142640',
	accent: hot,
	accentPress: '#ad366f',
	onAccent: '#ffffff',
	accentSoft: '#c2407f26',
	accentText: '#a32f68',
	brand: '#a8336b',
	rowIcon: '#a32f68',
	selection: '#c2407f24',
	link: '#0f7480',
	mentionText: '#0d6670',
	mentionPill: '#2fbfcc33',
	mentionBg: '#2fbfcc1f',
	keyword: '#c2407f40',
	code: '#f5e9f3',
	codeText: '#0f7480',
	spoiler: '#d6bfd4',
	spoilerRevealed: '#ead6e6',
	positive: '#1f7a55',
	warning: '#7a6418',
	danger: '#b5304a',
	dangerFill: '#c8384e',
}

const glitchStates = {
	...states,
	STATUS_ONLINE: '#7fe0b4',
	ICON_STATUS_ONLINE: '#7fe0b4',
	TEXT_STATUS_ONLINE: '#7fe0b4',
	STATUS_SPEAKING: '#7fe0b4',
	ICON_VOICE_SPEAKING: '#7fe0b4',
	ICON_STATUS_DND: '#ff6b7d',
	TEXT_STATUS_DND: '#ff6b7d',
	BADGE_NOTIFICATION_BACKGROUND: hot,
}
const glitchColors = lazyColors(glitchTone, {
	dark: { palette: glitchNight, extra: glitchStates },
	darker: { palette: glitchNight, extra: glitchStates },
	midnight: { palette: glitchNight, extra: glitchStates },
	light: { palette: glitchDay, extra: glitchStates },
})


// ---------------------------------------------------------------------------------------------
// Red: the red-background art. Deep wine surfaces, the art's crimson for buttons and rose links.

const crimson = '#c8233c'
const rose = '#ff9aa8'

const redTone: Tone = {
	greys: [
		['#000000', '#0d0506'],
		['#2c2d32', '#1c0b0e'],
		['#323339', '#241014'],
		['#393a41', '#2f161b'],
		['#41434a', '#391c22'],
		['#595a63', '#5e3a40'],
		['#81828a', '#8e6a6f'],
		['#97979f', '#a8868a'],
		['#abacb2', '#bea0a3'],
		['#c5c6ca', '#d6bec0'],
		['#efeff1', '#f6eaeb'],
		['#f3f3f4', '#f9eff0'],
		['#fbfbfb', '#fdf8f8'],
		['#ffffff', '#ffffff'],
	],
	hues: {
		red: '#ff6b7d',
		orange: '#f39a76',
		yellow: '#f0d080',
		green: '#7fd8b0',
		teal: '#86cfcf',
		blue: '#8aa6f0',
		blurple: '#a98ae0',
		purple: '#c47ae0',
		pink: rose,
	},
}

const redNight: Palette = {
	...night,
	rail: '#1c0b0e',
	floor: '#241014',
	panel: '#200d11',
	page: '#2b141a',
	card: '#341a20',
	popup: '#3c1f26',
	input: '#2f161b',
	control: '#47262e',
	pressed: '#552d36',
	strong: '#f9eff0',
	text: '#efe1e2',
	subtle: '#d3b5b8',
	muted: '#ad8d91',
	faint: '#755a5e',
	divider: '#ff9aa81a',
	border: '#ff9aa82e',
	borderStrong: '#ff9aa852',
	accent: crimson,
	accentPress: '#b01f35',
	onAccent: '#ffffff',
	accentSoft: '#c8233c33',
	accentText: rose,
	brand: '#a81d33',
	rowIcon: rose,
	selection: '#c8233c2e',
	link: rose,
	mentionText: '#ffd0d6',
	mentionPill: '#ff9aa833',
	mentionBg: '#ff9aa814',
	keyword: '#c8233c40',
	code: '#140708',
	codeText: rose,
	spoiler: '#47262e',
	spoilerRevealed: '#341a20',
	positive: '#7fd8b0',
	warning: '#f0d080',
	danger: '#ff6b7d',
	dangerFill: '#b81e36',
	scrim: '#0d0506cc',
}

const redDay: Palette = {
	...day,
	rail: '#f3dfe1',
	floor: '#fdf8f8',
	panel: '#f9ecee',
	page: '#f9ecee',
	input: '#f5e4e6',
	control: '#ecd5d8',
	pressed: '#e0c1c5',
	heading: '#220c10',
	strong: '#2a1015',
	text: '#432a2e',
	subtle: '#674a4e',
	muted: '#86686c',
	faint: '#b2989b',
	divider: '#2a101514',
	border: '#2a101521',
	borderStrong: '#2a101540',
	accent: crimson,
	accentPress: '#b01f35',
	onAccent: '#ffffff',
	accentSoft: '#c8233c26',
	accentText: '#a81d33',
	brand: '#a81d33',
	rowIcon: '#a81d33',
	selection: '#c8233c24',
	link: '#a81d33',
	mentionText: '#8e1a2c',
	mentionPill: '#c8233c33',
	mentionBg: '#c8233c1f',
	keyword: '#c8233c40',
	code: '#f7eaec',
	codeText: '#a81d33',
	spoiler: '#d6bec0',
	spoilerRevealed: '#ecd5d8',
	positive: '#1f7a55',
	warning: '#7a6418',
	danger: '#b5304a',
	dangerFill: '#b81e36',
}

const redStates = {
	...states,
	STATUS_ONLINE: '#7fd8b0',
	ICON_STATUS_ONLINE: '#7fd8b0',
	TEXT_STATUS_ONLINE: '#7fd8b0',
	STATUS_SPEAKING: '#7fd8b0',
	ICON_VOICE_SPEAKING: '#7fd8b0',
	ICON_STATUS_DND: '#ff6b7d',
	TEXT_STATUS_DND: '#ff6b7d',
	BADGE_NOTIFICATION_BACKGROUND: crimson,
}
const redColors = lazyColors(redTone, {
	dark: { palette: redNight, extra: redStates },
	darker: { palette: redNight, extra: redStates },
	midnight: { palette: redNight, extra: redStates },
	light: { palette: redDay, extra: redStates },
})


// ---------------------------------------------------------------------------------------------
// Blue, Noir and Pixel: built from a tone, an accent and a few surface colours each.

/** Greys from darkest to lightest, as theme colours for Discord's 14 grey stops. */
function greysOf(stops: string[]): [string, string][] {
	const discord = ['#000000', '#2c2d32', '#323339', '#393a41', '#41434a', '#595a63', '#81828a', '#97979f', '#abacb2', '#c5c6ca', '#efeff1', '#f3f3f4', '#fbfbfb', '#ffffff']
	return discord.map((d, i) => [d, stops[i]] as [string, string])
}

interface Look2 {
	greys: string[]
	hues: Tone['hues']
	surfaces: Pick<Palette, 'rail' | 'floor' | 'panel' | 'page' | 'card' | 'popup' | 'input' | 'control' | 'pressed'>
	text: Pick<Palette, 'strong' | 'text' | 'subtle' | 'muted' | 'faint'>
	accent: string
	accentPress: string
	onAccent: string
	accentText: string
	brand: string
	link: string
	mention: string
	keyword: string
	unread: string
	day: { accent: string; accentText: string; link: string; mention: string; tint: string }
}

function colorsOf(l: Look2) {
	const hexA = (hex: string, a: string) => hex.slice(0, 7) + a
	const n: Palette = {
		...night,
		...l.surfaces,
		...l.text,
		divider: hexA(l.link, '1a'),
		border: hexA(l.link, '2e'),
		borderStrong: hexA(l.link, '52'),
		accent: l.accent,
		accentPress: l.accentPress,
		onAccent: l.onAccent,
		accentSoft: hexA(l.accent, '33'),
		accentText: l.accentText,
		brand: l.brand,
		rowIcon: l.accentText,
		selection: hexA(l.accent, '2e'),
		link: l.link,
		mentionText: l.mention,
		mentionPill: hexA(l.link, '33'),
		mentionBg: hexA(l.link, '14'),
		keyword: hexA(l.keyword, '40'),
		code: l.surfaces.rail,
		codeText: l.link,
		spoiler: l.surfaces.control,
		spoilerRevealed: l.surfaces.card,
		dangerFill: l.unread,
		scrim: hexA(l.surfaces.rail, 'cc'),
	}
	const d: Palette = {
		...day,
		rail: l.day.tint,
		accent: l.day.accent,
		accentPress: l.day.accent,
		onAccent: '#ffffff',
		accentSoft: hexA(l.day.accent, '26'),
		accentText: l.day.accentText,
		brand: l.brand,
		rowIcon: l.day.accentText,
		selection: hexA(l.day.accent, '24'),
		link: l.day.link,
		mentionText: l.day.mention,
		mentionPill: hexA(l.day.accent, '33'),
		mentionBg: hexA(l.day.accent, '1f'),
		keyword: hexA(l.keyword, '40'),
		codeText: l.day.link,
		dangerFill: l.unread,
	}
	const st = { ...states, BADGE_NOTIFICATION_BACKGROUND: l.unread }
	const tone: Tone = { greys: greysOf(l.greys), hues: l.hues }
	return lazyColors(tone, {
		dark: { palette: n, extra: st },
		darker: { palette: n, extra: st },
		midnight: { palette: n, extra: st },
		light: { palette: d, extra: st },
	})
}

const blueColors = colorsOf({
	greys: ['#000000', '#0a0d12', '#0e1218', '#151a22', '#1b212b', '#36404f', '#66727f', '#808b99', '#99a4b2', '#b8c1cd', '#e8edf3', '#f0f3f7', '#f9fafc', '#ffffff'],
	hues: { red: '#ff6b7d', orange: '#f39a76', yellow: '#f0d080', green: '#7fd8b0', teal: '#86cfdc', blue: '#7fa9e0', blurple: '#8ea0ec', purple: '#b08ae0', pink: '#e89ab8' },
	surfaces: { rail: '#0a0d12', floor: '#0e1218', panel: '#0c1015', page: '#131820', card: '#191f29', popup: '#1f2632', input: '#141920', control: '#25303e', pressed: '#2f3c4d' },
	text: { strong: '#f0f3f7', text: '#dfe5ec', subtle: '#b6c0cc', muted: '#8d98a6', faint: '#5c6676' },
	accent: '#6f9fd0',
	accentPress: '#5f8fc0',
	onAccent: '#08111c',
	accentText: '#a9c8ec',
	brand: '#3f6f9a',
	link: '#8fb8e6',
	mention: '#cfe2f7',
	keyword: '#b5374f',
	unread: '#c2405a',
	day: { accent: '#3f6f9a', accentText: '#2f5a82', link: '#2a5a8a', mention: '#24507c', tint: '#e2e8f0' },
})

const noirColors = colorsOf({
	greys: ['#000000', '#0b0b0c', '#121213', '#1a1a1c', '#222224', '#3e3e42', '#6e6e74', '#88888e', '#a2a2a8', '#c0c0c5', '#ececee', '#f3f3f4', '#fbfbfb', '#ffffff'],
	hues: { red: '#ff5a5f', orange: '#f39a76', yellow: '#f0d080', green: '#7fd8b0', teal: '#86cfcf', blue: '#8aa6f0', blurple: '#a98ae0', purple: '#c47ae0', pink: '#ff8fa8' },
	surfaces: { rail: '#0b0b0c', floor: '#121213', panel: '#0f0f10', page: '#171718', card: '#1e1e20', popup: '#252527', input: '#19191a', control: '#2c2c2f', pressed: '#37373b' },
	text: { strong: '#f3f3f4', text: '#e4e4e6', subtle: '#bdbdc2', muted: '#94949a', faint: '#606066' },
	accent: '#d81e28',
	accentPress: '#bf1a23',
	onAccent: '#ffffff',
	accentText: '#ff7a7f',
	brand: '#a3161e',
	link: '#ff8085',
	mention: '#ffd0d2',
	keyword: '#d81e28',
	unread: '#d81e28',
	day: { accent: '#b8161f', accentText: '#a3161e', link: '#a3161e', mention: '#8e131a', tint: '#ecebeb' },
})

const pixelColors = colorsOf({
	greys: ['#000000', '#100e11', '#18161a', '#211e23', '#2a262c', '#463f48', '#76697a', '#8f8293', '#a99cac', '#c7bcc9', '#f1eaf2', '#f6f0f6', '#fcf9fc', '#ffffff'],
	hues: { red: '#ff6b85', orange: '#f39a76', yellow: '#f0d080', green: '#7fd8b0', teal: '#86cfcf', blue: '#8aa6f0', blurple: '#a98ae0', purple: '#c47ae0', pink: '#f08fb0' },
	surfaces: { rail: '#100e11', floor: '#18161a', panel: '#141215', page: '#1e1b20', card: '#262229', popup: '#2d2930', input: '#1c191e', control: '#352f38', pressed: '#423a46' },
	text: { strong: '#f6f0f6', text: '#eae0ea', subtle: '#c6b6c8', muted: '#9e8ea1', faint: '#695c6c' },
	accent: '#c43c63',
	accentPress: '#ad3457',
	onAccent: '#ffffff',
	accentText: '#f39ab5',
	brand: '#a12b4d',
	link: '#f5a3bc',
	mention: '#ffd6e2',
	keyword: '#c43c63',
	unread: '#c43c63',
	day: { accent: '#a12b4d', accentText: '#8f2544', link: '#8f2544', mention: '#7c1f3b', tint: '#eee4ec' },
})

// Rose: the art of her in a wine dress holding a rose. True black (AMOLED) surfaces with a
// breath of violet from her hair for cards, the dress and rose crimson for buttons, and her
// hair's violet for links and mentions so they stand apart from the red.
const roseColors = colorsOf({
	greys: ['#000000', '#0a080c', '#100d13', '#17131b', '#1e1923', '#3a3240', '#6a6070', '#857b8b', '#a096a6', '#bfb6c4', '#ece8ef', '#f3f0f5', '#fbfafc', '#ffffff'],
	hues: { red: '#ff5a6a', orange: '#f39a76', yellow: '#f0d080', green: '#7fd8b0', teal: '#86cfcf', blue: '#8aa6f0', blurple: '#a798e8', purple: '#b48ae6', pink: '#ff8fa8' },
	surfaces: { rail: '#000000', floor: '#000000', panel: '#000000', page: '#000000', card: '#0d0a10', popup: '#130f17', input: '#09070b', control: '#1c1622', pressed: '#271f2f' },
	text: { strong: '#f4f1f6', text: '#e6e1ea', subtle: '#bfb6c6', muted: '#958b9c', faint: '#5f5666' },
	accent: '#b0182c',
	accentPress: '#97142a',
	onAccent: '#ffffff',
	accentText: '#ff8f9c',
	brand: '#8a1426',
	link: '#b8a4ec',
	mention: '#e3d8ff',
	keyword: '#c41e34',
	unread: '#c41e34',
	day: { accent: '#a3162a', accentText: '#8f1325', link: '#5a3f9a', mention: '#4c3486', tint: '#efebf1' },
})

export default plugin({
	preInit({ themes }) {
		themes.registerGroup('ame', {
			name: 'Ame-chan',
			description: 'NEEDY STREAMER OVERLOAD · plum, cherry red and gold.',
		})
		themes.registerTheme('ame', 'ame', {
			name: 'Ame-chan',
			description: 'Plum surfaces, cherry-red accents, gold links. Simple and readable.',
			getColors: colors,
		})
		themes.registerTheme('ame', 'ame-background', {
			name: 'Ame-chan (Background, top)',
			description: 'The same colours with Ame-chan in the top corner, dimmed so text stays readable.',
			getColors: colors,
			background: {
				path: 'assets/ame.jpg',
				opacity: 1,
				blur: 0,
				dimming: 0.78,
			},
		})
		themes.registerTheme('ame', 'ame-background-bottom', {
			name: 'Ame-chan (Background, bottom)',
			description: 'Ame-chan in the bottom corner instead, her hair fading into the purple so the top of the chat stays clear.',
			getColors: colors,
			background: {
				path: 'assets/ame-bottom.jpg',
				opacity: 1,
				blur: 0,
				dimming: 0.78,
			},
		})
		themes.registerTheme('ame', 'ame-mono', {
			name: 'Ame-chan Purple',
			description: 'Soft purple and slate, from the sketch art.',
			getColors: monoColors,
		})
		themes.registerTheme('ame', 'ame-mono-background', {
			name: 'Ame-chan Purple (Background)',
			description: 'The sketch art without its white frame, at the bottom of the screen.',
			getColors: monoColors,
			background: {
				path: 'assets/ame-mono.jpg',
				opacity: 1,
				blur: 0,
				dimming: 0.78,
			},
		})
		themes.registerTheme('ame', 'ame-glitch', {
			name: 'Ame-chan Glitch',
			description: 'Deep magenta, hot pink and glitch cyan.',
			getColors: glitchColors,
		})
		themes.registerTheme('ame', 'ame-glitch-background', {
			name: 'Ame-chan Glitch (Background)',
			description: 'The glitch art at the bottom of the screen, fading into grainy magenta.',
			getColors: glitchColors,
			background: {
				path: 'assets/ame-glitch.jpg',
				opacity: 1,
				blur: 0,
				dimming: 0.78,
			},
		})
		themes.registerTheme('ame', 'ame-red', {
			name: 'Ame-chan Red',
			description: 'Deep wine, crimson and rose.',
			getColors: redColors,
		})
		themes.registerTheme('ame', 'ame-red-background', {
			name: 'Ame-chan Red (Background)',
			description: 'The red art at the bottom of the screen, on the same red.',
			getColors: redColors,
			background: {
				path: 'assets/ame-red.jpg',
				opacity: 1,
				blur: 0,
				dimming: 0.78,
			},
		})
		themes.registerTheme('ame', 'ame-blue', {
			name: 'Ame-chan Blue',
			description: 'Near-black with her blue hair for accents and a touch of red.',
			getColors: blueColors,
		})
		themes.registerTheme('ame', 'ame-blue-background', {
			name: 'Ame-chan Blue (Background)',
			description: 'The blue-haired art at the bottom of the screen, on black.',
			getColors: blueColors,
			background: {
				path: 'assets/ame-blue.jpg',
				opacity: 1,
				blur: 0,
				dimming: 0.78,
			},
		})
		themes.registerTheme('ame', 'ame-noir', {
			name: 'Ame-chan Noir',
			description: 'Charcoal and black with bright swirl red.',
			getColors: noirColors,
		})
		themes.registerTheme('ame', 'ame-noir-background', {
			name: 'Ame-chan Noir (Background)',
			description: 'The red-swirl art at the top of the screen, fading into black.',
			getColors: noirColors,
			background: {
				path: 'assets/ame-noir.jpg',
				opacity: 1,
				blur: 0,
				dimming: 0.78,
			},
		})
		themes.registerTheme('ame', 'ame-rose', {
			name: 'Ame-chan Rose',
			description: 'True black (AMOLED) with rose crimson and violet, from the wine-dress art.',
			getColors: roseColors,
		})
		themes.registerTheme('ame', 'ame-rose-background', {
			name: 'Ame-chan Rose (Background)',
			description: 'Her in the wine dress with a rose, melting into true black.',
			getColors: roseColors,
			background: {
				path: 'assets/ame-rose.jpg',
				opacity: 1,
				blur: 0,
				dimming: 0.75,
			},
		})
		themes.registerTheme('ame', 'ame-pixel', {
			name: 'Ame-chan Pixel',
			description: 'Charcoal with raspberry pink, from the pixel-window art.',
			getColors: pixelColors,
		})
		themes.registerTheme('ame', 'ame-pixel-background', {
			name: 'Ame-chan Pixel (Background)',
			description: 'The pixel-window art in the middle of the screen, on its charcoal.',
			getColors: pixelColors,
			background: {
				path: 'assets/ame-pixel.jpg',
				opacity: 1,
				blur: 0,
				dimming: 0.78,
			},
		})
	},
})
