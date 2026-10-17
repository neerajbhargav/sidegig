// Build sidegig for one or more browsers.
//   node scripts/build.mjs            -> all targets
//   node scripts/build.mjs chrome     -> one target
//   node scripts/build.mjs --zip      -> all targets + store zips
//   node scripts/build.mjs preview    -> UI preview bundle (mock browser APIs)
import { mkdir, rm, cp, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestFor, TARGETS } from './manifest.mjs';
import { configurePreview } from './preview.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const zip = args.includes('--zip');
const wanted = args.filter((a) => !a.startsWith('--'));
const targets = wanted.length ? wanted : TARGETS;

// Prefer native esbuild; fall back to the WebAssembly build where native binaries can't run.
async function loadEsbuild() {
  try {
    const native = await import('esbuild');
    await native.transform('let a = 1');
    return native;
  } catch {
    const wasm = await import('esbuild-wasm');
    return wasm.default ?? wasm;
  }
}

const entries = {
  background: 'src/background/index.ts',
  rail: 'src/content/rail.ts',
  framefit: 'src/content/framefit.ts',
  'framefit-main': 'src/content/framefit-main.ts',
  bridge: 'src/content/bridge.ts',
  ui: 'src/ui/main.ts',
  options: 'src/options/main.ts',
};

async function bundle(esbuild, target, outdir, extraEntries = {}) {
  await esbuild.build({
    entryPoints: Object.fromEntries(
      Object.entries({ ...entries, ...extraEntries }).map(([k, v]) => [k, path.join(root, v)]),
    ),
    outdir,
    bundle: true,
    format: 'iife',
    target: ['chrome130', 'firefox148', 'safari17'],
    loader: { '.css': 'text', '.svg': 'text' },
    define: { __TARGET__: JSON.stringify(target) },
    legalComments: 'none',
    minify: target !== 'preview',
    sourcemap: false,
    logLevel: 'warning',
  });
}

async function copyStatic(outdir) {
  for (const f of await readdir(path.join(root, 'src/pages'))) {
    await cp(path.join(root, 'src/pages', f), path.join(outdir, f));
  }
  await cp(path.join(root, 'src/ui/ui.css'), path.join(outdir, 'ui.css'));
  await cp(path.join(root, 'src/assets/icons'), path.join(outdir, 'icons'), { recursive: true });
  await cp(path.join(root, 'src/assets/fonts'), path.join(outdir, 'fonts'), { recursive: true });
  await cp(path.join(root, 'LICENSE'), path.join(outdir, 'LICENSE'));
  await cp(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(outdir, 'THIRD_PARTY_NOTICES.md'));
  for (const file of ['INSTALL.md', 'PRIVACY.md', 'README.md']) await cp(path.join(root, file), path.join(outdir, file));
}

const esbuild = await loadEsbuild();
for (const target of targets) {
  const outdir = path.join(root, 'dist', target);
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  if (target === 'preview') {
    await bundle(esbuild, 'preview', outdir, { shim: 'src/preview/shim.ts' });
    await copyStatic(outdir);
    await configurePreview(outdir);
    console.log('built preview ->', path.relative(root, outdir));
    continue;
  }
  await bundle(esbuild, target, outdir);
  await copyStatic(outdir);
  await writeFile(path.join(outdir, 'manifest.json'), JSON.stringify(manifestFor(target), null, 2));
  if (zip) {
    const file = path.join(root, 'dist', `sidegig-${target}.zip`);
    await rm(file, { force: true });
    execFileSync('zip', ['-qr', file, '.'], { cwd: outdir });
  }
  console.log('built', target, '->', path.relative(root, outdir));
}
if (existsSync(path.join(root, 'dist'))) process.exitCode = 0;
