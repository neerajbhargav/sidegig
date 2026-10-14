# sidegig status and handoff

Last updated: 2026-10-14 (Aside session "Opera-style sidebar extension for Chromium").
Update this file when you stop work. Keep "Where work stopped" true.
History: [CHANGELOG.md](../CHANGELOG.md) (every commit) and [evolution](evolution/README.md) (screenshots of every milestone).
Full build-session transcript, owner requests verbatim, and test tools: `context/README.md` (local only, not in git).

## Where work stopped

Branch `wip/in-panel-apps`. Goal: open Gmail and X inside sidegig's own sidebar frame instead of a side window.

- **X works in a frame.** `src/content/framefit-main.ts` (MAIN world) adds `SameSite=None; Secure` to cookie writes and merges same-site cookies into reads. It also blocks service-worker registration. `src/background/framecookies.ts` adds session DNR rules (ids 500-699) that append the site's same-site cookies to requests made from inside sidegig frames. The frame's first load is excluded (the browser already sends those cookies, and sending them twice caused Google's CookieMismatch page).
- **Gmail no longer breaks out of the frame.** `src/shared/framecheck.ts` (`rewriteFrameChecks`) turns `window!=top` style checks into constants. `src/content/framefit.ts` (isolated world, document_start, only frames named `sidegig-app-*` under the extension) rewrites inline scripts as they stream in and posts a `sidegig-frame` hello to the parent.
- **Gmail still shows "Temporary Error", numeric code 9.** Code 9 is Gmail's "Uncaught exception" error page (`Hb` calls `GM_showErrorPage(9, ...)`). The captured exception is:
  `TypeError: Cannot read properties of undefined (reading 'Kc')` at line 5668:13 of the Gmail module `m=ebdd,sps,l,spit,t,it,anc`, called from the page's inline script at line 38.
- **Next step:** open that module (fetch it from a normal Gmail tab, or use REA on a saved copy) and find what is undefined at 5668:13. Likely candidates: a cross-frame `top`/`parent` property read that the rewrite missed, or storage/cookie state the shim reports differently. Fix the shim or the rewrite, then reload the extension and re-test.
- **Temporary diagnostics are in the code.** Search for `DIAGNOSTIC (temporary)` in `src/content/framefit.ts` and `src/content/framefit-main.ts`. They record Gmail's error-page reason in sessionStorage (`sidegig-err`) and forward errors to the parent. Remove them before merging to `main`.
- Settings are at v10 (Gmail, X and the other `NO_FRAME` apps move to `openIn: 'panel'`). If Gmail cannot be fixed, revert Gmail to `'window'` in the migration and defaults.

## Open work, in priority order

1. Gmail in a frame (above). Then phone layouts in the side panel and a live check of X, Calendar, Instagram.
2. Sharp icons: each site's best icon source, fitted (see `src/shared/iconfit.ts`, `src/background/favicons.ts`).
3. AI settings section in `src/options/main.ts`: keys, local server address, browser model status, ChatGPT plan (Codex) toggle, OpenRouter sign-in, custom instructions, MCP servers add/remove (`mcpServers` is read but nothing writes it), bridge status, agent access off/read/full.
4. Agent bridge: run `bridge/sidegig-bridge.mjs` end to end (WebSocket handshake, a `codex.run` prompt). Build the extension side that answers the bridge's `browser_*` tool calls, with an agent-access setting and a visible banner while an agent controls a tab.
5. Sidebar chat: `chatUi(ctx, { where: 'panel' })` exists; wire it into `panel.html` and add a rail button.
6. Settings page redesign (sticky header with search, live slider values, "Saved" chip, Appearance first). A previous script failed near `opt('Delay', ...)` in `src/options/main.ts`; inspect that line first.
7. Size slider in the Customize Theme tab (the Layout tab has one). Check new-tab sizes at 1280x720, 1440x900, 1920x1080.
8. Verify in the real extension after a reload: new-tab grid and Clear mode, arrange mode, chat with a real key, rail plates and single rail, icon fit, the Pomodoro seconds hand, bell and digit bounce.
9. Undecided (ask the owner): Opera-style drawer placement next to the rail; hiding the page rail while Chrome's side panel is open; the product name (sidegig, Ledge or Edgewise); default wallpaper.

## Blocked or limited

- Chrome's side panel shows only extension pages. Sites that refuse frames need the frame work above, or the docked side window.
- Safari project generation needs a Mac: `npm run safari`.
- macOS full screen: a side window gets its own space, so apps open as a tab beside the current one.
- Switching Gmail to a mobile user agent made Google ask for the password again. Do not spoof Gmail's user agent.

## Key decisions (keep unless the owner changes them)

- Free and open source (GPL-3.0). No paid tier, donations, sponsors or affiliate links. Ask the owner before adding any income path.
- Design: Chrome/Material 3 look, Google Sans Flex, Material Symbols, accent `#0b57d0`, adaptive page theme. No drop shadows or glows, no sparkle "AI" icon, sentence-case labels, no middle-dot "A · B · C" strings, no arrow glyphs glued to text, ease-out motion without bounce (except the Pomodoro digit bounce), respect reduced motion. Text never sits directly on a busy wallpaper without the readability layer.
- Docking: margin on `html` plus per-element translate for fixed elements. Never `transform` or `contain` on `html`.
- Header stripping (X-Frame-Options, CSP) only for sub_frame requests from the extension; never main_frame.
- New tab: a 12 x 8 grid that fits one screen (`src/shared/layout.ts`); narrow or short windows fall back to one column. Clear mode picks text tone per widget by sampling the wallpaper (`src/shared/legible.ts`, `src/ui/views/ntlegible.ts`).
- Chat: clean-room from public API docs and the MCP spec. Keys stay on the device (`aiKeys`, local storage, never synced). ChatGPT-plan access only through the official Codex CLI via the bridge. Claude and Gemini subscriptions are not supported (their terms forbid third-party use); use API keys. No identity spoofing, no reading other apps' tokens.
- Bridge: one local daemon on `127.0.0.1:47617`; the extension connects over WebSocket; first extension origin is paired; web pages are refused.
- Icons: the site's own icon at screen resolution, measured and fitted to one visual size; bundled CC0 brand glyphs when the browser has none.
- One rail per page: an older rail instance removes itself.

## Commit history (recent)

- `11c528c` Sidebar apps that fit, Arc-style rail plates, one rail per page
- `c3d1162` Steady rendering, and an AI chat built into the new tab
- `44f1e03` Grid, readable Clear widgets, simpler theming, pocket folders, arrange mode
- `05b80da` Add widgets panel, Size setting
