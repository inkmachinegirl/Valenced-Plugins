import { findModule } from './find'

/**
 * Wraps chat handlers on Discord's `MessagesHandlers` instances (one per open chat).
 *
 * `modules/messages/native/MessagesHandlers.tsx` exports a class whose constructor builds every
 * handler (handleDoubleTapMessage, handleLongPressMessage, ...) as an own property, so patching the
 * prototype does nothing. Its `params` getter, though, lives on the prototype and is first read by
 * the chat rows after every handler exists; that read is where each instance is caught and its
 * handlers wrapped. (UI Tweaks documents this on 350.4.) The getter is chained, not replaced, so
 * another plugin doing the same keeps working, and an instance already wrapped by another plugin
 * gets this wrapper around theirs.
 */

const PATH = 'modules/messages/native/MessagesHandlers.tsx'
const MARK = Symbol.for('dev.ketsuyumi.tap-to-react.wrapped')

export type Wrapper = (
	instance: any,
	original: (...args: any[]) => unknown,
) => (...args: any[]) => unknown

const wrappers = new Map<string, Wrapper>()
export let handlerStatus = 'Waiting for the chat to open'
/** Whether Discord has passed a plain message tap to the plugin yet. */
export let tapSeen = false
export const noteTap = () => {
	tapSeen = true
}

function wrapInstance(instance: any) {
	if (!instance || typeof instance !== 'object') return
	const done: Set<string> = instance[MARK] ?? new Set()
	for (const [key, wrapper] of wrappers) {
		if (done.has(key)) continue
		const current = instance[key]
		if (typeof current !== 'function') continue
		const wrapped = wrapper(instance, current)
		try {
			Object.defineProperty(instance, key, {
				value: wrapped,
				writable: true,
				configurable: true,
				enumerable: true,
			})
			done.add(key)
		} catch {}
	}
	try {
		Object.defineProperty(instance, MARK, {
			value: done,
			configurable: true,
		})
	} catch {}
	if (done.size) handlerStatus = `Hooked (${[...done].join(', ')})`
}

/** Installs the trap. Returns the undo. */
export function installHandlers(map: Record<string, Wrapper>): () => void {
	for (const [key, wrapper] of Object.entries(map)) wrappers.set(key, wrapper)
	let restore: (() => void) | undefined
	const undo = findModule(PATH, ['MessagesHandlers'], (mod: any) => {
		const proto = (mod?.MessagesHandlers ?? mod?.default?.MessagesHandlers)
			?.prototype
		const descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'params')
		if (!descriptor?.get) {
			handlerStatus =
				"Not available: Discord's chat handlers have a different shape here"
			return
		}
		const previousGet = descriptor.get
		Object.defineProperty(proto, 'params', {
			configurable: true,
			enumerable: descriptor.enumerable,
			get(this: any) {
				if (this !== proto && wrappers.size)
					try {
						wrapInstance(this)
					} catch {}
				return previousGet.call(this)
			},
			set: descriptor.set,
		})
		handlerStatus = 'Ready: open or switch to a chat once'
		restore = () => {
			const now = Object.getOwnPropertyDescriptor(proto, 'params')
			// Only put the old getter back if nobody chained on top of ours since.
			if (now?.get && now.get !== previousGet)
				Object.defineProperty(proto, 'params', descriptor)
		}
	})
	return () => {
		wrappers.clear()
		undo()
		restore?.()
	}
}

/** The message and channel an event is about, from the handlers' own lookup. */
export function targetOf(instance: any, event: any) {
	const raw = event?.nativeEvent ?? event
	const messageId = raw?.messageId != null ? String(raw.messageId) : undefined
	const data = messageId ? instance?.getMessageData?.(messageId) : undefined
	const message = data?.message
	const channel = data?.messageChannel ?? data?.channel
	return { messageId, message, channel }
}
