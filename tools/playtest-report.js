'use strict';
// THE PLAYTEST REPORT: a recorded playtest (tools/playtest-listen.js) read back as a timeline a person can check the
// PLAYTEST items against.
//   node tools/playtest-report.js [session dir]        default: the newest under .claude/review/playtest/
//
// Per browser tab: when it opened and at what size; every screen shown (with the buttons on it, once); what was clicked on
// each screen, in order; settings written; lobby and connection messages; games started, how fast they ran, what stalled,
// how they ended; right-clicks with several units (a right-click followed by another inside eight seconds is marked
// SUPERSEDED -- its units were sent somewhere else before they could arrive); errors and warnings; notes.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), base = path.join(root, '.claude', 'review', 'playtest');
const dir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(base, fs.readdirSync(base).filter(d => /^\d{4}-/.test(d)).sort().pop() || '');
const file = path.join(dir, 'events.jsonl');
if (!fs.existsSync(file)) { console.log('no events.jsonl in ' + dir); process.exit(2); }
const events = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
const t = e => (e.at || '').slice(11, 19);
const cut = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n) + '...' : s; };
const tabs = new Map();
for (const e of events) { const k = e.tab + '.' + e.load; if (!tabs.has(k)) tabs.set(k, []); tabs.get(k).push(e); }
console.log('PLAYTEST ' + path.relative(root, dir) + ': ' + events.length + ' events, ' + tabs.size + ' page loads');
console.log('files: ' + fs.readdirSync(dir).join(', '));
for (const [k, list] of tabs) {
  list.sort((a, b) => a.seq - b.seq);
  const boot = list.find(e => e.t === 'boot');
  console.log('\n=== tab ' + k + (boot ? '  ' + t(boot) + '  ' + boot.w + 'x' + boot.h + ' @' + boot.dpr + '  build ' + boot.build + '  first screen ' + boot.panel : '') + '  (' + list.length + ' events)');
  if (boot && boot.storage) console.log('    stored at boot: ' + Object.keys(boot.storage).join(', '));
  const seen = new Set(); let clicks = [], keys = 0, lastPanel = boot ? boot.panel : '';
  const flush = () => { if (clicks.length || keys) console.log('    clicks: ' + clicks.join(' | ') + (keys ? '   [' + keys + ' keys]' : '')); clicks = []; keys = 0; };
  const gathers = list.filter(e => e.t === 'gather');
  for (const e of list) {
    switch (e.t) {
      case 'panel': flush(); lastPanel = e.id; console.log(t(e) + ' SCREEN ' + e.id + (seen.has(e.id) ? '' : '  -- ' + cut(e.text, 260))); seen.add(e.id); break;
      case 'click': clicks.push((e.id ? '#' + e.id : e.data ? Object.entries(e.data).map(([a, b]) => a + '=' + b).join(',') : e.tag) + (e.text ? ' "' + cut(e.text, 28) + '"' : '') + (e.disabled ? ' (disabled)' : '')); break;
      case 'change': clicks.push('change ' + (e.id ? '#' + e.id : e.data ? Object.entries(e.data).map(([a, b]) => a + '=' + b).join(',') : e.tag) + '=' + cut(e.value, 30)); break;
      case 'key': keys++; if (!e.game && e.on && (e.on.data || e.on.id)) clicks.push('key ' + e.key + ' on ' + (e.on.id ? '#' + e.on.id : Object.entries(e.on.data || {}).map(([a, b]) => a + '=' + b).join(','))); break;
      case 'storage': flush(); console.log(t(e) + ' SETTING ' + e.key + (e.removed ? ' removed' : e.bytes != null ? ' (' + e.bytes + ' bytes)' : ' = ' + cut(e.value, 220))); break;
      case 'net-status': flush(); console.log(t(e) + ' NET STATUS ' + cut(e.text, 120)); break;
      case 'net-error': flush(); console.log(t(e) + ' NET ERROR ' + cut(e.msg, 160)); break;
      case 'net-in': { let m = {}; try { m = JSON.parse(e.m); } catch (x) { } if (m.t === 'lobby') { const sig = m.state + '|' + (m.players || []).map(p => p.name + ':' + p.race + ':' + p.team + (p.ready ? '*' : '')).join(',') + '|' + m.layout; if (sig === list._lastLobby) break; list._lastLobby = sig; flush(); console.log(t(e) + ' LOBBY ' + m.state + ' ' + m.layout + ' ' + sig.split('|')[1]); } else if (m.t === 'start') { flush(); console.log(t(e) + ' NET START seed ' + m.seed + ' you ' + m.you + ' players ' + J(m.players)); } else if (m.t === 'sys') { flush(); console.log(t(e) + ' SYS ' + m.ev + ' ' + cut(J(m), 100)); } else if (!['lobbies', 'pings', 'hello', 'lobby'].includes(m.t)) { flush(); console.log(t(e) + ' NET IN ' + cut(e.m, 140)); } break; }
      case 'net-out': { let m = {}; try { m = JSON.parse(e.m); } catch (x) { } if (m.t === 'set' || m.t === 'join' || m.t === 'start' || m.t === 'addai' || m.t === 'leave') { flush(); console.log(t(e) + ' NET OUT ' + cut(e.m, 140)); } break; }
      case 'game-start': flush(); console.log(t(e) + ' GAME ' + e.game + ' START ' + e.summary); break;
      case 'load': flush(); console.log(t(e) + ' LOAD ' + e.mode + ' ' + e.info); break;
      case 'game-over': flush(); console.log(t(e) + ' GAME ' + e.game + ' OVER at ' + e.clock + ': ' + e.result); break;
      case 'stall': flush(); console.log(t(e) + ' STALL ' + e.what + '  supply ' + (e.player ? e.player.supUsed + '/' + e.player.supMax : '?') + '  minerals ' + (e.player ? e.player.minerals : '?')); break;
      case 'note': flush(); console.log(t(e) + ' NOTE "' + e.text + '" (' + e.where + ')'); break;
      case 'desync': flush(); console.log(t(e) + ' DESYNC frame ' + e.f); break;
      case 'error': case 'console-error': case 'console-warn': case 'resource': case 'alert': flush(); console.log(t(e) + ' ' + e.t.toUpperCase() + ' ' + cut(e.msg || (e.args && e.args.join(' ')) || e.src, 300) + (e.n > 1 ? ' (x' + e.n + ')' : '') + (e.stack ? '\n        ' + cut(e.stack, 400) : '')); break;
      case 'gather': { flush(); const next = gathers.find(g => g.seq > e.seq); const superseded = next && Date.parse(next.at) - Date.parse(e.at) < 8000; console.log(t(e) + ' RIGHT-CLICK ' + e.n + ' ' + e.types + (e.line ? ' LINE' : '') + ': spread ' + e.spreadBefore + ' -> ' + e.spreadAfter + ' px, farthest ' + e.farthestFromPoint + ' px' + (superseded ? '  SUPERSEDED' : '')); break; }
      case 'visibility': case 'resize': case 'pagehide': case 'skirmish': case 'rec': break;
    }
  }
  flush();
  const ticks = list.filter(e => e.t === 'tick' && e.mode === 'play' && !e.paused);
  if (ticks.length) {
    const fps = ticks.map(e => e.fps).filter(n => n > 0), tps = ticks.map(e => e.tps).filter(n => n != null);
    const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : '-'; };
    console.log('    in game: ' + ticks.length + ' samples, last clock ' + ticks[ticks.length - 1].clock + '; frames a second min ' + q(fps, 0) + ' / median ' + q(fps, 0.5) + '; game frames a second min ' + q(tps, 0) + ' / median ' + q(tps, 0.5) + ' (24 at speed 1.0)');
  }
}
function J(v) { return JSON.stringify(v); }
