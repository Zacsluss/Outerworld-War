// Builds the multiplayer relay -- test/serve.js, byte for byte, nothing ported -- into ONE self-contained
// executable with Node's single-executable-application build, and puts it where Tauri expects a sidecar:
//   desktop/src-tauri/binaries/bw-relay-<target triple>[.exe]
// The steps are Node's documented ones (nodejs.org/api/single-executable-applications.html):
//   1. copy test/serve.js to relay/build/bw-relay.js -- the SEA takes one script, and serve.js requires
//      only built-ins (http, fs, path, crypto, os), so there is nothing to bundle
//   2. node --experimental-sea-config sea-config.json                    -> bw-relay.blob
//   3. copy the node executable running this script                    -> bw-relay[.exe]  (~93 MB: it IS node)
//   4. postject injects the blob under NODE_SEA_BLOB with Node's fuse;  macOS: strip the signature first, ad-hoc sign after
//   5. copy to src-tauri/binaries/bw-relay-<triple>[.exe]              (tauri-build and the bundler rename it to bw-relay[.exe] beside the app)
//
// Measured on Node 24.19.0 before this was written (REVIEW-M17 task 28): inside the executable process.argv is
// [exe, exe, ...args], so serve.js's argv[2] (port) and argv[3] (delay) mean what they always meant; __dirname
// is the executable's directory, so the static half of serve.js points at a directory that holds no page and
// serves 404s -- harmless, the wrapper loads the page from its own bundle. The WebSocket protocol is the one
// test/rooms.js, test/net.js and test/net_many.js run against `node test/serve.js`; relay/check.js proves the build.
//
//   node relay/build.js [--target <triple>]     the triple defaults to `rustc -vV`'s host, then to the platform
//
// It cannot cross-build: a SEA is a copy of the node that runs this script, so the macOS binary is built on a
// Mac (and the Apple-silicon one on an Apple-silicon Mac), each with the same command. Bun's `bun build --compile`
// is the other route and is not installed here; nothing below depends on it.
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const here = __dirname, desktop = path.join(here, '..'), repo = path.join(desktop, '..');
const SRC = path.join(repo, 'test', 'serve.js');
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';   // Node's documented sentinel; the runtime looks for this exact string
const major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 20) { console.log('build:relay needs Node 20 or newer for the single-executable build; this is ' + process.version); process.exit(2); }
const argTarget = (() => { const i = process.argv.indexOf('--target'); return i > 0 ? process.argv[i + 1] || '' : ''; })();
const TRIPLES = { 'win32-x64': 'x86_64-pc-windows-msvc', 'win32-arm64': 'aarch64-pc-windows-msvc', 'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin', 'linux-x64': 'x86_64-unknown-linux-gnu', 'linux-arm64': 'aarch64-unknown-linux-gnu' };
function hostTriple() {
  if (argTarget) return argTarget;
  const r = spawnSync('rustc', ['-vV'], { encoding: 'utf8' }); const m = r.status === 0 && /^host: (\S+)/m.exec(r.stdout || '');
  if (m) return m[1];
  const t = TRIPLES[process.platform + '-' + process.arch];
  if (!t) { console.log('build:relay: no target triple known for ' + process.platform + '-' + process.arch + '; pass --target <triple>'); process.exit(2); }
  return t;
}
const run = (cmd, args, opts) => { const r = spawnSync(cmd, args, Object.assign({ stdio: 'inherit' }, opts || {})); if (r.status !== 0) { console.log('build:relay: `' + cmd + ' ' + args.join(' ') + '` failed (exit ' + r.status + (r.error ? ', ' + r.error.message : '') + ')'); process.exit(r.status || 1); } };

(async () => {
  const triple = hostTriple(), suffix = process.platform === 'win32' ? '.exe' : '';
  const build = path.join(here, 'build');
  fs.rmSync(build, { recursive: true, force: true }); fs.mkdirSync(build, { recursive: true });
  // 1. one script, verbatim -- the whole point of shipping the relay as a sidecar rather than a port
  fs.copyFileSync(SRC, path.join(build, 'bw-relay.js'));
  // 2. the blob. useCodeCache would start a few ms faster and is skipped on purpose: it ties the blob to
  //    this exact node build in one more way, and the relay starts once per hosted game.
  fs.writeFileSync(path.join(build, 'sea-config.json'), JSON.stringify({ main: 'bw-relay.js', output: 'bw-relay.blob', disableExperimentalSEAWarning: true }, null, 2) + '\n');
  run(process.execPath, ['--experimental-sea-config', 'sea-config.json'], { cwd: build });
  // 3. a copy of node
  const exe = path.join(build, 'bw-relay' + suffix);
  fs.copyFileSync(process.execPath, exe);
  if (process.platform === 'darwin') run('codesign', ['--remove-signature', exe]);
  // 4. inject. postject is a devDependency of desktop/package.json; `npm install` in desktop/ puts it here.
  let inject; try { inject = require('postject').inject; } catch (e) { console.log('build:relay: postject is not installed -- run `npm install` in desktop/ first (' + e.message + ')'); process.exit(2); }
  await inject(exe, 'NODE_SEA_BLOB', fs.readFileSync(path.join(build, 'bw-relay.blob')), Object.assign({ sentinelFuse: FUSE }, process.platform === 'darwin' ? { machoSegmentName: 'NODE_SEA' } : {}));
  if (process.platform === 'darwin') run('codesign', ['--sign', '-', exe]);
  // 5. where Tauri looks for the sidecar `binaries/bw-relay` named in tauri.conf.json
  const dest = path.join(desktop, 'src-tauri', 'binaries', 'bw-relay-' + triple + suffix);
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(exe, dest);
  if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
  console.log('build:relay: ' + dest + ' (' + (fs.statSync(dest).size / 1048576).toFixed(1) + ' MB, Node ' + process.version + ', from test/serve.js unchanged)\n  prove it answers a room join: npm run check:relay');
})().catch(e => { console.log('build:relay failed: ' + (e && e.stack || e)); process.exit(1); });
