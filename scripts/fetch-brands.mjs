// Brand icons for the built-in apps, from Simple Icons (CC0 1.0, https://simpleicons.org).
// Used only when the browser doesn't know a site's icon yet (it shows a blank globe
// until you've visited the site). Brand names and logos belong to their owners.
// Run: node scripts/fetch-brands.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// catalog id -> Simple Icons slug
const SLUGS = {
  claude: 'claude', chatgpt: 'openai', gemini: 'googlegemini', perplexity: 'perplexity', whatsapp: 'whatsapp',
  telegram: 'telegram', messenger: 'messenger', slack: 'slack', discord: 'discord', gmail: 'gmail',
  calendar: 'googlecalendar', keep: 'googlekeep', translate: 'googletranslate', ytmusic: 'youtubemusic',
  spotify: 'spotify', x: 'x', grok: 'x', linkedin: 'linkedin', reddit: 'reddit', instagram: 'instagram', notion: 'notion',
  linear: 'linear', github: 'github', todoist: 'todoist',
  // AI providers on the new tab's AI switch
  aimode: 'google', lechat: 'mistralai', leo: 'brave',
};
// Sites people bookmark: host -> Simple Icons slug. Anything not listed (or not in
// Simple Icons) keeps the browser's own site icon.
const DOMAINS = {
  'google.com': 'google', 'mail.google.com': 'gmail', 'drive.google.com': 'googledrive', 'docs.google.com': 'googledocs',
  'calendar.google.com': 'googlecalendar', 'maps.google.com': 'googlemaps', 'photos.google.com': 'googlephotos', 'meet.google.com': 'googlemeet',
  'keep.google.com': 'googlekeep', 'translate.google.com': 'googletranslate', 'news.google.com': 'googlenews', 'scholar.google.com': 'googlescholar',
  'gemini.google.com': 'googlegemini', 'notebooklm.google.com': 'google', 'youtube.com': 'youtube', 'music.youtube.com': 'youtubemusic',
  'github.com': 'github', 'gitlab.com': 'gitlab', 'bitbucket.org': 'bitbucket', 'vercel.com': 'vercel', 'netlify.com': 'netlify',
  'supabase.com': 'supabase', 'cloudflare.com': 'cloudflare', 'render.com': 'render', 'railway.app': 'railway', 'fly.io': 'flydotio',
  'heroku.com': 'heroku', 'digitalocean.com': 'digitalocean', 'firebase.google.com': 'firebase', 'npmjs.com': 'npm', 'pypi.org': 'pypi',
  'docker.com': 'docker', 'hub.docker.com': 'docker', 'kaggle.com': 'kaggle', 'huggingface.co': 'huggingface', 'leetcode.com': 'leetcode',
  'stackoverflow.com': 'stackoverflow', 'codepen.io': 'codepen', 'replit.com': 'replit', 'codesandbox.io': 'codesandbox', 'stackblitz.com': 'stackblitz',
  'developer.mozilla.org': 'mdnwebdocs', 'news.ycombinator.com': 'ycombinator', 'ycombinator.com': 'ycombinator', 'workatastartup.com': 'ycombinator',
  'producthunt.com': 'producthunt', 'dev.to': 'devdotto', 'hashnode.com': 'hashnode', 'medium.com': 'medium', 'substack.com': 'substack',
  'arxiv.org': 'arxiv', 'overleaf.com': 'overleaf', 'zotero.org': 'zotero', 'wikipedia.org': 'wikipedia', 'en.wikipedia.org': 'wikipedia',
  'figma.com': 'figma', 'dribbble.com': 'dribbble', 'behance.net': 'behance', 'framer.com': 'framer', 'webflow.com': 'webflow', 'canva.com': 'canva',
  'notion.so': 'notion', 'notion.com': 'notion', 'calendar.notion.so': 'notion', 'linear.app': 'linear', 'slack.com': 'slack', 'app.slack.com': 'slack',
  'discord.com': 'discord', 'web.whatsapp.com': 'whatsapp', 'whatsapp.com': 'whatsapp', 'web.telegram.org': 'telegram', 'telegram.org': 'telegram',
  'signal.org': 'signal', 'messenger.com': 'messenger', 'zoom.us': 'zoom', 'trello.com': 'trello', 'asana.com': 'asana', 'atlassian.com': 'atlassian',
  'atlassian.net': 'jira', 'todoist.com': 'todoist', 'app.todoist.com': 'todoist', 'evernote.com': 'evernote', 'obsidian.md': 'obsidian',
  'airtable.com': 'airtable', 'dropbox.com': 'dropbox', 'box.com': 'box', 'icloud.com': 'icloud', 'apple.com': 'apple', 'proton.me': 'proton',
  'calendar.proton.me': 'protoncalendar', 'mail.proton.me': 'protonmail', 'fastmail.com': 'fastmail',
  'x.com': 'x', 'twitter.com': 'x', 'threads.net': 'threads', 'bsky.app': 'bluesky', 'mastodon.social': 'mastodon', 'reddit.com': 'reddit',
  'instagram.com': 'instagram', 'facebook.com': 'facebook', 'pinterest.com': 'pinterest', 'tumblr.com': 'tumblr', 'tiktok.com': 'tiktok',
  'snapchat.com': 'snapchat', 'quora.com': 'quora', 'twitch.tv': 'twitch', 'vimeo.com': 'vimeo', 'spotify.com': 'spotify', 'open.spotify.com': 'spotify',
  'music.apple.com': 'applemusic', 'soundcloud.com': 'soundcloud', 'bandcamp.com': 'bandcamp', 'netflix.com': 'netflix', 'primevideo.com': 'primevideo',
  'disneyplus.com': 'disneyplus', 'hbomax.com': 'hbo', 'max.com': 'hbo', 'hulu.com': 'hulu', 'crunchyroll.com': 'crunchyroll', 'letterboxd.com': 'letterboxd',
  'goodreads.com': 'goodreads', 'imdb.com': 'imdb', 'steampowered.com': 'steam', 'store.steampowered.com': 'steam', 'epicgames.com': 'epicgames',
  'playstation.com': 'playstation', 'nintendo.com': 'nintendo', 'chess.com': 'chessdotcom', 'lichess.org': 'lichess',
  'chatgpt.com': 'openai', 'chat.openai.com': 'openai', 'openai.com': 'openai', 'claude.ai': 'claude', 'anthropic.com': 'anthropic',
  'perplexity.ai': 'perplexity', 'chat.mistral.ai': 'mistralai', 'mistral.ai': 'mistralai', 'grok.com': 'x', 'chat.deepseek.com': 'deepseek',
  'copilot.microsoft.com': 'githubcopilot', 'poe.com': 'poe', 'ollama.com': 'ollama', 'langchain.com': 'langchain', 'smith.langchain.com': 'langchain',
  'amazon.com': 'amazon', 'ebay.com': 'ebay', 'etsy.com': 'etsy', 'shopify.com': 'shopify', 'ikea.com': 'ikea', 'target.com': 'target',
  'bestbuy.com': 'bestbuy', 'walmart.com': 'walmart', 'costco.com': 'costco', 'uber.com': 'uber', 'lyft.com': 'lyft', 'doordash.com': 'doordash',
  'instacart.com': 'instacart', 'airbnb.com': 'airbnb', 'booking.com': 'bookingdotcom', 'expedia.com': 'expedia', 'tripadvisor.com': 'tripadvisor',
  'yelp.com': 'yelp', 'paypal.com': 'paypal', 'venmo.com': 'venmo', 'stripe.com': 'stripe', 'dashboard.stripe.com': 'stripe', 'wise.com': 'wise',
  'revolut.com': 'revolut', 'robinhood.com': 'robinhood', 'coinbase.com': 'coinbase', 'cash.app': 'cashapp', 'chase.com': 'chase',
  'americanexpress.com': 'americanexpress', 'discover.com': 'discover', 'sofi.com': 'sofi', 'experian.com': 'experian', 'creditkarma.com': 'creditkarma',
  'duolingo.com': 'duolingo', 'coursera.org': 'coursera', 'udemy.com': 'udemy', 'edx.org': 'edx', 'khanacademy.org': 'khanacademy',
  'nytimes.com': 'newyorktimes', 'theguardian.com': 'theguardian', 'bbc.com': 'bbc', 'bbc.co.uk': 'bbc', 'economist.com': 'theeconomist',
  'bloomberg.com': 'bloomberg', 'reuters.com': 'reuters', 'wsj.com': 'wallstreetjournal', 'theverge.com': 'theverge', 'wired.com': 'wired',
  'techcrunch.com': 'techcrunch', 'ft.com': 'financialtimes', 'feedly.com': 'feedly', 'pocket.com': 'pocket', 'readwise.io': 'readwise',
  'unsplash.com': 'unsplash', 'pexels.com': 'pexels', 'wallhaven.cc': 'wallhaven', 'awwwards.com': 'awwwards', 'glassdoor.com': 'glassdoor',
  'indeed.com': 'indeed', 'wellfound.com': 'wellfound', 'upwork.com': 'upwork', 'fiverr.com': 'fiverr', 'greenhouse.io': 'greenhouse',
  'calendly.com': 'calendly', 'loom.com': 'loom', 'miro.com': 'miro', 'excalidraw.com': 'excalidraw', 'raycast.com': 'raycast', 'arc.net': 'arc',
  'brave.com': 'brave', 'opera.com': 'opera', 'mozilla.org': 'firefoxbrowser', 'vivaldi.com': 'vivaldi', 'cursor.com': 'cursor',
  'lovable.dev': 'lovable', 'bolt.new': 'stackblitz', 'v0.dev': 'v0', 'v0.app': 'v0', 'openrouter.ai': 'openrouter', 'apify.com': 'apify',
};
const CDN = 'https://cdn.jsdelivr.net/npm/simple-icons@15';
const meta = await (await fetch(`${CDN}/data/simple-icons.json`)).json();
const list = Array.isArray(meta) ? meta : meta.icons;
const slugOf = (t) => t.toLowerCase().replace(/\+/g, 'plus').replace(/\./g, 'dot').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const out = path.join(root, 'src/assets/icons/brands');
await mkdir(out, { recursive: true });
const HEX = { chatgpt: '000000' }; // the real mark is black, not the corporate purple
const dark = [];
const done = [];
for (const [id, slug] of Object.entries(SLUGS)) {
  const res = await fetch(`${CDN}/icons/${slug}.svg`);
  if (!res.ok) {
    console.log(id, slug, 'not in Simple Icons, skipped');
    continue;
  }
  const svg = await res.text();
  const m = list.find((i) => (i.slug ?? slugOf(i.title)) === slug);
  const hex = HEX[id] ?? m?.hex ?? '1f1f1f';
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255);
  if (0.2126 * r + 0.7152 * g + 0.0722 * b < 0.12) dark.push(id);
  const d = svg.match(/<path d="([^"]+)"/)?.[1];
  if (!d) {
    console.log(id, slug, 'no path, skipped');
    continue;
  }
  done.push(id);
  await writeFile(path.join(out, `${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#${hex}" d="${d}"/></svg>\n`);
  console.log(id, slug, hex);
}
// Site logos by domain (file name = slug), with each brand's colour for the colour style.
const hexOf = {};
const domains = {};
const fetched = new Set();
for (const [host, slug] of Object.entries(DOMAINS)) {
  if (!fetched.has(slug)) {
    const res = await fetch(`${CDN}/icons/${slug}.svg`);
    const d = res.ok ? (await res.text()).match(/<path d="([^"]+)"/)?.[1] : null;
    if (!d) {
      console.log(host, slug, 'not in Simple Icons, skipped');
      fetched.add(slug);
      continue;
    }
    const m = list.find((i) => (i.slug ?? slugOf(i.title)) === slug);
    hexOf[slug] = (m?.hex ?? '1f1f1f').toLowerCase();
    await writeFile(path.join(out, `${slug}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#${hexOf[slug]}" d="${d}"/></svg>\n`);
    fetched.add(slug);
  }
  if (hexOf[slug]) domains[host] = slug;
}
for (const id of done) hexOf[id] ??= (HEX[id] ?? list.find((i) => (i.slug ?? slugOf(i.title)) === SLUGS[id])?.hex ?? '1f1f1f').toLowerCase();
console.log(Object.keys(domains).length, 'domains,', Object.keys(hexOf).length, 'logos');
await writeFile(
  path.join(root, 'src/shared/brands.ts'),
  `// Generated by scripts/fetch-brands.mjs from Simple Icons (CC0). Do not edit.\n` +
    `/** Catalog apps with a bundled brand icon (icons/brands/<id>.svg). */\nexport const BRAND_ICONS = new Set(${JSON.stringify(done)});\n` +
    `/** Black logos: shown inverted on dark surfaces. */\nexport const DARK_BRANDS = new Set(${JSON.stringify(dark)});\n` +
    `/** Site host -> logo file (icons/brands/<file>.svg). */\nexport const BRAND_DOMAINS: Record<string, string> = ${JSON.stringify(domains)};\n` +
    `/** Logo file -> brand colour (hex, no #). */\nexport const BRAND_HEX: Record<string, string> = ${JSON.stringify(hexOf)};\n`,
);
