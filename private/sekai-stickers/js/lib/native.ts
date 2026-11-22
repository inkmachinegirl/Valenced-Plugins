/**
 * The sticker renderer. Upstream draws with a Kotlin class (SekaiStickers.kt); Valenced can't load
 * native code, so this fork draws on a <canvas> in a hidden WebView (ui/Renderer.tsx) with the
 * maker's own fonts, loaded from TheOriginalAyaka/sekai-stickers on GitHub. The API is the same as
 * upstream's native half, so the panel barely changed.
 *
 * - The text layout is lib/design.ts `layout`, computed here and sent as pieces, so the PNG and the
 *   live preview use the same maths.
 * - PNGs are written with Discord's NativeFileModule (base64), to `cache` for a send and to
 *   `documents` for Saved stickers.
 */

import { rm } from '@valenced/modules/native/fs'
import { TurboModuleRegistry } from 'react-native'
import { layout } from './design'
import { reportError } from '../shared/report'

export const ASSET_BASE =
	'https://raw.githubusercontent.com/TheOriginalAyaka/sekai-stickers/main/'
export const IMAGE_HOST = `${ASSET_BASE}public/img/`

export interface RenderOptions {
	/** Picture path under public/img, like `airi/Airi_01.png`. */
	img: string
	text: string
	/** Middle of the text, in sticker pixels (296x256). */
	x: number
	y: number
	/** Tenths of a radian, -10..10, as the web maker uses. */
	rotate: number
	size: number
	/** Gap between lines, as a percentage of the font size. */
	lineSpacing: number
	/** -100..100; 0 is straight, positive arches up, negative dips down. */
	bend: number
	/** The picture's size (percent of fitted) and offset in sticker pixels. */
	imageScale: number
	imageX: number
	imageY: number
	color: string
}

export interface Rendered {
	path: string
	width: number
	height: number
}

export interface FontMetrics {
	/** React Native font family for the preview; none here (the WebView has the font, RN doesn't). */
	font?: string
	/** Text box above and below the baseline, as fractions of the font size. */
	ascent: number
	descent: number
}

// ---- The bridge to the WebView (ui/Renderer.tsx mounts it and calls attachRenderer) ----

type Send = (script: string) => void
interface Pending {
	resolve: (value: any) => void
	reject: (error: Error) => void
	timer: ReturnType<typeof setTimeout>
}

let send: Send | undefined
let ready = false
const waiting: Array<() => void> = []
const pending = new Map<number, Pending>()
let nextId = 1

/** The WebView is up and its fonts are loaded (or failed to; it then draws with a fallback). */
export function attachRenderer(fn: Send | undefined) {
	send = fn
	if (!fn) ready = false
}

export function rendererReady(info: { ascent?: number; descent?: number }) {
	ready = true
	if (info?.ascent && info?.descent)
		metrics = { ascent: info.ascent, descent: info.descent }
	resolveMetrics?.(metrics)
	for (const run of waiting.splice(0)) run()
}

export function rendererMessage(raw: string) {
	let data: any
	try {
		data = JSON.parse(raw)
	} catch {
		return
	}
	if (data?.type === 'ready') return rendererReady(data)
	if (data?.type === 'log')
		return reportError(`[Sekai Stickers] renderer: ${data.message}`)
	const job = pending.get(data?.id)
	if (!job) return
	pending.delete(data.id)
	clearTimeout(job.timer)
	if (data.error) job.reject(new Error(data.error))
	else job.resolve(data.result)
}

function call<T>(kind: string, payload: unknown, timeout = 20000): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const id = nextId++
		const timer = setTimeout(() => {
			pending.delete(id)
			reject(
				new Error(
					ready
						? 'the renderer took too long'
						: "the renderer didn't start (no internet?)",
				),
			)
		}, timeout)
		pending.set(id, { resolve, reject, timer })
		const go = () => {
			try {
				send?.(
					`window.__sekai&&window.__sekai(${JSON.stringify({ id, kind, payload })});true;`,
				)
			} catch (error: any) {
				pending.delete(id)
				clearTimeout(timer)
				reject(error instanceof Error ? error : new Error(String(error)))
			}
		}
		if (ready && send) go()
		else waiting.push(go)
	})
}

// ---- Files ----

const files = (): any => {
	try {
		return (TurboModuleRegistry as any).get('NativeFileModule')
	} catch {
		return undefined
	}
}

async function writePng(
	where: 'cache' | 'documents',
	name: string,
	dataUrl: string,
): Promise<string> {
	const fm = files()
	if (typeof fm?.writeFile !== 'function')
		throw new Error("Discord's file writer wasn't found")
	const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
	const path = await fm.writeFile(where, name, b64, 'base64')
	return String(path).replace(/^file:\/\//, '')
}

// ---- Drawing ----

const WIDTH = 296
const HEIGHT = 256

function job(options: RenderOptions) {
	const design = { v: 2 as const, ...options }
	return {
		img: IMAGE_HOST + options.img,
		color: options.color,
		x: options.x,
		y: options.y,
		rotate: options.rotate,
		size: options.size,
		imageScale: options.imageScale ?? 100,
		imageX: options.imageX ?? 0,
		imageY: options.imageY ?? 0,
		ascent: metrics.ascent,
		descent: metrics.descent,
		pieces: layout(
			design as any,
			metrics,
			l => widths.get(l) ?? (l.charCodeAt(0) < 0x2e80 ? 0.55 : 1),
		),
	}
}

async function draw(options: RenderOptions): Promise<string> {
	if (options.bend)
		await measureLetters(Array.from(options.text.replace(/\n/g, '')))
	return call<string>('render', job(options))
}

/** A PNG data URL of the sticker, for the editor's preview. */
export function previewSticker(options: RenderOptions): Promise<string> {
	return draw(options)
}

let counter = 0
/** Last rendered data URL per path, so keepRender can copy without reading the file back. */
const recent = new Map<string, string>()
const remember = (path: string, url: string) => {
	recent.set(path, url)
	if (recent.size > 8) recent.delete(recent.keys().next().value!)
}

/** Draws the sticker to a PNG in the cache, ready to attach. */
export async function renderSticker(options: RenderOptions): Promise<Rendered> {
	const url = await draw(options)
	const name = `sekai-${Date.now().toString(36)}${(++counter).toString(36)}.png`
	const path = await writePng('cache', name, url)
	remember(path, url)
	return { path, width: WIDTH, height: HEIGHT }
}

const savedName = (id: string) =>
	`sekai-saved-${id.replace(/[^a-z0-9]/gi, '')}.png`

/** Stores a render with Saved stickers (`documents`); returns the new path. */
export async function keepRender(path: string, id: string): Promise<string> {
	const url = recent.get(path)
	if (!url) throw new Error('render first')
	return writePng('documents', savedName(id), url)
}

/** Deletes a saved sticker's PNG. */
export async function forgetRender(path: string): Promise<boolean> {
	try {
		return await rm(path.replace(/^file:\/\//, ''))
	} catch {
		return false
	}
}

/** A fresh copy of a saved sticker to send, drawn again from its saved design. */
export async function reuseSaved(
	id: string,
	design?: RenderOptions,
): Promise<Rendered> {
	if (!design) throw new Error(`saved sticker ${id} wasn't found`)
	return renderSticker(design)
}

// ---- Font measurements ----

// YurukaStd's own hhea numbers, used until the WebView answers.
let metrics: FontMetrics = { ascent: 0.88, descent: 0.12 }
let resolveMetrics: ((m: FontMetrics) => void) | undefined
const metricsLoaded = new Promise<FontMetrics>(resolve => {
	resolveMetrics = resolve
})

export function fontMetrics(): FontMetrics {
	return metrics
}

/** Resolves once the renderer has loaded the font and measured it. */
export function loadFontMetrics(): Promise<FontMetrics> {
	return metricsLoaded
}

const widths = new Map<string, number>()

/** A letter's width as a fraction of the font size, or undefined until [measureLetters] has it. */
export function letterWidth(letter: string): number | undefined {
	return widths.get(letter)
}

/** Measures any of [letters] not measured yet. Resolves true if something new came back. */
export async function measureLetters(letters: string[]): Promise<boolean> {
	const missing = [...new Set(letters)].filter(letter => !widths.has(letter))
	if (!missing.length) return false
	const result = await call<Record<string, number>>('measure', missing)
	for (const [letter, width] of Object.entries(result ?? {}))
		widths.set(letter, Number(width))
	return true
}
