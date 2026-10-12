# Privacy

sidegig has no servers, no accounts and no analytics. Nothing you do in sidegig is sent to its developers.

## What is stored, and where

| Data | Where | Synced? |
|---|---|---|
| Settings (rail, theme, apps, AI prompts, link rules) | Browser extension storage | Yes, through your browser's own sync, if you use it |
| Custom CSS, workspaces, status card results, unread counts | Browser extension storage on this device | No |
| GitHub / Vercel tokens | Browser extension storage on this device | Never |
| Bookmark stacks | Your normal browser bookmarks | However your browser syncs bookmarks |

## Network requests sidegig makes

- **The sites you open** in sidegig (for example claude.ai when you click Claude), exactly as if you opened them yourself.
- **GitHub API** (`api.github.com`) with your token, only if you turn on the GitHub card.
- **Vercel API** (`api.vercel.com`) with your token, only if you turn on the Vercel card.
- **Gmail's unread feed** (`mail.google.com/mail/u/0/feed/atom`) with your existing Google sign-in, only if you turn on the Gmail card.
- **Site icons**: in Chrome-family browsers from the browser's own icon cache; in Firefox and Safari from the site's `/favicon.ico`.

## Page content

sidegig reads a page's text only when you ask AI about it (the rail button, the shortcut or the right-click menu). That text goes into the AI site you chose, in your browser. sidegig itself does not keep or send it anywhere else.

## Network header changes

To let sites load inside sidegig's own panel, sidegig removes the `X-Frame-Options` and `Content-Security-Policy` response headers, and marks the request as a normal page load, **only for frames that load inside sidegig's panel** (requests not attached to a browser tab, started by sidegig or going to your chosen app sites and their sign-in pages). Your normal browsing is never changed.
