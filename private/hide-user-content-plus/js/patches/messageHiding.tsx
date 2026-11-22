import { getAssetIdByName } from '@valenced/assets'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { insteadJSX } from '@valenced/react/jsx-runtime'
import { findInTree } from '@valenced/utils/tree'
import { cloneElement, isValidElement } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  collapseBlock,
  isBlockRevealed,
  isImageDisplayed,
  revealBlock,
  toggleImageDisplayed,
  useMessageStateRevision,
} from '../state'
import { getCachedSettings, shouldHideMessage } from '../storage'
import type { DiscordMessageLike } from '../types'
import type { FC, ReactElement, ReactNode } from 'react'
import type { GestureResponderEvent } from 'react-native'

const styles = StyleSheet.create({
  indicatorButton: {
    marginLeft: 4,
    paddingHorizontal: 2,
    paddingVertical: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  indicatorIcon: {
    width: 13,
    height: 13,
    tintColor: '#949BA4',
  },
  indicatorIconActive: {
    tintColor: '#DBDEE1',
  },
  spoilerBlockOverlay: {
    backgroundColor: '#2B2D31',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  revealedBlockWrapper: {
    borderRadius: 8,
    paddingVertical: 2,
  },
  blurredImageWrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
  },
  blurredScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 18, 20, 0.35)',
  },
  fallbackGlyph: {
    color: '#949BA4',
    fontSize: 12,
    fontWeight: '600',
  },
})

function hasImageMedia(message?: DiscordMessageLike): boolean {
  if (!message) return false
  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    return message.attachments.some(
      att => !att.content_type || att.content_type.startsWith('image/'),
    )
  }
  if (Array.isArray(message.embeds) && message.embeds.length > 0) {
    return message.embeds.some(embed => Boolean(embed.image || embed.thumbnail))
  }
  return false
}

/**
 * Post-timestamp indicator modeled after Discord's @silent message bell.
 * Tapping toggles displaying the image for this message.
 */
function HiddenMediaIndicator({ messageId }: { messageId: string }) {
  useMessageStateRevision()
  const displayed = isImageDisplayed(messageId)
  const iconAsset = getAssetIdByName(displayed ? 'EyeIcon' : 'EyeSlashIcon')

  return (
    <Pressable
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={displayed ? 'Hide image' : 'Show hidden image'}
      style={styles.indicatorButton}
      onPress={(e: GestureResponderEvent) => {
        e?.stopPropagation?.()
        toggleImageDisplayed(messageId)
      }}
    >
      {iconAsset ? (
        <Image
          source={iconAsset}
          style={[styles.indicatorIcon, displayed && styles.indicatorIconActive]}
        />
      ) : (
        <Text style={styles.fallbackGlyph}>{displayed ? '◉' : '⊘'}</Text>
      )}
    </Pressable>
  )
}

/**
 * Isolates interactive child nodes (inline text spoilers and image media viewers)
 * so tapping them stops propagation and does not trigger the parent whitespace
 * Pressable that restores the message-block spoiler overlay.
 */
function isolateInteractiveChildren(
  node: ReactNode,
  imageMode: 'hidden' | 'blurred',
  imageDisplayed: boolean,
): ReactNode {
  if (
    node == null ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number'
  ) {
    return node
  }
  if (Array.isArray(node)) {
    return node.map(child =>
      isolateInteractiveChildren(child, imageMode, imageDisplayed),
    )
  }
  if (!isValidElement(node)) return node

  const props = (node.props ?? {}) as Record<string, any>
  const typeName =
    typeof node.type === 'function'
      ? (node.type as any).displayName || node.type.name || ''
      : String(node.type ?? '')

  const isSpoilerNode =
    /spoiler/i.test(typeName) || Boolean(props.isSpoiler) || Boolean(props.spoiler)

  const isMediaNode =
    node.type === Image ||
    /attachment|media|image/i.test(typeName) ||
    Boolean(props.attachment) ||
    Boolean(props.media)

  if (isMediaNode) {
    if (!imageDisplayed && imageMode === 'blurred') {
      return (
        <View
          style={styles.blurredImageWrap}
          onStartShouldSetResponder={() => true}
        >
          {cloneElement(node as ReactElement<any>, {
            blurRadius: 28,
            onPress: (e: GestureResponderEvent) => {
              e?.stopPropagation?.()
              props.onPress?.(e)
            },
          })}
          <View pointerEvents="none" style={styles.blurredScrim} />
        </View>
      )
    }
  }

  if (typeof props.onPress === 'function' || isSpoilerNode || isMediaNode) {
    const originalOnPress = props.onPress
    const nextChildren = props.children
      ? isolateInteractiveChildren(props.children, imageMode, imageDisplayed)
      : props.children

    return cloneElement(node as ReactElement<any>, {
      children: nextChildren,
      onPress: (e: GestureResponderEvent) => {
        e?.stopPropagation?.()
        originalOnPress?.(e)
      },
    })
  }

  if (props.children !== undefined) {
    return cloneElement(node as ReactElement<any>, {
      children: isolateInteractiveChildren(props.children, imageMode, imageDisplayed),
    })
  }

  return node
}

/**
 * Covers the entire message block background (text + attachments) with a spoiler overlay.
 * - Tapping the spoiler overlay reveals the block.
 * - Inside a revealed block, text spoilers and image taps stop propagation so they still work.
 * - Tapping whitespace restores the spoiler overlay.
 */
function HiddenMessageSpoilerBlock({
  messageId,
  imageMode,
  children,
}: {
  messageId: string
  imageMode: 'hidden' | 'blurred'
  children: ReactNode
}) {
  useMessageStateRevision()
  const revealed = isBlockRevealed(messageId)
  const imageDisplayed = isImageDisplayed(messageId)

  if (!revealed) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hidden message spoiler, tap to reveal"
        style={styles.spoilerBlockOverlay}
        onPress={() => revealBlock(messageId)}
      >
        <View style={{ opacity: 0 }} pointerEvents="none">
          {children}
        </View>
      </Pressable>
    )
  }

  return (
    <Pressable
      style={styles.revealedBlockWrapper}
      onPress={() => collapseBlock(messageId)}
    >
      {isolateInteractiveChildren(children, imageMode, imageDisplayed)}
    </Pressable>
  )
}

/**
 * Hides or blurs image attachments when `hideText === false`.
 */
function HiddenImagesContainer({
  messageId,
  imageMode,
  children,
}: {
  messageId: string
  imageMode: 'hidden' | 'blurred'
  children: ReactNode
}) {
  useMessageStateRevision()
  const imageDisplayed = isImageDisplayed(messageId)

  if (imageDisplayed) {
    return <>{children}</>
  }

  if (imageMode === 'hidden') {
    return null
  }

  return (
    <View style={styles.blurredImageWrap}>
      {cloneElement(
        isValidElement(children) ? (children as ReactElement<any>) : <View>{children}</View>,
        { blurRadius: 28 },
      )}
      <View pointerEvents="none" style={styles.blurredScrim} />
    </View>
  )
}

function isHeaderNode(node: any): boolean {
  if (!isValidElement(node)) return false
  const name = String(
    (node.type as any)?.displayName || (node.type as any)?.name || '',
  )
  return /MessageHeader|Header/i.test(name)
}

export function patchMessageHiding(): () => void {
  const unpatches: Array<() => void> = []

  // 1. Patch RowManager.prototype.generate so native chat rows strip hidden images
  // when in images-only + hidden mode and attach reactive plugin state metadata.
  unpatches.push(
    getModules(
      withProps<{ prototype: { generate: (data: any) => any } }>('prototype'),
      mod => {
        const proto = mod?.prototype as Record<string, any> | undefined
        if (!proto || typeof proto.generate !== 'function' || !proto.getTextColor) return

        unpatches.push(
          instead(proto as Record<string, (...args: any[]) => any>, 'generate', function (this: unknown, args: any[], orig: (...a: any[]) => any) {
            const data = args[0]
            const row = Reflect.apply(orig, this, args)
            const msg: DiscordMessageLike | undefined = data?.message ?? row?.message
            if (!msg?.id) return row

            const settings = getCachedSettings()
            const channelId = msg.channel_id ?? msg.channelId ?? data?.channelId
            if (!shouldHideMessage(settings, msg.author?.id, channelId)) return row

            row.__valencedHidden = {
              messageId: msg.id,
              imageMode: settings.imageMode,
              hideText: settings.hideText,
              hasImages: hasImageMedia(msg),
            }

            if (
              !settings.hideText &&
              settings.imageMode === 'hidden' &&
              !isImageDisplayed(msg.id) &&
              Array.isArray(row.message?.attachments)
            ) {
              row.message = {
                ...row.message,
                attachments: [],
              }
            }

            return row
          }),
        )
      },
      { max: 1 },
    ),
  )

  // 2. Patch MessageHeader to append the post-timestamp indicator (next to silent bell)
  unpatches.push(
    getModules(
      withProps<{ MessageHeader: FC<any> }>('MessageHeader'),
      ({ MessageHeader }) => {
        unpatches.push(
          insteadJSX(MessageHeader, ([type, props, key], jsx) => {
            const rendered = jsx(type, props, key)
            const msg: DiscordMessageLike | undefined = props?.message
            if (!msg?.id) return rendered

            const settings = getCachedSettings()
            const channelId = msg.channel_id ?? msg.channelId ?? props?.channelId
            if (!shouldHideMessage(settings, msg.author?.id, channelId)) {
              return rendered
            }

            const timestampGroup = findInTree(
              rendered as Record<string, any>,
              (node: any) =>
                Boolean(
                  node &&
                    typeof node === 'object' &&
                    Array.isArray(node.props?.children) &&
                    node.props.children.some(
                      (c: any) =>
                        isValidElement(c) &&
                        /timestamp/i.test(
                          String((c.type as any)?.displayName || (c.type as any)?.name || ''),
                        ),
                    ),
                ),
              { maxDepth: 6 },
            ) as { props?: { children?: ReactNode[] } } | undefined

            if (timestampGroup && Array.isArray(timestampGroup.props?.children)) {
              timestampGroup.props.children.push(
                <HiddenMediaIndicator
                  key={`valenced-hidden-indicator-${msg.id}`}
                  messageId={msg.id}
                />,
              )
            }

            return rendered
          }),
        )
      },
      { max: 1 },
    ),
  )

  // 3. Patch unified Message component so when `hideText === true`, the entire
  // message block background (text + attachments) gets a single unified spoiler overlay.
  unpatches.push(
    getModules(
      withProps<{ Message: FC<any> }>('Message'),
      ({ Message }) => {
        unpatches.push(
          insteadJSX(Message, ([type, props, key], jsx) => {
            const rendered = jsx(type, props, key)
            const msg: DiscordMessageLike | undefined = props?.message
            if (!msg?.id || !isValidElement(rendered)) return rendered

            const settings = getCachedSettings()
            const channelId = msg.channel_id ?? msg.channelId ?? props?.channelId
            if (!settings.hideText || !shouldHideMessage(settings, msg.author?.id, channelId)) {
              return rendered
            }

            const bodyContainer = findInTree(
              rendered as Record<string, any>,
              (node: any) =>
                Boolean(
                  node &&
                    typeof node === 'object' &&
                    Array.isArray(node.props?.children) &&
                    node.props.children.some(isHeaderNode),
                ),
              { maxDepth: 5 },
            ) as { props?: { children?: ReactNode[] } } | undefined

            if (bodyContainer && Array.isArray(bodyContainer.props?.children)) {
              const headerNodes: ReactNode[] = []
              const blockNodes: ReactNode[] = []

              for (const child of bodyContainer.props.children) {
                if (isHeaderNode(child)) headerNodes.push(child)
                else blockNodes.push(child)
              }

              bodyContainer.props.children = [
                ...headerNodes,
                <HiddenMessageSpoilerBlock
                  key={`valenced-spoiler-block-${msg.id}`}
                  messageId={msg.id}
                  imageMode={settings.imageMode}
                >
                  {blockNodes}
                </HiddenMessageSpoilerBlock>,
              ]
              return rendered
            }

            return (
              <HiddenMessageSpoilerBlock
                messageId={msg.id}
                imageMode={settings.imageMode}
              >
                {rendered}
              </HiddenMessageSpoilerBlock>
            )
          }),
        )
      },
      { max: 1 },
    ),
  )

  // 4. Patch MessageAttachments for images-only mode (`hideText === false`)
  unpatches.push(
    getModules(
      withProps<{ MessageAttachments: FC<any> }>('MessageAttachments'),
      ({ MessageAttachments }) => {
        unpatches.push(
          insteadJSX(MessageAttachments, ([type, props, key], jsx) => {
            const rendered = jsx(type, props, key)
            const msg: DiscordMessageLike | undefined = props?.message
            if (!msg?.id) return rendered

            const settings = getCachedSettings()
            const channelId = msg.channel_id ?? msg.channelId ?? props?.channelId
            if (settings.hideText || !shouldHideMessage(settings, msg.author?.id, channelId)) {
              return rendered
            }

            return (
              <HiddenImagesContainer
                messageId={msg.id}
                imageMode={settings.imageMode}
              >
                {rendered}
              </HiddenImagesContainer>
            )
          }),
        )
      },
      { max: 1 },
    ),
  )

  return () => {
    for (const unpatch of unpatches) {
      unpatch()
    }
  }
}
