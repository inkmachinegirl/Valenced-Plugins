import { getAssetIdByName } from '@valenced/assets'
import { ActionSheetActionCreators, ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { before } from '@valenced/patcher'
import { beforeJSX } from '@valenced/react/jsx-runtime'
import { findInTree } from '@valenced/utils/tree'
import { createElement, forwardRef, memo } from 'react'
import { refreshActiveChannelRows } from '../state'
import { getCachedSettings, isUserHidden, toggleHiddenUser } from '../storage'
import type { DiscordUserLike } from '../types'
import type { ReactElement } from 'react'

const USER_SHEET_KEYS = new Set([
  'UserProfileOverflow',
  'UserActionSheet',
  'GuildUserSheet',
  'UserContextMenu',
  'MessageAuthorActionSheet',
  'LongPressUserActionSheet',
])

function extractTargetUser(source: unknown): DiscordUserLike | undefined {
  if (!source || typeof source !== 'object') return undefined
  const record = source as Record<string, any>
  if (record.user && typeof record.user.id === 'string') {
    return record.user as DiscordUserLike
  }
  if (typeof record.userId === 'string') {
    return { id: record.userId }
  }
  return findInTree(
    record,
    (node: any) =>
      Boolean(
        node &&
          typeof node === 'object' &&
          ((node.user && typeof node.user.id === 'string') ||
            typeof node.userId === 'string'),
      ),
    { maxDepth: 4 },
  ) as DiscordUserLike | undefined
}

async function handleToggleUser(user: DiscordUserLike) {
  const hiddenNow = await toggleHiddenUser(user.id)
  ActionSheetActionCreators.hideActionSheet()
  refreshActiveChannelRows()

  const label = user.globalName || user.username || user.id
  try {
    ToastActionCreators.open('VALENCED_HIDE_USER_TOGGLED', {
      text: hiddenNow ? `Hiding content from ${label}` : `Showing content from ${label}`,
      variant: 'default',
    } as any)
  } catch {
    /* a toast isn't worth a crash */
  }
}

function buildActionSheetRow(user: DiscordUserLike) {
  const settings = getCachedSettings()
  const hidden = isUserHidden(settings, user.id)
  const iconId = getAssetIdByName(hidden ? 'EyeIcon' : 'EyeSlashIcon')

  return createElement(Design.ActionSheetRow, {
    key: `valenced-hide-user-${user.id}`,
    label: hidden ? 'Unhide User Content' : 'Hide User Content',
    icon: iconId
      ? createElement(Design.ActionSheetRow.Icon ?? 'View', { source: iconId } as any)
      : undefined,
    onPress: () => {
      void handleToggleUser(user)
    },
  } as any)
}

function injectRowIntoTree(tree: ReactElement, user: DiscordUserLike): ReactElement {
  const groupNode = findInTree(
    tree as Record<string, any>,
    (node: any) =>
      Boolean(
        node &&
          typeof node === 'object' &&
          (node.type === Design.ActionSheetRow.Group ||
            node.type === Design.TableRowGroup) &&
          Array.isArray(node.props?.children),
      ),
    { maxDepth: 8 },
  ) as { props?: { children?: any[] } } | undefined

  if (groupNode && Array.isArray(groupNode.props?.children)) {
    const alreadyInjected = groupNode.props.children.some(
      (child: any) => child?.key === `valenced-hide-user-${user.id}`,
    )
    if (!alreadyInjected) {
      groupNode.props.children.push(buildActionSheetRow(user))
    }
  }

  return tree
}

// Fork fix (Hide User Content+): Discord's lazy sheets are often memo / forwardRef objects, not
// functions, so calling `mod.default(props)` threw "Object is not a function" and sent Valenced
// into Recovery Mode. Wrap the inner render function instead, keeping the memo / forwardRef shell.
const wrappedSheets = new WeakMap<object, unknown>()
const MEMO = Symbol.for('react.memo')
const FORWARD_REF = Symbol.for('react.forward_ref')

function withRow(render: (props: any, ref?: any) => any, fallbackUser: DiscordUserLike) {
  const Wrapped = function (this: unknown, sheetProps: any, ref?: any) {
    const rendered = render.call(this, sheetProps, ref)
    try {
      const resolvedUser = extractTargetUser(sheetProps) ?? fallbackUser
      if (rendered && resolvedUser?.id) return injectRowIntoTree(rendered, resolvedUser)
    } catch {
      /* a row we couldn't add is no reason to break the sheet */
    }
    return rendered
  }
  ;(Wrapped as any).displayName = (render as any).displayName ?? render.name
  return Wrapped
}

function wrapSheet(sheet: any, user: DiscordUserLike): unknown {
  if (!sheet || (typeof sheet !== 'function' && typeof sheet !== 'object')) return undefined
  if (sheet.__valencedHidePatched) return undefined
  const cached = wrappedSheets.get(sheet)
  if (cached) return cached
  let out: any
  if (typeof sheet === 'function') {
    out = withRow(sheet, user)
  } else if (sheet.$$typeof === MEMO) {
    const inner = sheet.type
    if (typeof inner === 'function') out = memo(withRow(inner, user), sheet.compare)
    else if (inner?.$$typeof === FORWARD_REF && typeof inner.render === 'function')
      out = memo(forwardRef(withRow(inner.render, user) as any), sheet.compare)
  } else if (sheet.$$typeof === FORWARD_REF && typeof sheet.render === 'function') {
    out = forwardRef(withRow(sheet.render, user) as any)
  }
  if (!out) return undefined
  out.__valencedHidePatched = true
  wrappedSheets.set(sheet, out)
  return out
}

export function patchUserContextMenu(): () => void {
  const unpatches: Array<() => void> = []

  // 1. Intercept Discord Mobile bottom ActionSheets opened for users
  unpatches.push(
    before(ActionSheetActionCreators, 'openLazy', args => {
      const [sheetPromise, key, props] = args
      const user = extractTargetUser(props)
      const isUserSheet =
        (typeof key === 'string' && USER_SHEET_KEYS.has(key)) || Boolean(user?.id)

      if (!isUserSheet || !user?.id || !sheetPromise) return args

      const wrappedPromise = sheetPromise.then(mod => {
        const wrapped = wrapSheet(mod?.default, user)
        return wrapped ? { ...mod, default: wrapped as any } : mod
      })

      return [wrappedPromise, key, props, args[3]]
    }),
  )

  // 2. Intercept ContextMenu components rendered in tablet / split layouts
  if (Design.ContextMenu) {
    unpatches.push(
      beforeJSX(Design.ContextMenu, ([type, props, key]) => {
        const user = extractTargetUser(props)
        if (!user?.id || !Array.isArray(props?.items)) {
          return [type, props, key]
        }

        const hidden = isUserHidden(getCachedSettings(), user.id)
        const targetLabel = hidden ? 'Unhide User Content' : 'Hide User Content'
        const alreadyInjected = props.items.some(
          item => !Array.isArray(item) && item?.label === targetLabel,
        )

        if (!alreadyInjected) {
          return [
            type,
            {
              ...props,
              items: [
                ...props.items,
                {
                  label: targetLabel,
                  action: () => {
                    void handleToggleUser(user)
                  },
                },
              ],
            },
            key,
          ]
        }

        return [type, props, key]
      }),
    )
  }

  return () => {
    for (const unpatch of unpatches) {
      unpatch()
    }
  }
}
