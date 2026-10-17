# sidegig status and handoff

Last updated: 2026-10-16 (0.2.0 product pass validated on `product/core-experience`; merge and live deployment next).
Update this file when you stop work. Keep "Where work stopped" true.
History: [CHANGELOG.md](../CHANGELOG.md) (regenerated on `main` after each merge) and [evolution](evolution/README.md) (screenshots of every milestone).
Full build-session transcript, owner requests verbatim, and test tools: `context/README.md` (local only, not in git).

## Where work stopped

**Product iteration 0.2.0, 2026-10-16:** the owner asked for an installable, usable product with a better experience across existing features. Work is on `product/core-experience`, based on `main` at `0200a12`. The earlier merge/deploy authorization remains in scope. Current source passes the checks below; this iteration has not yet been reloaded in the installed extension.

- Fresh installation opens a dedicated setup screen. It saves pinned apps, sidebar position and the optional new tab. Turning the new tab off and on clears the cached off flag correctly. Existing users can reopen Setup guide from settings. Settings now show one section at a time, retain complete forms during search, and offer a section selector on narrow screens.
- Native appearance keeps the tools prominent. Studio looks retain their decorative objects. Compact widgets have visible expand controls. Notes opens a usable editor, writes during input, and follows changes from another tab. Own storage echoes cannot replace the editor during rapid typing. Tasks expose their input and use a native checkbox. Expanded widgets have a close control, keyboard focus loop and Escape recovery. Weather has loading, timeout, failure and retry states; changing cities cannot display the previous city’s cached forecast. The calendar empty state opens the calendar.
- The sidebar now exposes the existing built-in Assistant. Model discovery runs independently of the dashboard, has a bounded timeout and a recoverable connection error. No paid model requests were made. Shared search opens complete HTTP(S) addresses and bare domains directly.
- The preview now supports isolated persistent settings, notes and tasks across reloads and open tabs. Explicit fixtures stay volatile. Cache-busted preview assets prevent stale bundles during rapid rebuilds. `scripts/product-smoke.js` checks setup, note editing and rapid input, reload persistence, two open tabs, tasks, settings search/navigation, held model discovery, the Assistant route and URL navigation. Preview bookmark data is still an in-memory fixture.
- Validation: 124 tests and typecheck pass. The product browser smoke passes. All 12 looks fit 1440×900. Native views pass 1280×720, 1440×900, 1920×1080 and narrow 390×844; narrow pages scroll vertically without horizontal overflow. The setup primary action fits 1280×720. Sidebar chat fits 420×720. Keyboard Tab/Shift+Tab/Escape, Arrange resizing, widget removal, Reset layout, setup opt-out/re-enable and weather/model failure states pass. Twelve redraws stay at 9 storage listeners, 1 bookmark listener, 1 resize listener, 4 keyboard listeners and 1 observer. A held chat reply after New chat does not enter the new conversation.
- Packaging: version 0.2.0; all four targets and zips pass in an isolated copy with the real tsconfig. Packages include INSTALL.md, PRIVACY.md and README.md. Preview scripts and fixture pages are excluded. Chromium remains a local unpacked install; Firefox needs signing for distribution and Safari needs Xcode conversion/signing. There is no browser-store publication.
- Tool limits: T3 snapshots timed out twice, so verification used the documented Aside workflow. The preview server expired once and was restarted after `ERR_CONNECTION_REFUSED`. One URL probe targeted the hidden Search field while Ask mode was active; selecting Search corrected the probe. Rapid Notes input exposed a real focus loss, fixed by ignoring own storage echoes. A stale cached bundle initially hid that fix; revisioned preview assets corrected the check. An expired shell session returned `Unknown process id`; its saved logs were read directly. Aside’s one-shot process can exit zero after JavaScript errors, so smoke success requires the explicit PASS marker.
- Limits: a clean browser-profile install, real keyed chat, provider/MCP OAuth, bridge pairing and live cross-device sync remain untested. Full backup still excludes notes, conversations and keys; the install guide states this. Strongest alternative: passing unit tests would conceal broken daily-use flows — ruled out for the listed flows by browser interaction, reload checks, two open tabs, held-network failures and independent isolated package builds. Other integrations still require live checks.

`main` includes the bug and UI fixes below, merged from `bugfix/codebase-review` in `c8983ae` at the owner’s request. The branch is retained as merged history. `drawer-dynamic-url` remains unmerged (open work item 1). The earlier Phase 1 work was merged from `audit-fixes`, built on `wip/in-panel-apps`. The full earlier audit report, session transcript and test scripts are in `context/claude-code-session-2026-10-14/` (local only).

**UI fixes, merged and deployed 2026-10-16:**

- Each render now has an abort signal. Replacing a new tab ends its bookmark, storage, keyboard and resize listeners, observers and timers. A browser probe across 12 redraws stays at 7 storage listeners, 1 bookmark listener, 1 resize listener, 4 keyboard listeners and 1 observer. Before the fix, bookmark listeners and observers grew from 1 to 13.
- The grid uses the page’s actual bottom padding. The fixture dashboard fits 1280×720, 1440×900 and 1920×1080 without vertical overflow. Arrange, resizing, removing Notes and Reset layout still work in the browser.
- Customize now has a visible close button, keyboard tabs, a Size control in Colours, and no reload memory. Async Wallpaper loads cannot overwrite a newer tab. Switches and segmented controls reflect each click immediately. Shared chat and help controls use the surface theme, with visible keyboard focus and correct dark fields. The mobile dashboard clips decorative feather overflow; 390×844 has no horizontal scroll. Hover and slip-drop motion use ease-out.
- Chat runs retain their original conversation and controller. A browser model held until after New chat cannot write its reply into the new conversation. Stop prevents remaining tools, keeps a result for each announced call and forwards the current cancellation signal to cached MCP tools. Two transport regression tests cover these paths. Asking without a model now opens the connection UI visibly. Custom instructions have a typed default and survive settings loading.
- AI settings reuse the existing provider connection UI. They now expose provider disconnect, custom instructions and MCP server add, enable, token, sign-in and remove controls. Keys and tool tokens stay local. Browser checks saved instructions, added a fixture server, saved its token, disabled it and removed both server and token. No paid model or external sign-in was used.
- Final validation passes: 123 tests, typecheck, all four builds and store zips in a temporary project copy, and 16 fixture screens. Customize closes after reload. Desktop sizes 1280×720, 1440×900, 1920×1080 and narrow 390×844 pass. Screenshots in `docs/evolution` use clean fixtures. The merged source was rebuilt into `dist/` and reloaded in the owner’s Aside. The loaded UI, options and stylesheet SHA-256 hashes match the files on disk. The isolated build also matches byte for byte after copying the project’s tsconfig.
- Tool limits: T3 preview snapshots timed out twice (`Preview automation snapshot timed out after 15000ms`), so UI verification used the documented Aside workflow. Aside does not expose viewport resizing; a same-origin iframe supplied exact sizes. A wrapper navigation readiness timeout was avoided by resizing the existing iframe. A reload check initially read before rendering; waiting for the control corrected the probe. Two live snapshot probes expected a header before one existed; a full snapshot and explicit render wait corrected them. The optional native esbuild package is absent; the supported WebAssembly build passed. The initial isolated copy omitted tsconfig and differed only by a strict-mode directive; rebuilding with tsconfig produced identical bundles.
- Limits: live OAuth, a real keyed chat, cross-device sync and bridge pairing remain untested. The old `drawer-dynamic-url` branch is excluded. Strongest alternative: detached widgets would clean up through garbage collection — ruled out by active listener and observer growth on the old build and stable counts across 12 redraws on the fixed build.

**Settings and import fixes, merged and deployed 2026-10-16:**

- A save that exceeds sync quota now survives loading over an older synced copy. Each save keeps a device-local backup and an embedded timestamp. Loading chooses the newer copy; a newer remote save can still win. Custom CSS remains local. Six storage regression tests cover fallback, recovery, remote updates, legacy copies, browsers without sync and clock rollback after an observed save. Legacy copies without timestamps retain sync precedence because their age is unknown.
- Older settings migrations discard null and primitive app entries instead of crashing. The Clear-mode and wallpaper migrations copy nested data instead of changing the imported backup. Frozen-input and repeated-import regression tests pass.
- Setup imports now describe partial settings using the same defaults and migrations as Apply. Missing or empty look names no longer crash the summary. Explicitly empty part lists stay empty; a pictures-only code no longer acquires apps, looks and reading parts that could overwrite unrelated settings.
- Validation before the UI changes: 121 tests and the typecheck passed. All four targets and their store zips built in a temporary copy. Sixteen fixture preview pages rendered with zero changed pixels against the earlier `main` outside the installed rail after each settings/import fix. The final combined suite has 123 passing tests. A browser check confirms that the same partial setup fails to open on the old code and opens its summary and part controls on the fixed code. The fixture screenshot is in `docs/evolution`.
- Browser workarounds: T3's automation disconnected and its reconnect stalled. The comparison used the `aside-browser` skill. The CLI required an update; the viewport-resize method was unavailable. An early capture ran during a rebuild and hit a missing fixture page; it was discarded. Another attempt hit Aside's temporary tab-edit lock. The successful captures use one tab, completed builds, an isolated baseline folder and the same existing viewport. Aside's one-shot REPL also closes tabs on exit, so interactive checks run in one invocation. The older pixel-diff helper emits a Pillow deprecation warning; a second diff using Pillow's image operations confirms the same zero-pixel result.
- Limits: no live cross-device sync, signed-in chat or bridge check was run. Legacy copies have no reliable save time; they retain sync precedence when both copies lack timestamps. An older extension version's untimestamped remote save cannot supersede a timestamped local copy. Concurrent edits from separate extension contexts still use whole-settings saves. Strongest alternative: the settings rollback was only stale UI state — ruled out by direct API-level save/load reproduction before and after the fix.

**Deployed 2026-10-16:** `dist/chrome` built from merged `main` is loaded in the owner’s Aside. The extension was reloaded; its manifest has `identity` and minimum Chrome 130. Live checks: Gmail reached the inbox in 2 s and stayed for the 20 s check; X showed posts in 2 s with no error during the 15 s check. The live settings page exposes model connections, instructions and MCP controls. The live new tab has a grid, starts Customize closed, and keeps its existing stored layout across reload. No production preferences were changed. Runtime file hashes match the new build (`ui.js`: `69860b3f1085671c…`, `options.js`: `83cc1dcc0999de1b…`, `ui.css`: `904ee0c0c8253950…`). All four targets and store zips are in `dist/`. No store publication. Local checks pass; remote CI runs on the final push.

**Gmail and X open inside sidegig's own sidebar frame, signed in** (checked live in the owner's Aside on 2026-10-14: Gmail stays in the inbox for 30 s and more, X shows the timeline).

- **X:** `src/content/framefit-main.ts` (MAIN world) adds `SameSite=None; Secure` to cookie writes, merges the site's same-site cookies into `document.cookie` reads (from `pageCookies` in `src/background/framecookies.ts`), and blocks service-worker registration.
- **Gmail, three layers, all fixed:**
  1. Frame-busting: `rewriteFrameChecks` (`src/shared/framecheck.ts`) turns `window!=top` checks in inline scripts into constants (`src/content/framefit.ts`).
  2. "Temporary Error" code 9: Gmail's code uses `top` as its own window (`_.pu(top, …)` for the gmonkey API, `top.document`, `top.js`, `win.top`). In the frame `top` is sidegig's cross-origin page, so module "a" threw a SecurityError and stopped before defining `_.gbg`; the `reading 'Kc'` crash was only the knock-on. Fix: `rewriteTopRefs` turns bare `top` into `self` and `x.top` reads into `__sidegigTop(x)` (the frame's window when x is that window). Inline scripts are rewritten as they stream in; Gmail's own-origin `<script src>` modules are fetched, rewritten and loaded from a blob, in order (`framefit-main.ts`). Only for hosts in `TOP_REWRITE_HOSTS` (Gmail).
  3. CookieMismatch about 4 s after the inbox showed: the DNR rules that appended same-site cookies to the frame's requests duplicated cookies the browser already sends. Deleted; X works without them too.
- **The phone layout is never applied to Gmail** (`dnr.ts` skips mail.google.com, and the app bar hides the phone button for Gmail): `mobile: true` on Gmail sent mobile Gmail into a reload loop and risks Google's re-sign-in prompt.
- How it was found (repeatable loop, about 10 s per run): open `panel.html` in an Aside tab, set `chrome.storage.local.panelRequest = {appId:'gmail', ts:Date.now()}`, poll the `sidegig-app-gmail` frame's title and path. Gmail swallows its own errors (`_._DumpException`), so a temporary trap on that setter is how the first error was found. The scripts are in `context/claude-code-session-2026-10-14/working-files/`.
- Settings are at v10 (Gmail, X and the other `NO_FRAME` apps open in the panel).

**New-tab fixes:**

- **A saved layout, folder colours and the active space survive loading.** `mergeSettings` (`src/shared/storage.ts`) kept only keys present in the defaults, so the `{}` defaults of `newtab.layout` and `newtab.folderTones` always came back empty, and `stacks.activeSpace` (no default) was dropped. An empty-object default now marks a map whose keys are the user's, and `activeSpace` defaults to `''` (readers use `||`). The live reload check leaves the existing stored layout unchanged. A new arrangement was tested only in the fixture preview, to preserve the owner’s preferences.
- **Customize › Reset layout redraws the grid.** The grid now follows layout saves made anywhere (`onSettingsChanged` in `src/ui/views/ntgrid.ts`, which also covers a second open new tab). Checked in the preview.
- **Removing a widget in arrange mode no longer freezes the top bar.** A grid built while `html[data-arranging]` is set resumes arranging (`edit(true, true)`, quiet). Checked in the preview: red on the old code, green after. The preview loop page needs cache-busted script URLs (`ui.js?v=…`), or the browser runs a stale `ui.js`.

**Audit, 2026-10-14.** The whole codebase was read for over-engineering, architecture and security. The owner answered 16 questions (see Key decisions). Done so far (Phase 1):

- CI: `.github/workflows/ci.yml` typechecks, tests and builds Chrome on every push (Node 24, `engines` in `package.json`). The version number comes from `package.json` only.
- `CHANGELOG.md` is regenerated on `main` after a merge (the pre-commit hook only reminds).
- Dead TypeScript deleted (306 lines). `tsc --noUnusedLocals` is clean.
- 265 CSS selectors that can never match deleted (`ui.css` 2494 → 2246 lines). `scripts/css-check.mjs` finds them (`--fix` removes them) and `test/css.test.ts` keeps the count at zero. A 16-page before/after screenshot diff in the preview showed 0 changed pixels.
- The `identity` permission (OpenRouter and MCP sign-in windows); minimum Chrome 130 and Firefox 148.

## Open work, in priority order

Continue the existing-feature product pass. Run the typecheck, tests and relevant browser flows after each step. Announce live checks first.

Next product checks: install 0.2.0 in a clean browser profile, verify sign-in and failure recovery for each shipped app, and exercise real provider/MCP connections. Then address the hardening work below before public store distribution. Add complete local backup/restore for notes and chats; current Setups export does not include them.

1. **Phase 1b, hardening** (owner: "Yes, as Phase 1b").
   - Branch `drawer-dynamic-url` puts the drawer behind Chrome's per-session random URL (`use_dynamic_url`), so websites can't embed it. Not merged: a drawer at that URL starts its app frames from a second host, so the frame rules now list both hosts (`applyRules` in `src/background/dnr.ts`), but nobody has seen it work. Before merging, check live: an app opens inside the in-page drawer on a normal page, and Gmail and X still open in the side panel. If a drawer app fails, compare the drawer document's origin with rule 1's `initiatorDomains` (`declarativeNetRequest.testMatchOutcome`).
   - Limit header rule 2 to sidegig's own frames (`tabIds: [-1, …]`).
   - Rail ↔ drawer messages over a `MessageChannel` instead of `postMessage('*')`.
   - Background message checks: decide from `sender` (URL, extension page or not), not from hosts named inside the message (`frame-cookies`, `clear-sw`, `profile-import`, `badge`, `ai-claim`).
   - Bridge: pairing code from `sidegig-bridge setup`, proved on every connection; frame-size limit; reject unmasked frames; cap Codex runs and stop them when the socket closes; tool calls belong to the socket that asked.
2. **AI settings follow-up:** provider connections, local server address, browser model status, Codex connection, OpenRouter sign-in, custom instructions and MCP server management are implemented. Verify real provider and MCP OAuth. Bridge pairing-code entry and persistent bridge status still need the hardened bridge protocol. Agent access off/read/full waits for the bridge’s browser side (item 9).
3. **Phase 2, typed data:** a typed schema for the `chrome.storage.local` keys and the `sidegig.nt*` localStorage keys; a pure `normalizeSettings` with ordered migrations and explicit user-owned maps (newest-wins loading and the known migration mutations are fixed); one typed message protocol with a handler map in `src/background/index.ts`. Verify cross-device sync and coordinate simultaneous edits from separate contexts.
4. **Phase 3, remaining structure:** add a widget registry; give Customize one page API; make `sync()` redraw only the subsystem that changed. Per-render abort cleanup, closed Customize after reload, surface theme tokens, dark help/chat, undefined CSS tokens, hover/drop easing and the overridden pattern fade are fixed. Continue consolidating duplicate component styles without changing the established design.
5. **Phase 4, tests:** a fake `chrome.*` seam built from the preview shim; router tests; a manifest snapshot test; bridge tests through Node's WebSocket client; preview end-to-end scripts.
6. Phone layouts in the side panel and a live check of Calendar, Instagram, Grok and Messenger in frames (Gmail and X done). Watch Gmail for other `top` uses in modules it loads later (compose, settings, chat); `TOP_REWRITE_HOSTS` covers mail.google.com only.
7. Sharp icons: each site's best icon source, fitted (see `src/shared/iconfit.ts`, `src/background/favicons.ts`).
8. Sidebar Assistant is wired in 0.2.0. Verify a real model and page attachments from the side panel.
9. Agent bridge end to end: run `bridge/sidegig-bridge.mjs` (WebSocket handshake, a `codex.run` prompt); build the extension side that answers `browser_*` tool calls, with an agent-access setting and a visible banner while an agent controls a tab.
10. Settings now have a sticky header, search, Saved status, section navigation and a narrow-screen selector. Continue field-level validation, error recovery and focus checks; keep full forms available in search.
11. Check other compact windows and unusually large interface sizes. Colours and Layout both have a Size slider; standard desktop and narrow fixture sizes pass.
12. Verify in the real extension after a reload: the saved layout surviving a reload, new-tab grid and Clear mode, arrange mode, chat with a real key, rail plates and single rail, icon fit, the Pomodoro seconds hand, bell and digit bounce.
13. Undecided (ask the owner): Opera-style drawer placement next to the rail; hiding the page rail while Chrome's side panel is open; the product name (sidegig, Ledge or Edgewise); default wallpaper.

## Blocked or limited

- Chrome's side panel shows only extension pages. Sites that refuse frames need the frame work above, or the docked side window.
- Safari project generation needs a Mac: `npm run safari`.
- macOS full screen: a side window gets its own space, so apps open as a tab beside the current one.
- Switching Gmail to a mobile user agent made Google ask for the password again. Do not spoof Gmail's user agent. The code now enforces this.

## Key decisions (keep unless the owner changes them)

- Free and open source (GPL-3.0). No paid tier, donations, sponsors or affiliate links. Ask the owner before adding any income path.
- Design: Chrome/Material 3 look, Google Sans Flex, Material Symbols, accent `#0b57d0`, adaptive page theme. No drop shadows or glows, no sparkle "AI" icon, sentence-case labels, no middle-dot "A · B · C" strings, no arrow glyphs glued to text, ease-out motion without bounce or overshoot, except that digits bounce when they change (clock, to-do count, timer; owner, 2026-10-14), respect reduced motion. Text never sits directly on a busy wallpaper without the readability layer.
- Docking: margin on `html` plus per-element translate for fixed elements. Never `transform` or `contain` on `html`.
- Header stripping (X-Frame-Options, CSP) only for sub_frame requests from the extension; never main_frame.
- New tab: a 12 x 8 grid that fits one screen (`src/shared/layout.ts`); narrow or short windows fall back to one column. Clear mode picks text tone per widget by sampling the wallpaper (`src/shared/legible.ts`, `src/ui/views/ntlegible.ts`).
- Chat: clean-room from public API docs and the MCP spec. Keys stay on the device (`aiKeys`, local storage, never synced). ChatGPT-plan access only through the official Codex CLI via the bridge. Claude and Gemini subscriptions are not supported (their terms forbid third-party use); use API keys. No identity spoofing, no reading other apps' tokens.
- Bridge: one local daemon on `127.0.0.1:47617`; the extension connects over WebSocket; web pages are refused. Pairing is by a code that `sidegig-bridge setup` prints and the owner pastes once in AI settings (decided 2026-10-14; today the first extension origin is paired).
- Icons: the site's own icon at screen resolution, measured and fitted to one visual size; bundled CC0 brand glyphs when the browser has none.
- One rail per page: an older rail instance removes itself.

### Owner decisions from the 2026-10-14 audit round

- Audit fixes go on their own branch, one commit per fix, pushed per phase; the work stops only when a test or live check fails. Nothing merges to `main` until the owner says.
- Live checks in the owner's Aside (side panel, Gmail, X) are allowed for sidebar, frame and background changes, announced before each. The new tab is checked in the preview with fixtures.
- Chat tools keep running without asking ("Never ask").
- The `identity` permission is required on every target. Minimums: Chrome 130, Firefox 148, no fallback code.
- CSS: "fix what is broken and make it look consistent across the whole tool": one component set on every surface, each surface keeps its own colour theme.
- Changelog is generated at merge (done). The history chat finder is deleted (done). Customize's reload memory is cut, and the overridden pattern-fade rule is deleted rather than restored (both done in the UI follow-up).

## Commit history (recent)

Full list: [CHANGELOG.md](../CHANGELOG.md).

- `3598f2b` identity permission; Chrome 130 and Firefox 148 minimums
- `20e53e2` Remove 265 CSS selectors that can never match, and a test that keeps it that way
- `0b40c50` Delete dead TypeScript found by the audit
- `988e9e2` CI: typecheck, tests and a Chrome build on every push; one version number
- `aae3fce` Removing a widget in arrange mode no longer freezes the top bar
- `51b363d` Gmail runs signed in inside the sidebar frame
- `11c528c` Sidebar apps that fit, Arc-style rail plates, one rail per page
