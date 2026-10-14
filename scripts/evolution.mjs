#!/usr/bin/env node
// Keeps the project's history current: screenshots in docs/evolution and CHANGELOG.md.
//
//   npm run snap -- <image> "<caption>" [--date YYYY-MM-DD]
//     Copies a screenshot into docs/evolution (JPEG, longest side 1440 px) and adds it
//     to docs/evolution/README.md under a heading for the current commit.
//     Crop or blur private text (to-do items, emails, chat titles, inbox rows) first.
//
//   npm run changelog
//     Rewrites CHANGELOG.md from the git history of the current branch.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'docs', 'evolution');
const INDEX = join(DIR, 'README.md');

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function slugOf(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || 'screenshot'
  );
}

function add(args) {
  const dateAt = args.indexOf('--date');
  const date = dateAt >= 0 ? args[dateAt + 1] : today();
  const rest = dateAt >= 0 ? args.filter((_, i) => i !== dateAt && i !== dateAt + 1) : args;
  const [image, ...words] = rest;
  const caption = words.join(' ').trim();
  if (!image || !caption || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('Usage: npm run snap -- <image> "<caption>" [--date YYYY-MM-DD]');
    process.exit(1);
  }
  const src = resolve(process.cwd(), image);
  if (!existsSync(src)) {
    console.error(`No such image: ${src}`);
    process.exit(1);
  }

  const taken = readdirSync(DIR).filter((f) => f.startsWith(`${date}-`)).length;
  const base = `${date}-${String(taken + 1).padStart(2, '0')}-${slugOf(caption)}`;
  let file = `${base}.jpg`;
  try {
    // macOS: resize and convert in one step.
    execFileSync('sips', ['-Z', '1440', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', src, '--out', join(DIR, file)], { stdio: 'ignore' });
  } catch {
    file = `${base}${extname(src).toLowerCase() || '.png'}`;
    copyFileSync(src, join(DIR, file));
    console.warn('sips is not available; copied the image without resizing.');
  }

  const hash = git('log', '-1', '--format=%h');
  const subject = git('log', '-1', '--format=%s');
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const dirty = git('status', '--porcelain').length > 0;
  const text = readFileSync(INDEX, 'utf8').replace(/\s+$/, '');
  const headings = [...text.matchAll(/^## .*$/gm)];
  const lastHeading = headings.length ? headings[headings.length - 1][0] : '';
  const sameEntry = lastHeading.includes(date) && text.slice(headings.at(-1)?.index ?? 0).includes(`\`${hash}\``);
  const img = `<img src="${file}" width="49%" alt="${caption.replace(/"/g, '&quot;')}">`;
  const block = sameEntry
    ? `\n${img}\n`
    : `\n\n## ${date}: ${subject}\n\nCommit \`${hash}\` on branch \`${branch}\`${dirty ? ' (plus uncommitted work)' : ''}.\n\n${img}\n`;
  writeFileSync(INDEX, `${text}${block}`);
  console.log(`Added docs/evolution/${file}`);
}

function changelog() {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const lines = git('log', '--date=short', '--format=%ad%x09%h%x09%s').split('\n').filter(Boolean);
  const byDay = new Map();
  for (const line of lines) {
    const [day, hash, subject] = line.split('\t');
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(`- \`${hash}\` ${subject}`);
  }
  let out = `# Changelog\n\nGenerated from the git history of \`${branch}\` by \`npm run changelog\`. Newest first.\nScreenshots of each milestone: [docs/evolution](docs/evolution/README.md). Current state and next steps: [docs/STATUS.md](docs/STATUS.md).\n`;
  for (const [day, items] of byDay) out += `\n## ${day}\n\n${items.join('\n')}\n`;
  writeFileSync(join(ROOT, 'CHANGELOG.md'), out);
  console.log(`Wrote CHANGELOG.md (${lines.length} commits)`);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'add') add(args);
else if (cmd === 'changelog') changelog();
else {
  console.error('Usage: node scripts/evolution.mjs add <image> "<caption>" [--date YYYY-MM-DD] | changelog');
  process.exit(1);
}
