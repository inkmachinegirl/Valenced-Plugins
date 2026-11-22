# Valenced Plugins by Satou

## Public vs private plugins

- `plugins/` — public. Pushing to `main` publishes them (release workflow → `gh-pages` pool + `index.json`).
- `private/` — **never published**. These reach the user only as zips.

## Private plugin zips (backup — use these, don't rebuild from memory)

Every private plugin has an installable zip in **`private/_zips/<id>@<version>.zip`** (manifest.json + index.js),
committed to the repo. When the user asks for a private plugin ("send me the X zip"), send that file.

After changing a private plugin (bump its version), refresh its zip and commit it:

```sh
scripts/pack-private.sh <folder>      # or no argument for all private plugins
```

Private plugins (folder → name):

| Folder | Name | Notes |
|---|---|---|
| `blocked-toggle` | Chat Filters | Eye button on the member list top bar: show blocked/ignored, hide embeds, hide voice messages, hide never-talked (needs Never Talked); voice badge |
| `repo-autoupdate` | Satou's Plugins Auto Update | Updates/installs plugins from this repo only (`inkmachinegirl.github.io/Valenced-Plugins`) |
| `pronouns` | Pronouns+ | Faster fork of bleelblep's Pronouns (GPL-3.0) |
| `last-online-plus` | Last Online Tracker+ | Fork of k1ng_op's Last Online Tracker (GPL-3.0) |
| `favorite-anything-plus` | Favorite Anything+ | Fork of TheUnrealZaka's Favorite Anything (MIT) |
| `no-suggestions-plus` | No Suggestions+ | Fork of MarkLong0467's No Suggestions (GPL-3.0) |
| `server-drawer-plus` | Server Drawer+ | Fork of Server Drawer (kmmiio99o/Rosie/Benjii, GPL-3.0, from Accentaro/Valenced-Plugins): swipe up on the chat bar opens the drawer |
| `better-channel-list` | Better Channel List+ | |
| `fake-nickname` | Fake Nickname+ | |
| `ghost-log` | Ghost Log+ | |
| `instant-actions` | Instant Actions+ | |
| `media-controls` | Media Controls | |
| `multi-select` | Multi Select | |
| `read-all` | Read All Servers+ | |
| `skip-confirmations` | Skip Confirmations | |
| `staff-tags` | Staff Tags+ | |

## Moving a plugin from public to private

1. `git mv plugins/<name> private/<name>`, pack its zip (`scripts/pack-private.sh <name>`), commit, push `main`.
2. Unpublish: on `gh-pages`, delete `pool/<id>@*.zip` and remove its entry from `index.json`
   (keep `index.json` at 2-space indent so the diff is only that entry), commit, push `gh-pages`.

## Forks of other people's plugins

Only fork plugins whose licence allows it (GPL/MIT…), keep the licence file and credit the
original author. dariussbezy's Show Blocked has **no licence** — don't copy or fork it.
