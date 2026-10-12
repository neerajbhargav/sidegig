# Privacy

Margin has no servers, no accounts and no analytics. Nothing you do in Margin is sent to its developers.

## What is stored, and where

| Data | Where | Synced? |
|---|---|---|
| Settings (rail, theme, apps, AI prompts, link rules) | Browser extension storage | Yes, through your browser's own sync, if you use it |
| Custom CSS, workspaces, status card results, unread counts | Browser extension storage on this device | No |
| GitHub / Vercel tokens | Browser extension storage on this device | Never |
| Bookmark stacks | Your normal browser bookmarks | However your browser syncs bookmarks |

## Network requests Margin makes

- **The sites you open** in Margin (for example claude.ai when you click Claude), exactly as if you opened them yourself.
- **GitHub API** (`api.github.com`) with your token, only if you turn on the GitHub card.
- **Vercel API** (`api.vercel.com`) with your token, only if you turn on the Vercel card.
- **Gmail's unread feed** (`mail.google.com/mail/u/0/feed/atom`) with your existing Google sign-in, only if you turn on the Gmail card.
- **Site icons**: in Chrome-family browsers from the browser's own icon cache; in Firefox and Safari from the site's `/favicon.ico`.

## Page content

Margin reads a page's text only when you ask AI about it (the rail button, the shortcut or the right-click menu). That text goes into the AI site you chose, in your browser. Margin itself does not keep or send it anywhere else.

## Network header changes

To let sites load inside Margin's own panel, Margin removes the `X-Frame-Options` and `Content-Security-Policy` response headers, and marks the request as a normal page load, **only for frames that load inside Margin's panel** (requests not attached to a browser tab, started by Margin or going to your chosen app sites and their sign-in pages). Your normal browsing is never changed.
