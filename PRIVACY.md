# Privacy

sidegig has no servers, no accounts and no analytics. Nothing you do in sidegig is sent to its developers.

## What is stored, and where

| Data | Where | Synced? |
|---|---|---|
| Settings (rail, theme, apps, AI prompts, link rules) | Browser extension storage | Yes, through your browser's own sync, if you use it |
| Custom CSS, workspaces, status card results, unread counts | Browser extension storage on this device | No |
| GitHub / Vercel tokens | Browser extension storage on this device | Never |
| Bookmark stacks | Your normal browser bookmarks | However your browser syncs bookmarks |
| Edition interests, reading list, what you've been shown or waved off | Browser extension storage on this device | No |

## Network requests sidegig makes

- **The sites you open** in sidegig (for example claude.ai when you click Claude), exactly as if you opened them yourself.
- **GitHub API** (`api.github.com`) with your token, only if you turn on the GitHub card.
- **Vercel API** (`api.vercel.com`) with your token, only if you turn on the Vercel card.
- **Gmail's unread feed** (`mail.google.com/mail/u/0/feed/atom`) with your existing Google sign-in, only if you turn on the Gmail card.
- **Site icons**: in Chrome-family browsers from the browser's own icon cache; in Firefox and Safari from the site's `/favicon.ico`.
- **The new tab edition**, only once you've given it interests: short search phrases (your interests, never your profile, saves or history) go to the sources you keep on: Hacker News (Algolia), Substack, Google News, YouTube, Apple's iTunes Search, Open Library, arXiv and Reddit. These requests are sent signed out (no cookies), so they don't touch your accounts or their recommendations. Pictures in the edition load from those services.

## Your AI and the edition

When you click “Ask Claude” (or ChatGPT, Gemini) on the new tab, sidegig types one prompt into that AI asking it to describe your interests as a JSON block, and sends it only if you've turned on auto-send for Ask AI. While that request is pending (up to 20 minutes), sidegig looks on that AI's page for the reply block marked `sidegig_profile` and reads only that. It never reads your other conversations. The prompt asks the AI to leave out anything private or sensitive, and you can edit or delete every interest afterwards.

If your browser has a built-in model (Gemini Nano in Chrome), sidegig can ask it to review each edition and explain picks. That runs on your computer; nothing is sent anywhere. You can turn it off in Settings → New tab edition.

## Page content

sidegig reads a page's text only when you ask AI about it (the rail button, the shortcut or the right-click menu). That text goes into the AI site you chose, in your browser. sidegig itself does not keep or send it anywhere else.

## Network header changes

To let sites load inside sidegig's own panel, sidegig removes the `X-Frame-Options` and `Content-Security-Policy` response headers, and marks the request as a normal page load, **only for frames that load inside sidegig's panel** (requests not attached to a browser tab, started by sidegig or going to your chosen app sites and their sign-in pages). Your normal browsing is never changed.

## Wallpaper collections

When you pick a collection (Cars, Anime, Tech...) or type your own words, sidegig
sends those search words, signed out, to Wallhaven, NASA's image library or Bing,
and downloads the matching pictures and small thumbnails. Nothing else is sent.
Pictures, rankings and anything you hide stay in this browser's local storage.
App icons are checked locally against the browser's own icon cache.
