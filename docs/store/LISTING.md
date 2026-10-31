# Chrome Web Store listing

Paste these fields into the Chrome Web Store developer dashboard. Images in this folder come from `node scripts/store-shots.mjs` (fixture preview, no personal data). Upload `sidegig-chrome.zip` from the latest release.

## Store listing

- **Name:** sidegig
- **Summary (132 characters max):** A free, open-source sidebar: your signed-in apps, an AI assistant and bookmark stacks beside any web page. No account.
- **Category:** Productivity → Tools
- **Language:** English
- **Screenshots (1280x800):** `1-assistant.png`, `2-newtab.png`, `3-welcome.png`, `4-newtab-dark.png`, `5-settings.png`
- **Small promo tile (440x280):** `promo-440x280.png`
- **Homepage:** https://github.com/neerajbhargav/sidegig
- **Support:** https://github.com/neerajbhargav/sidegig/issues

**Description:**

```
sidegig puts your apps beside the page you are reading.

Hover the edge of any web page and a slim rail slides in. Open Gmail, WhatsApp, Claude, ChatGPT, Notion or any site in the browser's sidebar, signed in as you. Close it and the page is yours again.

• Apps beside any page: pin any website to the rail. Unread badges for the apps that show them.
• An AI assistant that can read the page: ask about the page, a tab or your bookmarks. Use the browser's built-in model, a local model (Ollama), your own API key (OpenAI, Anthropic, Gemini, OpenRouter) or your ChatGPT plan through the official Codex CLI.
• Sign-in codes: with the Gmail card on, a new sign-in code shows as a ticket you copy in one click. Found on your device by rules, no AI needed.
• Bookmark stacks, tab groups and saved workspaces in one sidebar.
• An optional new tab: clock, search, calendar, to-dos, notes, a focus timer and your shortcuts on one grid, with wallpapers and an Arc-style space colour.

Private by design: no account, no sidegig server, no analytics. Your keys stay on this device. Free and open source under GPL-3.0: https://github.com/neerajbhargav/sidegig
```

## Privacy practices

- **Single purpose:** a sidebar that keeps the user's web apps, AI assistant and bookmarks beside the page they are browsing.
- **Remote code:** No. All extension code ships in the package. (In Gmail's frame only, sidegig rewrites Gmail's own scripts so they run inside a frame; it loads no code of its own from the network.)
- **Data collected:** none sent to the developer. Tick nothing in the data-usage form. The certifications are true: no sale, no unrelated use, no credit-worthiness use.
- **Privacy policy URL:** https://github.com/neerajbhargav/sidegig/blob/main/PRIVACY.md

## Permission justifications

| Permission | Why |
|---|---|
| `<all_urls>` host access | Draw the rail on any page the user visits, and load the sites the user pins inside the sidebar. |
| `declarativeNetRequestWithHostAccess` | Let pinned sites load in sidegig's sidebar frames by removing their frame-blocking headers, for sub-frames that sidegig opens only. Top-level pages are never changed. |
| `cookies` | Let a pinned site's own scripts read its own cookies inside sidegig's frame, so the user stays signed in. |
| `browsingData` | Clear one site's service worker before showing it in the sidebar (Gmail and X break inside a frame otherwise). |
| `scripting` | Read the current page's text when the user asks the assistant about it. |
| `tabs`, `tabGroups` | List, switch and save the user's tabs and tab groups in the sidebar and workspaces. |
| `bookmarks` | Show the user's bookmarks as stacks in the sidebar and on the new tab. |
| `history` | Search history from the sidebar search, and from the assistant when the user asks. |
| `sidePanel` | Open apps in the browser's side panel. |
| `storage`, `unlimitedStorage` | Keep settings, notes and the user's own wallpapers on this device. |
| `alarms` | Refresh status cards and the optional weekly backup. |
| `contextMenus` | Right-click items: ask AI about a page or selection, add to stacks, open a link in a mini window. |
| `identity` | Sign-in windows for OpenRouter and MCP servers the user connects. |
| `favicon` | Show site icons from the browser's own cache. |
| `search` | Run a search with the browser's default search engine from the sidebar or new tab, when the user has not picked an engine. |
| `webNavigation` (optional) | Link rules: open chosen links in the sidebar. Asked for when the user turns it on. |
| `downloads` (optional) | The opt-in weekly backup file. Asked for when the user turns it on. |

## Reviewer notes

Header changes apply only to sub-frames that sidegig itself opens, never to top-level pages; the trade-off is documented in the README's Security model. Test account: none needed. Load the extension, hover the left edge of any page, and click an app on the rail.
