import { useEffect, useState } from 'react'
import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'

/**
 * Tracks per-message interactive reveal states:
 * - revealedBlocks: message block spoiler lifted temporarily (restored on whitespace tap)
 * - displayedImages: image display toggled via the post-timestamp indicator
 */
const revealedBlocks = new Set<string>()
const displayedImages = new Set<string>()
const listeners = new Set<() => void>()
let revision = 0

function emitChange() {
  revision += 1
  for (const listener of listeners) {
    listener()
  }
}

export function isBlockRevealed(messageId: string): boolean {
  return revealedBlocks.has(messageId)
}

export function revealBlock(messageId: string): void {
  if (revealedBlocks.has(messageId)) return
  revealedBlocks.add(messageId)
  emitChange()
}

export function collapseBlock(messageId: string): void {
  if (!revealedBlocks.delete(messageId)) return
  emitChange()
}

export function isImageDisplayed(messageId: string): boolean {
  return displayedImages.has(messageId)
}

export function toggleImageDisplayed(messageId: string): boolean {
  const next = !displayedImages.has(messageId)
  if (next) {
    displayedImages.add(messageId)
  } else {
    displayedImages.delete(messageId)
  }
  emitChange()
  refreshActiveChannelRows()
  return next
}

export function resetTransientMessageState(): void {
  revealedBlocks.clear()
  displayedImages.clear()
  emitChange()
}

export function useMessageStateRevision(): number {
  const [rev, setRev] = useState(revision)
  useEffect(() => {
    const listener = () => setRev(revision)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return rev
}

/**
 * Requests Discord mobile's chat list to re-evaluate visible rows after
 * toggling a hidden user or clicking the post-timestamp indicator.
 */
export function refreshActiveChannelRows(): void {
  try {
    const selectedChannelStore = (Stores as Record<string, any>).SelectedChannelStore
    const channelId = selectedChannelStore?.getChannelId?.()
    if (!channelId) return
    Dispatcher?.dispatch?.({
      type: 'MESSAGE_UPDATE',
      message: { id: '__valenced_hide_refresh__', channel_id: channelId },
    })
  } catch {
    // Non-fatal if dispatcher isn't ready yet
  }
}
