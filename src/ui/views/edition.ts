// The new tab edition: a short, finite issue picked from your interests, with
// a Saved shelf you curate and an Interests page you (and your AI) control.
import { uid } from '../../shared/api.ts';
import { getLocal, setLocal, onLocalChanged, updateSettings } from '../../shared/storage.ts';
import { CATALOG, catalogById } from '../../shared/catalog.ts';
import { appFromCatalog } from '../../shared/defaults.ts';
import type { AppEntry, PendingPrompt } from '../../shared/types.ts';
import type { EdItem, EdKind, Edition, Interest, Profile, SavedItem } from '../../shared/edition/types.ts';
import { ED_KINDS, KIND_LABEL } from '../../shared/edition/types.ts';
import {
  addInterest,
  removeInterest,
  importPrompt,
  parseImport,
  mergeImport,
  learnFromSave,
  learnFromDismiss,
  learnFromOpen,
  sanitizeProfile,
} from '../../shared/edition/profile.ts';
import { leadOf, groupByKind } from '../../shared/edition/rank.ts';
import { xSearchUrl } from '../../shared/edition/sources.ts';
import { h, ico, iconButton, faviconOnly, hostOf, toast, ago } from '../dom.ts';
import { type Ctx, openApp, send } from '../ctx.ts';
import { seg, toggle } from './quick.ts';

type Tab = 'today' | 'saved' | 'interests';

interface EdStatus {
  building: boolean;
  at: number;
  errors: string[];
  imported?: { host: string; count: number; at: number };
}

const KIND_ICON: Record<EdKind, string> = { read: 'article', watch: 'play', podcast: 'headphones', book: 'book', paper: 'science', discuss: 'forum', music: 'music' };

const getProfile = async () => sanitizeProfile(await getLocal('edProfile', null));
const setProfile = (p: Profile) => setLocal('edProfile', p);

// ------------------------------------------------------------- on-device AI

/** Chrome's built-in model (Gemini Nano). Absent in most other browsers, which is fine. */
const LM = () => (globalThis as any).LanguageModel as any | undefined;
const LM_OPTS = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

async function aiAvailability(): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'> {
  const lm = LM();
  if (!lm?.availability) return 'unavailable';
  try {
    return await lm.availability(LM_OPTS);
  } catch {
    return 'unavailable';
  }
}

/**
 * Let the on-device model look over the picks: drop the ones that don't fit,
 * pull better ones up from the reserve, and say in a line why each is here.
 * Runs once per edition, on this computer.
 */
async function refine(ed: Edition, p: Profile): Promise<Edition | null> {
  if ((await aiAvailability()) !== 'available') return null;
  const list = [...ed.items, ...ed.reserve].slice(0, 22);
  if (!list.length) return null;
  const top = [...p.interests].sort((a, b) => b.weight - a.weight).slice(0, 14);
  const prompt = [
    `Reader: ${p.about || 'not given'}`,
    `Interests (weight 1-5): ${top.map((i) => `${i.term} (${Math.round(i.weight)})`).join(', ')}`,
    p.avoid.length ? `Avoid: ${p.avoid.join(', ')}` : '',
    '',
    'For each numbered item, rate how well it fits this reader from 0 to 10, and write one plain line (under 14 words) telling them why it is worth their time. No hype, no emoji.',
    '',
    ...list.map((it, n) => `${n}. [${KIND_LABEL[it.kind]}] ${it.title}${it.by ? ` (${it.by})` : ''} — found for "${it.topic}"`),
  ]
    .filter((l) => l !== null)
    .join('\n');
  const schema = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { n: { type: 'integer' }, fit: { type: 'integer', minimum: 0, maximum: 10 }, why: { type: 'string' } },
          required: ['n', 'fit', 'why'],
        },
      },
    },
    required: ['items'],
  };
  let session: any;
  try {
    session = await LM()!.create(LM_OPTS);
    const raw = await session.prompt(prompt, { responseConstraint: schema });
    const out = JSON.parse(raw) as { items: { n: number; fit: number; why: string }[] };
    const verdict = new Map(out.items.filter((x) => Number.isInteger(x.n) && list[x.n]).map((x) => [list[x.n].id, x]));
    const tidy = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 110);
    const keep = ed.items.filter((i) => (verdict.get(i.id)?.fit ?? 5) >= 4);
    const fill = ed.reserve.filter((i) => (verdict.get(i.id)?.fit ?? 0) >= 6).sort((a, b) => verdict.get(b.id)!.fit - verdict.get(a.id)!.fit);
    // Never shrink the edition by more than a third because of the model.
    while (keep.length < Math.max(ed.items.length - Math.floor(ed.items.length / 3), 1) && fill.length) keep.push(fill.shift()!);
    const withWhy = (i: EdItem) => {
      const v = verdict.get(i.id);
      return v?.why ? { ...i, why: tidy(v.why) } : i;
    };
    const used = new Set(keep.map((i) => i.id));
    return { ...ed, items: keep.map(withWhy), reserve: ed.reserve.filter((i) => !used.has(i.id)).map(withWhy), refined: true };
  } catch {
    return null;
  } finally {
    session?.destroy?.();
  }
}

// ------------------------------------------------------------- AI import

function aiApps(ctx: Ctx): AppEntry[] {
  const mine = ctx.settings.apps.filter((a) => catalogById(a.catalogId ?? a.id)?.aiInput?.length);
  const extra = ['claude', 'chatgpt', 'gemini'].filter((id) => !mine.some((a) => (a.catalogId ?? a.id) === id) && CATALOG.some((c) => c.id === id)).map(appFromCatalog);
  return [...mine, ...extra].slice(0, 3);
}

/** Open your AI with the interests prompt typed in; the bridge reads its JSON reply back. */
function askAi(ctx: Ctx, app: AppEntry) {
  const host = new URL(app.url).hostname;
  // The side panel only opens inside the click, so open first, then hand over the prompt.
  openApp(ctx, { ...app, openIn: app.openIn === 'drawer' ? 'panel' : app.openIn });
  // Same rule as Ask AI: typed in for you to read, sent only if you've turned on auto-send.
  const autoSend = ctx.settings.ai.autoSend;
  const p: PendingPrompt = { id: uid('p_'), appId: app.id, host, text: importPrompt(), autoSend, created: Date.now() };
  void setLocal('edImport', { host, at: Date.now() });
  void setLocal('aiPending', p);
  toast(autoSend ? `Asking ${app.name}. Your edition updates when it replies.` : `Prompt is ready in ${app.name}. Send it, and your edition updates when it replies.`);
}

function pasteBox(onDone: () => void): HTMLElement {
  const area = h('textarea', { class: 'text-input ed-paste', rows: 5, placeholder: 'Paste your AI’s reply (the JSON block) here' });
  const go = h('button', { class: 'btn primary', type: 'button' }, 'Use this');
  go.addEventListener('click', async () => {
    const imp = parseImport(area.value);
    if (!imp) return toast('Couldn’t find the profile in that text');
    await setProfile(mergeImport(await getProfile(), imp, 'pasted'));
    void send({ type: 'edition-build' }).catch(() => undefined);
    toast(`Added ${imp.topics.length + imp.music.length + imp.creators.length} interests`);
    onDone();
  });
  const copy = h('button', { class: 'btn', type: 'button' }, ico('copy', 16), 'Copy the prompt');
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(importPrompt());
    toast('Prompt copied. Paste it into any AI or agent.');
  });
  return h(
    'details',
    { class: 'ed-paste-wrap' },
    h('summary', {}, 'Use another AI or agent'),
    h('p', { class: 'muted' }, 'Copy the prompt into any assistant (ChatGPT on your phone, Claude Code, Codex…), then paste its reply here.'),
    h('div', { class: 'actions' }, copy),
    area,
    h('div', { class: 'actions' }, go),
  );
}

// ------------------------------------------------------------- cards

const whyOf = (i: EdItem, p: Profile) => {
  if (i.why) return i.why;
  const src = p.interests.find((x) => x.term.toLowerCase() === i.topic.toLowerCase());
  if (!i.topic) return '';
  if (src?.from === 'ai') return `Your AI says you’re into ${i.topic}`;
  if (src?.from === 'saves') return `You’ve been saving things about ${i.topic}`;
  return `You follow ${i.topic}`;
};

interface Actions {
  saved: Set<string>;
  profile: Profile;
  save(i: EdItem): void;
  dismiss(i: EdItem): void;
  open(i: EdItem): void;
}

function card(i: EdItem, a: Actions, lead = false): HTMLElement {
  const square = !lead && (i.kind === 'podcast' || i.kind === 'music' || i.kind === 'book');
  const shape = lead ? 'lead' : i.image ? (square ? 'square' : 'media') : 'text';
  const link = (cls: string, ...kids: (Node | string | null)[]) =>
    h('a', { class: cls, href: i.url, onclick: () => a.open(i), onauxclick: (e: MouseEvent) => e.button === 1 && a.open(i) }, ...kids);
  let media: HTMLElement | null = null;
  if (i.image) {
    const img = h('img', { src: i.image, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    media = link(`ed-media ${i.kind}`, img);
    const fail = () => {
      // Older YouTube videos may lack the sharp thumbnail: fall back once before giving up on the picture.
      if (img.src.includes('/hq720.jpg')) return void (img.src = img.src.replace('/hq720.jpg', '/mqdefault.jpg'));
      img.removeEventListener('error', fail);
      media?.remove();
      art.dataset.shape = 'text';
    };
    img.addEventListener('error', fail);
  }
  const saved = a.saved.has(i.id);
  const why = whyOf(i, a.profile);
  const art = h(
    'article',
    { class: 'ed-card', dataset: { shape, kind: i.kind } },
    media,
    h(
      'div',
      { class: 'ed-body' },
      h('div', { class: 'ed-kicker' }, faviconOnly(i.url, 'fav xs'), h('span', {}, [i.by, i.meta].filter(Boolean).join(' · ') || i.source)),
      link('ed-title', i.title),
      lead && i.summary ? h('p', { class: 'ed-sum' }, i.summary) : null,
      why ? h('div', { class: 'ed-why' }, i.why ? ico('sparkle', 14) : null, h('span', {}, why)) : null,
      i.discuss || i.alt
        ? h(
            'div',
            { class: 'ed-links' },
            i.discuss && i.discuss !== i.url ? h('a', { href: i.discuss }, 'Discussion') : null,
            i.alt ? h('a', { href: i.alt.url }, i.alt.label) : null,
          )
        : null,
    ),
    h(
      'div',
      { class: 'ed-actions' },
      iconButton(saved ? 'saved' : 'bookmarkAdd', saved ? 'Saved' : 'Save for later', () => a.save(i), saved),
      iconButton('notFor', 'Not for me', () => a.dismiss(i)),
    ),
  );
  return art;
}

// ------------------------------------------------------------- views

const editionName = (t: number) => {
  const hr = new Date(t).getHours();
  return hr < 12 ? 'Morning edition' : hr < 17 ? 'Afternoon edition' : 'Evening edition';
};
const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function setupCard(ctx: Ctx, rerender: () => void): HTMLElement {
  const input = h('input', { class: 'text-input', placeholder: 'Or type a few interests, comma separated' });
  const form = h('form', { class: 'ed-add' }, input, h('button', { class: 'btn', type: 'submit' }, 'Start'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const terms = input.value.split(',').map((t) => t.trim()).filter(Boolean);
    if (!terms.length) return;
    const p = await getProfile();
    for (const t of terms) addInterest(p, t, 3, 'you');
    await setProfile(p);
    void send({ type: 'edition-build' }).catch(() => undefined);
    rerender();
  });
  return h(
    'div',
    { class: 'ed-setup' },
    h('div', { class: 'ed-setup-title' }, ico('edition', 22), 'Your own front page'),
    h(
      'p',
      {},
      'Ask the AI you already use what you’re into. It writes a short list of your interests, sidegig reads it back, and every new tab becomes a small edition of articles, videos, podcasts, books and discussions picked for you. No feed, no ads, no tracking, and it ends.',
    ),
    h(
      'div',
      { class: 'actions' },
      aiApps(ctx).map((app, n) => h('button', { class: `btn${n === 0 ? ' primary' : ''}`, type: 'button', onclick: () => askAi(ctx, app) }, `Ask ${app.name}`)),
    ),
    form,
    pasteBox(rerender),
    h(
      'p',
      { class: 'ed-fine' },
      `${ctx.settings.ai.autoSend ? 'The prompt is sent to your AI for you.' : 'The prompt is typed into your AI for you to read and send.'} Your interests stay on this device; only short search phrases go to the sources you turn on.`,
    ),
  );
}

function todayView(ctx: Ctx, ed: Edition | null, st: EdStatus | null, a: Actions, rerender: () => void): HTMLElement {
  const wrap = h('div', { class: 'ed-today' });
  if (!a.profile.interests.length) return wrap.appendChild(setupCard(ctx, rerender)), wrap;
  if (!ed || !ed.items.length) {
    wrap.append(
      h(
        'div',
        { class: 'ed-empty' },
        st?.building ? 'Putting together your edition…' : ed ? 'Nothing new for your interests right now. Try adding a few more.' : 'Your first edition is on its way…',
      ),
    );
    if (!st?.building && !ed) void send({ type: 'edition-build' }).catch(() => undefined);
    return wrap;
  }
  const lead = leadOf(ed.items);
  if (lead) wrap.append(card(lead, a, true));
  const rest = ed.items.filter((i) => i !== lead);
  for (const [kind, items] of groupByKind(rest)) {
    wrap.append(
      h(
        'section',
        { class: 'ed-sec' },
        h('div', { class: 'ed-sec-h' }, ico(KIND_ICON[kind], 16), KIND_LABEL[kind]),
        h('div', { class: 'ed-grid', dataset: { kind } }, items.map((i) => card(i, a))),
      ),
    );
  }
  const topics = a.profile.interests.filter((i) => !i.kinds?.length).sort((x, y) => y.weight - x.weight).slice(0, 5);
  if (topics.length) {
    wrap.append(
      h(
        'section',
        { class: 'ed-sec' },
        h('div', { class: 'ed-sec-h' }, ico('forum', 16), 'Posts on X', h('span', { class: 'ed-sec-note' }, 'live search, opens X')),
        h('div', { class: 'chips' }, topics.map((t) => h('a', { class: 'chip', href: xSearchUrl(t.term) }, t.term))),
      ),
    );
  }
  const next = ed.built + ctx.settings.edition.refreshHours * 3_600_000;
  wrap.append(
    h(
      'div',
      { class: 'ed-end' },
      h('div', {}, 'That’s today’s edition.'),
      h('div', { class: 'muted' }, `Next one around ${clock(next)}. Save what you like and wave off what you don’t; the next edition learns from both.`),
      ed.errors.length ? h('div', { class: 'ed-fine' }, `Couldn’t reach: ${ed.errors.map((e) => e.split(':')[0]).join(', ')}`) : null,
    ),
  );
  return wrap;
}

function savedView(saved: SavedItem[], rerender: () => void, filter: { kind: EdKind | 'all' }): HTMLElement {
  const wrap = h('div', { class: 'ed-saved' });
  if (!saved.length) {
    wrap.append(h('div', { class: 'ed-empty' }, 'Nothing saved yet. Save from the edition, or right-click any page or link and choose “Save to your reading list”.'));
    return wrap;
  }
  const kinds = ED_KINDS.filter((k) => saved.some((s) => s.kind === k));
  wrap.append(
    h(
      'div',
      { class: 'chips' },
      h('button', { class: 'chip', type: 'button', 'aria-pressed': String(filter.kind === 'all'), onclick: () => ((filter.kind = 'all'), rerender()) }, `All ${saved.length}`),
      kinds.map((k) =>
        h('button', { class: 'chip', type: 'button', 'aria-pressed': String(filter.kind === k), onclick: () => ((filter.kind = k), rerender()) }, `${KIND_LABEL[k]} ${saved.filter((s) => s.kind === k).length}`),
      ),
    ),
  );
  const list = h('div', { class: 'ed-list' });
  for (const s of saved.filter((x) => filter.kind === 'all' || x.kind === filter.kind)) {
    list.append(
      h(
        'div',
        { class: 'ed-row' },
        s.image ? h('img', { class: `ed-thumb ${s.kind}`, src: s.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('span', { class: 'ed-thumb icon' }, ico(KIND_ICON[s.kind], 18)),
        h(
          'div',
          { class: 'ed-row-body' },
          h('a', { class: 'ed-title', href: s.url }, s.title),
          h('div', { class: 'ed-kicker' }, h('span', {}, [s.by ?? hostOf(s.url), `saved ${ago(s.savedAt)}`].join(' · '))),
        ),
        iconButton('trash', 'Remove', async () => {
          const all = await getLocal<SavedItem[]>('edSaved', []);
          await setLocal('edSaved', all.filter((x) => x.id !== s.id));
        }),
      ),
    );
  }
  const exp = h('button', { class: 'btn', type: 'button' }, 'Export as JSON');
  exp.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'sidegig-reading-list.json' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  wrap.append(list, h('div', { class: 'actions', style: { marginTop: '14px' } }, exp));
  return wrap;
}

function weightDots(i: Interest, onPick: (w: number) => void): HTMLElement {
  const w = Math.round(i.weight);
  return h(
    'span',
    { class: 'ed-dots', title: `How much: ${w} of 5` },
    [1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', class: n <= w ? 'on' : '', 'aria-label': `Set to ${n} of 5`, onclick: () => onPick(n) })),
  );
}

async function interestsView(ctx: Ctx, p: Profile, rebuildSoon: () => void): Promise<HTMLElement> {
  const wrap = h('div', { class: 'ed-int' });
  const edit = async (fn: (p: Profile) => void) => {
    const cur = await getProfile();
    fn(cur);
    await setProfile(cur);
    rebuildSoon();
  };
  const FROM: Record<Interest['from'], string> = { you: 'you', ai: 'your AI', saves: 'your saves' };
  const chipFor = (i: Interest) =>
    h(
      'span',
      { class: 'ed-ichip', dataset: { from: i.from }, title: `From ${FROM[i.from]}` },
      h('span', { class: 'ed-iterm' }, i.term),
      weightDots(i, (w) =>
        void edit((x) => {
          const t = x.interests.find((y) => y.term === i.term);
          if (t) Object.assign(t, { weight: w, from: 'you', updated: Date.now() });
        }),
      ),
      h('button', { class: 'ed-x', type: 'button', 'aria-label': `Remove ${i.term}`, onclick: () => void edit((x) => void removeInterest(x, i.term)) }, '×'),
    );
  const group = (title: string, note: string, list: Interest[], kinds: EdKind[] | undefined, placeholder: string) => {
    const input = h('input', { class: 'text-input', placeholder });
    const form = h('form', { class: 'ed-add' }, input, h('button', { class: 'btn', type: 'submit' }, 'Add'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const terms = input.value.split(',').map((t) => t.trim()).filter(Boolean);
      if (terms.length) void edit((x) => terms.forEach((t) => addInterest(x, t, 3, 'you', kinds)));
    });
    return h(
      'section',
      { class: 'ed-sec' },
      h('div', { class: 'ed-sec-h' }, title, h('span', { class: 'ed-sec-note' }, note)),
      h('div', { class: 'ed-ichips' }, list.sort((a, b) => b.weight - a.weight).map(chipFor)),
      form,
    );
  };
  const topics = p.interests.filter((i) => !i.kinds?.length);
  const musicI = p.interests.filter((i) => i.kinds?.length === 1 && i.kinds[0] === 'music');
  const creators = p.interests.filter((i) => i.kinds?.length && !(i.kinds.length === 1 && i.kinds[0] === 'music'));

  const from = p.importedFrom
    ? h('p', { class: 'muted' }, `${p.about ? `“${p.about}” ` : ''}Last filled in by ${p.importedFrom === 'pasted' ? 'a pasted reply' : p.importedFrom} ${p.importedAt ? ago(p.importedAt) : ''}.`)
    : h('p', { class: 'muted' }, 'Your AI can fill this in for you. It only takes one prompt.');
  wrap.append(
    h(
      'section',
      { class: 'ed-sec ed-from' },
      from,
      h('div', { class: 'actions' }, aiApps(ctx).map((app) => h('button', { class: 'btn', type: 'button', onclick: () => askAi(ctx, app) }, `Update from ${app.name}`))),
      pasteBox(() => undefined),
    ),
    group('Topics', 'searched across articles, videos, podcasts, books and discussions', topics, undefined, 'Add topics, e.g. agent evals, Japanese minimal fashion'),
    group('Music', 'genres or artists', musicI, ['music'], 'Add music, e.g. Telugu indie'),
    group('People', 'writers, podcasters, channels', creators, ['watch', 'podcast', 'book'], 'Add people, e.g. Naval Ravikant'),
  );

  const avoidIn = h('input', { class: 'text-input', placeholder: 'Never show me…' });
  const avoidForm = h('form', { class: 'ed-add' }, avoidIn, h('button', { class: 'btn', type: 'submit' }, 'Add'));
  avoidForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = avoidIn.value.trim();
    if (t) void edit((x) => void (x.avoid = [...new Set([...x.avoid, t])]));
  });
  wrap.append(
    h(
      'section',
      { class: 'ed-sec' },
      h('div', { class: 'ed-sec-h' }, 'Avoid'),
      h('div', { class: 'ed-ichips' }, p.avoid.map((t) => h('span', { class: 'ed-ichip' }, h('span', { class: 'ed-iterm' }, t), h('button', { class: 'ed-x', type: 'button', 'aria-label': `Remove ${t}`, onclick: () => void edit((x) => void (x.avoid = x.avoid.filter((y) => y !== t))) }, '×')))),
      avoidForm,
    ),
  );

  const k = ctx.settings.edition.kinds;
  wrap.append(
    h(
      'section',
      { class: 'ed-sec' },
      h('div', { class: 'ed-sec-h' }, 'In your edition'),
      h(
        'div',
        { class: 'chips' },
        ED_KINDS.map((kind) =>
          h(
            'button',
            {
              class: 'chip',
              type: 'button',
              'aria-pressed': String(k[kind]),
              onclick: () => {
                void updateSettings((s) => void (s.edition.kinds[kind] = !s.edition.kinds[kind]));
                rebuildSoon();
              },
            },
            ico(KIND_ICON[kind], 16),
            KIND_LABEL[kind],
          ),
        ),
      ),
    ),
  );

  // On-device AI: offered, never assumed (the first use downloads a model).
  const av = await aiAvailability();
  if (av !== 'unavailable') {
    const line = h('span', { class: 'muted' });
    const row = h('div', { class: 'opt' }, h('div', {}, h('div', {}, 'Smarter picks with on-device AI'), line), null);
    if (av === 'available') {
      line.textContent = 'Reviews each edition and explains every pick. Runs inside your browser; nothing leaves this computer.';
      row.append(toggle(ctx.settings.edition.onDeviceAi, (v) => void updateSettings((s) => void (s.edition.onDeviceAi = v)), 'On-device AI'));
    } else {
      line.textContent = 'Your browser can download a small model that runs locally (a few GB, once). Free and private.';
      const btn = h('button', { class: 'btn', type: 'button' }, av === 'downloading' ? 'Downloading…' : 'Turn on');
      btn.addEventListener('click', async () => {
        btn.textContent = 'Downloading…';
        try {
          const s = await LM()!.create({
            ...LM_OPTS,
            monitor(m: any) {
              m.addEventListener('downloadprogress', (e: any) => (btn.textContent = `Downloading ${Math.round((e.loaded ?? 0) * 100)}%`));
            },
          });
          s.destroy?.();
          btn.textContent = 'Ready';
          toast('On-device AI is ready');
        } catch {
          btn.textContent = 'Not available here';
        }
      });
      row.append(btn);
    }
    wrap.append(h('section', { class: 'ed-sec' }, row));
  }
  wrap.append(
    h(
      'p',
      { class: 'ed-fine' },
      'How picks work: sidegig searches Hacker News, Substack, Google News, YouTube, Apple Podcasts, Open Library, arXiv and Reddit for your interests (signed out), then ranks by how well each result fits, how fresh it is and how much people valued it. Nothing is ranked by what keeps you scrolling, and each edition ends. Your interests and saves stay on this device.',
    ),
  );
  return wrap;
}

// ------------------------------------------------------------- section

export async function editionSection(ctx: Ctx): Promise<HTMLElement> {
  const root = h('section', { class: 'ed', 'aria-label': 'Your edition' });
  const remember = {
    get: () => {
      try {
        return sessionStorage.getItem('sidegig.edTab') as Tab | null;
      } catch {
        return null;
      }
    },
    set: (t: Tab) => {
      try {
        sessionStorage.setItem('sidegig.edTab', t);
      } catch {
        /* storage blocked: fine, the tab just won't be remembered */
      }
    },
  };
  let tab: Tab = remember.get() || 'today';
  const filter: { kind: EdKind | 'all' } = { kind: 'all' };
  let rebuildTimer = 0;
  const rebuildSoon = () => {
    clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(() => void send({ type: 'edition-build' }).catch(() => undefined), 2500);
  };

  let rendering = false;
  let again = false;
  const render = async () => {
    if (rendering) return void (again = true);
    rendering = true;
    try {
      const [ed, st, profile, saved] = await Promise.all([
        getLocal<Edition | null>('edition', null),
        getLocal<EdStatus | null>('edStatus', null),
        getProfile(),
        getLocal<SavedItem[]>('edSaved', []),
      ]);
      const savedIds = new Set(saved.map((s) => s.id));
      const actions: Actions = {
        saved: savedIds,
        profile,
        async save(i) {
          const all = await getLocal<SavedItem[]>('edSaved', []);
          if (all.some((x) => x.id === i.id)) {
            await setLocal('edSaved', all.filter((x) => x.id !== i.id));
            return toast('Removed from saved');
          }
          await setLocal('edSaved', [{ ...i, savedAt: Date.now() }, ...all].slice(0, 1000));
          await setProfile(learnFromSave(await getProfile(), i));
          toast('Saved. Expect more like this.');
        },
        async dismiss(i) {
          const [cur, dis] = await Promise.all([getLocal<Edition | null>('edition', null), getLocal<Record<string, number>>('edDismissed', {})]);
          dis[i.id] = Date.now();
          const keys = Object.keys(dis);
          if (keys.length > 3000) for (const k of keys.sort((x, y) => dis[x] - dis[y]).slice(0, keys.length - 3000)) delete dis[k];
          await setLocal('edDismissed', dis);
          await setProfile(learnFromDismiss(await getProfile(), i));
          if (cur) {
            const at = cur.items.findIndex((x) => x.id === i.id);
            const items = cur.items.filter((x) => x.id !== i.id);
            // Refill from the reserve, never with something already saved or waved off.
            const savedNow = new Set((await getLocal<SavedItem[]>('edSaved', [])).map((x) => x.id));
            const reserve = cur.reserve.filter((x) => !savedNow.has(x.id) && !dis[x.id]);
            const same = reserve.findIndex((x) => x.kind === i.kind);
            const swap = reserve.splice(same >= 0 ? same : 0, 1)[0];
            if (swap && at >= 0) items.splice(at, 0, swap);
            await setLocal('edition', { ...cur, items, reserve });
          }
          toast('Got it. Less like that.');
        },
        open(i) {
          void getProfile().then((p) => setProfile(learnFromOpen(p, i)));
        },
      };

      const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      const head = h(
        'div',
        { class: 'ed-head' },
        h(
          'div',
          { class: 'ed-mast' },
          h('div', { class: 'ed-name' }, tab === 'today' && ed ? editionName(ed.built) : 'Your edition'),
          h('div', { class: 'ed-date' }, date, ed && tab === 'today' ? ` · ${st?.building ? 'updating…' : `updated ${ago(ed.built)}`}` : ''),
        ),
        h(
          'div',
          { class: 'ed-tools' },
          seg<Tab>(tab, [['today', 'Today'], ['saved', `Saved${saved.length ? ` ${saved.length}` : ''}`], ['interests', 'Interests']], (t) => {
            tab = t;
            remember.set(t);
            void render();
          }),
          profile.interests.length
            ? iconButton('refresh', 'New edition now', () => {
                void send({ type: 'edition-build' }).catch(() => undefined);
                toast('Building a fresh edition…');
              })
            : null,
        ),
      );
      const body =
        tab === 'today'
          ? todayView(ctx, ed, st, actions, () => void render())
          : tab === 'saved'
            ? savedView(saved, () => void render(), filter)
            : await interestsView(ctx, profile, rebuildSoon);
      root.replaceChildren(head, body);

      if (tab === 'today' && ed?.items.length) {
        // Count what you've been shown, once per edition, so it doesn't keep coming back.
        if (!ed.counted) {
          const seen = await getLocal<Record<string, number>>('edSeen', {});
          for (const i of ed.items) seen[i.id] = (seen[i.id] ?? 0) + 1;
          const keys = Object.keys(seen);
          if (keys.length > 4000) for (const k of keys.slice(0, keys.length - 4000)) delete seen[k];
          await setLocal('edSeen', seen);
          await setLocal('edition', { ...ed, counted: true });
        }
        // Let on-device AI review the picks once (one tab does it; the others wait).
        if (ctx.settings.edition.onDeviceAi && !ed.refined) {
          const lock = await getLocal<number>('edRefining', 0);
          if (Date.now() - lock > 120_000) {
            await setLocal('edRefining', Date.now());
            const better = await refine(ed, profile);
            const cur = await getLocal<Edition | null>('edition', null);
            if (better && cur?.id === ed.id) await setLocal('edition', { ...better, counted: cur.counted });
            await setLocal('edRefining', 0);
          }
        }
      }
    } finally {
      rendering = false;
      if (again) {
        again = false;
        void render();
      }
    }
  };

  // Re-render on changes, but never under someone typing.
  let pending = 0;
  const changed = () => {
    clearTimeout(pending);
    pending = window.setTimeout(() => {
      const a = document.activeElement as HTMLInputElement | null;
      if (a && root.contains(a) && /INPUT|TEXTAREA/.test(a.tagName) && a.value) {
        a.addEventListener('blur', () => void render(), { once: true });
        return;
      }
      void render();
    }, 120);
  };
  const offs = ['edition', 'edStatus', 'edProfile', 'edSaved'].map((k) => onLocalChanged(k, () => (root.isConnected ? changed() : offs.forEach((off) => off()))));
  offs.push(
    onLocalChanged('edStatus', (v) => {
      const imp = (v as EdStatus | null)?.imported;
      if (root.isConnected && imp && Date.now() - imp.at < 5000) toast(`Got ${imp.count} interests from ${imp.host}`);
    }),
  );
  await render();
  return root;
}
