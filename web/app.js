// Labels: a page editor in mm, rendered in the browser to the printer's dots (384 wide, 8/mm) for printd.
// Objects: svg (dropped files and templates, their texts editable), image, text, box, line, cable.
// One render path: the page's objects as SVG markup. On screen inline (page fonts); to print as an image,
// the fonts it uses embedded as data, then drawn at 8 dots/mm: shapes and text thresholded, pictures dithered.
'use strict';
const $ = id => document.getElementById(id);
const PAPER = ['mode', 'length', 'gap', 'width', 'left', 'tear', 'cut'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const r2 = v => Math.round(v * 100) / 100;
const CLIP = 'labels-objects:';
const UI_ICONS = {"visibility":"M600.5-379.5Q650-429 650-500t-49.5-120.5Q551-670 480-670t-120.5 49.5Q310-571 310-500t49.5 120.5Q409-330 480-330t120.5-49.5Zm-200-41Q368-453 368-500t32.5-79.5Q433-612 480-612t79.5 32.5Q592-547 592-500t-32.5 79.5Q527-388 480-388t-79.5-32.5ZM216-283Q98-366 40-500q58-134 176-217t264-83q146 0 264 83t176 217q-58 134-176 217t-264 83q-146 0-264-83Zm264-217Zm222.5 174.5Q804-391 857-500q-53-109-154.5-174.5T480-740q-121 0-222.5 65.5T102-500q54 109 155.5 174.5T480-260q121 0 222.5-65.5Z","visibility_off":"m629-419-44-44q26-71-27-118t-115-24l-44-44q17-11 38-16t43-5q71 0 120.5 49.5T650-500q0 22-5.5 43.5T629-419Zm129 129-40-40q49-36 85.5-80.5T857-500q-50-111-150-175.5T490-740q-42 0-86 8t-69 19l-46-47q35-16 89.5-28T485-800q143 0 261.5 81.5T920-500q-26 64-67 117t-95 93Zm58 226L648-229q-35 14-79 21.5t-89 7.5q-146 0-265-81.5T40-500q20-52 55.5-101.5T182-696L56-822l42-43 757 757-39 44ZM223-654q-37 27-71.5 71T102-500q51 111 153.5 175.5T488-260q33 0 65-4t48-12l-64-64q-11 5-27 7.5t-30 2.5q-70 0-120-49t-50-121q0-15 2.5-30t7.5-27l-97-97Zm305 142Zm-116 58Z","lock":"M220-80q-24.75 0-42.37-17.63Q160-115.25 160-140v-434q0-24.75 17.63-42.38Q195.25-634 220-634h70v-96q0-78.85 55.61-134.42Q401.21-920 480.11-920q78.89 0 134.39 55.58Q670-808.85 670-730v96h70q24.75 0 42.38 17.62Q800-598.75 800-574v434q0 24.75-17.62 42.37Q764.75-80 740-80H220Zm0-60h520v-434H220v434Zm314.5-162.03Q557-324.06 557-355q0-30-22.67-54.5t-54.5-24.5q-31.83 0-54.33 24.5t-22.5 55q0 30.5 22.67 52.5t54.5 22q31.83 0 54.33-22.03ZM350-634h260v-96q0-54.17-37.88-92.08-37.88-37.92-92-37.92T388-822.08q-38 37.91-38 92.08v96ZM220-140v-434 434Z","delete":"M261-120q-24.75 0-42.37-17.63Q201-155.25 201-180v-570h-41v-60h188v-30h264v30h188v60h-41v570q0 24-18 42t-42 18H261Zm438-630H261v570h438v-570ZM367-266h60v-399h-60v399Zm166 0h60v-399h-60v399ZM261-750v570-570Z","lock_open":"M220-634h390v-96q0-54.17-37.88-92.08-37.88-37.92-92-37.92T388-822.08q-38 37.91-38 92.08h-60q0-79 55.61-134.5 55.6-55.5 134.5-55.5 78.89 0 134.39 55.58Q670-808.85 670-730v96h70q24.75 0 42.38 17.62Q800-598.75 800-574v434q0 24.75-17.62 42.37Q764.75-80 740-80H220q-24.75 0-42.37-17.63Q160-115.25 160-140v-434q0-24.75 17.63-42.38Q195.25-634 220-634Zm0 494h520v-434H220v434Zm314.5-162.03Q557-324.06 557-355q0-30-22.67-54.5t-54.5-24.5q-31.83 0-54.33 24.5t-22.5 55q0 30.5 22.67 52.5t54.5 22q31.83 0 54.33-22.03ZM220-140v-434 434Z"};   // Material Symbols, for the layer rows
const uiIcon = n => `<svg viewBox="0 -960 960 960" width="15" height="15" fill="currentColor"><path d="${UI_ICONS[n]}"/></svg>`;

let st = null;                              // printd's status
let doc = { pages: [[]] };                  // objects per page, mm
let page = 0, sel = null, nextId = 1;
let multi = new Set();                        // selected besides sel (Shift click)
let undo = [], redo = [];

// ---- persistence, undo

function saveLocal() { try { localStorage.setItem('labels.doc', JSON.stringify(doc)); } catch (e) {} share(); }
function loadLocal() {
  try { const d = JSON.parse(localStorage.getItem('labels.doc')); if (d && d.pages) setDoc(d); } catch (e) {}
}
function setDoc(d) {
  doc = d; page = Math.min(page, doc.pages.length - 1); sel = null; multi.clear();
  nextId = 1 + Math.max(0, ...flat(doc.pages.flat()).map(o => o.id));
}
function commit() { undo.push(JSON.stringify(doc)); if (undo.length > 100) undo.shift(); redo = []; }
function changed() { pruneCuts(); saveLocal(); draw(); props(); layers(); }
function undoStep(back) {
  const from = back ? undo : redo, to = back ? redo : undo;
  if (!from.length) return;
  to.push(JSON.stringify(doc)); const id = sel; setDoc(JSON.parse(from.pop()));
  sel = objs().some(o => o.id === id) ? id : null; changed();
}

// ---- api

async function api(path, opt) {
  const r = await fetch(path, opt), j = await r.json();
  if (j.error) throw new Error(j.error);
  return j;
}
let msgT;
function say(t) { const m = $('msg'); m.textContent = t; m.classList.toggle('on', !!t); clearTimeout(msgT); if (t) msgT = setTimeout(() => m.classList.remove('on'), 4000); }

// ---- the paper

const paper = () => st.paper[st.selected];
const objs = () => doc.pages[page];
const find = id => objs().find(o => o.id === id);
const flat = os => os.flatMap(o => (o.kind === 'group' ? [o, ...flat(o.kids)] : [o]));     // groups opened
const reid = (o, map) => { const old = o.id; o.id = nextId++; if (map) map[old] = o.id; if (o.kids) o.kids.forEach(k => reid(k, map)); return o; };      // a copy: its own ids
// copies of links whose ends were copied too join the copies
const relink = (os, map) => { for (const o of os) if (o.kind === 'link') { if (map[o.a]) o.a = map[o.a]; if (map[o.b]) o.b = map[o.b]; } return os; };
const chosen = () => objs().filter(o => o.id === sel || multi.has(o.id));
function selNone() { sel = null; multi.clear(); }
function setChosen(ids) { sel = ids.length ? ids[ids.length - 1] : null; multi = new Set(ids.slice(0, -1)); }
function toggleChosen(id) {     // in the selection, or out of it
  if (id === sel) { const r = [...multi]; sel = r.pop() ?? null; multi = new Set(r); }
  else if (multi.has(id)) multi.delete(id);
  else { if (sel != null) multi.add(sel); sel = id; }
}
// tiles made by Repeat share a `tile` id with their cut lines (`cutOf`): the cut lines go with the last tile on a page
// and a link goes when either of its ends does
function pruneCuts() {
  doc.pages = doc.pages.map(pg => {
    const all = flat(pg), sets = new Set(all.filter(o => o.tile).map(o => o.tile)), ids = new Set(all.map(o => o.id));
    const gone = o => (o.cutOf && !sets.has(o.cutOf)) || (o.kind === 'link' && !(ids.has(o.a) && ids.has(o.b)));
    return pg.some(gone) ? pg.filter(o => !gone(o)) : pg;
  });
}
function removeObjs(cs) {
  if (!cs.length) return;
  commit(); doc.pages[page] = objs().filter(x => !cs.includes(x)); selNone(); changed();
}

function geo(pg = objs(), forPrint = false) {
  const p = paper(), D = st.dpmm, PW = st.width / D;
  if (p.mode === 'labels') return { W: p.width, H: p.length, left: p.left, PW, labels: true, lost: wholeOn() ? 0 : st.lost_mm ?? p.tear };
  const bottom = Math.max(0, ...pg.filter(o => !o.hidden).map(o => vis(o).y + vis(o).h));
  const H = forPrint ? Math.max(5, bottom + 1) : Math.max(30, bottom + 15);
  return { W: PW, H, left: 0, PW, labels: false, lost: 0 };
}
// the printable band in page mm
const band = g => ({ x0: Math.max(0, -g.left), x1: Math.min(g.W, -g.left + g.PW) });

// ---- geometry of an object: x, y, w, h its box unturned, rot (degrees) about its centre

const rad = o => (o.rot || 0) * Math.PI / 180;
function corner(o, lx, ly) {      // a point in the object's own box → page mm
  const a = rad(o), c = Math.cos(a), s = Math.sin(a), dx = lx - o.w / 2, dy = ly - o.h / 2;
  return { x: o.x + o.w / 2 + dx * c - dy * s, y: o.y + o.h / 2 + dx * s + dy * c };
}
function vis(o) {                 // the box around it as drawn (on black: with the black margin)
  const a = rad(o), c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)), m = 2 * negPad(o);
  const w = (o.w + m) * c + (o.h + m) * s, h = (o.w + m) * s + (o.h + m) * c;
  return { x: o.x + o.w / 2 - w / 2, y: o.y + o.h / 2 - h / 2, w, h };
}
// white behind: a white box under the object (its box, a margin, rounded), so it reads on something black. Codes and
// markers have it unless turned off: their quiet zone has to be white.
const whiteOn = o => o.kind !== 'link' && !o.neg && (o.bg ?? (o.kind === 'code' || o.kind === 'marker'));
function whiteBehind(o) {
  if (!whiteOn(o)) return '';
  const m = dots(o.bgPad ?? 0.5), r = o.bgR ?? 0.5;
  return `<rect x="${-m}" y="${-m}" width="${r2(o.w + 2 * m)}" height="${r2(o.h + 2 * m)}" rx="${r}" fill="#fff"/>`;
}
const negPad = o => (o.neg ? Math.round((o.negPad || 0) * 8) / 8 : 0);    // whole dots
const normRot = r => r2(((r % 360) + 360) % 360);

function add(o, place = true) {
  o.id = nextId++; o.rot = o.rot || 0;
  if (place) {      // the first free spot from the top left (below the tear zone), else over the others
    const spot = freeSpot(o), g = geo(), b = band(g);
    o.x = spot ? spot.x : b.x0 + 0.4;
    o.y = spot ? spot.y : (g.labels && $('avoid').checked ? g.lost + 0.5 : 0.5);
    if (!spot && objs().length) say('no free space for it: put over the others');
  }
  objs().push(o); sel = o.id;
  return o;
}

// ---- fonts: the store's, by family (weights and styles as @font-face descriptors), and by PostScript name and
// file name (what a Sketch SVG asks for: font-family="Inter-Bold"). Only the index is fetched at the start; a font
// is given to the browser when something on the page uses it, and the browser downloads the faces it draws.

const GENERIC = ['sans-serif', 'serif', 'monospace', 'system-ui', 'cursive'];
const SYSTEM = ['Helvetica Neue', 'Helvetica', 'Arial', 'Menlo', 'Georgia'];
const families = {};    // family → [face]
const alias = {};       // PostScript / file name → face
const fontData = {};    // file → data: URL
const cssFamily = f => (GENERIC.includes(f) ? f : `"${f}", sans-serif`);
const stem = n => n.replace(/\.(ttf|otf|woff2?|ttc)$/i, '');
const fontUrl = f => `/store/fonts/${encodeURIComponent(f.file)}`;

async function loadFonts() {
  const { fonts } = await api('/api/fonts');
  for (const k in families) delete families[k];
  for (const k in alias) delete alias[k];
  for (const f of fonts) (families[f.family] = families[f.family] || []).push(f);
  for (const f of fonts) for (const a of [f.ps, stem(f.file)]) if (a && !alias[a] && !families[a]) alias[a] = f;
  for (const k in families) families[k].sort((a, b) => a.weight - b.weight || a.italic - b.italic);
  $('fonts').innerHTML = `<div class="hint">${fonts.length} faces, ${Object.keys(families).length} families</div>`;
}
const given = new Set();
function useFont(name) {     // the family's faces, or the one face a PostScript / file name means
  if (given.has(name)) return;
  const fs = families[name] ? families[name] : alias[name] ? [alias[name]] : null;
  if (!fs) return;
  given.add(name);
  for (const f of fs) {
    const desc = families[name] ? { weight: String(f.weight), style: f.italic ? 'italic' : 'normal' } : {};
    try { document.fonts.add(new FontFace(name, `url(${fontUrl(f)})`, desc)); } catch (e) {}
  }
}
const fontNames = css => css.split(',').map(n => n.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
const pendingFonts = new Set();
function needFont(spec) {       // a font not loaded yet: measure again once it is
  if (document.fonts.check(spec) || pendingFonts.has(spec)) return;
  pendingFonts.add(spec);
  document.fonts.load(spec).then(() => { flat(doc.pages.flat()).forEach(o => { if (o.kind === 'text') fitText(o); if (o.kind === 'icon' && o.num) iconBox(o); }); draw(); }).catch(() => {});
}
// the face a family, weight and style come out in
function face(family, weight = 400, italic = false) {
  const fs = families[family];
  if (!fs) return alias[family] || null;
  const st = fs.filter(f => f.italic === !!italic);
  return (st.length ? st : fs).reduce((a, b) => Math.abs(b.weight - weight) < Math.abs(a.weight - weight) ? b : a);
}

const measureCtx = document.createElement('canvas').getContext('2d');
function measure(text, font, size, weight = 400, italic = false) {
  const spec = `${italic ? 'italic ' : ''}${weight} 100px ${cssFamily(font)}`;
  if (families[font] || alias[font]) { useFont(font); needFont(spec); }
  measureCtx.font = spec;
  const m = measureCtx.measureText(text || ' '), k = size / 100;
  return { w: m.width * k, asc: (m.fontBoundingBoxAscent || 80) * k, desc: (m.fontBoundingBoxDescent || 20) * k };
}
function fitText(o) {   // a text object's box follows its text; its top left corner stays put, turned or not
  const lines = o.text.split('\n'), lh = o.size * 1.15;
  const ms = lines.map(l => measure(l, o.font, o.size, o.weight, o.italic));
  const w = r2(Math.max(1, ...ms.map(m => m.w))), h = r2(ms[0].asc + ms[0].desc + (lines.length - 1) * lh);
  if (o.w && o.x != null) {
    const c0 = corner(o, 0, 0), a = rad(o), c = Math.cos(a), s = Math.sin(a);
    o.w = w; o.h = h;
    o.x = r2(c0.x + w / 2 * c - h / 2 * s - w / 2);
    o.y = r2(c0.y + w / 2 * s + h / 2 * c - h / 2);
  } else { o.w = w; o.h = h; }
}

// the faces a page needs, as @font-face rules with the fonts in them
async function fontCss(pg, body) {
  const want = new Map();     // file → { name, descriptors? }
  const use = (name, weight, italic, exact) => {
    if (families[name]) {
      const fs = exact ? [face(name, weight, italic)] : families[name];
      fs.forEach(f => want.set(f.file + '|' + name, { f, name, desc: `font-weight:${f.weight};font-style:${f.italic ? 'italic' : 'normal'};` }));
    } else if (alias[name]) want.set(alias[name].file + '|' + name, { f: alias[name], name, desc: '' });
  };
  for (const o of pg) {
    if (o.kind === 'text') use(o.font, o.weight, o.italic, true);
    if (['cable', 'wire', 'pins'].includes(o.kind)) use(o.font, 700, false, true);
    if (o.kind === 'filament') use(o.font, 400, false, false);
    if (o.kind === 'marker' && o.caption) use(o.font, 400, false, true);
  }
  const names = new Set();    // what the SVGs ask for
  for (const m of body.matchAll(/font-family(?:="|:\s*)([^";}>]+)/g)) fontNames(m[1]).forEach(n => names.add(n));
  names.forEach(n => { if (!pg.some(o => ['text', 'cable', 'wire', 'pins', 'marker', 'filament'].includes(o.kind) && o.font === n)) use(n, 400, false, false); });
  await Promise.all([...want.values()].map(async ({ f }) => {
    if (fontData[f.file]) return;
    const b = await (await fetch(fontUrl(f))).blob();
    fontData[f.file] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
  }));
  return [...want.values()].map(({ f, name, desc }) => `@font-face{font-family:"${name}";${desc}src:url(${fontData[f.file]})}`).join('');
}

// ---- the font picker: families in their own face, a search

let pickCb = null;
const pop = $('fontpop');
// the fonts picked lately, first in the picker; text styles (font, size, weight) lately used, as chips on a text
let recentFonts = [], recentStyles = [];
try { recentFonts = JSON.parse(localStorage.getItem('labels.recentFonts')) || []; recentStyles = JSON.parse(localStorage.getItem('labels.styles')) || []; } catch (e) {}
function rememberFont(f) {
  recentFonts = [f, ...recentFonts.filter(x => x !== f)].slice(0, 8);
  try { localStorage.setItem('labels.recentFonts', JSON.stringify(recentFonts)); } catch (e) {}
}
const styleKey = t => `${t.font}|${t.size}|${t.weight}|${t.italic ? 1 : 0}`;
function rememberStyle(o) {
  if (!o || o.kind !== 'text') return;
  const t = { font: o.font, size: o.size, weight: o.weight, italic: !!o.italic };
  recentStyles = [t, ...recentStyles.filter(x => styleKey(x) !== styleKey(t))].slice(0, 6);
  try { localStorage.setItem('labels.styles', JSON.stringify(recentStyles)); } catch (e) {}
}
function styleChips() {
  if (!recentStyles.length) return '';
  return `<div class="field"><div>recent styles</div><div class="chips">${recentStyles.map((t, i) => (useFont(t.font),
    `<button data-style="${i}" title="${esc(t.font)}, ${t.size} mm, ${t.weight}${t.italic ? ', italic' : ''}" style="font-family:${esc(cssFamily(t.font))};font-weight:${t.weight}${t.italic ? ';font-style:italic' : ''}">${esc(t.font.length > 14 ? t.font.slice(0, 13) + '…' : t.font)} ${t.size}</button>`)).join('')}</div></div>`;
}
function pickFont(btn, current, cb) {
  pickCb = f => { rememberFont(f); cb(f); };
  const r = btn.getBoundingClientRect();
  pop.style.left = Math.min(r.left, innerWidth - 300) + 'px';
  pop.style.top = Math.min(r.bottom + 4, innerHeight - 380) + 'px';
  pop.hidden = false;
  $('fontq').value = ''; listFonts(current); $('fontq').focus();
}
function listFonts(current) {
  const q = $('fontq').value.trim().toLowerCase();
  const all = [...GENERIC, ...SYSTEM, ...Object.keys(families).sort((a, b) => a.localeCompare(b))];
  const rows = all.filter(f => !q || f.toLowerCase().includes(q));
  const row = f => `<div class="frow${f === current ? ' on' : ''}" data-f="${esc(f)}"><span class="prev">${esc(f)}</span><small>${families[f] ? families[f].length : ''}</small></div>`;
  const recent = q ? [] : recentFonts.filter(f => all.includes(f));
  $('fontrows').innerHTML = (recent.length ? `<div class="fhead">Recent</div>${recent.map(row).join('')}<div class="fhead">All</div>` : '') + (rows.map(row).join('') || '<div class="hint">no such font</div>');
  const on = $('fontrows').querySelector('.on'); if (on) on.scrollIntoView({ block: 'center' });
}
$('fontq').oninput = () => listFonts();
$('fontq').onkeydown = e => {
  if (e.key === 'Escape') pop.hidden = true;
  if (e.key === 'Enter') { const r = $('fontrows').querySelector('.frow'); if (r) { pickCb(r.dataset.f); pop.hidden = true; } }
};
$('fontrows').onclick = e => { const r = e.target.closest('.frow'); if (r) { pickCb(r.dataset.f); pop.hidden = true; } };
addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.fontbtn')) pop.hidden = true; });
$('cFontBtn').onclick = e => pickFont(e.currentTarget, $('cFont').value, f => { useFont(f); $('cFont').value = f; $('cFontBtn').textContent = f; $('cFontBtn').style.fontFamily = cssFamily(f); });

// ---- SVG objects

// svg units: Sketch writes px as points (its 58 mm artboard is 165 px)
function svgSize(root) {
  const unit = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 72, '': 25.4 / 72 };
  const vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const len = (a, i) => {
    const m = /^([\d.]+)\s*([a-z]*)$/i.exec(root.getAttribute(a) || '');
    if (m) return +m[1] * (unit[m[2].toLowerCase()] ?? unit.px);
    return vb.length === 4 ? vb[i] * unit.px : 20;
  };
  const w = parseFloat(root.getAttribute('width')) || 100, h = parseFloat(root.getAttribute('height')) || 100;
  return { w: len('width', 2), h: len('height', 3), vb: vb.length === 4 ? vb.join(' ') : `0 0 ${w} ${h}` };
}
function parseSvg(src) {
  const d = new DOMParser().parseFromString(src, 'image/svg+xml');
  if (d.documentElement.nodeName !== 'svg' || d.querySelector('parsererror')) throw new Error('not an SVG');
  return d;
}
function svgObject(src, name) {
  const d = parseSvg(src), s = svgSize(d.documentElement), g = geo(), b = band(g);
  const k = Math.min(1, (b.x1 - b.x0 - 2) / s.w, (g.H - 2) / s.h);    // bigger than the page: fit it
  return { kind: 'svg', name: name || 'svg', src, vb: s.vb, w: r2(s.w * k), h: r2(s.h * k), texts: [] };
}
// the texts of an SVG, in order: what a template lets you change
const svgTexts = d => [...d.querySelectorAll('text')].filter(t => !t.closest('defs,clipPath,mask,symbol'));
const parsed = new Map();
function svgDoc(o) {
  if (!parsed.has(o.src)) {     // once per SVG: the fonts it asks for
    const d = parseSvg(o.src); parsed.set(o.src, d);
    for (const m of o.src.matchAll(/font-family(?:="|:\s*)([^";}>]+)/g)) fontNames(m[1]).forEach(useFont);
  }
  return parsed.get(o.src);
}
function setText(el, v) {
  const lines = String(v).split('\n'), spans = [...el.querySelectorAll('tspan')];
  if (!spans.length) { el.textContent = v; return; }
  spans.forEach((sp, i) => { sp.textContent = i < lines.length ? (i === spans.length - 1 ? lines.slice(i).join(' ') : lines[i]) : ''; });
}
// the SVG's inside, its texts set, its ids and classes made its own (two of one template, or two Sketch
// files both with "path-1", must not find each other's)
function svgInner(o) {
  const d = svgDoc(o).documentElement.cloneNode(true), texts = svgTexts(d);
  (o.texts || []).forEach((v, i) => { if (v != null && texts[i]) setText(texts[i], v); });
  const p = `o${o.id}-`;
  let s = [...d.childNodes].map(n => new XMLSerializer().serializeToString(n)).join('');
  s = s.replace(/\sxmlns(:\w+)?="[^"]*"/g, '')
    .replace(/\bid="([^"]+)"/g, `id="${p}$1"`)
    .replace(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g, `url(#${p}$1)`)
    .replace(/(xlink:)?href="#([^"]+)"/g, `href="#${p}$2"`)
    .replace(/\bclass="([^"]+)"/g, (m, c) => `class="${c.split(/\s+/).map(x => p + x).join(' ')}"`)
    .replace(/<style([^>]*)>([\s\S]*?)<\/style>/g, (m, a, css) => `<style${a}>${css.replace(/\.([A-Za-z_][\w-]*)/g, `.${p}$1`)}</style>`);
  const keep = [...d.attributes].filter(a => !/^(width|height|viewBox|x|y|xmlns.*|version|id|class)$/.test(a.name))
    .map(a => ` ${a.name}="${esc(a.value)}"`).join('');
  return `<g${keep}>${s}</g>`;
}

// ---- cable flags: the text over a fold, again under it turned round, a tail to wrap the cable

function cableInner(o) {
  const { F, hh, T, th } = o, sw = 0.25, pad = Math.min(1, hh * 0.15), fx = o.side === 'l' ? T : 0;
  const font = cssFamily(o.font).replace(/"/g, "'");
  let sa = hh * 0.55, sb = hh * 0.38;     // big 55% of the half, small 38%, shrunk together to fit
  const wa = measure(o.a, o.font, sa, 700).w, wb = measure(o.b, o.font, sb, 700).w;
  const k = Math.min(1, (F - 3 * pad) / Math.max(0.1, wa + wb + pad));
  sa *= k; sb *= k;
  const half = `<text x="${pad}" y="${hh / 2}" dominant-baseline="central" font-family="${font}" font-weight="700" font-size="${r2(sa)}">${esc(o.a)}</text>` +
    `<text x="${F - pad}" y="${hh / 2}" dominant-baseline="central" text-anchor="end" font-family="${font}" font-weight="700" font-size="${r2(sb)}">${esc(o.b)}</text>`;
  const tail = o.side === 'l'
    ? `<path d="M${T} ${hh}H${sw / 2}V${hh + th}H${T}" fill="none" stroke="#000" stroke-width="${sw}"/>`
    : `<path d="M${F} ${hh - th}H${F + T - sw / 2}V${hh}H${F}" fill="none" stroke="#000" stroke-width="${sw}"/>`;
  return `<g transform="translate(${fx} 0)">` +
    `<rect x="${sw / 2}" y="${sw / 2}" width="${F - sw}" height="${2 * hh - sw}" fill="#fff" stroke="#000" stroke-width="${sw}"/>` +
    `<line x1="0" x2="${F}" y1="${hh}" y2="${hh}" stroke="#000" stroke-width="0.125" stroke-dasharray="0.5 0.5"/>` +
    half + `<g transform="translate(${F} ${2 * hh}) rotate(180)">${half}</g></g>` + tail;
}
function cableBox(o) { o.w = r2(o.F + o.T); o.h = r2(2 * o.hh); }

// ---- codes: bwip-js (web/vendor, loaded when first needed) gives the modules; drawn here, every module a whole
// number of printer dots, the code put on the head's dot grid, so the smallest sizes print as they should

const CODES = {     // bcid: [name, 2d?, example, quiet zone in modules (smallest that reads well)]
  qrcode: ['QR code', true, 'https://noop.pw', 2], microqrcode: ['Micro QR', true, 'A12', 2],
  datamatrix: ['Data Matrix', true, 'it-0001', 1], datamatrixrectangular: ['Data Matrix, oblong', true, 'it-0001', 1],
  azteccode: ['Aztec', true, 'it-0001', 0], pdf417: ['PDF417', true, 'it-0001', 2],
  code128: ['Code 128', false, 'LIMN-0001', 5], code39: ['Code 39', false, 'LIMN1', 5],
  ean13: ['EAN-13', false, '4006381333931', 7], ean8: ['EAN-8', false, '96385074', 7],
  upca: ['UPC-A', false, '036000291452', 7], interleaved2of5: ['ITF', false, '12345670', 5],
};
const DOT = 0.125;
const dots = v => Math.round(v / DOT) * DOT;
let bwip = null;
function loadBwip() {
  return bwip = bwip || new Promise((res, rej) => {
    const sc = document.createElement('script'); sc.src = 'vendor/bwip-js-min.js';
    sc.onload = () => res(window.bwipjs); sc.onerror = () => rej(new Error('could not load the barcode library'));
    document.head.appendChild(sc);
  });
}
async function genCode(o) {
  const B = await loadBwip(), opts = { bcid: o.type, text: o.text || ' ' };
  if (o.type === 'qrcode' || o.type === 'microqrcode') opts.eclevel = o.ec || 'L';
  try {
    const r = B.raw(opts)[0];
    if (r.pixs) { const rows = r.pixs.length / r.pixx; o.mat = { cols: r.pixx, rows, rowh: Math.max(1, Math.round(r.pixy / rows)), bits: r.pixs.join('') }; }
    else o.mat = { sbs: r.sbs };
    o.err = '';
  } catch (e) { o.err = String(e.message || e).replace(/^bwipp\.\w+#\d+:\s*/, ''); }
  codeBox(o);
}
function codeGeo(o) {     // mm: module, quiet, border, padding, the code's own size
  const m = o.mod * DOT, q = o.quiet * m, b = o.border ? o.bw * DOT : 0, P = o.border ? dots(o.pad) : 0;
  const M = o.mat || { cols: 10, rows: 10, rowh: 1, bits: '' };
  let cw, ch, th = 0;
  if (M.sbs) { cw = M.sbs.reduce((a, v) => a + v, 0) * m; th = o.hrt ? dots(o.tsize * 1.25) : 0; ch = dots(o.bar) + th; }
  else { cw = M.cols * m; ch = M.rows * M.rowh * m; }
  const qy = M.sbs ? Math.min(q, m * 2) : q;
  return { m, q, qy, b, P, cw, ch, th, w: cw + 2 * (q + P + b), h: ch + 2 * (qy + P + b) };
}
function codeBox(o) { const g = codeGeo(o); o.w = r2(g.w); o.h = r2(g.h); }
function frame(o, b, P) {     // the border, its line inside the box, corners rounded or not
  if (!o.border) return '';
  const rx = o.round ? Math.max(0, o.radius - b / 2) : 0;
  return `<rect x="${b / 2}" y="${b / 2}" width="${r2(o.w - b)}" height="${r2(o.h - b)}" rx="${rx}" fill="none" stroke="#000" stroke-width="${b}"/>`;
}
function codeInner(o) {
  const g = codeGeo(o), M = o.mat, x0 = g.b + g.P + g.q, y0 = g.b + g.P + g.qy;
  let h = frame(o, g.b, g.P);
  if (!M) return h + `<rect width="${o.w}" height="${o.h}" fill="none" stroke="#000" stroke-width="0.2" stroke-dasharray="1 1"/>`;
  let d = '';
  if (M.sbs) {
    const bh = dots(o.bar); let x = x0;
    M.sbs.forEach((v, i) => { const w = v * g.m; if (i % 2 === 0) d += `M${r2(x)} ${y0}h${r2(w)}v${bh}h${-r2(w)}z`; x += w; });
    if (o.hrt) h += `<text x="${r2(x0 + g.cw / 2)}" y="${r2(y0 + bh + g.th * 0.85)}" text-anchor="middle" font-family="${cssFamily(o.font).replace(/"/g, "'")}" font-size="${o.tsize}">${esc(o.text)}</text>`;
  } else {
    const rh = M.rowh * g.m;
    for (let r = 0; r < M.rows; r++) {
      let c = 0;
      while (c < M.cols) {
        if (M.bits[r * M.cols + c] !== '1') { c++; continue; }
        const c0 = c; while (c < M.cols && M.bits[r * M.cols + c] === '1') c++;
        d += `M${r2(x0 + c0 * g.m)} ${r2(y0 + r * rh)}h${r2((c - c0) * g.m)}v${r2(rh)}h${-r2((c - c0) * g.m)}z`;
      }
    }
  }
  return h + `<path d="${d}" fill="#000" shape-rendering="crispEdges"/>`;
}

// ---- the logo tag: a box, an icon, a title and a line under it

function tagInner(o) {
  const b = o.border ? o.bw * DOT : 0, P = o.border ? dots(o.pad) : 0, ih = Math.max(1, o.h - 2 * (b + P));
  let h = frame(o, b, P), x = b + P;
  if (o.d) { const r = iconRef(o.icon); h += `<svg x="${x}" y="${b + P}" width="${ih}" height="${ih}" viewBox="${ICONSETS[r.set].vb}">${iconShapes(o.d, r.set, o.style)}</svg>`; x += ih + Math.max(0.5, ih * 0.12); }
  const room = Math.max(1, o.w - x - b - P), font = cssFamily(o.font).replace(/"/g, "'");
  let st = o.sub ? ih * 0.52 : ih * 0.7, ss = ih * 0.3;
  const wt = measure(o.title, o.font, st, 700).w, ws = o.sub ? measure(o.sub, o.font, ss, 400).w : 0;
  st *= Math.min(1, room / Math.max(0.1, wt)); ss *= Math.min(1, room / Math.max(0.1, ws));
  const ax = o.align === 'middle' ? x + room / 2 : x, anchor = o.align === 'middle' ? 'middle' : 'start', top = b + P;
  if (o.sub) {
    h += `<text x="${r2(ax)}" y="${r2(top + ih * 0.5)}" text-anchor="${anchor}" font-family="${font}" font-weight="700" font-size="${r2(st)}">${esc(o.title)}</text>`;
    h += `<text x="${r2(ax)}" y="${r2(top + ih * 0.5 + ss * 1.25)}" text-anchor="${anchor}" font-family="${font}" font-size="${r2(ss)}">${esc(o.sub)}</text>`;
  } else h += `<text x="${r2(ax)}" y="${r2(top + ih / 2)}" dominant-baseline="central" text-anchor="${anchor}" font-family="${font}" font-weight="700" font-size="${r2(st)}">${esc(o.title)}</text>`;
  return h;
}

function imgFilter(o) {
  const c = 1 + (o.contrast || 0) / 100, b = (o.bright || 0) / 100 + (1 - c) / 2;
  const inv = o.invert ? `<feComponentTransfer><feFuncR type="linear" slope="-1" intercept="1"/><feFuncG type="linear" slope="-1" intercept="1"/><feFuncB type="linear" slope="-1" intercept="1"/></feComponentTransfer>` : '';
  return `<filter id="f${o.id}" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/>` +
    `<feComponentTransfer><feFuncR type="linear" slope="${c}" intercept="${b}"/><feFuncG type="linear" slope="${c}" intercept="${b}"/><feFuncB type="linear" slope="${c}" intercept="${b}"/></feComponentTransfer>${inv}</filter>`;
}

function inner(o, noImages, neg) {
  switch (o.kind) {
    case 'group': return groupInner(o, noImages, neg);
    case 'shape': return shapeInner(o);
    case 'svg': return `<svg width="${o.w}" height="${o.h}" viewBox="${o.vb}" preserveAspectRatio="none" overflow="visible">${svgInner(o)}</svg>`;
    case 'image':
      if (noImages) return `<rect width="${o.w}" height="${o.h}" fill="#fff"/>`;
      return `<defs>${imgFilter(o)}</defs><image href="${o.src}" width="${o.w}" height="${o.h}" preserveAspectRatio="none" filter="url(#f${o.id})"/>`;
    case 'text': {
      const lines = o.text.split('\n'), m = measure(lines[0], o.font, o.size, o.weight, o.italic), lh = o.size * 1.15;
      const x = o.align === 'end' ? o.w : o.align === 'middle' ? o.w / 2 : 0;
      return lines.map((l, i) => `<text x="${x}" y="${r2(m.asc + i * lh)}" text-anchor="${o.align || 'start'}" font-family="${cssFamily(o.font).replace(/"/g, "'")}" font-size="${o.size}" font-weight="${o.weight}"${o.italic ? ' font-style="italic"' : ''}${o.white ? ' fill="#fff"' : ''}>${esc(l)}</text>`).join('');
    }
    case 'box': {
      const sw = o.fill ? 0 : o.sw;
      return `<rect x="${sw / 2}" y="${sw / 2}" width="${Math.max(0, o.w - sw)}" height="${Math.max(0, o.h - sw)}" rx="${o.r}" fill="${o.fill ? '#000' : 'none'}" stroke="#000" stroke-width="${sw}"${o.dash ? ` stroke-dasharray="${o.dash} ${o.dash}"` : ''}/>`;
    }
    case 'line': return lineInner(o);
    case 'cable': return cableInner(o);
    case 'code': return codeInner(o);
    case 'tag': return tagInner(o);
    case 'marker': return markerInner(o);
    case 'wire': return wireInner(o);
    case 'pins': return pinsInner(o);
    case 'filament': return filamentInner(o);
    case 'link': return linkInner(o);
    case 'icon': {
      const L = iconLayout(o);
      return `<svg x="${r2(L.ix)}" y="${r2(L.iy)}" width="${L.s}" height="${L.s}" viewBox="${o.vb || ICONSETS.material.vb}" preserveAspectRatio="none">${iconShapes(o.svg ?? o.d, o.set, o.style, o.white ? '#fff' : '#000', o.sw)}</svg>` + (L.b ? badgeSvg(o, L) : '');
    }
  }
  return '';
}
function markup(o, noImages, inGroup) {
  let cx = o.x + o.w / 2, cy = o.y + o.h / 2, rot = o.rot || 0;
  if ((o.kind === 'code' || o.kind === 'marker' || o.kind === 'group' || o.kind === 'filament') && st) {      // its top left on a dot of the head: modules land on whole dots
    if (o.kind === 'code' || o.kind === 'marker' || o.kind === 'filament') rot = Math.round(rot / 90) * 90 % 360;
    const v = vis({ ...o, rot }), left = inGroup ? 0 : geo().left;      // in a group: on the group's grid, itself on dots
    cx += dots(v.x + left) - left - v.x; cy += dots(v.y) - v.y;
  }
  const t = `translate(${r2(cx)} ${r2(cy)}) rotate(${rot}) translate(${-o.w / 2} ${-o.h / 2})`;
  return `<g class="obj" data-id="${o.id}" transform="${t}">${whiteBehind(o)}${o.neg && o.kind !== 'image' ? negInner(o, noImages) : inner(o, noImages)}</g>`;
}
// on black: a black box (the object's, plus a margin) with the object cut out of it, so it prints white on black.
// The object is the box's mask: where it draws black, the paper shows. Works for every kind; a code's quiet zone
// is part of the black, as an inverted code wants it.
function negInner(o, noImages) {
  const m = negPad(o), x = -m, y = -m, w = r2(o.w + 2 * m), h = r2(o.h + 2 * m);
  const G = o.kind === 'group' && o.shape !== 'none';       // a group: the black takes its frame's shape
  const rx = G ? (o.shape === 'pill' ? h / 2 : o.shape === 'ellipse' ? 0 : o.r || 0) : Math.max(0, o.negR || 0);
  const black = G && o.shape === 'ellipse' ? `<ellipse cx="${o.w / 2}" cy="${o.h / 2}" rx="${w / 2}" ry="${h / 2}"`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"`;
  return `<mask id="n${o.id}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}">` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>${inner(o, noImages, true)}</mask>` +
    `${black} fill="#000" mask="url(#n${o.id})"${o.kind === 'code' ? ' shape-rendering="crispEdges"' : ''}/>`;
}

// ---- groups: objects kept together (their x, y in the group's box), a frame around them or not

function groupInner(o, noImages, neg) {
  const sw = o.sw || 0, d = o.dash ? ` stroke-dasharray="${o.dash} ${o.dash}"` : '';
  let f = '';
  if (!neg && sw > 0 && o.shape !== 'none') {
    const a = `fill="none" stroke="#000" stroke-width="${sw}"${d}`;
    f = o.shape === 'ellipse' ? `<ellipse cx="${o.w / 2}" cy="${o.h / 2}" rx="${(o.w - sw) / 2}" ry="${(o.h - sw) / 2}" ${a}/>`
      : `<rect x="${sw / 2}" y="${sw / 2}" width="${r2(o.w - sw)}" height="${r2(o.h - sw)}" rx="${o.shape === 'pill' ? (o.h - sw) / 2 : Math.max(0, (o.r || 0) - sw / 2)}" ${a}/>`;
  }
  return o.kids.filter(k => !k.hidden).map(k => markup(k, noImages, true)).join('') + f;
}
function group() {
  const os = chosen().filter(o => o.kind !== 'link'); if (os.length < 2) return say('select two or more first (Shift click)');
  commit();
  const pad = 1, vs = os.map(vis), x0 = Math.min(...vs.map(v => v.x)) - pad, y0 = Math.min(...vs.map(v => v.y)) - pad;
  const w = Math.ceil((Math.max(...vs.map(v => v.x + v.w)) + pad - x0) * 8) / 8, h = Math.ceil((Math.max(...vs.map(v => v.y + v.h)) + pad - y0) * 8) / 8;
  const all = objs(), at = Math.max(...os.map(o => all.indexOf(o)));
  const g = { kind: 'group', id: nextId++, x: r2(x0), y: r2(y0), w, h, rot: 0, shape: 'rect', sw: 0.25, r: 1, pad, dash: 0,
    kids: all.filter(o => os.includes(o)).map(o => Object.assign(o, { x: r2(o.x - x0), y: r2(o.y - y0) })) };
  all.splice(at + 1, 0, g); doc.pages[page] = all.filter(o => !os.includes(o));
  multi.clear(); sel = g.id; changed();
}
function ungroup(g) {
  commit(); const os = objs();
  const kids = g.kids.map(k => {
    const c = corner(g, k.x + k.w / 2, k.y + k.h / 2);
    return Object.assign(k, { x: r2(c.x - k.w / 2), y: r2(c.y - k.h / 2), rot: normRot((k.rot || 0) + (g.rot || 0)) });
  });
  os.splice(os.indexOf(g), 1, ...kids); sel = kids[kids.length - 1].id; multi = new Set(kids.slice(0, -1).map(k => k.id)); changed();
}
function groupPad(g, pad) {       // the frame further out or in, the objects staying where they are
  const d = dots(pad) - g.pad; if (!d) return;
  g.pad = dots(pad); g.kids.forEach(k => { k.x = r2(k.x + d); k.y = r2(k.y + d); });
  g.x = r2(g.x - d); g.y = r2(g.y - d); g.w = r2(g.w + 2 * d); g.h = r2(g.h + 2 * d);
}

// ---- shapes: outlines in the object's box, filled or not, corners rounded by r

const SHAPES = {
  ellipse: ['Ellipse'],
  triangle: ['Triangle', (w, h) => [[w / 2, 0], [w, h], [0, h]]],
  rtriangle: ['Right triangle', (w, h) => [[0, 0], [w, h], [0, h]]],
  diamond: ['Diamond', (w, h) => [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]],
  hexagon: ['Hexagon', (w, h) => [[w / 4, 0], [3 * w / 4, 0], [w, h / 2], [3 * w / 4, h], [w / 4, h], [0, h / 2]]],
  star: ['Star', (w, h) => [...Array(10)].map((_, i) => { const a = Math.PI * i / 5 - Math.PI / 2, k = i % 2 ? 0.4 : 1; return [w / 2 + Math.cos(a) * k * w / 2, h * 0.53 + Math.sin(a) * k * h * 0.53]; })],
  arrow: ['Block arrow', (w, h) => { const L = Math.min(w * 0.5, h); return [[0, h * 0.3], [w - L, h * 0.3], [w - L, 0], [w, h / 2], [w - L, h], [w - L, h * 0.7], [0, h * 0.7]]; }],
  chevron: ['Chevron', (w, h) => { const L = Math.min(w * 0.4, h / 2); return [[0, 0], [w - L, 0], [w, h / 2], [w - L, h], [0, h], [L, h / 2]]; }],
  pentagon: ['Arrow tag', (w, h) => { const L = Math.min(w * 0.4, h / 2); return [[0, 0], [w - L, 0], [w, h / 2], [w - L, h], [0, h]]; }],
};
function roundPoly(pts, r) {      // a closed path, each corner cut back by up to r and curved through
  if (!r) return 'M' + pts.map(p => p.map(r2).join(' ')).join('L') + 'Z';
  const n = pts.length, cut = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  let d = '';
  pts.forEach((p, i) => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const p0 = cut(p, a, Math.min(r, la / 2) / la), p1 = cut(p, b, Math.min(r, lb / 2) / lb);
    d += `${i ? 'L' : 'M'}${r2(p0[0])} ${r2(p0[1])}Q${r2(p[0])} ${r2(p[1])} ${r2(p1[0])} ${r2(p1[1])}`;
  });
  return d + 'Z';
}
function shapeInner(o) {
  const sw = o.fill ? 0 : o.sw, a = `fill="${o.fill ? '#000' : 'none'}" stroke="#000" stroke-width="${sw}" stroke-linejoin="round"${o.dash ? ` stroke-dasharray="${o.dash} ${o.dash}"` : ''}`;
  if (o.shape === 'ellipse') return `<ellipse cx="${o.w / 2}" cy="${o.h / 2}" rx="${Math.max(0, (o.w - sw) / 2)}" ry="${Math.max(0, (o.h - sw) / 2)}" ${a}/>`;
  const pts = SHAPES[o.shape][1](Math.max(0, o.w - sw), Math.max(0, o.h - sw)).map(([x, y]) => [x + sw / 2, y + sw / 2]);
  return `<path d="${roundPoly(pts, o.r || 0)}" ${a}/>`;
}

// ---- a line's ends: an arrow, an open arrow, a dot, a bar

const HEADS = { '': 'none', arrow: 'arrow', open: 'open arrow', dot: 'dot', bar: 'bar' };
function lineInner(o) {
  const t = o.h, y = t / 2, L = Math.max(1.2, t * 4), W = L * 0.45, ends = [o.h1 || '', o.h2 || ''];
  const back = e => (e === 'arrow' ? L * 0.8 : e === 'open' ? t * 0.9 : 0);      // the line stops inside its heads
  const x0 = back(ends[0]), x1 = o.w - back(ends[1]);
  let h = `<line x1="${r2(x0)}" x2="${r2(x1)}" y1="${y}" y2="${y}" stroke="#000" stroke-width="${t}"${o.dash ? ` stroke-dasharray="${o.dash} ${o.dash}"` : ''}/>`;
  ends.forEach((e, i) => {
    const X = i ? o.w : 0, s = i ? -1 : 1;      // the tip, and which way back along the line
    if (e === 'arrow') h += `<path d="M${r2(X)} ${y}L${r2(X + s * L)} ${r2(y - W)}L${r2(X + s * L)} ${r2(y + W)}Z" fill="#000" stroke="#000" stroke-width="${Math.min(t, 0.2)}" stroke-linejoin="round"/>`;
    if (e === 'open') h += `<path d="M${r2(X + s * L)} ${r2(y - W)}L${r2(X + s * t * 0.7)} ${y}L${r2(X + s * L)} ${r2(y + W)}" fill="none" stroke="#000" stroke-width="${t}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (e === 'dot') h += `<circle cx="${r2(X + s * W * 0.7)}" cy="${y}" r="${r2(W * 0.7)}" fill="#000"/>`;
    if (e === 'bar') h += `<line x1="${r2(X + s * t / 2)}" x2="${r2(X + s * t / 2)}" y1="${r2(y - W)}" y2="${r2(y + W)}" stroke="#000" stroke-width="${t}"/>`;
  });
  return h;
}

// ---- markers: ArUco / AprilTag (markers.json, from OpenCV's own tables by markers.py), ChArUco boards and
// checkerboards for camera calibration. Like the codes: every bit a whole number of dots, on the head's dot grid.

let MK = null;
const markerDicts = () => (MK = MK || fetch('markers.json').then(r => r.json()));
let MKD = null;       // the dictionaries once loaded: drawing needs them at once
const MMODES = { tag: 'one marker', charuco: 'ChArUco board', checker: 'checkerboard' };
const hexBits = (h, n) => [...h].map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join('').slice(-n * n);
async function genMarker(o) {
  MKD = await markerDicts();
  const D = MKD[o.dict], lim = Math.min(o.dsize || D.codes.length, D.codes.length);
  o.tid = Math.max(0, Math.min(lim - 1, Math.round(+o.tid || 0)));
  const need = o.mode === 'charuco' ? Math.floor(o.sx * o.sy / 2) : o.mode === 'tag' ? 1 : 0;
  o.err = o.tid + need > lim ? `ids ${o.tid}–${o.tid + need - 1}: the dictionary (as ${lim}) has ids up to ${lim - 1}` : '';
  o.n = D.n; o.bits = [...Array(need)].map((_, i) => D.codes[o.tid + i] ? hexBits(D.codes[o.tid + i], D.n) : '');
  markerBox(o);
}
function markerCaption(o) {
  if (!MKD) markerDicts().then(d => { if (!MKD) { MKD = d; draw(); } }).catch(() => {});
  const D = MKD && MKD[o.dict], name = D ? D.name : o.dict;
  if (o.mode === 'tag') return `${name} #${o.tid}`;
  const S = r2(o.sq * DOT);
  return o.mode === 'checker' ? `checker ${o.sx}×${o.sy}, ${S} mm` : `ChArUco ${o.sx}×${o.sy} ${name} ${S}/${r2(markerCell(o) * (o.n + 2) * DOT)} mm, from #${o.tid}`;
}
function markerCap(o, w) {      // the caption, short if the long one doesn't fit, its size to fit the width
  let t = markerCaption(o), s = o.csize;
  const fit = t => w / Math.max(0.1, measure(t, o.font, 1).w);
  if (o.mode === 'tag' && fit(t) < s) t = `#${o.tid}`;
  return { t, s: Math.min(s, fit(t)) };
}
const markerCell = o => Math.max(1, Math.floor(o.sq * o.ratio / ((o.n || 4) + 2)));     // a ChArUco marker's bit, dots
function markerGeo(o) {       // mm: the white margin, the pattern's size, the caption's height
  const tag = o.mode === 'tag', m = o.mod * DOT, n = o.n || 4;
  const q = tag ? o.quiet * m : dots(o.margin);
  const pw = tag ? (n + 2) * m : o.sx * o.sq * DOT, ph = tag ? pw : o.sy * o.sq * DOT;
  const cap = o.caption ? dots(o.csize * 1.35) : 0;
  return { m, q, pw, ph, cap, w: pw + 2 * q, h: ph + 2 * q + cap };
}
function markerBox(o) { const g = markerGeo(o); o.w = r2(g.w); o.h = r2(g.h); }
// black runs of a bit grid as one path: bit(r, c) true = black
function cellsPath(bit, cols, rows, x0, y0, m) {
  let d = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols;) {
    if (!bit(r, c)) { c++; continue; }
    const c0 = c; while (c < cols && bit(r, c)) c++;
    d += `M${r2(x0 + c0 * m)} ${r2(y0 + r * m)}h${r2((c - c0) * m)}v${r2(m)}h${-r2((c - c0) * m)}z`;
  }
  return d;
}
function markerInner(o) {
  const g = markerGeo(o), n = o.n || 4, x0 = g.q, y0 = g.q;
  let d = '';
  if (o.mode === 'tag') {
    const b = (o.bits || [])[0] || '';
    d = cellsPath((r, c) => r === 0 || c === 0 || r === n + 1 || c === n + 1 || b[(r - 1) * n + c - 1] === '1', n + 2, n + 2, x0, y0, g.m);
  } else {
    const S = o.sq * DOT;
    d = cellsPath((r, c) => (r + c) % 2 === 0, o.sx, o.sy, x0, y0, S);
    if (o.mode === 'charuco') {      // a marker in each white square, ids on from the first, row by row (OpenCV's order)
      const k = markerCell(o), side = k * (n + 2), off = Math.floor((o.sq - side) / 2) * DOT;
      let i = 0;
      for (let r = 0; r < o.sy; r++) for (let c = 0; c < o.sx; c++) {
        if ((r + c) % 2 === 0) continue;
        const b = (o.bits || [])[i++] || '';
        d += cellsPath((rr, cc) => rr === 0 || cc === 0 || rr === n + 1 || cc === n + 1 || b[(rr - 1) * n + cc - 1] === '1', n + 2, n + 2, x0 + c * S + off, y0 + r * S + off, k * DOT);
      }
    }
  }
  let h = `<path d="${d}" fill="#000" shape-rendering="crispEdges"/>`;
  if (o.caption) { const c = markerCap(o, o.w); h += `<text x="${r2(o.w / 2)}" y="${r2(y0 + g.ph + g.q + g.cap * 0.75)}" text-anchor="middle" font-family="${cssFamily(o.font).replace(/"/g, "'")}" font-size="${r2(c.s)}">${esc(c.t)}</text>`; }
  if (o.cut) h += `<rect x="0.05" y="0.05" width="${r2(o.w - 0.1)}" height="${r2(o.h - 0.1)}" fill="none" stroke="#000" stroke-width="0.125" stroke-dasharray="0.5 0.5"/>`;
  return h;
}

// ---- wire tags. Wrap: a strip round the wire, its text along the wire, repeated round it so one faces you from any
// side; π·d per turn, 1.5 turns (Brady's rule). Sleeve: a strip slid into clear heat-shrink before shrinking, as wide
// as the tube lies flat (π·d/2), less a little to slide in.

const circ = o => Math.PI * o.d;
function wireGeo(o) {
  const font = o.font, wt = 700, len = Math.max(1, o.L - 1);
  const fitW = s => Math.min(s, s * len / Math.max(0.1, measure(o.text, font, s, wt).w));
  if (o.mode === 'sleeve') {
    const H = Math.max(1, r2(circ(o) / 2 - o.slack));
    return { W: o.L, H, rows: [H / 2], s: fitW(o.size > 0 ? Math.min(o.size, H * 0.8) : H * 0.75) };
  }
  const C = circ(o), H = r2(C * o.wraps);
  let s = o.size > 0 ? o.size : C / 2 / 1.3;           // auto: two rows a turn
  s = fitW(s);
  const k = Math.max(1, Math.floor(C / (s * 1.3))), p = C / k, rows = [];
  for (let y = p / 2; y < H; y += p) rows.push(y);
  return { W: o.L, H, rows, s };
}
function wireBox(o) { const g = wireGeo(o); o.w = r2(g.W); o.h = r2(g.H); }
function wireInner(o) {
  const g = wireGeo(o), font = cssFamily(o.font).replace(/"/g, "'");
  let h = g.rows.map(y => `<text x="${r2(g.W / 2)}" y="${r2(y)}" dominant-baseline="central" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${r2(g.s)}">${esc(o.text)}</text>`).join('');
  if (o.mode !== 'sleeve' && o.turns) for (let y = circ(o); y < g.H - 0.3; y += circ(o)) h += `<path d="M0 ${r2(y)}h1M${r2(g.W - 1)} ${r2(y)}h1" stroke="#000" stroke-width="0.125"/>`;     // where each turn ends
  if (o.cut) h += `<rect x="0.05" y="0.05" width="${r2(g.W - 0.1)}" height="${r2(g.H - 0.1)}" fill="none" stroke="#000" stroke-width="0.125" stroke-dasharray="0.5 0.5"/>`;
  return h;
}

// ---- pin strips: the names over a row of pins, 2.54 mm headers (Dupont housings), JST, terminal blocks, DIN breakers.
// Wrap: round the housing, the long way round the wires: the front (pin 1 at the left), the side, the back (seen from
// behind: the same pins, last first), the other side, a bit to glue over. Both: front, side, back. One: the front.
// Two rows (2×N): the odd pins on the front, the even on the back.

const PIN_PRESETS = {
  dupont1: ['Dupont 1×N (2.54)', { pitch: 2.54, prow: 1, t: 2.5, h: 10, mode: 'wrap', along: true }],
  dupont2: ['Dupont 2×N (2.54)', { pitch: 2.54, prow: 2, t: 5.08, h: 10, mode: 'wrap', along: true }],
  jstxh: ['JST XH (2.5)', { pitch: 2.5, prow: 1, t: 5.75, h: 8, mode: 'both', along: true }],
  jstph: ['JST PH (2.0)', { pitch: 2, prow: 1, t: 4.5, h: 6, mode: 'both', along: true }],
  tb508: ['Terminal block 5.08', { pitch: 5.08, prow: 1, t: 0, h: 8, mode: 'one', along: true }],
  tb35: ['Terminal block 3.5', { pitch: 3.5, prow: 1, t: 0, h: 8, mode: 'one', along: true }],
  din: ['DIN rail breakers (18)', { pitch: 18, prow: 1, t: 0, h: 12, mode: 'one', along: false }],
};
const PIN_MODES = { wrap: 'wrap round (front, side, back, side, glue)', both: 'both sides (front, side, back)', one: 'one side' };
const pinNames = o => String(o.names).split(/[,\n]/).map(s => s.trim());
function pinsGeo(o) {
  const names = pinNames(o), n = Math.max(1, o.count), get = i => names[i] ?? '';
  const pins = [...Array(n)].map((_, i) => ({ i, name: get(i) }));
  const front = o.prow === 2 ? pins.filter(p => p.i % 2 === 0) : pins;
  const back = o.prow === 2 ? pins.filter(p => p.i % 2 === 1) : pins;
  const segs = [{ kind: 'face', pins: front }];       // left to right along the strip
  if (o.mode !== 'one') segs.push({ kind: 'side', w: o.t }, { kind: 'face', pins: back.slice().reverse() });
  if (o.mode === 'wrap') segs.push({ kind: 'side', w: o.t }, { kind: 'glue', w: o.ov });
  let x = 0;
  for (const s of segs) { s.x = x; s.w = s.kind === 'face' ? s.pins.length * o.pitch : s.w; x += s.w; }
  // one size for every name: the longest fits its cell
  const long = Math.max(0.1, ...pins.map(p => measure(p.name || ' ', o.font, 1, 700).w));
  const s = o.along ? Math.min(o.pitch * 0.75, (o.h - 1.6) / long) : Math.min(o.h * 0.6, (o.pitch - 0.4) / long);
  return { segs, W: x, s: o.size > 0 ? Math.min(o.size, s) : s };
}
function pinsBox(o) { const g = pinsGeo(o); o.w = r2(Math.max(1, g.W)); }
function pinsInner(o) {
  const g = pinsGeo(o), H = o.h, font = cssFamily(o.font).replace(/"/g, "'"), sw = 0.125;
  let h = `<rect x="${sw / 2}" y="${sw / 2}" width="${r2(g.W - sw)}" height="${r2(H - sw)}" fill="none" stroke="#000" stroke-width="${sw}"/>`;
  for (const s of g.segs) {
    if (s.x > 0) h += `<line x1="${r2(s.x)}" x2="${r2(s.x)}" y1="0" y2="${H}" stroke="#000" stroke-width="0.125" stroke-dasharray="0.375 0.375"/>`;      // a fold
    if (s.kind === 'glue') h += `<path d="${[...Array(Math.ceil(H / 1.5))].map((_, i) => `M${r2(s.x)} ${r2(i * 1.5 + 1.5)}l${r2(Math.min(s.w, 1.5))} ${-r2(Math.min(s.w, 1.5))}`).join('')}" stroke="#000" stroke-width="0.125"/>`;
    if (s.kind !== 'face') continue;
    s.pins.forEach((p, j) => {
      const x = s.x + j * o.pitch, cx = x + o.pitch / 2;
      if (j && o.lines) h += `<line x1="${r2(x)}" x2="${r2(x)}" y1="0" y2="${H}" stroke="#000" stroke-width="0.125"/>`;
      if (p.i === 0 && o.mark) h += `<rect x="${r2(x + 0.25)}" y="0.25" width="${r2(o.pitch - 0.5)}" height="0.75" fill="#000"/>`;      // pin 1
      if (!p.name) return;
      const top = o.mark ? 1.1 : 0.4, cy = (top + H - 0.4) / 2;
      h += o.along
        ? `<text transform="translate(${r2(cx)} ${r2(cy)}) rotate(-90)" dominant-baseline="central" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${r2(g.s)}">${esc(p.name)}</text>`
        : `<text x="${r2(cx)}" y="${r2(cy)}" dominant-baseline="central" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${r2(g.s)}">${esc(p.name)}</text>`;
    });
  }
  return h;
}

// ---- filament spools: brand, type, colour, dates, and a code built from them (shown as text and as a Data Matrix / QR).
// The code's pattern: {B} brand code, {T} type code, {C} colour initials, {sku} product code, {yyyy} {yy} {mm} {dd}
// {yymmdd} the date bought, {o:yymmdd} opened, {n} {nn} {nnn} the serial (Repeat counts it up). No serial: the
// {n}s go, with a - _ . before them.

const BRANDS = { 'Bambu Lab': 'BBL', 'Prusament': 'PRU', 'Polymaker': 'PLM', 'Elegoo': 'ELG', 'eSun': 'ESN', 'Sunlu': 'SNL', 'Overture': 'OVT',
  'Creality': 'CRE', 'Anycubic': 'ANC', 'Jayo': 'JYO', 'Eryone': 'ERY', 'Hatchbox': 'HTB', 'Fiberlogy': 'FBL', 'Extrudr': 'EXD', 'colorFabb': 'CFB',
  'Spectrum': 'SPF', 'Fillamentum': 'FLM', 'Das Filament': 'DAS', '3DJake': '3DJ', 'Rosa3D': 'R3D', 'Formfutura': 'FFT', 'Kingroon': 'KGR',
  'Geeetech': 'GTH', 'Amolen': 'AML', 'Siraya Tech': 'SRY', 'Kexcelled': 'KXL', 'Inland': 'INL', 'Generic': 'GEN' };
const FTYPES = ['PLA Basic', 'PLA Matte', 'PLA Silk+', 'PLA Tough+', 'PLA Translucent', 'PLA Galaxy', 'PLA Sparkle', 'PLA Metal', 'PLA Marble',
  'PLA Glow', 'PLA Wood', 'PLA-CF', 'PLA Aero', 'PETG HF', 'PETG Basic', 'PETG Translucent', 'PETG-CF', 'ABS', 'ABS-GF', 'ASA', 'ASA Aero',
  'TPU 95A HF', 'TPU for AMS', 'PC', 'PC FR', 'PA6-CF', 'PAHT-CF', 'PET-CF', 'PPS-CF', 'PVA', 'Support for PLA', 'Support for PLA/PETG', 'Support for ABS'];
const FCODES = ['datamatrix', 'qrcode'];
const brandCode = o => (o.bcode || BRANDS[Object.keys(BRANDS).find(k => k.toLowerCase() === String(o.brand).trim().toLowerCase())]
  || (([a, ...r]) => (a || '') + r.filter(c => !'AEIOU'.includes(c)).join(''))([...String(o.brand).toUpperCase().replace(/[^A-Z0-9]/g, '')]).slice(0, 3) || 'X');
function typeCode(o) {     // "PLA Basic" PLA, "PLA Matte" PLAM, "PETG HF" PETGHF, "PA6-CF" PA6CF, "Support for PLA" SUPPLA
  if (o.tcode) return o.tcode;
  const ws = String(o.type).replace(/\+/g, '').split(/\s+/).filter(Boolean);
  if (!ws.length) return 'X';
  if (/^support$/i.test(ws[0])) return 'SUP' + ws.slice(1).filter(w => !/^for$/i.test(w)).join('').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (ws[0].toUpperCase().replace(/[^A-Z0-9]/g, '') + ws.slice(1).filter(w => !/^basic$/i.test(w))
    .map(w => (/^[A-Z0-9]{1,3}$/.test(w) ? w : w[0].toUpperCase())).join('')).slice(0, 8);
}
function filamentCode(o) {
  const d = String(o.bought || ''), od = String(o.opened || ''), ymd = x => x.replace(/-/g, '').slice(2);
  let p = o.pattern || '{B}-{T}-{yymmdd}-{nn}';
  if (!o.useSerial) p = p.replace(/[-_. ]?\{n+\}/g, '');
  return p.replace(/\{o:yymmdd\}/g, ymd(od) || '------').replace(/\{yymmdd\}/g, ymd(d)).replace(/\{yyyy\}/g, d.slice(0, 4)).replace(/\{yy\}/g, d.slice(2, 4))
    .replace(/\{mm\}/g, d.slice(5, 7)).replace(/\{dd\}/g, d.slice(8, 10)).replace(/\{B\}/g, brandCode(o)).replace(/\{T\}/g, typeCode(o))
    .replace(/\{C\}/g, String(o.color).split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join('')).replace(/\{sku\}/g, o.sku || '')
    .replace(/\{(n+)\}/g, (m, n) => String(o.serial ?? 1).padStart(n.length, '0'));
}
async function genFilament(o) {
  o.code = filamentCode(o); o.mat = null; o.err = '';
  if (!o.showCode || !o.code) return;
  try { const r = (await loadBwip()).raw({ bcid: o.ctype || 'datamatrix', text: o.code })[0]; o.mat = { cols: r.pixx, rows: r.pixs.length / r.pixx, bits: r.pixs.join('') }; }
  catch (e) { o.err = String(e.message || e).replace(/^bwipp\.\w+#\d+:\s*/, ''); }
}
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
// the label: a frame; the code's symbol at the left as tall as it fits (whole-dot modules); at the right the brand, the type
// big (on black if asked), the colour and product code, temperatures, the dates (opened: a line to write on), the code
function filamentInner(o) {
  const b = o.border ? 0.25 : 0, P = dots(Math.max(0.5, o.h * 0.06)), H = o.h - 2 * (b + P), font = cssFamily(o.font).replace(/"/g, "'");
  let h = o.border ? `<rect x="${b / 2}" y="${b / 2}" width="${r2(o.w - b)}" height="${r2(o.h - b)}" rx="1.5" fill="none" stroke="#000" stroke-width="${b}"/>` : '';
  let x = b + P;
  const M = o.showCode && o.mat;
  if (M) {      // whole dots a module, as big as the height and a third of the width allow
    const mod = Math.max(1, Math.floor(Math.min(H, o.w * 0.36) / DOT / Math.max(M.cols, M.rows))), S = M.cols * mod * DOT, y0 = dots(b + P + (H - M.rows * mod * DOT) / 2);
    h += `<path d="${cellsPath((r, c) => M.bits[r * M.cols + c] === '1', M.cols, M.rows, dots(x), y0, mod * DOT)}" fill="#000" shape-rendering="crispEdges"/>`;
    x += S + Math.max(1, o.w * 0.03);
  }
  const room = Math.max(1, o.w - x - b - P), dates = `bought ${o.bought || '—'}`, opened = o.opened ? `opened ${o.opened}` : 'opened';
  const rows = [      // [text, share of the height, weight, font, inverted]
    o.brand && [String(o.brand).toUpperCase(), 0.13, 600, font],
    [o.type || 'PLA', 0.27, 800, font, o.typeBar],
    (o.color || o.sku) && [[o.color, o.sku].filter(Boolean).join(' · '), 0.15, 500, font],
    o.temps && [o.temps, 0.11, 400, font],
    [`${dates} · ${opened}`, 0.11, 400, font, false, !o.opened],
    [o.code, 0.13, 700, 'ui-monospace,monospace'],
  ].filter(Boolean);
  const total = rows.reduce((a, r) => a + r[1], 0) * 1.25;
  let y = b + P;
  for (const [t, share, wt, f, inv, blank] of rows) {
    const lh = H * share / total * 1.25, fam = f.split(',')[0].replace(/'/g, '');
    let size = lh * 0.8;
    const lineW = blank ? Math.max(6, room * 0.25) : 0, wid = measure(t, fam === 'ui-monospace' ? 'monospace' : fam, size, wt).w;
    size *= Math.min(1, (room - lineW - (inv ? size * 0.6 : 0)) / Math.max(0.1, wid));
    const cy = y + lh / 2;
    if (inv) h += `<rect x="${r2(x)}" y="${r2(y + lh * 0.04)}" width="${r2(room)}" height="${r2(lh * 0.92)}" rx="${r2(lh * 0.2)}" fill="#000"/>`;
    h += `<text x="${r2(x + (inv ? size * 0.3 : 0))}" y="${r2(cy)}" dominant-baseline="central" font-family="${f}" font-weight="${wt}" font-size="${r2(size)}"${inv ? ' fill="#fff"' : ''}>${esc(t)}</text>`;
    if (blank) h += `<line x1="${r2(o.w - b - P - lineW)}" x2="${r2(o.w - b - P)}" y1="${r2(cy + size * 0.35)}" y2="${r2(cy + size * 0.35)}" stroke="#000" stroke-width="0.125"/>`;
    y += lh;
  }
  if (o.err) h += `<text x="${r2(x)}" y="${r2(o.h - b - P)}" font-size="1.2" fill="#000">${esc(o.err)}</text>`;
  return h;
}

// ---- links: a line joining two objects that follows them when they move. It leaves each from the side facing the other
// (or the side asked for), goes straight out `lead` mm, then to the other: with 45° bends (straight, a diagonal, straight;
// the diagonal in the middle or at an end), right angles (a step half-way), or straight. Corners rounded or not; a dot
// or an arrow at an end. J joins the selected in a chain (in the order clicked), Shift J all to the last one clicked.

const linkGeo = new Map();      // per link: where its middle handle is, and pointer → k
const ROUTES = { d45: '45° bends', ortho: 'right angles', straight: 'straight' };
const SIDES = { auto: 'facing the other', top: 'top', bottom: 'bottom', left: 'left', right: 'right' };
const LHEADS = { '': 'none', open: 'line arrow', arrow: 'filled arrow', dot: 'dot' };
function boxIn(pg, id, dx = 0, dy = 0) {     // the box of an object on the page, as drawn, groups opened (their turn ignored)
  for (const o of pg) {
    if (o.id === id) { const v = vis(o); return { x: v.x + dx, y: v.y + dy, w: v.w, h: v.h }; }
    if (o.kids) { const v = boxIn(o.kids, id, dx + o.x, dy + o.y); if (v) return v; }
  }
  return null;
}
function anchorOf(v, side) {
  const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
  return { top: { x: cx, y: v.y, d: [0, -1] }, bottom: { x: cx, y: v.y + v.h, d: [0, 1] }, left: { x: v.x, y: cy, d: [-1, 0] }, right: { x: v.x + v.w, y: cy, d: [1, 0] } }[side];
}
function autoSide(a, b) {      // across the wider gap between the two boxes
  const dx = b.x + b.w / 2 - (a.x + a.w / 2), dy = b.y + b.h / 2 - (a.y + a.h / 2);
  const gx = Math.abs(dx) - (a.w + b.w) / 2, gy = Math.abs(dy) - (a.h + b.h) / 2;
  return gy >= gx ? (dy >= 0 ? 'bottom' : 'top') : (dx >= 0 ? 'right' : 'left');
}
const OPP = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
function linkPoints(o, pg) {
  const A = boxIn(pg, o.a), B = boxIn(pg, o.b); if (!A || !B) return null;
  const sa = o.sa && o.sa !== 'auto' ? o.sa : autoSide(A, B), sb = o.sb && o.sb !== 'auto' ? o.sb : (o.sa && o.sa !== 'auto' ? autoSide(B, A) : OPP[sa]);
  const P = anchorOf(A, sa), Q = anchorOf(B, sb), g = o.gap || 0;
  const p0 = { x: P.x + P.d[0] * g, y: P.y + P.d[1] * g }, q0 = { x: Q.x + Q.d[0] * g, y: Q.y + Q.d[1] * g };
  if (o.route === 'straight') { linkGeo.delete(o.id); return [p0, q0]; }
  const L = o.lead ?? 1, lead = e => Math.max(L, e === 'arrow' || e === 'open' ? headSize(o) * 1.5 : 0);      // an arrow sits on a straight bit
  const La = lead(o.h1), Lb = lead(o.h2), p1 = { x: p0.x + P.d[0] * La, y: p0.y + P.d[1] * La }, q1 = { x: q0.x + Q.d[0] * Lb, y: q0.y + Q.d[1] * Lb };
  const vert = P.d[0] === 0, dx = q1.x - p1.x, dy = q1.y - p1.y, sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
  // along: the leaving direction's axis; the rest goes across
  const along = vert ? Math.abs(dy) : Math.abs(dx), across = vert ? Math.abs(dx) : Math.abs(dy);
  const pt = (a, c) => (vert ? { x: p1.x + sx * c, y: p1.y + sy * a } : { x: p1.x + sx * a, y: p1.y + sy * c });
  // k: where the bend is, 0 at the start to 1 at the end (dragged with the middle handle)
  const k = Math.max(0, Math.min(1, o.k ?? { start: 0, end: 1 }[o.bend] ?? 0.5));
  let mid, at;      // at: the middle handle's place along, and how the pointer's place along gives k
  if (o.route === 'ortho') { mid = [pt(along * k, 0), pt(along * k, across)]; at = { t: along * k, c: across / 2, k: t => t / along }; }
  else if (along >= across) {      // straight, a 45° run covering the sideways part, straight
    const rest = along - across;
    mid = [pt(rest * k, 0), pt(rest * k + across, across)]; at = { t: rest * k + across / 2, c: across / 2, k: t => (t - across / 2) / rest };
  } else {                          // wider than long: a 45° in, the long way across, a 45° out
    const a1 = along * (1 - k);
    mid = [pt(a1, a1), pt(a1, across - along * k)]; at = { t: a1, c: across / 2, k: t => 1 - t / along };
  }
  linkGeo.set(o.id, { at: pt(at.t, at.c), toK: q => at.k(vert ? (q.y - p1.y) * sy : (q.x - p1.x) * sx) });
  const pts = [p0, p1, ...mid, q1, q0].map(p => ({ x: r2(p.x), y: r2(p.y) }));
  return pts.filter((p, i) => !i || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 0.01)
    .filter((p, i, a) => i === 0 || i === a.length - 1 || Math.abs((p.x - a[i - 1].x) * (a[i + 1].y - p.y) - (p.y - a[i - 1].y) * (a[i + 1].x - p.x)) > 1e-4);     // no points mid-way along a straight run
}
function updateLinks(pg) {
  for (const o of pg) {
    if (o.kind !== 'link') continue;
    const pts = linkPoints(o, pg); if (!pts) continue;
    const pad = Math.max(o.sw, headSize(o)) + 0.25, xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    o.pts = pts; o.rot = 0;
    o.x = r2(Math.min(...xs) - pad); o.y = r2(Math.min(...ys) - pad);
    o.w = r2(Math.max(...xs) - o.x + pad); o.h = r2(Math.max(...ys) - o.y + pad);
  }
}
const headSize = o => Math.max(0.8, o.sw * 3);
function linkInner(o) {
  const pts = (o.pts || []).map(p => ({ x: r2(p.x - o.x), y: r2(p.y - o.y) })); if (pts.length < 2) return '';
  const S = headSize(o), tips = [pts[0], pts[pts.length - 1]], dirs = [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]];
  // the line stops inside its arrow heads: under a filled one, and short of a line arrow's tip (no cap poking through)
  [[o.h1, 0, 1], [o.h2, pts.length - 1, pts.length - 2]].forEach(([e, i, j]) => {
    const cut = e === 'arrow' ? S * 0.7 : e === 'open' ? o.sw * 0.9 : 0; if (!cut) return;
    const a = pts[i], b = pts[j], l = Math.hypot(b.x - a.x, b.y - a.y), k = Math.min(cut, l * 0.9) / (l || 1);
    pts[i] = { x: r2(a.x + (b.x - a.x) * k), y: r2(a.y + (b.y - a.y) * k) };
  });
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {       // corners cut back by up to r and curved through
    const p = pts[i], n = pts[i + 1], r = o.r || 0;
    if (!n || !r) { d += `L${p.x} ${p.y}`; continue; }
    const a = pts[i - 1], la = Math.hypot(p.x - a.x, p.y - a.y), lb = Math.hypot(n.x - p.x, n.y - p.y), ka = Math.min(r, la / 2) / la, kb = Math.min(r, lb / 2) / lb;
    d += `L${r2(p.x + (a.x - p.x) * ka)} ${r2(p.y + (a.y - p.y) * ka)}Q${p.x} ${p.y} ${r2(p.x + (n.x - p.x) * kb)} ${r2(p.y + (n.y - p.y) * kb)}`;
  }
  let h = `<path d="${d}" fill="none" stroke="transparent" stroke-width="2.5"/>` +      // easier to click
    `<path d="${d}" fill="none" stroke="#000" stroke-width="${o.sw}" stroke-linejoin="round" stroke-linecap="round"${o.dash ? ` stroke-dasharray="${o.dash} ${o.dash}"` : ''}/>`;
  // heads on the line's own axis (its last straight bit), symmetric about it, the tip at the end
  [o.h1, o.h2].forEach((e, i) => {
    const tip = tips[i], from = dirs[i][1];
    if (e === 'dot') h += `<circle cx="${tip.x}" cy="${tip.y}" r="${r2(S / 2)}" fill="#000"/>`;
    if (e !== 'arrow' && e !== 'open') return;
    const l = Math.hypot(tip.x - from.x, tip.y - from.y) || 1, ux = (tip.x - from.x) / l, uy = (tip.y - from.y) / l;
    if (e === 'arrow') {
      const W = S * 0.5;
      h += `<path d="M${tip.x} ${tip.y}L${r2(tip.x - ux * S - uy * W)} ${r2(tip.y - uy * S + ux * W)}L${r2(tip.x - ux * S + uy * W)} ${r2(tip.y - uy * S - ux * W)}Z" fill="#000" stroke="#000" stroke-width="${r2(o.sw / 2)}" stroke-linejoin="round"/>`;
    } else {        // the chevron's outer edge on the end: its stroke's centre a little back
      const W = S * 0.55, L = S * 0.8, tx = tip.x - ux * o.sw * 0.7, ty = tip.y - uy * o.sw * 0.7;
      h += `<path d="M${r2(tx - ux * L - uy * W)} ${r2(ty - uy * L + ux * W)}L${r2(tx)} ${r2(ty)}L${r2(tx - ux * L + uy * W)} ${r2(ty - uy * L - ux * W)}" fill="none" stroke="#000" stroke-width="${o.sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  });
  return h;
}
function linkName(o) { const pg = objs(), n = id => { const x = flat(pg).find(k => k.id === id); return x ? layerName(x) : '?'; }; return `${n(o.a)} — ${n(o.b)}`; }
const LINK = { route: 'd45', sa: 'auto', sb: 'auto', lead: 1, gap: 0, k: 0.5, r: 0.5, sw: 0.375, dash: 0, h1: '', h2: '' };
try { Object.assign(LINK, JSON.parse(localStorage.getItem('labels.link')) || {}); } catch (e) {}
// chain: each to the next in the order clicked; star: each to the last one clicked. Lines under the objects.
function join(how) {
  const cs = [...multi, sel].filter(id => id != null).map(find).filter(o => o && o.kind !== 'link');
  if (cs.length < 2 || joining) return toggleJoin();
  addLinks(how === 'star' ? cs.slice(0, -1).map(o => [o, cs[cs.length - 1]]) : cs.slice(1).map((o, i) => [cs[i], o]));
}
// the join tool (phones, or nothing selected): tap one object, then the next ... each tap a link from the last one
let joining = null;
function toggleJoin() {
  const o = sel && find(sel);
  joining = joining ? null : { from: o && o.kind !== 'link' ? o.id : null };
  say(joining ? `Join: tap ${joining.from != null ? 'the next object' : 'the first object, then the next'} (Join or Esc to stop)` : '');
  draw();
}
// the top object whose box is under a point (an icon's blank parts count): easier to hit with a finger
const objAt = q => objs().slice().reverse().find(o => !o.hidden && o.kind !== 'link' && (v => q.x >= v.x - 1 && q.x <= v.x + v.w + 1 && q.y >= v.y - 1 && q.y <= v.y + v.h + 1)(vis(o)));
function joinTap(q) {         // tap one, then the next: a link between, and on from that one
  const o = objAt(q);
  if (!o) { joining.from = null; selNone(); changed(); return say('Join: tap the first object'); }
  if (joining.from != null && joining.from !== o.id && find(joining.from)) addLinks([[find(joining.from), o]]);
  joining.from = o.id; sel = o.id; multi.clear(); changed();
  say('Join: now the next one (empty paper: start again; Join or Esc: stop)');
}
function addLinks(pairs) {
  const has = (a, b) => objs().some(l => l.kind === 'link' && ((l.a === a && l.b === b) || (l.a === b && l.b === a)));
  const made = pairs.filter(([a, b]) => !has(a.id, b.id)).map(([a, b]) => ({ kind: 'link', id: nextId++, ...LINK, a: a.id, b: b.id, x: 0, y: 0, w: 1, h: 1, rot: 0 }));
  if (!made.length) return say('joined already');
  commit(); doc.pages[page] = made.concat(objs());
  changed(); if (!joining) say(`${made.length} link${made.length > 1 ? 's' : ''}: select one to change its route (it follows the objects)`);
}
function linkProps(o) {
  const sl = (k, opts, v) => `<select data-k="${k}">${Object.entries(opts).map(([a, n]) => `<option value="${a}"${a === (v ?? '') ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
  let h = `<p class="hint">${esc(linkName(o))}. It follows them when they move.</p>`;
  h += field('route', sl('route', ROUTES, o.route));
  if (o.route !== 'straight') h += field('bend, start → end', `<input data-k="k" type="range" min="0" max="1" step="0.05" value="${o.k ?? { start: 0, end: 1 }[o.bend] ?? 0.5}">`);
  h += `<p class="hint">Or drag its handles: the middle one slides the bend along, an end one moves that end to another side.</p>`;
  h += field('leaves from', sl('sa', SIDES, o.sa || 'auto')) + field('arrives at', sl('sb', SIDES, o.sb || 'auto'));
  if (o.route !== 'straight') h += field('straight out first, mm', num('lead', o.lead ?? 1, 0.5));
  h += field('gap at the ends, mm', num('gap', o.gap || 0, 0.25));
  h += field('line, mm', num('sw', o.sw, 0.125)) + field('dash, mm', num('dash', o.dash || 0, 0.25));
  if (o.route !== 'straight') h += field('corners, mm', num('r', o.r || 0, 0.25));
  h += field('start', sl('h1', LHEADS, o.h1 || '')) + field('end', sl('h2', LHEADS, o.h2 || ''));
  h += `<div class="row"><button id="linkswap" title="start and end the other way round">Swap ends</button><button id="linkdef" title="new links get this route and look">Use for new links</button></div>`;
  return h;
}

// ---- the stage

// zoom: screen px per mm. Real size is CSS's 96 px/inch times this screen's own correction (measured once with a
// ruler held to the screen, kept per browser): the paper on screen as big as on the roll.
const PXMM = 96 / 25.4;
// Known screens, told apart by their size in CSS px and pixel ratio: CSS px per real inch from the panel's own pixels per
// inch, so 1:1 is the real size without a ruler. [name, CSS width, height, pixel ratio, panel ppi, panel px across].
// A Mac's scaled modes ("looks like") all render at 2× and are shrunk onto the panel; an iPhone's are the panel's own.
// Sizes two screens share at different ppi are left out (older 13"/15" MacBooks at 1440 × 900 ...).
const SCREENS = [
  ['iPhone 16 Pro / 17 / 17 Pro', 402, 874, 3, 460], ['iPhone 16 Pro Max / 17 Pro Max', 440, 956, 3, 460], ['iPhone Air', 420, 912, 3, 460],
  ['iPhone 14 Pro / 15 / 15 Pro / 16', 393, 852, 3, 460], ['iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus', 430, 932, 3, 460],
  ['iPhone 12 / 13 / 14 / 16e', 390, 844, 3, 460], ['iPhone 12 Pro Max / 13 Pro Max / 14 Plus', 428, 926, 3, 458],
  ['iPhone X / XS / 11 Pro / 12 mini / 13 mini', 375, 812, 3, 458], ['iPhone XS Max / 11 Pro Max', 414, 896, 3, 458],
  ['iPhone XR / 11', 414, 896, 2, 326], ['iPhone SE / 8', 375, 667, 2, 326],
  ['iPad mini', 744, 1133, 2, 326], ['iPad / iPad Air 11″', 820, 1180, 2, 264], ['iPad Pro 11″', 834, 1194, 2, 264], ['iPad Pro 11″', 834, 1210, 2, 264],
  ['iPad Pro 12.9″ / Air 13″', 1024, 1366, 2, 264], ['iPad Pro 13″ / Air 13″', 1032, 1376, 2, 264], ['iPad', 810, 1080, 2, 264],
  ...[[1512, 982], [1800, 1169], [1312, 852], [1147, 745], [1024, 665]].map(([w, h]) => ['MacBook Pro 14″', w, h, 2, 254.2, 3024]),
  ...[[1728, 1117], [2056, 1329], [1496, 967], [1312, 848], [1168, 755]].map(([w, h]) => ['MacBook Pro 16″', w, h, 2, 254.2, 3456]),
  ...[[1536, 960], [1792, 1120], [2048, 1280], [1344, 840], [1152, 720]].map(([w, h]) => ['MacBook Pro 16″ (2019)', w, h, 2, 226, 3072]),
  ...[[1280, 832], [1470, 956]].map(([w, h]) => ['MacBook Air 13″', w, h, 2, 224.4, 2560]), ['MacBook Air 15″', 1440, 932, 2, 224.4, 2880],
  ['iMac 24″', 2240, 1260, 2, 218, 4480], ['Studio Display / 5K', 2560, 1440, 2, 218, 5120], ['Pro Display XDR', 3008, 1692, 2, 218, 6016],
];
function knownScreen() {
  const dpr = devicePixelRatio || 1, a = Math.min(screen.width, screen.height), b = Math.max(screen.width, screen.height);
  for (const [name, w, h, r, ppi, native] of SCREENS) {
    const k = dpr / r;      // the browser's own zoom (Chrome and Firefox change the pixel ratio with it)
    if (Math.abs(k - 1) > 0.6) continue;
    for (const f of [1, k]) {     // the screen's size as given, or as Firefox gives it (divided by its zoom)
      if (Math.abs(a * f - Math.min(w, h)) > 2 || Math.abs(b * f - Math.max(w, h)) > 2) continue;
      const perInch = (native ? ppi * w / native : ppi / r) / k;      // CSS px per real inch
      return { name, w, h, cal: Math.round(perInch / 96 * 1000) / 1000 };
    }
  }
  return null;
}
const SCREEN = knownScreen();
let cal = SCREEN ? SCREEN.cal : 1, calOwn = false;
try { const v = +localStorage.getItem('labels.cal'); if (v) { cal = v; calOwn = true; } } catch (e) {}
const realZoom = () => PXMM * cal;
let zoom = realZoom();
const phone = matchMedia('(max-width: 860px)'), coarse = matchMedia('(pointer: coarse)');
let tab = null;      // phones: the panel shown in the sheet
const rulerOn = () => $('ruler').checked;
const margin = () => (rulerOn() ? 20 / zoom + 1 : 2);     // mm round the paper: the rulers, 20 px whatever the zoom
// rulers along the top and the left, in page mm: a tick every mm, longer at 5, numbered at 10 (or 20, 50 when small)
function rulers(g) {
  const R = margin(), px = v => v / zoom, t = 16 / zoom, step = zoom < 1.5 ? 50 : zoom < 2.5 ? 20 : 10;
  const tick = (v, axis) => {
    const L = px(v % step === 0 ? 9 : v % 5 === 0 ? 6 : 3.5);
    return axis === 'x' ? `M${v} ${-1 - L}v${L}` : `M${-1 - L} ${v}h${L}`;
  };
  let d = '', labels = '';
  for (let v = 0; v <= g.W + 1e-6; v++) { d += tick(v, 'x'); if (v % step === 0) labels += `<text x="${v + px(2)}" y="${-1 - t + px(9)}">${v}</text>`; }
  for (let v = 0; v <= g.H + 1e-6; v++) { d += tick(v, 'y'); if (v % step === 0 && v) labels += `<text x="${-1 - t + px(1)}" y="${v - px(2)}">${v}</text>`; }
  return `<g pointer-events="none"><rect x="${-R}" y="${-1 - t}" width="${g.W + R}" height="${t}" style="fill:var(--card)"/>` +
    `<rect x="${-1 - t}" y="${-R}" width="${t}" height="${g.H + R}" style="fill:var(--card)"/>` +
    `<path d="${d}" style="stroke:var(--mute)" stroke-width="${px(1)}" fill="none"/>` +
    `<g style="fill:var(--mute)" font-family="system-ui,sans-serif" font-size="${px(9)}">${labels}</g>` +
    `<line id="curx" y1="${-1 - t}" y2="-1" style="stroke:var(--sel)" stroke-width="${px(1.5)}" visibility="hidden"/>` +
    `<line id="cury" x1="${-1 - t}" x2="-1" style="stroke:var(--sel)" stroke-width="${px(1.5)}" visibility="hidden"/></g>`;
}
function draw() {
  if (!st) return;
  updateLinks(objs());
  const g = geo(), b = band(g), s = $('stage'), R = margin(), px = v => v / zoom;
  s.setAttribute('viewBox', `${-R} ${-R} ${g.W + R + 2} ${g.H + R + 2}`);
  s.setAttribute('width', (g.W + R + 2) * zoom); s.setAttribute('height', (g.H + R + 2) * zoom);
  const prev = $('preview').checked, css = getComputedStyle(document.body);
  const off = css.getPropertyValue('--off').trim(), lost = css.getPropertyValue('--lost').trim();
  let h = (rulerOn() ? rulers(g) : '') + `<rect x="0" y="0" width="${g.W}" height="${g.H}" rx="${g.labels ? 2 : 0}" fill="#fff" stroke="#bbb" stroke-width="0.1"/>`;
  const shown = objs().filter(o => !o.hidden).map(o => o.locked ? markup(o).replace('<g class="obj"', '<g class="obj" pointer-events="none"') : markup(o));
  h += `<g id="objs" style="opacity:${prev ? 0.12 : 1}">${shown.join('')}</g>`;
  h += `<image id="prev" x="${-g.left}" y="0" width="${g.PW}" height="${g.H}" style="image-rendering:pixelated" pointer-events="none"/>`;
  // where it can't print: off the head's band, and (labels) the top that's past the head after a tear
  if (b.x0 > 0) h += `<rect x="0" y="0" width="${b.x0}" height="${g.H}" fill="${off}" pointer-events="none"/>`;
  if (b.x1 < g.W) h += `<rect x="${b.x1}" y="0" width="${g.W - b.x1}" height="${g.H}" fill="${off}" pointer-events="none"/>`;
  if (g.labels && g.lost) {      // the top past the head: what it is, and how to have it back (a whole label, the rest of this one skipped)
    h += `<rect x="0" y="0" width="${g.W}" height="${g.lost}" fill="${lost}" pointer-events="none"/>`;
    const fs = Math.min(px(11), g.lost * 0.3), t = `top ${r2(g.lost)} mm: past the head`, t2 = 'use a whole label';
    if (fs * zoom >= 6) h += `<g id="lostchip" style="cursor:pointer"><title>The top ${r2(g.lost)} mm of the label at the head went past it ${st.fresh ? 'before anything printed (after a feed-out, the tear bar is ahead of the head)' : 'at the last feed-out'}: it can't print there. Click: print on the next whole label instead (the rest of this one is fed through blank). The "whole label" box by Print turns it back.</title>` +
      `<text x="${g.W / 2}" y="${r2(g.lost / 2 - fs * 0.15)}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${r2(fs)}" style="fill:var(--accent)">${t}</text>` +
      `<text x="${g.W / 2}" y="${r2(g.lost / 2 + fs * 1.05)}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${r2(fs)}" font-weight="600" text-decoration="underline" style="fill:var(--accent)">${t2}</text></g>`;
  }
  for (const m of objs().filter(x => multi.has(x.id) && !x.hidden)) {
    const pts = [[0, 0], [m.w, 0], [m.w, m.h], [0, m.h]].map(([x, y]) => corner(m, x, y));
    h += `<polygon points="${pts.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" style="stroke:var(--sel)" stroke-width="${1.5 / zoom}" stroke-dasharray="${4 / zoom}" pointer-events="none"/>`;
  }
  const o = sel && find(sel);
  if (o && !o.hidden) {      // its outline turned with it, the corner to scale, the knob over it to turn
    const pts = [[0, 0], [o.w, 0], [o.w, o.h], [0, o.h]].map(([x, y]) => corner(o, x, y));
    const big = coarse.matches, hs = (big ? 20 : 8) / zoom, sw = 1.5 / zoom, a = rad(o), top = corner(o, o.w / 2, 0), k = (big ? 30 : 18) / zoom;
    const knob = { x: top.x + Math.sin(a) * k, y: top.y - Math.cos(a) * k }, se = pts[2];
    h += `<polygon points="${pts.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" style="stroke:var(--sel)" stroke-width="${sw}" stroke-dasharray="${4 / zoom}" pointer-events="none"/>`;
    h += `<line x1="${top.x}" y1="${top.y}" x2="${knob.x}" y2="${knob.y}" style="stroke:var(--sel)" stroke-width="${sw}" pointer-events="none"/>`;
    if (!o.locked && !multi.size && o.kind !== 'link' && !joining) h += `<circle id="rothandle" cx="${knob.x}" cy="${knob.y}" r="${hs / 1.6}" style="fill:var(--card);stroke:var(--sel);cursor:grab" stroke-width="${sw}"><title>turn (15° steps, Shift: free)</title></circle>`;
    if (!o.locked && o.kind !== 'group' && o.kind !== 'link' && !multi.size && !joining) h += `<rect id="handle" x="${se.x - hs / 2}" y="${se.y - hs / 2}" width="${hs}" height="${hs}" style="fill:var(--sel);cursor:nwse-resize"/>`;
    if (o.kind === 'link' && !o.locked && !multi.size && o.pts && !joining) {     // ends: to another side; the middle: the bend along
      for (const [end, q] of [['a', o.pts[0]], ['b', o.pts[o.pts.length - 1]]])
        h += `<circle class="lend" data-end="${end}" cx="${q.x}" cy="${q.y}" r="${hs / 2}" style="fill:var(--card);stroke:var(--sel);cursor:move" stroke-width="${sw}"><title>drag to another side of the object</title></circle>`;
      const G = o.route !== 'straight' && linkGeo.get(o.id);
      if (G) h += `<rect id="lmid" x="${G.at.x - hs / 2}" y="${G.at.y - hs / 2}" width="${hs}" height="${hs}" transform="rotate(45 ${G.at.x} ${G.at.y})" style="fill:var(--sel);cursor:grab"><title>drag: the bend along the way (Alt: no steps)</title></rect>`;
    }
  }
  const jf = joining && joining.from != null && find(joining.from);
  if (jf) {       // join tool: the object it goes from, a line to the pointer
    const v = vis(jf);
    h += `<rect x="${v.x - 0.5}" y="${v.y - 0.5}" width="${v.w + 1}" height="${v.h + 1}" rx="1" fill="none" style="stroke:var(--accent)" stroke-width="${2 / zoom}" pointer-events="none"/>` +
      `<line id="rubber" x1="${v.x + v.w / 2}" y1="${v.y + v.h / 2}" x2="${v.x + v.w / 2}" y2="${v.y + v.h / 2}" style="stroke:var(--accent)" stroke-width="${1.5 / zoom}" stroke-dasharray="${4 / zoom}" pointer-events="none"/>`;
  }
  document.body.classList.toggle('joining', !!joining);
  for (const l of guides) h += `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#e11d8f" stroke-width="${1 / zoom}" pointer-events="none"/>`;
  s.innerHTML = h;
  pages(); tools();
  if (prev) schedulePreview();
}
// what Print prints: every page with something on it, or only this one
const printing = () => doc.pages.map((p, i) => ($('printwhat').value === 'all' || i === page) && p.some(o => !o.hidden));
function pages() {
  const pr = printing(), n = pr.filter(Boolean).length * Math.max(1, +$('copies').value || 1);
  $('pages').innerHTML = doc.pages.map((p, i) => `<button data-p="${i}" class="${i === page ? 'on' : ''}${pr[i] ? '' : ' skip'}" title="${pr[i] ? 'prints' : 'does not print'}">${i + 1}</button>`).join('');
  $('print').textContent = n === 1 ? 'Print 1 label' : `Print ${n} labels`;
}
function goPage(i) { page = Math.max(0, Math.min(doc.pages.length - 1, i)); selNone(); changed(); }
$('pages').onclick = e => { const p = e.target.dataset.p; if (p != null) goPage(+p); };
$('addpage').onclick = () => { commit(); doc.pages.splice(page + 1, 0, []); goPage(page + 1); };
$('delpage').onclick = () => {
  if (doc.pages.length < 2) return say('the only page');
  if (objs().length && !confirm('Delete this page and what is on it?')) return;
  commit(); doc.pages.splice(page, 1); goPage(page);
};
function setZoom(z) {
  zoom = Math.max(1.5, Math.min(30, z)); $('zoom').value = zoom;
  const r = zoom / realZoom(); $('zoomv').textContent = Math.abs(r - 1) < 0.01 ? '1:1' : r < 1 ? `1:${r2(1 / r)}` : `${r2(r)}:1`;
  draw();
}
function zoomFit() {
  const g = geo(), v = $('view'), R = rulerOn() ? 7 : 2;     // the rulers' margin at about this zoom
  setZoom(Math.floor(Math.min((v.clientWidth - 48) / (g.W + R + 2), (v.clientHeight - 48) / (g.H + R + 2)) * 2) / 2);
}
$('zoom').oninput = e => setZoom(+e.target.value);
$('real').onclick = $('tReal').onclick = () => setZoom(realZoom());
$('preview').onchange = draw;
// "whole label": print from the top of the next label, the part-used one at the head skipped; snap guides on or off
const wholeOn = () => $('whole').checked;
for (const [id, key, def] of [['whole', 'labels.whole', false], ['snap', 'labels.snap', true]]) {
  try { const v = localStorage.getItem(key); $(id).checked = v == null ? def : v === '1'; } catch (e) {}
  $(id).onchange = () => { try { localStorage.setItem(key, $(id).checked ? '1' : '0'); } catch (e) {} draw(); };
}
try { $('ruler').checked = localStorage.getItem('labels.ruler') !== '0'; } catch (e) {}
$('ruler').onchange = () => { try { localStorage.setItem('labels.ruler', $('ruler').checked ? '1' : '0'); } catch (e) {} draw(); };
// the screen's scale: at 1:1, a real ruler on the screen's ruler; what it reads at the screen's 40 (or any mark)
$('calib').onclick = () => {
  const at = +$('calmark').value || 40, got = +$('calread').value;
  if (!(got > 0)) return say('put a real ruler on the screen ruler at 1:1, enter where its mark lands');
  const shown = at * zoom / realZoom();        // what that mark measures if the screen were right
  cal = r2(cal * shown / got * 1000) / 1000;
  try { localStorage.setItem('labels.cal', cal); } catch (e) {}
  calOwn = true; calNote();
  setZoom(realZoom()); say(`screen scale ${cal}: now 1:1 is the real size`);
};
$('calreset').onclick = () => {
  cal = SCREEN ? SCREEN.cal : 1; calOwn = false; try { localStorage.removeItem('labels.cal'); } catch (e) {}
  setZoom(realZoom()); calNote(); say(SCREEN ? `screen scale back to the ${SCREEN.name}'s` : 'screen scale reset (96 px per inch)');
};
function calNote() {
  $('calnote').innerHTML = (SCREEN ? `This screen: <b>${esc(SCREEN.name)}</b> (${SCREEN.w} × ${SCREEN.h}), scale ${SCREEN.cal} set for it.`
    : `This screen isn't one it knows (${screen.width} × ${screen.height} at ${devicePixelRatio}×): 96 px per inch until measured.`) +
    (calOwn ? ` Measured here: <b>${cal}</b> (Reset: back to ${SCREEN ? 'the preset' : '1'}).` : '');
}
calNote();
// the pointer on the rulers
$('stage').addEventListener('pointermove', e => {
  const cx = $('curx'), cy = $('cury'); if (!cx) return;
  const p = toMM(e); cx.setAttribute('x1', p.x); cx.setAttribute('x2', p.x); cy.setAttribute('y1', p.y); cy.setAttribute('y2', p.y);
  cx.setAttribute('visibility', 'visible'); cy.setAttribute('visibility', 'visible');
});
$('stage').addEventListener('pointerleave', () => { for (const id of ['curx', 'cury']) { const l = $(id); if (l) l.setAttribute('visibility', 'hidden'); } });

let prevT;
function schedulePreview() {
  clearTimeout(prevT);
  prevT = setTimeout(async () => {
    try {
      const { bits, H } = await rasterize(objs());
      const c = document.createElement('canvas'); c.width = st.width; c.height = H;
      const x = c.getContext('2d'), id = x.createImageData(st.width, H);
      for (let i = 0; i < bits.length; i++) { id.data[4 * i + 3] = bits[i] ? 255 : 0; }
      x.putImageData(id, 0, 0);
      const im = $('prev'); if (im) im.setAttribute('href', c.toDataURL());
    } catch (e) { say(e.message); }
  }, 150);
}

// ---- pointer: select, drag, scale, turn

const toMM = e => { const p = $('stage').createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform($('stage').getScreenCTM().inverse()); };
const snap = (v, e) => (e.altKey ? r2(v) : Math.round(v * 2) / 2);
let drag = null;
$('stage').addEventListener('pointerdown', e => {
  if (e.target.closest('#lostchip')) { $('whole').checked = true; $('whole').onchange(); return say('prints on the next whole label: the rest of the one at the head is fed through'); }
  if (joining) return joinTap(toMM(e));
  const p = toMM(e), o0 = sel && find(sel);
  if (e.target.id === 'lmid' && o0) {
    commit(); drag = { kind: 'bend', o: o0 };
  } else if (e.target.classList.contains('lend') && o0) {
    commit(); drag = { kind: 'side', o: o0, end: e.target.dataset.end };
  } else if (e.target.id === 'handle' && o0) {
    commit(); drag = { kind: 'scale', o: o0, anchor: corner(o0, 0, 0), start: JSON.parse(JSON.stringify(o0)) };
  } else if (e.target.id === 'rothandle' && o0) {
    commit(); drag = { kind: 'turn', o: o0 };
  } else {
    let g = e.target.closest('.obj');
    while (g && g.parentNode.closest('.obj')) g = g.parentNode.closest('.obj');      // in a group: the group
    const id = g ? +g.dataset.id : null;
    if ((e.shiftKey || e.ctrlKey || e.metaKey) && id != null) toggleChosen(id);      // Shift / Ctrl / ⌘: add, or take out
    else if (id == null) selNone();
    else if (id !== sel && !multi.has(id)) { sel = id; multi.clear(); }
    else if (multi.has(id)) { multi.delete(id); multi.add(sel); sel = id; }
    const lk = id != null && !multi.size && find(id);
    if (lk && lk.kind === 'link' && !lk.locked) {      // a link's line dragged: its bend moves (it has no place of its own)
      if (lk.route !== 'straight' && linkGeo.get(lk.id)) { commit(); drag = { kind: 'bend', o: lk }; }
      else say('a straight link goes where its ends are: drag an end circle to another side, or pick another route');
    } else if (id != null && (id === sel || multi.has(id))) {
      commit(); drag = { kind: 'move', p, items: chosen().filter(o => !o.locked && o.kind !== 'link').map(o => ({ o, x: o.x, y: o.y })), moved: false };
      drag.box = boxOf(drag.items.map(it => vis(it.o)));
    }
    draw(); props(); layers();
  }
  if (drag) $('stage').setPointerCapture(e.pointerId);
});
$('stage').addEventListener('pointermove', e => {
  const rb = joining && $('rubber'); if (rb) { const q = toMM(e); rb.setAttribute('x2', q.x); rb.setAttribute('y2', q.y); }
  if (!drag) return;
  const p = toMM(e), o = drag.o;
  if (drag.kind === 'move') {
    let dx = snap(p.x - drag.p.x, e), dy = snap(p.y - drag.p.y, e);
    guides = [];
    if (snapOn() && !e.altKey && drag.box) {
      const g = guide(drag.box, p.x - drag.p.x, p.y - drag.p.y, drag.items.map(it => it.o));
      if (g.dx != null) dx = g.dx; if (g.dy != null) dy = g.dy; guides = g.lines;
    }
    for (const it of drag.items) { it.o.x = r2(it.x + dx); it.o.y = r2(it.y + dy); }
    drag.moved = true;
  } else if (drag.kind === 'bend') {
    const G = linkGeo.get(o.id);
    if (G) { const k = Math.max(0, Math.min(1, G.toK(p))); o.k = e.altKey ? r2(k) : Math.round(k * 20) / 20; delete o.bend; drag.moved = true; }
  } else if (drag.kind === 'side') {       // the side of its object nearest the pointer
    const v = boxIn(objs(), drag.end === 'a' ? o.a : o.b);
    if (v) o[drag.end === 'a' ? 'sa' : 'sb'] = ['top', 'bottom', 'left', 'right'].map(sd => [sd, anchorOf(v, sd)]).sort((a, b) => Math.hypot(a[1].x - p.x, a[1].y - p.y) - Math.hypot(b[1].x - p.x, b[1].y - p.y))[0][0];
  } else if (drag.kind === 'turn') {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    let a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90;
    if (!e.shiftKey) a = Math.round(a / 15) * 15;
    o.rot = normRot(a);
  } else {      // the pointer in the object's own frame, from its fixed top left corner
    const s = drag.start, a = rad(s), dx = p.x - drag.anchor.x, dy = p.y - drag.anchor.y;
    const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a);
    let fx = Math.max(0.05, lx / s.w), fy = Math.max(0.05, ly / s.h);
    if (!e.shiftKey || ['text', 'cable', 'icon', 'code', 'marker'].includes(o.kind)) fx = fy = Math.max(fx, fy);
    if (o.kind === 'wire') fx = Math.max(fx, 0.05);
    if (o.kind === 'pins') fy = ly / s.h;
    scaleObj(o, s, fx, fy);
    o.x = r2(drag.anchor.x + (o.w / 2) * Math.cos(a) - (o.h / 2) * Math.sin(a) - o.w / 2);
    o.y = r2(drag.anchor.y + (o.w / 2) * Math.sin(a) + (o.h / 2) * Math.cos(a) - o.h / 2);
  }
  draw();
});
$('stage').addEventListener('pointerup', () => {
  if (guides.length) { guides = []; draw(); }
  if (drag) { const moved = !['move', 'bend'].includes(drag.kind) || drag.moved; if (!moved) undo.pop(); drag = null; if (moved) changed(); }
  if (remote && !dirty) take(remote);
});
// snap guides: a moving selection's edges and middle catch on the other objects' edges and middles, the label's edges,
// middle and printable band, and the tear zone's line, within 6 screen px; a line shows what it caught on. Alt: off.
let guides = [];
const snapOn = () => $('snap').checked;
const boxOf = vs => { const x = Math.min(...vs.map(v => v.x)), y = Math.min(...vs.map(v => v.y)); return { x, y, w: Math.max(...vs.map(v => v.x + v.w)) - x, h: Math.max(...vs.map(v => v.y + v.h)) - y }; };
function guide(box, rdx, rdy, moving) {
  const g = geo(), b = band(g), tol = 6 / zoom, others = objs().filter(o => !o.hidden && !moving.includes(o)).map(vis);
  const page_ = { x: [0, g.W / 2, g.W, b.x0, b.x1], y: [0, g.H / 2, g.H, ...(g.labels && g.lost && !wholeOn() ? [g.lost] : [])] };
  const best = (axis, at, len) => {      // the nearest target to any of the box's three lines on this axis
    const mine = [at, at + len / 2, at + len], targets = [...page_[axis].map(v => ({ v, o: null })),
      ...others.flatMap(o => { const a = axis === 'x' ? o.x : o.y, l = axis === 'x' ? o.w : o.h; return [a, a + l / 2, a + l].map(v => ({ v, o })); })];
    let hit = null;
    for (const t of targets) for (const m of mine) { const d = t.v - m; if (Math.abs(d) <= tol && (!hit || Math.abs(d) < Math.abs(hit.d))) hit = { d, ...t }; }
    return hit;
  };
  const hx = best('x', box.x + rdx, box.w), hy = best('y', box.y + rdy, box.h), lines = [];
  const out = { dx: null, dy: null, lines };
  if (hx) { out.dx = r2(rdx + hx.d); const y0 = Math.min(box.y + rdy, hx.o ? hx.o.y : 0), y1 = Math.max(box.y + rdy + box.h, hx.o ? hx.o.y + hx.o.h : g.H); lines.push({ x1: hx.v, x2: hx.v, y1: y0 - 2, y2: y1 + 2 }); }
  if (hy) { out.dy = r2(rdy + hy.d); const nx = out.dx ?? rdx, x0 = Math.min(box.x + nx, hy.o ? hy.o.x : 0), x1 = Math.max(box.x + nx + box.w, hy.o ? hy.o.x + hy.o.w : g.W); lines.push({ x1: x0 - 2, x2: x1 + 2, y1: hy.v, y2: hy.v }); }
  return out;
}
function scaleObj(o, s0, fx, fy) {
  if (o.kind === 'text') { const x = o.x, y = o.y; o.size = r2(s0.size * fx); o.w = 0; fitText(o); o.x = x; o.y = y; return; }
  if (o.kind === 'cable') { for (const k of ['F', 'hh', 'T', 'th']) o[k] = r2(s0[k] * fx); cableBox(o); return; }
  if (o.kind === 'line') { o.w = r2(s0.w * fx); return; }
  if (o.kind === 'code') { o.mod = Math.max(1, Math.round(s0.mod * fx)); codeBox(o); return; }
  if (o.kind === 'icon') { o.isz = r2((s0.isz ?? s0.w) * fx); iconBox(o); return; }
  if (o.kind === 'marker') { if (o.mode === 'tag') o.mod = Math.max(1, Math.round(s0.mod * fx)); else o.sq = Math.max(4, Math.round(s0.sq * fx)); markerBox(o); return; }
  if (o.kind === 'wire') { o.L = r2(Math.max(2, s0.L * fx)); wireBox(o); return; }
  if (o.kind === 'pins') { o.h = r2(Math.max(2, s0.h * fy)); pinsBox(o); return; }
  o.w = r2(s0.w * fx); o.h = r2(s0.h * fy);
}

// ---- keyboard

const SHORTCUTS = [
  ['T / B / L / A / C / G', 'add text, box, line, arrow, code, tag'], ['M / W / P / F', 'add marker, wire tag, pin strip, filament label'], ['Shift or Ctrl/⌘ click', 'select more (drag moves them all); in Layers, Shift click selects a run'], ['Alt while dragging', 'no snapping'], ['Ctrl + wheel, pinch', 'zoom where the pointer is'],
  ['Ctrl A', 'select all'], ['J, Shift J', 'join the selected with links: a chain in the order clicked; all to the last clicked. Nothing (or one) selected: the join tool, click one, then the next …'], ['Ctrl G, Ctrl Shift G', 'group (a frame around), ungroup'], ['Enter', 'edit the selected text'], ['Tab, Shift Tab', 'select the next, previous'],
  ['Arrows', 'nudge 0.5 mm (Shift 5, Alt 1 dot)'], ['R, Shift R', 'turn 90° right, left'], ['] [', 'turn 15° (Shift 1°)'],
  ['0 (zero)', 'no turn'], ['Del', 'delete'], ['Ctrl C / X / V', 'copy, cut, paste (also between tabs)'], ['Ctrl D', 'duplicate'],
  ['Ctrl ] [', 'a layer up, down'], ['Ctrl Shift ] [', 'to front, to back'], ['H', 'hide, show'], ['N', 'on black, or not'], ['K', 'lock, unlock'], ['Ctrl Z, Ctrl Shift Z', 'undo, redo'], ['PgUp PgDn', 'page before, after'],
  ['+ − =', 'zoom in, out, fit'], ['V', 'as printed'], ['Ctrl S', 'save the design'], ['Ctrl P', 'print'],
  ['Esc', 'nothing selected'], ['?', 'this list'],
];
$('keys').innerHTML = '<h3>Shortcuts</h3><table>' + SHORTCUTS.map(([k, v]) => `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('') + '</table><p class="hint">Ctrl is ⌘ on a Mac. Esc or ? closes.</p>';
$('keys').onclick = () => $('keys').hidden = true;
$('help').onclick = () => $('keys').hidden = !$('keys').hidden;

addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 'p') { e.preventDefault(); $('print').click(); return; }
  if (mod && k === 's') { e.preventDefault(); $('savedesign').click(); return; }
  if (e.key === 'Escape') { joining = null; if (typing) document.activeElement.blur(); $('keys').hidden = true; pop.hidden = true; selNone(); changed(); return; }
  if (typing) return;
  if (mod && k === 'z') { e.preventDefault(); undoStep(!e.shiftKey); return; }
  if (mod && k === 'y') { e.preventDefault(); undoStep(false); return; }
  if (mod && k === 'a') { e.preventDefault(); const os = objs(); if (os.length) { sel = os[os.length - 1].id; multi = new Set(os.slice(0, -1).map(o => o.id)); changed(); } return; }
  if (mod && k === 'g') {
    e.preventDefault(); const g = sel && find(sel);
    if (e.shiftKey) { if (g && g.kind === 'group') ungroup(g); else say('select a group'); } else group();
    return;
  }
  if (!mod && !e.altKey && /^[tblcgvhknamwpfj?+=-]$/i.test(e.key)) e.preventDefault();    // the key itself types nothing
  if (!mod) {
    if (e.key === '?') { $('keys').hidden = !$('keys').hidden; return; }
    if (k === 't') return $('addtext').click();
    if (k === 'b') return $('addbox').click();
    if (k === 'l') return $('addline').click();
    if (k === 'c') return $('addcode').click();
    if (k === 'g') return $('addtag').click();
    if (k === 'a') return $('addarrow').click();
    if (k === 'm') return $('addmarker').click();
    if (k === 'w') return $('addwire').click();
    if (k === 'p') return $('addpins').click();
    if (k === 'f') return $('addfil').click();
    if (k === 'j') return join(e.shiftKey ? 'star' : 'chain');
    if (k === 'v') { $('preview').checked = !$('preview').checked; return draw(); }
    if (e.key === '+') return setZoom(zoom + 2);
    if (e.key === '-') return setZoom(zoom - 2);
    if (e.key === '=') return zoomFit();
    if (e.key === 'PageUp') { e.preventDefault(); return goPage(page - 1); }
    if (e.key === 'PageDown') { e.preventDefault(); return goPage(page + 1); }
    if (e.key === 'Tab') {
      e.preventDefault(); const os = objs(); if (!os.length) return;
      const i = os.findIndex(o => o.id === sel);
      sel = os[(i + (e.shiftKey ? -1 : 1) + os.length + (i < 0 && e.shiftKey ? 1 : 0)) % os.length].id; changed(); return;
    }
  }
  const o = sel && find(sel); if (!o) return;
  const d = e.altKey ? 0.125 : e.shiftKey ? 5 : 0.5;
  const mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
  const turn = a => { commit(); o.rot = normRot((o.rot || 0) + a); changed(); };
  if (mv && o.locked && !multi.size) { e.preventDefault(); say('locked (K unlocks)'); }
  else if (mv) { e.preventDefault(); commit(); for (const c of chosen().filter(c => !c.locked && c.kind !== 'link')) { c.x = r2(c.x + mv[0]); c.y = r2(c.y + mv[1]); } changed(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') removeObjs(chosen());
  else if (mod && k === 'd') { e.preventDefault(); duplicate(o); }
  else if (mod && /^[\[\]{}]$/.test(e.key)) {
    e.preventDefault(); const up = e.key === ']' || e.key === '}';
    zorderMany(chosen(), e.shiftKey ? (up ? 'top' : 'bottom') : (up ? 'up' : 'down'));
  }
  else if (mod) return;
  else if (k === 'h') { commit(); o.hidden = !o.hidden; changed(); }
  else if (k === 'k') { commit(); o.locked = !o.locked; changed(); }
  else if (k === 'n' && o.kind !== 'image') {
    commit(); o.neg = !o.neg;
    if (o.neg && o.negPad == null) { o.negPad = o.kind === 'code' || o.kind === 'group' ? 0 : 1; o.negR = o.kind === 'code' ? 0 : 1; }
    changed();
  }
  else if (o.locked && (mv || /^[r\[\]{}0]$/i.test(e.key))) say('locked (K unlocks)');
  else if (k === 'r') turn(e.shiftKey ? -90 : 90);
  else if (e.key === ']' || e.key === '}') turn(e.shiftKey ? 1 : 15);
  else if (e.key === '[' || e.key === '{') turn(e.shiftKey ? -1 : -15);
  else if (e.key === '0') { commit(); o.rot = 0; changed(); }
  else if (e.key === 'Enter') { e.preventDefault(); const t = $('props').querySelector('textarea'); if (t) { t.focus(); t.select(); } }
});
function duplicate(o) {
  commit(); const map = {}, cs = relink((multi.size ? chosen() : [o]).map(x => reid(JSON.parse(JSON.stringify(x)), map)), map);
  cs.forEach(c => { c.x = r2(c.x + 2); c.y = r2(c.y + 2); objs().push(c); });
  sel = cs[cs.length - 1].id; multi = new Set(cs.slice(0, -1).map(c => c.id)); changed();
}
// copy and paste as text on the clipboard: works between tabs and pages
addEventListener('copy', e => copyCut(e, false));
addEventListener('cut', e => copyCut(e, true));
function copyCut(e, cut) {
  if (/INPUT|TEXTAREA/.test(document.activeElement.tagName) || !sel) return;
  const cs = chosen(); if (!cs.length) return;
  e.preventDefault(); e.clipboardData.setData('text/plain', CLIP + JSON.stringify(cs));
  if (cut) removeObjs(cs);
}

// ---- repeat: copies of the selected object in a grid (across × down, a gap between), more than a label holds going on
// to the next pages. Numbered: {n} in its texts counts up from "from" ({nn}, {nnn}: with zeros), a marker's id counts
// up. A list: one line a copy, put for {v}, or for its main text if it has no {v}. Cut lines between, if asked.

const REP = { across: 2, down: 3, gx: 1, gy: 1, total: 0, from: 1, count: true, list: '', cut: true, open: false };
try { Object.assign(REP, JSON.parse(localStorage.getItem('labels.rep')) || {}, { open: false }); } catch (e) {}
const MAIN = { text: ['text'], code: ['text'], tag: ['title', 'sub'], cable: ['a', 'b'], wire: ['text'], pins: ['names'], filament: ['color', 'sku'] };
const hasV = o => [...(MAIN[o.kind] || []).map(k => o[k]), ...(o.texts || [])].some(s => /\{v\}/.test(s || '')) || (o.kids || []).some(hasV);
function stamp(o, n, v, putV) {     // the copy's own number and list line
  const sub = s => (s == null ? s : String(s).replace(/\{(n+)\}/g, (m, p) => String(n).padStart(p.length, '0')).replace(/\{v\}/g, v ?? ''));
  for (const k of MAIN[o.kind] || []) o[k] = sub(o[k]);
  if (o.texts) o.texts = o.texts.map(sub);
  if (putV && v != null) {
    if (o.kind === 'svg') { o.texts = o.texts || []; o.texts[0] = v; }
    else if (o.kind === 'marker') o.tid = parseInt(v, 10) || 0;
    else if (MAIN[o.kind]) o[MAIN[o.kind][0]] = v;
  }
  if (o.kids) o.kids.forEach((k, i) => stamp(k, n, v, putV && i === 0));
}
async function refit(o) {      // its box again after its texts changed
  if (o.kids) { await Promise.all(o.kids.map(refit)); return; }
  if (o.kind === 'text') fitText(o);
  if (o.kind === 'cable') cableBox(o);
  if (o.kind === 'wire') wireBox(o);
  if (o.kind === 'pins') pinsBox(o);
  if (o.kind === 'code') await genCode(o);
  if (o.kind === 'marker') await genMarker(o);
  if (o.kind === 'filament') await genFilament(o);
}
// the list's lines; for a marker its ids, and ranges: "0-9, 20, 30-38/2" (commas or lines)
function repLines(o) {
  const ls = REP.list.split('\n').map(l => l.trim()).filter(Boolean);
  if (o.kind !== 'marker') return ls;
  return ls.flatMap(l => l.split(',')).map(x => x.trim()).filter(Boolean).flatMap(x => {
    const m = /^(\d+)\s*[-–]\s*(\d+)(?:\s*\/\s*(\d+))?$/.exec(x);
    if (!m) return [x];
    const a = +m[1], b = +m[2], st = Math.max(1, +(m[3] || 1)), out = [];
    for (let i = a; a <= b ? i <= b : i >= b; i += a <= b ? st : -st) { out.push(String(i)); if (out.length > 500) break; }
    return out;
  });
}
// what a marker's copies will be: their ids, said short
function repIds(o) {
  const ls = repLines(o), per = Math.max(1, REP.across) * Math.max(1, REP.down), total = ls.length || REP.total || per;
  const ids = ls.length ? ls.map(v => parseInt(v, 10) || 0) : [...Array(Math.min(total, 501))].map((_, i) => (o.tid || 0) + (REP.count ? i : 0));
  const runs = [];
  for (const v of ids) { const r = runs[runs.length - 1]; if (r && v === r[1] + 1) r[1] = v; else runs.push([v, v]); }
  const txt = runs.map(([a, b]) => (a === b ? a : `${a}–${b}`)).join(', ');
  const D = MKD && MKD[o.dict], over = D && Math.max(...ids) >= D.codes.length;
  return `${ids.length} markers, ids ${txt.length > 60 ? txt.slice(0, 60) + '…' : txt}` + (over ? ` (past ${D.name}'s ${D.codes.length})` : '');
}
function repFit(o) {        // as many as the label (the printable band, below the tear zone) holds from where it is
  const v = vis(o), { x1, yMax } = packArea();
  const across = Math.max(1, Math.floor((x1 - v.x + REP.gx + 1e-6) / (v.w + REP.gx)));
  const down = yMax > 1e3 ? REP.down : Math.max(1, Math.floor((yMax - v.y + REP.gy + 1e-6) / (v.h + REP.gy)));
  return { across, down };
}
async function repeat(o) {
  REP.across = Math.max(1, Math.round(REP.across)); REP.down = Math.max(1, Math.round(REP.down));
  const lines = repLines(o);
  const per = REP.across * REP.down, total = lines.length || REP.total || per, putV = lines.length && !hasV(o);
  if (total > 500) return say('500 copies at most');
  let note = '';
  if (o.kind === 'marker' && o.mode === 'tag' && (REP.count || lines.length)) {      // ids past the dictionary: a bigger one
    const D = MKD[o.dict], last = lines.length ? Math.max(...lines.map(v => parseInt(v, 10) || 0)) : (o.tid || 0) + total - 1;
    if (last >= D.codes.length) return say(`ids up to ${last}: ${D.name} has ${D.codes.length}`);
    if (last >= o.dsize) { const s = D.sizes.find(n => n > last) || D.codes.length; note = `, ids up to ${last}: as ${s} now (detect with that)`; commit(); o.dsize = s; }
    else commit();
  } else commit();
  const set = nextId++; o.tile = set;      // the copies and their cut lines: one set
  const v = vis(o), tpl = JSON.stringify(o), at = objs().indexOf(o), made = [];
  doc.pages[page] = objs().filter(x => x !== o);
  for (let i = 0; i < total; i++) {
    const p = page + Math.floor(i / per), j = i % per, c = j % REP.across, r = Math.floor(j / REP.across);
    if (!doc.pages[p]) doc.pages.push([]);
    const k = i ? reid(JSON.parse(tpl)) : Object.assign(o, JSON.parse(tpl));
    k.x = r2(o.x + c * (v.w + REP.gx)); k.y = r2(o.y + r * (v.h + REP.gy));
    if (k.kind === 'marker' && REP.count && !lines.length) k.tid = (JSON.parse(tpl).tid || 0) + i;
    if (k.kind === 'filament' && REP.count) k.serial = (JSON.parse(tpl).serial || 1) + i;
    stamp(k, REP.count ? REP.from + i : REP.from, lines[i], putV);
    made.push({ k, p });
  }
  await Promise.all(made.map(m => refit(m.k)));
  // the copies where the original was in the layers, on the later pages on top
  const first = made.filter(m => m.p === page).map(m => m.k);
  objs().splice(Math.min(at, objs().length), 0, ...first);
  made.filter(m => m.p !== page).forEach(m => doc.pages[m.p].push(m.k));
  if (REP.cut && (REP.across > 1 || REP.down > 1 || total > 1)) {      // cut lines in the gaps' middles, round the grid
    for (let p = page; p <= page + Math.floor((total - 1) / per); p++) {
      const n = Math.min(per, total - (p - page) * per), cols = Math.min(REP.across, n), rows = Math.ceil(n / REP.across);
      const x0 = v.x - REP.gx / 2, y0 = v.y - REP.gy / 2, W = cols * (v.w + REP.gx), H = rows * (v.h + REP.gy);
      const ln = (x, y, len, rot) => ({ kind: 'line', id: nextId++, w: r2(len), h: 0.125, dash: 0.5, rot, label: 'cut', cutOf: set,
        x: r2(rot ? x - len / 2 : x), y: r2(rot ? y + len / 2 - 0.0625 : y - 0.0625) });
      const cuts = [];
      for (let c = 0; c <= cols; c++) cuts.push(ln(x0 + c * (v.w + REP.gx), y0, H, 90));
      for (let r = 0; r <= rows; r++) cuts.push(ln(x0, y0 + r * (v.h + REP.gy), W, 0));
      doc.pages[p].unshift(...cuts);
    }
  }
  const mine = first.map(k => k.id); sel = mine[mine.length - 1]; multi = new Set(mine.slice(0, -1));
  changed();
  say(`${total} made` + (total > per ? ` on ${Math.ceil(total / per)} pages` : '') + note);
}
function repProps(o) {
  const n = repLines(o).length, mk = o.kind === 'marker' && o.mode === 'tag';
  return `<details id="rep"${REP.open ? ' open' : ''}><summary>Repeat (tiles)</summary>` +
    `<label>across <input data-r="across" type="number" min="1" step="1" value="${REP.across}"></label>` +
    `<label>down <input data-r="down" type="number" min="1" step="1" value="${REP.down}"></label>` +
    `<label>gap across, mm <input data-r="gx" type="number" step="0.25" value="${REP.gx}"></label>` +
    `<label>gap down, mm <input data-r="gy" type="number" step="0.25" value="${REP.gy}"></label>` +
    `<label title="more than across × down: on to the next pages (0: one label's worth)">how many (0: a label full) <input data-r="total" type="number" min="0" step="1" value="${REP.total}"></label>` +
    `<label title="{n} in a text counts up from this; a marker's id counts up">count up <input data-r="count" type="checkbox"${REP.count ? ' checked' : ''}></label>` +
    `<label>{n} from <input data-r="from" type="number" step="1" value="${REP.from}"></label>` +
    (mk ? `<div class="field"><div>or the ids: <code>0-9, 20, 30-38/2</code> (commas or lines)</div><textarea data-r="list" rows="2" placeholder="10-29">${esc(REP.list)}</textarea></div>` +
      `<p class="hint" id="repids">${esc(repIds(o))}</p>`
    : `<div class="field"><div>or a list, one a copy (for {v}, else for its text)${n ? `: ${n}` : ''}</div><textarea data-r="list" rows="3" placeholder="GND&#10;VCC&#10;SDA">${esc(REP.list)}</textarea></div>`) +
    `<label>cut lines <input data-r="cut" type="checkbox"${REP.cut ? ' checked' : ''}></label>` +
    `<div class="row"><button id="repfit" title="as many across and down as fit the label from where it is">Fill label</button><button id="repgo" class="go">Make</button></div>` +
    `<p class="hint">Put <code>{n}</code> (or <code>{nnn}</code>: 001) in a text to number the copies.</p></details>`;
}

// ---- align: the selected lined up on the selection's edges or middles, or spaced evenly (their boxes as drawn)

function alignSel(how) {
  const cs = chosen().filter(o => !o.locked); if (cs.length < 2) return say('select two or more (not locked)');
  const vs = cs.map(vis), x0 = Math.min(...vs.map(v => v.x)), x1 = Math.max(...vs.map(v => v.x + v.w));
  const y0 = Math.min(...vs.map(v => v.y)), y1 = Math.max(...vs.map(v => v.y + v.h));
  commit();
  if (how === 'dx' || how === 'dy') {
    const X = how === 'dx', k = X ? 'x' : 'y', L = X ? 'w' : 'h', order = cs.map((o, i) => ({ o, v: vs[i] })).sort((a, b) => a.v[k] - b.v[k]);
    const gap = ((X ? x1 - x0 : y1 - y0) - order.reduce((a, it) => a + it.v[L], 0)) / (order.length - 1);
    let at = X ? x0 : y0;
    for (const { o, v } of order) { o[k] = r2(o[k] + at - v[k]); at += v[L] + gap; }
  } else cs.forEach((o, i) => {
    const v = vs[i];
    if (how === 'l') o.x = r2(o.x + x0 - v.x); if (how === 'r') o.x = r2(o.x + x1 - v.x - v.w); if (how === 'c') o.x = r2(o.x + (x0 + x1) / 2 - v.x - v.w / 2);
    if (how === 't') o.y = r2(o.y + y0 - v.y); if (how === 'b') o.y = r2(o.y + y1 - v.y - v.h); if (how === 'm') o.y = r2(o.y + (y0 + y1) / 2 - v.y - v.h / 2);
  });
  changed();
}

// ---- the properties panel

function field(label, html) { return `<label>${label} ${html}</label>`; }
const num = (k, v, step = 0.5) => `<input data-k="${k}" type="number" step="${step}" value="${v}">`;
const fontBtn = (k, f) => (useFont(f), `<button class="fontbtn" data-fk="${k}" style="font-family:${esc(cssFamily(f))}">${esc(f)}</button>`);
function frameProps(o) {
  let h = field('border', `<input data-k="border" type="checkbox"${o.border ? ' checked' : ''}>`);
  if (o.border) h += field('padding, mm', num('pad', o.pad, 0.25)) + field('line, dots', num('bw', o.bw, 1)) +
    field('rounded corners', `<input data-k="round" type="checkbox"${o.round ? ' checked' : ''}>`) + (o.round ? field('corner radius, mm', num('radius', o.radius, 0.25)) : '');
  return h;
}
function filamentProps(o) {
  const dl = (id, xs) => `<datalist id="${id}">${xs.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
  const txt = (k, ph = '', list = '') => `<input data-k="${k}" value="${esc(o[k] ?? '')}" placeholder="${esc(ph)}"${list ? ` list="${list}"` : ''}>`;
  let h = `<div class="field"><div>brand</div>${txt('brand', 'Bambu Lab', 'fbrands')}</div>` + dl('fbrands', Object.keys(BRANDS));
  h += `<div class="field"><div>type</div>${txt('type', 'PLA Basic', 'ftypes')}</div>` + dl('ftypes', FTYPES);
  h += `<div class="field"><div>colour</div>${txt('color', 'Jade White')}</div>`;
  h += field('product code', txt('sku', 'e.g. 10100'));
  h += field('temperatures', txt('temps', '190–230 °C'));
  h += field('bought', `<input data-k="bought" type="date" value="${esc(o.bought || '')}">`);
  h += field('opened', `<input data-k="opened" type="date" value="${esc(o.opened || '')}">`) + `<div class="row"><button data-fset="today">opened today</button><button data-fset="noopen">not opened (a line to write on)</button></div>`;
  h += `<h3>Code</h3><div class="field"><div>pattern: <code>{B}</code> brand <code>{T}</code> type <code>{C}</code> colour <code>{sku}</code> <code>{yymmdd}</code> <code>{yyyy}</code> <code>{mm}</code> <code>{dd}</code> bought, <code>{o:yymmdd}</code> opened, <code>{nn}</code> serial</div>${txt('pattern', '{B}-{T}-{yymmdd}-{nn}')}</div>`;
  h += field(`brand code (${esc(BRANDS[o.brand] ? 'known' : 'auto')}: ${esc(brandCode({ brand: o.brand }))})`, txt('bcode', brandCode({ brand: o.brand })));
  h += field(`type code (auto: ${esc(typeCode({ type: o.type }))})`, txt('tcode', typeCode({ type: o.type })));
  h += field('serial numbers', `<input data-k="useSerial" type="checkbox"${o.useSerial ? ' checked' : ''}>`) + (o.useSerial ? field('serial', num('serial', o.serial ?? 1, 1)) : '');
  h += `<p class="hint">Code: <b id="fcode">${esc(o.code || '')}</b>${o.useSerial ? '. Repeat counts the serial up, one a copy; a list in Repeat gives each copy its colour.' : ''}</p>`;
  h += field('symbol', `<input data-k="showCode" type="checkbox"${o.showCode ? ' checked' : ''}>`) + (o.showCode ? field('as', `<select data-k="ctype">${FCODES.map(c => `<option value="${c}"${c === o.ctype ? ' selected' : ''}>${CODES[c][0]}</option>`).join('')}</select>`) : '');
  h += `<h3>Look</h3>` + field('width, mm', num('w', r2(o.w))) + field('height, mm', num('h', r2(o.h))) + field('font', fontBtn('font', o.font));
  h += field('type on black', `<input data-k="typeBar" type="checkbox"${o.typeBar ? ' checked' : ''}>`) + field('border', `<input data-k="border" type="checkbox"${o.border ? ' checked' : ''}>`);
  if (o.err) h += `<p class="hint" style="color:var(--accent)">${esc(o.err)}</p>`;
  return h;
}
function weights(f) {
  const fs = families[f];
  const ws = fs ? [...new Set(fs.map(x => x.weight))] : [300, 400, 500, 600, 700, 800, 900];
  return ws.sort((a, b) => a - b);
}
const HELP = $('props').innerHTML;
function props() {
  const o = sel && find(sel), P = $('props');
  if (!o) { P.innerHTML = HELP; return; }
  if (multi.size) {
    const al = [['l', 'left'], ['c', 'centres across'], ['r', 'right'], ['t', 'top'], ['m', 'middles'], ['b', 'bottom']];
    P.innerHTML = `<h3>${multi.size + 1} selected</h3><p class="hint">Drag or nudge to move them together. Shift or Ctrl/⌘ click takes one out.</p>` +
      `<div class="row"><button id="group" title="Ctrl G">Group</button><button id="joinchain" title="a link from each to the next, in the order clicked (J)">Join</button><button id="joinstar" title="a link from each to the last one clicked (Shift J)">Join to last</button><button id="dup">Duplicate</button><button id="mhide">Hide / show</button><button id="mlock">Lock / unlock</button><button class="danger" id="del">Delete</button></div>` +
      `<h3>Align</h3><div class="row">${al.map(([k, n]) => `<button data-align="${k}" title="line up their ${n}">${{ l: '⇤', c: '↔', r: '⇥', t: '⤒', m: '↕', b: '⤓' }[k]} ${n.split(' ')[0]}</button>`).join('')}</div>` +
      (multi.size > 1 ? `<div class="row"><button data-align="dx" title="equal gaps across">Space across</button><button data-align="dy" title="equal gaps down">Space down</button></div>` : '') +
      (chosen().some(c => c.kind === 'text') ? styleChips() : '') +
      (doc.pages.length > 1 ? `<div class="row">to page <select id="topage"><option value="">…</option>${doc.pages.map((_, i) => i === page ? '' : `<option>${i + 1}</option>`).join('')}</select></div>` : '');
    return;
  }
  const v = vis(o);
  let h = `<h3>${KIND[o.kind]}${o.name ? ': ' + esc(o.name) : ''}</h3>`;
  if (o.kind !== 'link') h += field('x, mm', num('x', r2(v.x))) + field('y, mm', num('y', r2(v.y))) + field('turn, °', num('rot', o.rot || 0, 15));
  if (o.kind === 'code') {
    const g = codeGeo(o), M = o.mat;
    h += `<div class="field"><textarea data-k="text" rows="2">${esc(o.text)}</textarea></div>`;
    h += field('type', `<select data-k="type">${Object.entries(CODES).map(([k, v]) => `<option value="${k}"${k === o.type ? ' selected' : ''}>${v[0]}${v[1] ? '' : ' (1D)'}</option>`).join('')}</select>`);
    if (o.type === 'qrcode' || o.type === 'microqrcode') h += field('error correction', `<select data-k="ec">${['L', 'M', 'Q', 'H'].map(a => `<option${a === (o.ec || 'L') ? ' selected' : ''}>${a}</option>`).join('')}</select>`);
    h += field('module, dots', num('mod', o.mod, 1)) + field('quiet zone, modules', num('quiet', o.quiet, 1));
    if (M && M.sbs) h += field('bar height, mm', num('bar', o.bar, 0.5)) + field('text under', `<input data-k="hrt" type="checkbox"${o.hrt ? ' checked' : ''}>`) + (o.hrt ? field('text size, mm', num('tsize', o.tsize, 0.25)) + field('font', fontBtn('font', o.font)) : '');
    h += frameProps(o);
    const size = M && !M.sbs ? `${M.cols} × ${M.rows * M.rowh} modules, ` : '';
    h += `<p class="hint">${size}module ${r2(g.m)} mm, ${r2(o.w)} × ${r2(o.h)} mm in all.</p>`;
    if (o.err) h += `<p class="hint" style="color:var(--accent)">${esc(o.err)}</p>`;
    if (o.mod < 2) h += `<p class="hint" style="color:var(--accent)">1-dot modules (0.125 mm) are the smallest it can print; thermal dots spread, so they may not scan. 2 dots is the safe minimum.</p>`;
  } else if (o.kind === 'tag') {
    h += `<div class="field"><div>title</div><input data-k="title" value="${esc(o.title)}"></div><div class="field"><div>line under (empty: none)</div><input data-k="sub" value="${esc(o.sub)}"></div>`;
    h += field('width, mm', num('w', r2(o.w))) + field('height, mm', num('h', r2(o.h)));
    const r = iconRef(o.icon), S = ICONSETS[r.set], sts = Object.keys(S.styles);
    h += `<div class="field"><div>icon: a Material Symbols name, or <code>mdi:</code> / <code>phosphor:</code> / <code>tabler:</code> / <code>brands:</code> name (empty: none)</div><input data-k="icon" value="${esc(o.icon || '')}"></div>`;
    if (sts.length > 1) h += field('icon style', `<select data-k="style">${sts.map(a => `<option${a === setStyle(r.set, o.style) ? ' selected' : ''}>${a}</option>`).join('')}</select>`);
    if (S.fill) h += field('icon filled', `<input data-k="fill" type="checkbox"${o.fill ? ' checked' : ''}>`);
    h += field('font', fontBtn('font', o.font)) + field('align', `<select data-k="align">${['start', 'middle'].map(a => `<option${a === o.align ? ' selected' : ''}>${a}</option>`).join('')}</select>`);
    h += frameProps(o);
  } else if (o.kind === 'icon') {
    const set = o.set || 'material', S = ICONSETS[set], sts = Object.keys(S.styles);
    h += `<p class="hint">${S.name}: ${esc(o.name)}</p>` + field('size, mm', num('isz', r2(o.isz ?? o.w)));
    h += field('number', `<input data-k="num" value="${esc(o.num ?? '')}" placeholder="none">`);
    if (String(o.num ?? '').trim()) {
      const sl = (k, opts, v) => `<select data-k="${k}">${Object.entries(opts).map(([a, n]) => `<option value="${a}"${a === v ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
      h += field('number in', sl('nstyle', NSTYLES, o.nstyle || 'node')) + field('number at', sl('npos', NPOS, o.npos || 'above'));
      h += field('number size (× icon)', num('nsize', o.nsize || 0.42, 0.02)) + field('number font', fontBtn('nfont', o.nfont || 'sans-serif'));
    }
    if (sts.length > 1) h += field('style', `<select data-k="style">${sts.map(a => `<option${a === setStyle(set, o.style) ? ' selected' : ''}>${a}</option>`).join('')}</select>`);
    if (S.fill) h += field('filled', `<input data-k="fill" type="checkbox"${o.fill ? ' checked' : ''}>`);
    const st0 = S.stroke && S.stroke[setStyle(set, o.style)];
    if (st0) h += field('line (of 24)', num('sw', o.sw || st0, 0.25));
    h += field('white', `<input data-k="white" type="checkbox"${o.white ? ' checked' : ''}>`);
  } else if (o.kind === 'marker') {
    const D = MKD && MKD[o.dict], sl = (k, opts, v) => `<select data-k="${k}">${Object.entries(opts).map(([a, n]) => `<option value="${a}"${String(a) === String(v) ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
    h += field('what', sl('mode', MMODES, o.mode));
    if (o.mode !== 'checker') {
      h += field('dictionary', sl('dict', Object.fromEntries(Object.entries(MKD || {}).map(([k, d]) => [k, d.name])), o.dict));
      if (D && D.sizes.length > 1) h += field('as (ids)', sl('dsize', Object.fromEntries(D.sizes.map(n => [n, `${D.name.replace('ArUco ', '').replace('×', 'X')}_${n}`])), o.dsize));
      h += field(o.mode === 'tag' ? 'id' : 'first id', num('tid', o.tid, 1));
    }
    if (o.mode === 'tag') h += field('marker size, mm', num('msize', r2(((o.n || 4) + 2) * o.mod * DOT), 0.5)) + field('bit, dots', num('mod', o.mod, 1)) + field('white margin, bits', num('quiet', o.quiet, 1));
    else {
      h += field('squares across', num('sx', o.sx, 1)) + field('squares down', num('sy', o.sy, 1)) + field('square, dots', num('sq', o.sq, 1));
      if (o.mode === 'charuco') h += field('marker / square', num('ratio', o.ratio, 0.05));
      h += field('white margin, mm', num('margin', o.margin, 0.5));
    }
    h += field('caption', `<input data-k="caption" type="checkbox"${o.caption ? ' checked' : ''}>`) + (o.caption ? field('caption size, mm', num('csize', o.csize, 0.25)) + field('font', fontBtn('font', o.font)) : '');
    h += field('cut line', `<input data-k="cut" type="checkbox"${o.cut ? ' checked' : ''}>`);
    const g = markerGeo(o);
    h += `<p class="hint">${o.mode === 'tag' ? `${(o.n || 4) + 2} × ${(o.n || 4) + 2} bits with the black border, marker ${r2(g.pw)} mm` : `${o.sx} × ${o.sy} squares of ${r2(o.sq * DOT)} mm` + (o.mode === 'charuco' ? `, markers ${r2(markerCell(o) * ((o.n || 4) + 2) * DOT)} mm (${markerCell(o)}-dot bits)` : '')}; ${r2(o.w)} × ${r2(o.h)} mm in all. Detect with cv2.aruco ${D ? D.cv.replace('_1000', '_' + o.dsize) : ''}.</p>`;
    if (o.err) h += `<p class="hint" style="color:var(--accent)">${esc(o.err)}</p>`;
    if ((o.mode === 'tag' ? o.mod : markerCell(o)) < 3 && o.mode !== 'checker') h += `<p class="hint" style="color:var(--accent)">Bits under 3 dots (0.375 mm) blur on thermal paper: a camera may miss them.</p>`;
  } else if (o.kind === 'wire') {
    h += `<div class="field"><textarea data-k="text" rows="1">${esc(o.text)}</textarea></div>`;
    h += field('kind', `<select data-k="mode"><option value="wrap"${o.mode === 'wrap' ? ' selected' : ''}>wrap round the wire</option><option value="sleeve"${o.mode === 'sleeve' ? ' selected' : ''}>insert in a heat-shrink sleeve</option></select>`);
    h += field(o.mode === 'sleeve' ? 'sleeve inner Ø, mm' : 'wire Ø, mm', num('d', o.d, 0.1)) + field('length along it, mm', num('L', o.L, 1));
    if (o.mode === 'sleeve') h += field('slack, mm', num('slack', o.slack, 0.1));
    else h += field('turns', num('wraps', o.wraps, 0.25)) + field('turn marks', `<input data-k="turns" type="checkbox"${o.turns ? ' checked' : ''}>`);
    h += field('text size, mm (0: auto)', num('size', o.size, 0.25)) + field('font', fontBtn('font', o.font)) + field('cut line', `<input data-k="cut" type="checkbox"${o.cut ? ' checked' : ''}>`);
    const g = wireGeo(o);
    h += `<p class="hint">${r2(g.W)} × ${r2(g.H)} mm, text ${r2(g.s)} mm` + (o.mode === 'sleeve' ? `. Tube lies ${r2(circ(o) / 2)} mm flat.` : `, ${g.rows.length} rows; a turn is ${r2(circ(o))} mm.`) + `</p>`;
  } else if (o.kind === 'pins') {
    h += `<div class="field"><div>names, pin 1 first (comma or line each)</div><textarea data-k="names" rows="3">${esc(o.names)}</textarea></div>`;
    h += field('preset', `<select data-k="preset"><option value="">…</option>${Object.entries(PIN_PRESETS).map(([k, [n]]) => `<option value="${k}">${n}</option>`).join('')}</select>`);
    h += field('pins', num('count', o.count, 1)) + field('rows', `<select data-k="prow"><option value="1"${o.prow === 1 ? ' selected' : ''}>1 (1×N)</option><option value="2"${o.prow === 2 ? ' selected' : ''}>2 (2×N)</option></select>`);
    h += field('pitch, mm', num('pitch', o.pitch, 0.01)) + field('sides', `<select data-k="mode">${Object.entries(PIN_MODES).map(([k, n]) => `<option value="${k}"${k === o.mode ? ' selected' : ''}>${n}</option>`).join('')}</select>`);
    if (o.mode !== 'one') h += field('housing depth (side), mm', num('t', o.t, 0.1));
    if (o.mode === 'wrap') h += field('glue overlap, mm', num('ov', o.ov, 0.5));
    h += field('height, mm', num('h', o.h, 0.5)) + field('names along the wire', `<input data-k="along" type="checkbox"${o.along ? ' checked' : ''}>`);
    h += field('text size, mm (0: auto)', num('size', o.size, 0.25)) + field('font', fontBtn('font', o.font));
    h += field('pin 1 mark', `<input data-k="mark" type="checkbox"${o.mark ? ' checked' : ''}>`) + field('lines between', `<input data-k="lines" type="checkbox"${o.lines ? ' checked' : ''}>`);
    const g = pinsGeo(o);
    h += `<p class="hint">${r2(g.W)} × ${r2(o.h)} mm, names ${r2(g.s)} mm. Dashed: folds.${g.W > 48 ? ' Wider than the paper: fewer pins, or one side, or turn it 90°.' : ''}</p>`;
  } else if (o.kind === 'group') {
    h += `<p class="hint">${o.kids.length} objects. Ungroup (Ctrl Shift G) to change one.</p>`;
    h += field('frame', `<select data-k="shape">${[['none', 'none'], ['rect', 'box'], ['pill', 'pill'], ['ellipse', 'ellipse']].map(([k, n]) => `<option value="${k}"${k === o.shape ? ' selected' : ''}>${n}</option>`).join('')}</select>`);
    h += field('padding, mm', num('pad', o.pad, 0.25));
    if (o.shape !== 'none') h += field('line, mm', num('sw', o.sw, 0.125)) + (o.shape === 'rect' ? field('corner, mm', num('r', o.r, 0.5)) : '') + field('dash, mm', num('dash', o.dash || 0, 0.25));
    h += `<div class="row"><button id="ungroup">Ungroup</button></div>`;
  } else if (o.kind === 'shape') {
    h += field('shape', `<select data-k="shape">${Object.entries(SHAPES).map(([k, [n]]) => `<option value="${k}"${k === o.shape ? ' selected' : ''}>${n}</option>`).join('')}</select>`);
    h += field('width, mm', num('w', r2(o.w))) + field('height, mm', num('h', r2(o.h)));
    h += field('filled', `<input data-k="fill" type="checkbox"${o.fill ? ' checked' : ''}>`);
    if (!o.fill) h += field('line, mm', num('sw', o.sw, 0.125)) + field('dash, mm', num('dash', o.dash || 0, 0.25));
    if (o.shape !== 'ellipse') h += field('corners, mm', num('r', o.r || 0, 0.25));
  } else if (o.kind === 'filament') h += filamentProps(o);
  else if (o.kind === 'link') h += linkProps(o);
  else if (!['text', 'cable', 'line', 'marker', 'wire', 'pins'].includes(o.kind)) h += field('width, mm', num('w', r2(o.w))) + field('height, mm', num('h', r2(o.h)));
  if (o.kind === 'line') {
    h += field('length, mm', num('w', o.w)) + field('thickness, mm', num('h', o.h, 0.125)) + field('dash, mm', num('dash', o.dash || 0, 0.25));
    const hs = k => `<select data-k="${k}">${Object.entries(HEADS).map(([v, n]) => `<option value="${v}"${v === (o[k] || '') ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
    h += field('start', hs('h1')) + field('end', hs('h2'));
    h += `<p class="hint">Turn it with the knob: 15° steps (30°, 150°: isometric), Shift free.</p>`;
  }
  if (o.kind === 'text') {
    h += `<div class="field"><textarea data-k="text" rows="2">${esc(o.text)}</textarea></div>`;
    h += styleChips() + field('font', fontBtn('font', o.font)) + field('size, mm', num('size', o.size, 0.25));
    const ws = weights(o.font); if (!ws.includes(+o.weight)) ws.push(+o.weight);
    h += field('weight', `<select data-k="weight">${ws.sort((a, b) => a - b).map(w => `<option${w == o.weight ? ' selected' : ''}>${w}</option>`).join('')}</select>`);
    h += field('align', `<select data-k="align">${['start', 'middle', 'end'].map(a => `<option${a === (o.align || 'start') ? ' selected' : ''}>${a}</option>`).join('')}</select>`);
    h += field('italic', `<input data-k="italic" type="checkbox"${o.italic ? ' checked' : ''}>`) + field('white', `<input data-k="white" type="checkbox"${o.white ? ' checked' : ''}>`);
  }
  if (o.kind === 'box') {
    h += field('line, mm', num('sw', o.sw, 0.125)) + field('corner, mm', num('r', o.r, 0.5)) + field('dash, mm', num('dash', o.dash || 0, 0.25));
    h += field('filled', `<input data-k="fill" type="checkbox"${o.fill ? ' checked' : ''}>`);
  }
  if (o.kind === 'image') {
    h += field('brightness', `<input data-k="bright" type="range" min="-100" max="100" value="${o.bright || 0}">`);
    h += field('contrast', `<input data-k="contrast" type="range" min="-100" max="150" value="${o.contrast || 0}">`);
    h += field('invert', `<input data-k="invert" type="checkbox"${o.invert ? ' checked' : ''}>`);
    h += field('dither', `<select data-k="dither">${['atkinson', 'floyd', 'threshold'].map(a => `<option${a === (o.dither || 'atkinson') ? ' selected' : ''}>${a}</option>`).join('')}</select>`);
  }
  if (o.kind === 'cable') {
    h += `<div class="field"><div>big</div><input data-k="a" value="${esc(o.a)}"></div><div class="field"><div>small</div><input data-k="b" value="${esc(o.b)}"></div>`;
    h += field('flag width', num('F', o.F)) + field('half height', num('hh', o.hh)) + field('tail length', num('T', o.T)) + field('tail height', num('th', o.th));
    h += field('tail', `<select data-k="side"><option value="r"${o.side !== 'l' ? ' selected' : ''}>right, above the fold</option><option value="l"${o.side === 'l' ? ' selected' : ''}>left, below the fold</option></select>`);
    h += field('font', fontBtn('font', o.font));
  }
  if (o.kind === 'svg') {
    const texts = svgTexts(svgDoc(o));
    if (texts.length) h += `<h3>Texts</h3>`;
    texts.forEach((t, i) => {
      const cur = (o.texts || [])[i] ?? ([...t.querySelectorAll('tspan')].map(s => s.textContent).join('\n') || t.textContent);
      const ff = t.getAttribute('font-family') || (t.closest('[font-family]') || t).getAttribute('font-family') || '';
      const known = ff.split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).find(n => families[n] || alias[n]);
      h += `<div class="field"><div>${esc(ff)} ${esc(t.getAttribute('font-size') || '')}${ff && !known ? ' <span title="not in the fonts: the browser picks one">(?)</span>' : ''}</div><textarea data-t="${i}" rows="${Math.min(4, cur.split('\n').length)}">${esc(cur)}</textarea></div>`;
    });
    h += `<div class="row"><button id="savetpl">Save as template</button><button id="keepsize" title="the size the SVG says">1:1</button></div>`;
  }
  if (o.kind !== 'link' && !o.neg) {
    h += field('white behind', `<input data-k="bg" type="checkbox"${whiteOn(o) ? ' checked' : ''} title="a white box under it: it reads on black">`);
    if (whiteOn(o)) h += field('white margin, mm', num('bgPad', o.bgPad ?? 0.5, 0.125)) + field('white corner, mm', num('bgR', o.bgR ?? 0.5, 0.25));
  }
  if (o.kind !== 'image' && o.kind !== 'link') {
    h += field('on black', `<input data-k="neg" type="checkbox"${o.neg ? ' checked' : ''}>`);
    if (o.neg) h += field('black margin, mm', num('negPad', o.negPad || 0, 0.125)) + field('black corner, mm', num('negR', o.negR || 0, 0.25));
    if (o.neg && o.kind === 'code') h += `<p class="hint">White modules on black: the black spreads, so give it 3+ dot modules, and a quiet zone of at least 2 (it's black too). Most phone and zxing scanners read inverted codes; check yours.</p>`;
  }
  h += `<div class="row"><button id="rot">Turn 90°</button><button id="dup">Duplicate</button><button id="front">To front</button><button class="danger" id="del">Delete</button></div>`;
  if (!o.locked && o.kind !== 'link') h += repProps(o);
  if (doc.pages.length > 1) h += `<div class="row">to page <select id="topage">${doc.pages.map((_, i) => `<option${i === page ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></div>`;
  P.innerHTML = h;
}
let propEdit = false;
$('props').addEventListener('input', e => {
  const o = sel && find(sel); if (!o) return;
  const t = e.target, k = t.dataset.k;
  if (t.dataset.r) {      // the repeat settings: kept per browser, not part of the design
    REP[t.dataset.r] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Math.max(t.dataset.r === 'from' ? -1e9 : 0, +t.value || 0) : t.value;
    try { localStorage.setItem('labels.rep', JSON.stringify(REP)); } catch (er) {}
    if ($('repids')) $('repids').textContent = repIds(o);
    return;
  }
  if (!propEdit) { commit(); propEdit = true; }
  if (t.dataset.t != null) { o.texts = o.texts || []; o.texts[+t.dataset.t] = t.value; }
  else if (k) {
    const v = t.type === 'checkbox' ? t.checked : t.type === 'number' || t.type === 'range' ? +t.value : t.value;
    if (k === 'x' || k === 'y') { const vv = vis(o); o[k] = r2(o[k] + v - vv[k]); }
    else if (o.kind === 'group' && k === 'pad') groupPad(o, Math.max(0, v));
    else if (o.kind === 'group' && k === 'shape') { o.shape = v; props(); }
    else if (o.kind === 'shape' && k === 'fill') { o.fill = v; props(); }
    else if (k === 'rot') o.rot = normRot(v);
    else if ((k === 'w' || k === 'h') && (o.kind === 'svg' || o.kind === 'image' || o.kind === 'icon')) { const f = v / o[k]; if (f > 0) { o.w = r2(o.w * f); o.h = r2(o.h * f); } }
    else if (o.kind === 'code') {
      o[k] = k === 'mod' || k === 'quiet' || k === 'bw' ? Math.max(k === 'quiet' ? 0 : 1, Math.round(v)) : v;
      if (k === 'text' || k === 'type' || k === 'ec') {
        if (k === 'type') o.quiet = CODES[v][3];
        genCode(o).then(() => { saveLocal(); draw(); if (k !== 'text') props(); else { const e = $('props').querySelector('.hint[style]'); if (e || o.err) props(); } });
      }
      codeBox(o);
    }
    else if (o.kind === 'marker') {
      o[k] = ['tid', 'mod', 'quiet', 'sx', 'sy', 'sq', 'dsize'].includes(k) ? Math.max(['tid', 'quiet'].includes(k) ? 0 : 1, Math.round(v)) : v;
      if (k === 'dict') { o.dsize = MKD[v].sizes[0]; }
      if (k === 'msize') { o.mod = Math.max(1, Math.round(v / (((o.n || 4) + 2) * DOT))); delete o.msize; }
      if (['dict', 'dsize', 'tid', 'mode', 'sx', 'sy'].includes(k)) genMarker(o).then(() => { saveLocal(); draw(); props(); });
      markerBox(o); if (k === 'caption') props();
    }
    else if (o.kind === 'filament') {
      o[k] = k === 'serial' ? Math.max(0, Math.round(v)) : k === 'w' || k === 'h' ? Math.max(4, v) : v;
      if (k === 'today') { o.opened = today(); delete o.today; }
      genFilament(o).then(() => { saveLocal(); draw(); const c = $('fcode'); if (c) c.textContent = o.code; layers(); });
      if (['useSerial', 'showCode'].includes(k)) props();
    }
    else if (o.kind === 'wire') { o[k] = v; wireBox(o); if (k === 'mode') props(); }
    else if (o.kind === 'pins') {
      if (k === 'preset') { if (v) Object.assign(o, PIN_PRESETS[v][1]); props(); }
      else if (k === 'prow') o.prow = +v;
      else if (k === 'count') o.count = Math.max(1, Math.round(v));
      else o[k] = v;
      if (k === 'names') o.count = Math.max(o.count, pinNames(o).filter((x, i, a) => x || i < a.length - 1).length);
      pinsBox(o); if (k === 'mode') props();
    }
    else if (o.kind === 'tag' && ['icon', 'style', 'fill'].includes(k)) {
      o[k] = v; const r = iconRef(o.icon);
      if (!r.name) o.d = ''; else iconGet(r.set, o.style, r.name, o.fill).then(d => { o.d = d || ''; saveLocal(); draw(); if (k === 'icon') { const sel_ = $('props').querySelector('[data-k=style]'); if (sel_ && sel_.options.length !== Object.keys(ICONSETS[r.set].styles).length) props(); } });
    }
    else if (o.kind === 'icon' && ['isz', 'num', 'nstyle', 'npos', 'nsize'].includes(k)) {
      o[k] = k === 'isz' ? Math.max(1, v) : k === 'nsize' ? Math.min(1.5, Math.max(0.15, v)) : v; iconBox(o);
    }
    else if (o.kind === 'icon' && (k === 'style' || k === 'fill')) {
      o[k] = v; const set = o.set || 'material';
      iconGet(set, o.style, o.name, o.fill).then(d => { if (d) { o.svg = d; o.vb = ICONSETS[set].vb; delete o.d; saveLocal(); draw(); } });
    }
    else o[k] = v;
    if (o.kind === 'text') fitText(o);
    if (o.kind === 'cable') cableBox(o);
    if (o.kind === 'code' && ['border', 'pad', 'bw', 'bar', 'hrt', 'tsize'].includes(k)) { codeBox(o); if (k === 'border' || k === 'hrt') props(); }
    if (o.kind === 'tag' && (k === 'border' || k === 'round')) props();
    if (k === 'bg') props();
    if (k === 'neg') { if (v && o.negPad == null) { o.negPad = o.kind === 'code' || o.kind === 'group' ? 0 : 1; o.negR = o.kind === 'code' ? 0 : 1; } props(); }
  }
  saveLocal(); draw();
});
$('props').addEventListener('focusout', () => { propEdit = false; });
$('props').addEventListener('toggle', e => { if (e.target.id === 'rep') REP.open = e.target.open; }, true);
$('props').addEventListener('change', e => {
  propEdit = false;
  if (['size', 'weight', 'italic'].includes(e.target.dataset.k)) rememberStyle(sel && find(sel));
  if (e.target.dataset.r) return;
  if (e.target.id === 'topage') { if (e.target.value) toPage(chosen(), +e.target.value - 1); } else { props(); layers(); }
});
$('props').addEventListener('click', async e => {
  const o = sel && find(sel); if (!o) return;
  const fb = e.target.closest('.fontbtn');
  if (fb) return pickFont(fb, o[fb.dataset.fk], f => {
    commit(); useFont(f); o[fb.dataset.fk] = f;
    if (o.kind === 'text') { const ws = weights(f); if (!ws.includes(+o.weight)) o.weight = ws.reduce((a, b) => Math.abs(b - o.weight) < Math.abs(a - o.weight) ? b : a); fitText(o); rememberStyle(o); }
    if (o.kind === 'icon') iconBox(o);
    if (o.kind === 'wire') wireBox(o);
    if (o.kind === 'pins') pinsBox(o);
    changed();
  });
  const id = e.target.id;
  if (id === 'repfit') {
    const f = repFit(o); Object.assign(REP, f);
    const P = $('props'); P.querySelector('[data-r=across]').value = f.across; P.querySelector('[data-r=down]').value = f.down;
    try { localStorage.setItem('labels.rep', JSON.stringify(REP)); } catch (er) {}
    if ($('repids')) $('repids').textContent = repIds(o);
    return say(`${f.across} × ${f.down} fit`);
  }
  if (id === 'repgo') return repeat(o).catch(er => say(er.message));
  if (id === 'linkswap' && o.kind === 'link') { commit(); [o.a, o.b, o.sa, o.sb, o.h1, o.h2] = [o.b, o.a, o.sb, o.sa, o.h2, o.h1]; return changed(); }
  if (id === 'linkdef' && o.kind === 'link') {
    for (const k of Object.keys(LINK)) LINK[k] = o[k] ?? LINK[k];
    try { localStorage.setItem('labels.link', JSON.stringify(LINK)); } catch (er) {} return say('new links will look like this one');
  }
  const fs = e.target.closest('[data-fset]');
  if (fs && o.kind === 'filament') { commit(); o.opened = fs.dataset.fset === 'today' ? today() : ''; await genFilament(o); return changed(); }
  if (id === 'group') return group();
  if (id === 'joinchain' || id === 'joinstar') return join(id === 'joinstar' ? 'star' : 'chain');
  if (id === 'ungroup') return ungroup(o);
  if (multi.size && id === 'del') return removeObjs(chosen());
  if (multi.size && (id === 'mhide' || id === 'mlock')) {
    const k = id === 'mhide' ? 'hidden' : 'locked', cs = chosen(), v = !cs.every(c => c[k]);
    commit(); cs.forEach(c => { c[k] = v; }); return changed();
  }
  const al = e.target.closest('[data-align]'); if (al) return alignSel(al.dataset.align);
  const sc = e.target.closest('[data-style]');
  if (sc) {
    const t = recentStyles[+sc.dataset.style], ts = chosen().filter(c => c.kind === 'text'); if (!t || !ts.length) return;
    commit(); useFont(t.font); ts.forEach(c => { Object.assign(c, t); fitText(c); }); rememberStyle(ts[0]); return changed();
  }
  if (id === 'rot') { commit(); o.rot = normRot((o.rot || 0) + 90); changed(); }
  if (id === 'dup') duplicate(o);
  if (id === 'del') removeObjs([o]);
  if (id === 'front') { commit(); doc.pages[page] = objs().filter(x => x !== o).concat([o]); changed(); }
  if (id === 'keepsize') { commit(); const s = svgSize(svgDoc(o).documentElement); o.w = r2(s.w); o.h = r2(s.h); changed(); }
  if (id === 'savetpl') {
    const name = prompt('Template name', (o.name || 'template').replace(/\.svg$/i, '')); if (!name) return;
    const d = svgDoc(o).documentElement.cloneNode(true), texts = svgTexts(d);
    (o.texts || []).forEach((v, i) => { if (v != null && texts[i]) setText(texts[i], v); });
    try { await put('templates', name.replace(/[^\w .()+,-]/g, '_') + '.svg', new XMLSerializer().serializeToString(d)); say('saved'); listStore(); }
    catch (er) { say(er.message); }
  }
});

// ---- adding things

async function addCode(type = 'datamatrix') {
  const o = { kind: 'code', type, text: CODES[type][2], mod: 2, quiet: CODES[type][3], ec: 'L', bar: 6, hrt: true, tsize: 1.75, font: 'monospace',
    border: false, pad: 0.5, bw: 2, round: true, radius: 1 };
  await genCode(o); commit(); add(o); changed();
}
async function addTag() {
  const o = { kind: 'tag', title: 'NAS', sub: 'rack 2', icon: 'dns', style: 'outlined', fill: false, w: 30, h: 10, font: $('cFont').value || 'sans-serif',
    align: 'start', border: true, pad: 1, bw: 2, round: true, radius: 1.5 };
  o.d = await iconPath(o.style, o.icon, false); commit(); add(o); changed();
}
async function addMarker(mode = 'tag', dict = 'aruco4', extra = {}) {
  MKD = await markerDicts();
  const o = Object.assign({ kind: 'marker', mode, dict, dsize: MKD[dict].sizes[0], tid: 0, mod: 4, quiet: 1, sx: 7, sy: 5, sq: 48, ratio: 0.75, margin: 1,
    caption: true, csize: 1.5, font: 'monospace', cut: false }, extra);
  await genMarker(o);
  if (extra.mod == null && mode === 'tag') o.mod = Math.max(1, Math.round(20 / ((o.n + 2) * DOT)));     // about 20 mm
  markerBox(o); commit(); add(o); changed();
}
function addWire(mode = 'wrap') {
  const o = mode === 'sleeve' ? { kind: 'wire', mode, text: 'GND', d: 4.8, L: 14, slack: 0.4, wraps: 1.5, size: 0, turns: true, cut: true }
    : { kind: 'wire', mode, text: 'GND', d: 3, L: 16, slack: 0.4, wraps: 1.5, size: 0, turns: true, cut: true };
  o.font = $('cFont').value || 'sans-serif';
  wireBox(o); commit(); add(o); changed();
}
function addPins(preset = 'dupont1') {
  const o = Object.assign({ kind: 'pins', names: preset === 'din' ? 'Lights, Oven' : preset.startsWith('tb') ? 'L, N, PE' : preset === 'dupont2' ? '3V3, 5V, SDA, 5V, SCL, GND' : 'GND, 5V, SDA, SCL',
    count: 0, ov: 3, size: 0, mark: true, lines: true, font: $('cFont').value || 'sans-serif' }, PIN_PRESETS[preset][1]);
  o.count = pinNames(o).length; o.mark = !['din', 'tb508', 'tb35'].includes(preset);
  pinsBox(o); commit(); add(o); changed();
}
async function addFilament(extra = {}) {
  const o = Object.assign({ kind: 'filament', brand: 'Bambu Lab', type: 'PLA Basic', color: 'Jade White', sku: '10100', temps: '190–230 °C',
    bought: today(), opened: '', pattern: '{B}-{T}-{yymmdd}-{nn}', useSerial: true, serial: 1, showCode: true, ctype: 'datamatrix',
    font: $('cFont').value || 'sans-serif', typeBar: false, border: true, w: 46, h: 20 }, extra);
  await genFilament(o); commit(); add(o); changed();
}
const BUILTIN = { filament: ['Filament spool (Bambu style)', () => addFilament()],
  filsmall: ['Filament: small (AMS / spool side)', () => addFilament({ w: 46, h: 12, temps: '', brand: 'Bambu Lab', typeBar: true })],
  tag: ['Logo tag', addTag], qr: ['QR code', () => addCode('qrcode')], dm: ['Data Matrix', () => addCode('datamatrix')], c128: ['Barcode (Code 128)', () => addCode('code128')],
  wire: ['Wire tag, wrap round', () => addWire('wrap')], sleeve: ['Wire tag in heat-shrink', () => addWire('sleeve')],
  dupont1: ['Header 1×N (Dupont), wrap', () => addPins('dupont1')], dupont2: ['Header 2×N (Dupont), wrap', () => addPins('dupont2')],
  jstxh: ['JST XH, both sides', () => addPins('jstxh')], tb508: ['Terminal block strip 5.08', () => addPins('tb508')], din: ['DIN breaker strip (18 mm)', () => addPins('din')],
  aruco: ['ArUco marker (4×4_50)', () => addMarker('tag', 'aruco4')], april: ['AprilTag 36h11', () => addMarker('tag', 'tag36h11')],
  charuco: ['ChArUco board 7×5', () => addMarker('charuco', 'aruco4')], checker: ['Checkerboard 9×6', () => addMarker('checker', 'aruco4', { sx: 9, sy: 6, sq: 40 })] };

$('addtext').onclick = () => {
  commit(); const o = Object.assign({ kind: 'text', text: 'Text', font: $('cFont').value || 'sans-serif', size: 4, weight: 700, align: 'start' }, recentStyles[0] || {});
  fitText(o); add(o); changed();
  const t = $('props').querySelector('textarea'); if (t) { t.focus(); t.select(); }
};
$('addbox').onclick = () => { commit(); add({ kind: 'box', w: 20, h: 10, sw: 0.25, r: 1, fill: false }); changed(); };
$('addcode').onclick = () => addCode().catch(e => say(e.message));
$('addtag').onclick = () => addTag().catch(e => say(e.message));
$('addmarker').onclick = () => addMarker().catch(e => say(e.message));
$('addwire').onclick = () => addWire();
$('addpins').onclick = () => addPins();
$('addfil').onclick = () => addFilament().catch(e => say(e.message));
$('addline').onclick = () => { commit(); add({ kind: 'line', w: 40, h: 0.25, dash: 0 }); changed(); };
$('addarrow').onclick = () => { commit(); add({ kind: 'line', w: 20, h: 0.375, dash: 0, h2: 'open' }); changed(); };
$('addshape').innerHTML = '<option value="">Shape…</option>' + Object.entries(SHAPES).map(([k, [n]]) => `<option value="${k}">${n}</option>`).join('');
$('addshape').onchange = e => {
  const v = e.target.value; e.target.value = ''; if (!v) return;
  const wide = ['arrow', 'chevron', 'pentagon'].includes(v);
  commit(); add({ kind: 'shape', shape: v, w: wide ? 16 : 10, h: wide ? 6 : 10, fill: false, sw: 0.375, r: 0.5, dash: 0 }); changed();
};

async function addFiles(files) {
  const fontsUp = [];
  for (const f of files) {
    const n = f.name.toLowerCase();
    try {
      if (/\.(ttf|otf|woff2?)$/.test(n)) { fontsUp.push(put('fonts', f.name, f)); continue; }
      if (n.endsWith('.json')) { commit(); setDoc(JSON.parse(await f.text())); page = 0; continue; }
      if (n.endsWith('.svg') || f.type === 'image/svg+xml') { commit(); add(svgObject(await f.text(), f.name)); continue; }
      if (f.type.startsWith('image/')) { commit(); add(await imageObject(f)); continue; }
      say(`${f.name}: not an SVG, image, font or design`);
    } catch (e) { say(`${f.name}: ${e.message}`); }
  }
  if (fontsUp.length) { await Promise.all(fontsUp).catch(e => say(e.message)); await loadFonts(); say(`${fontsUp.length} font(s) added`); }
  changed();
}
function imageObject(file) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {   // kept at most 1200 px: the printer has 384 dots across
      const k = Math.min(1, 1200 / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      const g = geo(), b = band(g), w = Math.min(b.x1 - b.x0 - 2, (g.H - 2) * im.width / im.height);
      res({ kind: 'image', name: file.name, src: c.toDataURL('image/png'), w: r2(w), h: r2(w * im.height / im.width), dither: 'atkinson' });
    };
    im.onerror = () => rej(new Error('cannot read the image'));
    im.src = URL.createObjectURL(file);
  });
}
function pasteText(t) {
  if (t.startsWith(CLIP)) {
    const os = JSON.parse(t.slice(CLIP.length)), map = {}; commit();
    os.forEach(o => reid(o, map)); relink(os, map);
    multi.clear();
    for (const o of os) { if (objs().some(x => x.x === o.x && x.y === o.y)) { o.x = r2(o.x + 2); o.y = r2(o.y + 2); } objs().push(o); if (sel != null) multi.add(sel); sel = o.id; }
    multi.delete(sel);
    changed(); return true;
  }
  if (/<svg[\s>]/.test(t)) { commit(); add(svgObject(t, 'pasted')); changed(); return true; }
  return false;
}
$('file').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
const layerDrag = e => [...e.dataTransfer.types].includes('text/x-layer');
addEventListener('dragover', e => { e.preventDefault(); if (!layerDrag(e)) document.body.classList.add('drag'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('drag'); });
addEventListener('drop', e => {
  e.preventDefault(); document.body.classList.remove('drag');
  if (layerDrag(e)) return;
  if (e.dataTransfer.files.length) return addFiles([...e.dataTransfer.files]);
  try { pasteText(e.dataTransfer.getData('text/plain')); } catch (er) { say(er.message); }
});
addEventListener('paste', e => {
  if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  const fs = [...e.clipboardData.files];
  if (fs.length) { e.preventDefault(); return addFiles(fs); }
  try { if (pasteText(e.clipboardData.getData('text/plain'))) e.preventDefault(); } catch (er) { say(er.message); }
});

// ---- cable labels

try { $('cables').value = localStorage.getItem('labels.cables') ?? 'WAN | 2\nGMK | 19V\nRack | Sw'; } catch (e) { $('cables').value = 'WAN | 2\nGMK | 19V\nRack | Sw'; }
$('cables').oninput = () => { try { localStorage.setItem('labels.cables', $('cables').value); } catch (e) {} };

function cableParams() { return { F: +$('cF').value, hh: +$('cH').value, T: +$('cT').value, th: +$('cTh').value, font: $('cFont').value || 'sans-serif' }; }
$('mkcables').onclick = () => {
  const lines = $('cables').value.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return say('one cable per line: big | small');
  commit();
  for (const l of lines) {
    const [a, b = ''] = l.split('|').map(s => s.trim());
    const o = Object.assign({ kind: 'cable', a, b, side: 'r', x: 0, y: 0 }, cableParams());
    cableBox(o); add(o, false);
  }
  arrange(); changed();
};
$('arrange').onclick = () => { commit(); arrange(); changed(); };

// Cable flags packed down the page, first fit: each tried from the top, 0.1 mm at a time, tail right above its
// fold at the left of the band, or tail left below its fold at the right, against everything already there (other
// flags and their tails, anything else on the page). Equal flags come out in two staggered columns, the tails
// interlocked. What doesn't fit goes to the next page (labels).
const hit = (a, b, g) => a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g;
function cableRects(o, x, y, side) {
  return side === 'l' ? [{ x: x + o.T, y, w: o.F, h: 2 * o.hh }, { x, y: y + o.hh, w: o.T, h: o.th }]
    : [{ x, y, w: o.F, h: 2 * o.hh }, { x: x + o.F, y: y + o.hh - o.th, w: o.T, h: o.th }];
}
const rectsOf = o => (o.kind === 'cable' && !o.rot ? cableRects(o, o.x, o.y, o.side) : [vis(o)]);
function packArea() {
  const g = geo(), b = band(g);
  return { g, gap: 0.6, x0: b.x0 + 0.4, x1: b.x1 - 0.4, y0: g.labels && $('avoid').checked ? g.lost + 0.5 : 0.5, yMax: g.labels ? g.H - 0.4 : 1e4 };
}
function freeSpot(o) {
  const { gap, x0, x1, y0, yMax } = packArea(), w = vis(o).w, h = vis(o).h;
  const taken = objs().filter(x => !x.hidden && x !== o).flatMap(rectsOf);
  const xs = [x0, ...taken.map(t => r2(t.x + t.w + gap))].filter(x => x >= x0 - 1e-6 && x + w <= x1 + 1e-6).sort((a, b) => a - b);
  for (let y = y0; y + h <= yMax + 1e-6; y = r2(y + 0.25))
    for (const x of xs) { const r = { x, y, w, h }; if (taken.every(t => !hit(r, t, gap))) return { x: r2(x + w / 2 - o.w / 2), y: r2(y + h / 2 - o.h / 2) }; }
  return null;
}
function arrange() {
  const all = doc.pages.slice(page).flatMap(p => p.filter(o => o.kind === 'cable' && !o.hidden && !o.locked));
  if (!all.length) return say('no cable labels on this page');
  doc.pages = doc.pages.map((p, i) => (i < page ? p : p.filter(o => !all.includes(o)))).filter((p, i) => i <= page || p.length);
  const { gap, x0, x1, y0, yMax } = packArea();
  let pg = page, taken = [];
  const start = () => { taken = doc.pages[pg].filter(o => !o.hidden).flatMap(rectsOf); };
  const fit = o => {
    const w = o.F + o.T, xs = w <= x1 - x0 + 1e-6 ? [['r', x0], ['l', x1 - w], ['r', x1 - w], ['l', x0]] : [['r', x0]];
    for (let y = y0; y + 2 * o.hh <= yMax + 1e-6; y = r2(y + 0.1))
      for (const [side, x] of xs) {
        const rs = cableRects(o, x, y, side);
        if (rs.every(r => r.y + r.h <= yMax + 1e-6 && taken.every(t => !hit(r, t, gap)))) return { x, y, side };
      }
    return null;
  };
  start();
  for (const o of all) {
    o.rot = 0;
    let spot = fit(o);
    while (!spot) {
      if (!taken.length) { spot = { x: x0, y: y0, side: 'r' }; break; }     // too big for an empty page: there anyway
      pg++; if (!doc.pages[pg]) doc.pages.splice(pg, 0, []); start(); spot = fit(o);
    }
    o.side = spot.side; cableBox(o); o.x = r2(spot.x); o.y = r2(spot.y);
    doc.pages[pg].push(o); taken.push(...cableRects(o, o.x, o.y, o.side));
  }
  selNone();
  if (pg > page) say(`${all.length} cable labels on ${pg - page + 1} pages`);
}

// ---- layers: the page's objects, the top one first

const KIND = { svg: 'SVG', image: 'Image', text: 'Text', box: 'Box', line: 'Line', cable: 'Cable', icon: 'Icon', code: 'Code', tag: 'Tag', group: 'Group', shape: 'Shape', marker: 'Marker', wire: 'Wire', pins: 'Pins', filament: 'Filament', link: 'Link' };
const layerName = o => o.label || (o.kind === 'text' ? o.text.split('\n')[0] : o.kind === 'cable' ? `${o.a} | ${o.b}` : o.kind === 'code' ? `${CODES[o.type][0]}: ${o.text}` : o.kind === 'tag' ? o.title : o.kind === 'group' ? `${o.kids.length}: ${o.kids.map(k => layerName(k)).join(', ')}` : o.kind === 'shape' ? SHAPES[o.shape][0] : o.kind === 'marker' ? markerCaption(o) : o.kind === 'wire' ? o.text : o.kind === 'pins' ? pinNames(o).filter(Boolean).join(' ') : o.kind === 'filament' ? `${o.type} ${o.color} · ${o.code || ''}` : o.kind === 'link' ? linkName(o) : o.kind === 'line' && (o.h1 || o.h2) ? 'Arrow' : o.name || KIND[o.kind]);
// the selection up, down, to the front or the back, keeping its own order
function zorder(o, how) { zorderMany([o], how); }
function zorderMany(cs, how) {
  const os = objs(), on = new Set(cs), nx = os.slice();
  if (how === 'top' || how === 'bottom') {
    const rest = nx.filter(x => !on.has(x)), mine = nx.filter(x => on.has(x));
    nx.splice(0, nx.length, ...(how === 'top' ? rest.concat(mine) : mine.concat(rest)));
  } else if (how === 'up') {
    for (let i = nx.length - 2; i >= 0; i--) if (on.has(nx[i]) && !on.has(nx[i + 1])) [nx[i], nx[i + 1]] = [nx[i + 1], nx[i]];
  } else for (let i = 1; i < nx.length; i++) if (on.has(nx[i]) && !on.has(nx[i - 1])) [nx[i], nx[i - 1]] = [nx[i - 1], nx[i]];
  if (nx.every((x, i) => x === os[i])) return;
  commit(); os.splice(0, os.length, ...nx); changed();
}
// several to another page, in their order, on top there
function toPage(cs, p) {
  if (p === page || !doc.pages[p]) return;
  commit(); doc.pages[page] = objs().filter(x => !cs.includes(x)); doc.pages[p].push(...cs);
  page = p; setChosen(cs.map(x => x.id)); changed();
}
let anchor = null, picking = false;      // the last row clicked (Shift: from it); phones: taps add to the selection
function layers() {
  const os = objs(), n = chosen().length;
  let h = `<h3><span>Layers${n > 1 ? ` <small class="hint">${n} selected</small>` : ''}</span>` +
    `<button data-z="up" title="up one (Ctrl ])">↑</button><button data-z="down" title="down one (Ctrl [)">↓</button>` +
    `<button data-z="top" title="to front (Ctrl Shift ])">⤒</button><button data-z="bottom" title="to back (Ctrl Shift [)">⤓</button>` +
    `<button data-ldel class="danger" title="delete the selected (Del)"${n ? '' : ' disabled'}>${uiIcon('delete')}</button></h3>` +
    `<div class="lbar"><button data-lpick class="${picking ? 'on' : ''}" title="tap rows to add them to the selection, or take them out">Select several</button>` +
    `<button data-lall>All</button><button data-lnone${n ? '' : ' disabled'}>None</button>` +
    (doc.pages.length > 1 && n ? `<select data-lpage title="move the selected to that page"><option value="">to page…</option>${doc.pages.map((_, i) => i === page ? '' : `<option value="${i}">${i + 1}</option>`).join('')}</select>` : '') +
    `</div><div class="lrows">`;
  h += os.slice().reverse().map(o => `<div class="lrow${o.id === sel || multi.has(o.id) ? ' on' : ''}${o.hidden ? ' off' : ''}" draggable="true" data-id="${o.id}">` +
    `<span class="lk">${KIND[o.kind]}</span><span class="lname" title="double-click to rename">${esc(layerName(o))}</span>` +
    `<button data-vis class="${o.hidden ? 'set' : ''}" title="hide / show (H)">${uiIcon(o.hidden ? 'visibility_off' : 'visibility')}</button>` +
    `<button data-lock class="${o.locked ? 'set' : ''}" title="lock / unlock (K)">${uiIcon(o.locked ? 'lock' : 'lock_open')}</button></div>`).join('')
    || '<div class="hint">Nothing on this page.</div>';
  h += '</div>' + (os.length > 1 ? `<p class="hint lhint">${coarse.matches ? '<b>Select several</b>, then tap rows.' : 'Ctrl/⌘ click: one more · Shift click: a run.'} Drag selected rows to move them all.</p>` : '');
  $('layers').innerHTML = h;
}
$('layers').addEventListener('click', e => {
  const z = e.target.closest('[data-z]');
  if (z) { const cs = chosen(); if (cs.length) zorderMany(cs, z.dataset.z); else say('select something first'); return; }
  if (e.target.closest('[data-ldel]')) return removeObjs(chosen());
  if (e.target.closest('[data-lpick]')) { picking = !picking; return layers(); }
  if (e.target.closest('[data-lall]')) { setChosen(objs().map(o => o.id)); return changed(); }
  if (e.target.closest('[data-lnone]')) { selNone(); return changed(); }
  const row = e.target.closest('.lrow'); if (!row) return;
  const o = find(+row.dataset.id);
  if (e.target.closest('[data-vis]')) { commit(); o.hidden = !o.hidden; changed(); return; }
  if (e.target.closest('[data-lock]')) { commit(); o.locked = !o.locked; changed(); return; }
  const add = e.ctrlKey || e.metaKey || picking;
  if (e.shiftKey && anchor != null && find(anchor)) {       // a run of rows, from the last one clicked
    const os = objs(), i = os.indexOf(find(anchor)), j = os.indexOf(o);
    const run = os.slice(Math.min(i, j), Math.max(i, j) + 1).map(x => x.id).filter(id => id !== o.id);
    const keep = add ? [sel, ...multi].filter(id => id != null && !run.includes(id) && id !== o.id) : [];
    setChosen([...keep, ...run, o.id]);
  } else if (add) { toggleChosen(o.id); anchor = o.id; }
  else { sel = o.id; multi.clear(); anchor = o.id; }
  changed();
});
$('layers').addEventListener('change', e => {
  if (e.target.dataset.lpage != null && e.target.value !== '') toPage(chosen(), +e.target.value);
});
$('layers').addEventListener('dblclick', e => {
  const row = e.target.closest('.lrow'); if (!row) return;
  const o = find(+row.dataset.id), n = prompt('Name', layerName(o));
  if (n != null) { commit(); o.label = n.trim() || undefined; changed(); }
});
let dragRows = null;      // the rows dragged: the selection when the row is in it
$('layers').addEventListener('dragstart', e => {
  const row = e.target.closest('.lrow'); if (!row) return;
  const id = +row.dataset.id, cs = chosen();
  dragRows = cs.some(o => o.id === id) ? cs.map(o => o.id) : [id];
  e.dataTransfer.setData('text/x-layer', row.dataset.id); e.dataTransfer.effectAllowed = 'move';
});
$('layers').addEventListener('dragover', e => {
  if (!dragRows) return;
  e.preventDefault(); e.stopPropagation();
  $('layers').querySelectorAll('.drop').forEach(r => r.classList.remove('drop'));
  const row = e.target.closest('.lrow'); if (row) row.classList.add('drop');
});
$('layers').addEventListener('drop', e => {      // dropped on a row: just over it in the list, so just above it
  if (!dragRows) return;
  e.preventDefault(); e.stopPropagation();
  const row = e.target.closest('.lrow'), ids = dragRows; dragRows = null;
  if (!row || ids.includes(+row.dataset.id)) return changed();
  commit(); const os = objs(), mine = os.filter(o => ids.includes(o.id)), rest = os.filter(o => !ids.includes(o.id));
  rest.splice(rest.indexOf(find(+row.dataset.id)) + 1, 0, ...mine);
  os.splice(0, os.length, ...rest); changed();
});
$('layers').addEventListener('dragend', () => { dragRows = null; layers(); });

// ---- icons: packs from npm (web/icons, icons.py), one JSON per style, fetched when first used. An icon is a path d,
// or SVG markup when it takes more than one shape; Tabler's outline set is stroked, the others filled.

const ICONSETS = {
  picks: { name: 'Picks: network, electrical, 3D printing …', picks: true, styles: {} },
  material: { name: 'Material Symbols', vb: '0 -960 960 960', styles: { outlined: 'outlined', rounded: 'rounded', sharp: 'sharp' }, fill: true, sep: '_' },
  mdi: { name: 'Material Design Icons (community)', vb: '0 0 24 24', styles: { '': 'mdi' } },
  phosphor: { name: 'Phosphor', vb: '0 0 256 256', styles: { regular: 'phosphor-regular', bold: 'phosphor-bold', fill: 'phosphor-fill' } },
  tabler: { name: 'Tabler', vb: '0 0 24 24', styles: { outline: 'tabler-outline', filled: 'tabler-filled' }, stroke: { outline: 2 } },
  brands: { name: 'Brand logos (Simple Icons)', vb: '0 0 24 24', styles: { '': 'brands' } },
};
const packs = {};
const PICKS = () => iconPack('picks');       // {categories: {name: [ref]}, icons: {ref: drawing}}, icons.py
const iconPack = file => (packs[file] = packs[file] || fetch(`/icons/${file}.json`).then(r => r.json()));
const setStyle = (set, style) => (style in ICONSETS[set].styles ? style : Object.keys(ICONSETS[set].styles)[0]);
async function iconGet(set, style, name, fill) {
  const P = await iconPack(ICONSETS[set].styles[setStyle(set, style)]);
  return (fill && ICONSETS[set].fill && P[name + '-fill']) || P[name];
}
const iconPath = (style, name, fill) => iconGet('material', style, name, fill);
// an icon's drawing: its shapes in a group that gives them the colour (and the line, for a stroked set)
function iconShapes(v, set, style, color = '#000', sw) {
  set = set || 'material';
  const body = !v ? '' : v[0] === '<' ? v : `<path d="${v}"/>`, S = ICONSETS[set];
  const st = S.stroke && S.stroke[setStyle(set, style)];
  return st ? `<g color="${color}" fill="none" stroke="currentColor" stroke-width="${sw || st}" stroke-linecap="round" stroke-linejoin="round">${body}</g>`
    : `<g color="${color}" fill="currentColor">${body}</g>`;
}
// a number on an icon: in a box (on a network node, outlined, filled, a circle) above, below, beside it or on its corner
const NSTYLES = { node: 'on a node (box, stem, bar)', box: 'box', fill: 'filled', circle: 'circle' };
const NPOS = { above: 'above', below: 'below', right: 'right', left: 'left', corner: 'corner' };
function iconLayout(o) {
  const s = o.isz ?? o.w, t = String(o.num ?? '').trim();
  if (!t) return { s, ix: 0, iy: 0, w: s, h: s };
  const st = o.nstyle || 'node', pos = o.npos || 'above', bh = Math.max(1.5, s * (o.nsize || 0.42)), fs = bh * 0.68;
  const tw = measure(t, o.nfont || 'sans-serif', fs, 700).w, bw = Math.max(bh, tw + bh * (st === 'circle' ? 0.4 : 0.55));
  const node = st === 'node' && pos !== 'corner', stem = node ? bh * 0.55 : 0, gap = node ? bh * 0.2 : s * 0.06;
  let L;
  if (pos === 'above' || pos === 'below') {
    const w = Math.max(s, bw), up = pos === 'above';
    L = { w, h: bh + stem + gap + s, ix: (w - s) / 2, iy: up ? bh + stem + gap : 0, b: { x: (w - bw) / 2, y: up ? 0 : s + gap + stem }, dir: up ? 'down' : 'up' };
  } else if (pos === 'left' || pos === 'right') {
    const h = Math.max(s, bh), r = pos === 'right', w = s + gap + stem + bw;
    L = { w, h, ix: r ? 0 : w - s, iy: (h - s) / 2, b: { x: r ? s + gap + stem : 0, y: (h - bh) / 2 }, dir: r ? 'left' : 'right' };
  } else {
    const ox = bw * 0.4, oy = bh * 0.4;
    L = { w: s + ox, h: s + oy, ix: 0, iy: oy, b: { x: s + ox - bw, y: 0 }, dir: null };
  }
  Object.assign(L.b, { w: bw, h: bh, fs, t }); L.s = s; L.stem = stem;
  return L;
}
function iconBox(o) { const L = iconLayout(o); o.w = r2(L.w); o.h = r2(L.h); }
function badgeSvg(o, L) {
  const { x, y, w, h, fs, t } = L.b, st = o.nstyle || 'node', sw = r2(Math.max(0.25, h * 0.1)), filled = st === 'fill' || st === 'circle';
  const rx = st === 'circle' ? h / 2 : h * 0.25, font = cssFamily(o.nfont || 'sans-serif').replace(/"/g, "'"), k = o.white ? '#fff' : '#000', bg = o.white ? '#000' : '#fff';
  let out = '';
  if (!L.dir) out += `<rect x="${r2(x - sw * 1.5)}" y="${r2(y - sw * 1.5)}" width="${r2(w + sw * 3)}" height="${r2(h + sw * 3)}" rx="${r2(rx + sw * 1.5)}" fill="${bg}"/>`;   // on the corner: a ring of paper around it
  out += filled ? `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" rx="${r2(rx)}" fill="${k}"/>`
    : `<rect x="${r2(x + sw / 2)}" y="${r2(y + sw / 2)}" width="${r2(w - sw)}" height="${r2(h - sw)}" rx="${r2(Math.max(0, rx - sw / 2))}" fill="${bg}" stroke="${k}" stroke-width="${sw}"/>`;
  out += `<text x="${r2(x + w / 2)}" y="${r2(y + h / 2)}" dominant-baseline="central" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${r2(fs)}" fill="${filled ? bg : k}">${esc(t)}</text>`;
  if (L.stem) {        // the node: a stem from the box toward the icon, a bar across its end
    const a = `stroke="${k}" stroke-width="${sw}" stroke-linecap="round"`, cx = x + w / 2, cy = y + h / 2, S = L.stem, half = (L.dir === 'down' || L.dir === 'up' ? w : h) * 0.45;
    const [x0, y0, x1, y1] = { down: [cx, y + h, cx, y + h + S], up: [cx, y, cx, y - S], left: [x, cy, x - S, cy], right: [x + w, cy, x + w + S, cy] }[L.dir];
    out += `<line x1="${r2(x0)}" y1="${r2(y0)}" x2="${r2(x1)}" y2="${r2(y1)}" ${a}/>`;
    out += x0 === x1 ? `<line x1="${r2(x1 - half)}" y1="${r2(y1)}" x2="${r2(x1 + half)}" y2="${r2(y1)}" ${a}/>` : `<line x1="${r2(x1)}" y1="${r2(y1 - half)}" x2="${r2(x1)}" y2="${r2(y1 + half)}" ${a}/>`;
  }
  return out;
}

// "mdi:server", "brands:synology", or a Material Symbols name
function iconRef(s) {
  const m = /^\s*([a-z]+):(.*)$/.exec(s || ''), set = m && ICONSETS[m[1]] ? m[1] : 'material', raw = (m && ICONSETS[m[1]] ? m[2] : s || '').trim().toLowerCase();
  return { set, name: raw.replace(/[\s_-]+/g, ICONSETS[set].sep || '-') };
}
let iconT;
async function iconStyles() {
  const S = ICONSETS[$('iconset').value];
  const keys = S.picks ? Object.keys((await PICKS()).categories) : Object.keys(S.styles);
  $('iconstyle').innerHTML = keys.map(k => `<option>${k}</option>`).join('');
  $('iconstyle').hidden = keys.length < 2; $('iconfill').parentNode.hidden = !S.fill;
}
async function listPicks() {
  const P = await PICKS(), q = $('iconq').value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const refs = q ? Object.values(P.categories).flat().filter((r, i, a) => a.indexOf(r) === i && r.split(':')[1].replace(/[_-]/g, '').includes(q))
    : P.categories[$('iconstyle').value] || [];
  $('icons').innerHTML = refs.map(r => { const [set, n] = r.split(':'); return `<button data-icon="${r}" title="${n.replace(/[_-]/g, ' ')} (${ICONSETS[set].name})"><svg viewBox="${ICONSETS[set].vb}">${iconShapes(P.icons[r], set, '', 'currentColor')}</svg></button>`; }).join('')
    || '<div class="hint">no such icon</div>';
}
async function listIcons() {
  if (ICONSETS[$('iconset').value].picks) return listPicks();
  const set = $('iconset').value, style = $('iconstyle').value, fill = $('iconfill').checked, S = ICONSETS[set];
  const q = $('iconq').value.trim().toLowerCase().replace(/[\s_-]+/g, S.sep || '-');
  $('icons').innerHTML = '<div class="hint">loading…</div>';
  const P = await iconPack(S.styles[setStyle(set, style)]);
  const names = Object.keys(P).filter(n => !(S.fill && n.endsWith('-fill')));
  const hits = (q ? names.filter(n => n.includes(q)).sort((a, b) => (a.indexOf(q) - b.indexOf(q)) || a.length - b.length || a.localeCompare(b)) : names).slice(0, 160);
  $('icons').innerHTML = hits.map(n => `<button data-icon="${n}" title="${n.replace(/[_-]/g, ' ')}"><svg viewBox="${S.vb}">${iconShapes((fill && S.fill && P[n + '-fill']) || P[n], set, style, 'currentColor')}</svg></button>`).join('')
    || '<div class="hint">no such icon</div>';
}
$('iconset').innerHTML = Object.entries(ICONSETS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
$('iconq').oninput = () => { clearTimeout(iconT); iconT = setTimeout(listIcons, 150); };
$('iconset').onchange = () => iconStyles().then(listIcons);
$('iconstyle').onchange = listIcons; $('iconfill').onchange = listIcons;
$('iconq').closest('details').addEventListener('toggle', e => { if (e.target.open && !$('icons').innerHTML) iconStyles().then(listIcons); });
$('icons').onclick = async e => {
  const b = e.target.closest('[data-icon]'); if (!b) return;
  let set = $('iconset').value, style = $('iconstyle').value, fill = $('iconfill').checked, name = b.dataset.icon, svg;
  if (ICONSETS[set].picks) { svg = (await PICKS()).icons[name]; [set, name] = name.split(':'); style = setStyle(set, ''); fill = false; }
  else { style = setStyle(set, style); svg = await iconGet(set, style, name, fill); }
  const o = { kind: 'icon', set, name, style, fill, svg, vb: ICONSETS[set].vb, isz: 8, num: '' };
  iconBox(o); commit(); add(o); changed();
};

// ---- rendering to dots

function drawSvg(s, W, H) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(im, 0, 0, W, H);
      res(x.getImageData(0, 0, W, H).data);
    };
    im.onerror = () => rej(new Error('could not draw the page (an SVG it cannot read?)'));
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  });
}
async function rasterize(pg, forPrint = false) {
  updateLinks(pg);
  const g = geo(pg, forPrint), W = st.width, H = Math.round(g.H * st.dpmm);
  pg = pg.filter(o => !o.hidden);
  const body0 = pg.map(o => markup(o)).join(''), all = flat(pg).filter(o => !o.hidden), fcss = await fontCss(all, body0);
  const sheet = noImg => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="${-g.left} 0 ${g.PW} ${g.H}">` +
    `<style>${fcss}</style>${noImg ? pg.map(o => markup(o, true)).join('') : body0}</svg>`;
  const full = await drawSvg(sheet(false), W, H), lum = new Float32Array(W * H), bits = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { lum[i] = (0.2126 * full[4 * i] + 0.7152 * full[4 * i + 1] + 0.0722 * full[4 * i + 2]) / 255; bits[i] = lum[i] < 0.5 ? 1 : 0; }
  if (all.some(o => o.kind === 'image')) {     // the pictures' pixels: where the page differs without them; dithered there
    const bare = await drawSvg(sheet(true), W, H), mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = Math.abs(full[4 * i + 1] - bare[4 * i + 1]) > 2 ? 1 : 0;
    dither(lum, mask, bits, W, H, all.find(o => o.kind === 'image').dither || 'atkinson');
  }
  return { bits, H, g };
}
function dither(lum, mask, out, W, H, how) {
  const K = how === 'floyd' ? [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]]
    : how === 'atkinson' ? [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]] : [];
  const e = Float32Array.from(lum);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!mask[i]) continue;
    const v = e[i], q = v < 0.5 ? 0 : 1, err = v - q; out[i] = q ? 0 : 1;
    for (const [dx, dy, w] of K) { const X = x + dx, Y = y + dy; if (X >= 0 && X < W && Y < H && mask[Y * W + X]) e[Y * W + X] += err * w; }
  }
}
function pbm(bits, W, H) {
  const head = new TextEncoder().encode(`P4\n${W} ${H}\n`), out = new Uint8Array(head.length + W / 8 * H);
  out.set(head);
  for (let i = 0; i < bits.length; i++) if (bits[i]) out[head.length + (i >> 3)] |= 0x80 >> (i & 7);
  return out;
}

$('print').onclick = async () => {
  const n = Math.max(1, +$('copies').value || 1), list = [], pr = printing();
  for (let c = 0; c < n; c++) doc.pages.forEach((p, i) => { if (pr[i]) list.push(p); });
  if (!list.length) return say('nothing to print');
  $('print').disabled = true;
  try {
    let first = true, queued = ''; const notes = [];
    const job = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name = encodeURIComponent(jobName(list));
    for (const [i, p] of list.entries()) {
      const { bits, H } = await rasterize(p, true), out = i === list.length - 1 && $('feedout').checked ? '&out=1' : '';
      const s = await api(`/api/print?label=${first && !wholeOn() ? 'auto' : 'next'}${out}&job=${job}&i=${i}&n=${list.length}&name=${name}`, { method: 'POST', body: pbm(bits, st.width, H) });
      if (s.queued) queued = s.note; else if (s.note) notes.push(s.note);
      first = false; showStatus(s);
    }
    if (queued) say(queued); else say(`printed ${list.length}` + (notes.length ? ': ' + notes[0] : ''));
    draw(); listJobs();
  } catch (e) { say(e.message); }
  $('print').disabled = false;
};

// ---- recent prints: kept on the Pi (jobs/), printed again from here or from the Pi's little screen

// a job's name: what its first page says (texts, codes, tags ...), short
function jobName(list) {
  const words = flat(list[0]).filter(o => !o.hidden && ['text', 'tag', 'cable', 'code', 'icon', 'wire', 'pins', 'marker', 'filament'].includes(o.kind)).map(o => layerName(o).replace(/^[^:]*: /, ''));
  const n = list.length > 1 ? ` (${list.length})` : '';
  return (words.join(' · ') || 'label').slice(0, 60) + n;
}
function pbmThumb(buf) {     // P4 → a canvas, the paper white, cut after the last black row
  const b = new Uint8Array(buf), txt = new TextDecoder().decode(b.slice(0, 40)), m = /^P4\s+(\d+)\s+(\d+)\s/.exec(txt);
  if (!m) return null;
  const W = +m[1], H = +m[2], off = m[0].length, stride = (W + 7) >> 3;
  let last = 0; for (let y = 0; y < H; y++) for (let x = 0; x < stride; x++) if (b[off + y * stride + x]) last = y;
  const h = Math.min(H, last + 8), c = document.createElement('canvas'); c.width = W; c.height = h;
  const x2 = c.getContext('2d'), id = x2.createImageData(W, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
    const on = b[off + y * stride + (x >> 3)] & (0x80 >> (x & 7)), i = 4 * (y * W + x);
    id.data[i] = id.data[i + 1] = id.data[i + 2] = on ? 0 : 255; id.data[i + 3] = 255;
  }
  x2.putImageData(id, 0, 0); return c;
}
const ago = t => { const s = Date.now() / 1000 - t; return s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
async function listJobs() {
  const el = $('jobs'); if (!el.closest('details').open) return;
  const { jobs } = await api('/api/jobs');
  el.innerHTML = jobs.map(j => `<div class="job"><span class="thumb" data-thumb="${j.id}"></span><div><div>${esc(j.name || 'label')}</div>` +
    `<small class="hint">${j.pages} label${j.pages > 1 ? 's' : ''}, ${ago(j.time)}${j.prints > 1 ? `, printed ${j.prints}×` : ''}</small></div>` +
    `<button data-reprint="${j.id}">Reprint</button></div>`).join('') || '<div class="hint">nothing printed yet</div>';
  for (const t of el.querySelectorAll('[data-thumb]')) {
    fetch(`/api/jobs/${t.dataset.thumb}/0.pbm`).then(r => r.arrayBuffer()).then(b => { const c = pbmThumb(b); if (c) t.appendChild(c); }).catch(() => {});
  }
}
$('jobs').closest('details').addEventListener('toggle', e => { if (e.target.open) listJobs().catch(er => say(er.message)); });
$('jobs').onclick = async e => {
  const id = e.target.dataset.reprint; if (!id) return;
  e.target.disabled = true;
  try { const s = await api(`/api/reprint?id=${id}`, { method: 'POST' }); showStatus(s); draw(); say('printed again' + (s.note ? ': ' + s.note : '')); listJobs(); }
  catch (er) { say(er.message); }
  e.target.disabled = false;
};

// ---- the store: templates, designs (fonts above)

async function put(kind, name, body) {
  const r = await fetch(`/api/store/${kind}/${encodeURIComponent(name)}`, { method: 'PUT', body });
  const j = await r.json(); if (j.error) throw new Error(j.error);
}
async function listStore() {
  for (const kind of ['templates', 'designs']) {
    const { files } = await api('/api/store/' + kind);
    $(kind).innerHTML = (kind === 'templates' ? Object.entries(BUILTIN).map(([k, [n]]) => `<div class="item"><span data-builtin="${k}">${n}</span><small class="hint">built in</small></div>`).join('') : '') + files.map(f => `<div class="item"><span data-open="${kind}/${esc(f.name)}">${esc(f.name.replace(/\.(svg|json)$/, ''))}</span><button data-del="${kind}/${esc(f.name)}">×</button></div>`).join('') || '<div class="hint">none yet</div>';
  }
}
$('left').addEventListener('click', async e => {
  const open = e.target.dataset.open, del = e.target.dataset.del, bi = e.target.dataset.builtin;
  try {
    if (bi) await BUILTIN[bi][1]();
    if (open) {
      const t = await (await fetch('/store/' + open.split('/').map(encodeURIComponent).join('/'))).text();
      commit();
      if (open.startsWith('templates/')) add(svgObject(t, open.slice(10)));
      else { setDoc(JSON.parse(t)); page = 0; }
      changed();
    }
    if (del && confirm(`Delete ${del}?`)) {
      await api('/api/store/' + del.split('/').map(encodeURIComponent).join('/'), { method: 'DELETE' });
      listStore();
    }
  } catch (er) { say(er.message); }
});
$('savedesign').onclick = async () => {
  const name = prompt('Design name'); if (!name) return;
  try { await put('designs', name.replace(/[^\w .()+,-]/g, '_') + '.json', JSON.stringify(doc)); say('saved'); listStore(); } catch (e) { say(e.message); }
};
$('newdesign').onclick = () => { commit(); setDoc({ pages: [[]] }); page = 0; changed(); };

// ---- paper and roll

function showStatus(s) {
  st = s;
  $('paper').innerHTML = Object.keys(s.paper).map(n => `<option${n === s.selected ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const p = s.paper[s.selected];
  PAPER.forEach(k => $(k).value = p[k] ?? (k === 'cut' ? 4 : 0));
  $('psensor').checked = s.uses_sensor ?? p.mode !== 'labels';
  $('pos').textContent = p.mode !== 'labels' ? '' : s.pos_mm == null ? 'Not aligned yet: see below.'
    : `The head is ${s.pos_mm.toFixed(1)} mm into the label${s.fresh ? ', nothing printed on it yet' : ''}.`;
  pstat(s);
}
// the printer's state in the header: ready (green), no paper (red), jobs waiting for paper (amber), printd away (grey).
// Polled every 4 s while the page is in view; a tap lists what waits and offers to clear it.
function pstat(s) {
  const b = $('pstat'), wait = s ? (s.pending || []).length + (s.cups_jobs || 0) : 0;
  const [cls, txt] = !s ? ['off', 'printd away'] : wait ? ['wait', `${wait} waiting`] : s.sensor === 'out' ? ['out', 'No paper'] : !s.usb ? ['out', 'No USB'] : ['ok', 'Ready'];
  b.className = 'pstat ' + cls; b.textContent = txt;
  b.title = !s ? 'printd does not answer' : (s.sensor === 'out' ? 'the paper sensor sees no paper' + (s.uses_sensor ? '' : ' (this paper ignores it)') + '. ' : '') +
    (wait ? `${(s.pending || []).length} waiting for paper, ${s.cups_jobs || 0} in CUPS; dropped after ${Math.round((s.pending_ttl || 600) / 60)} min. Tap to see or clear.` : 'tap: the printer\'s state');
}
async function pollStatus() {
  if (document.hidden || drag) return;
  try { const s = await api('/api/status'); if (st) { Object.assign(st, { sensor: s.sensor, pending: s.pending, cups_jobs: s.cups_jobs, usb: s.usb, last: s.last, uses_sensor: s.uses_sensor }); } pstat(s); }
  catch (e) { pstat(null); }
}
setInterval(pollStatus, 4000);
document.addEventListener('visibilitychange', pollStatus);
$('pstat').onclick = async () => {
  const s = await api('/api/status').catch(() => null); pstat(s);
  if (!s) return say('printd does not answer');
  const ps = s.pending || [], n = ps.length + (s.cups_jobs || 0);
  if (!n) return say(s.sensor === 'out' ? 'No paper: load it; prints sent now wait for it' : s.sensor === 'ok' ? 'Ready: paper in' : 'Ready (the paper sensor did not answer)');
  const list = ps.map(j => `• ${j.name} (${Math.round(j.age / 60)} min)`).join('\n') + (s.cups_jobs ? `\n• ${s.cups_jobs} in the CUPS queue` : '');
  if (confirm(`Waiting${s.sensor === 'out' ? ' for paper' : ''}:\n${list}\n\nThey print when paper is in, or are dropped after ${Math.round(s.pending_ttl / 60)} min.\nClear them now?`)) {
    const r = await api('/api/pending/clear', { method: 'POST' }).catch(e => ({ note: e.message })); say(r.note); pollStatus();
  }
};
const roll = (path, opt) => api(path, opt).then(s => { showStatus(s); draw(); say(s.note || (s.fed_mm != null ? `fed ${s.fed_mm} mm` : '')); }).catch(e => say(e.message));
$('paper').onchange = () => roll('/api/select?name=' + encodeURIComponent($('paper').value), { method: 'POST' });
$('savepaper').onclick = () => {
  const name = prompt('Paper name', st.selected); if (!name) return;
  const body = { name, sensor: $('psensor').checked }; PAPER.forEach(k => body[k] = k === 'mode' ? $(k).value : +$(k).value);
  roll('/api/paper', { method: 'PUT', body: JSON.stringify(body) }).then(() => roll('/api/select?name=' + encodeURIComponent(name), { method: 'POST' }));
};
$('align').onclick = () => roll('/api/align?mm=' + (+$('alignmm').value || 0), { method: 'POST' });
$('tearbtn').onclick = () => roll('/api/tear', { method: 'POST' });
$('feed').onclick = () => roll('/api/feed?mm=5', { method: 'POST' });
$('feed1').onclick = () => roll('/api/feed?mm=1', { method: 'POST' });
$('printwhat').onchange = $('copies').oninput = () => pages();
try { $('feedout').checked = localStorage.getItem('labels.feedout') !== '0'; } catch (e) {}
$('feedout').onchange = () => { try { localStorage.setItem('labels.feedout', $('feedout').checked ? '1' : '0'); } catch (e) {} };

// ---- the design is shared: kept on the Pi (/api/doc), every screen follows it. An edit is sent 0.4 s after the
// last change, against the version it was made on; if another screen got in first, that one wins and comes here.

let docV = null, pushT = null, pushing = false, dirty = false, remote = null, synced = null;
function share() { if (docV == null) return; dirty = true; clearTimeout(pushT); pushT = setTimeout(push, 400); }
async function push() {
  if (pushing) { pushT = setTimeout(push, 200); return; }
  const body = JSON.stringify(doc);
  dirty = false; if (body === synced) return;        // nothing new (a redraw, a selection)
  pushing = true;
  try {
    const r = await fetch(`/api/doc?base=${docV}`, { method: 'PUT', body }), j = await r.json();
    if (r.status === 409) { take(j); say('changed on another screen meanwhile: showing that'); }
    else if (j.error) say(j.error);
    else { docV = j.v; synced = body; }
  } catch (e) { dirty = true; pushT = setTimeout(push, 3000); }
  pushing = false;
}
function take(j) {      // another screen's design: kept where we were (page, selection) when it is still there
  if (drag) { remote = j; return; }
  docV = j.v; remote = null;
  if (!j.doc) return;
  synced = JSON.stringify(j.doc);
  const id = sel, pg = page; setDoc(j.doc); page = Math.min(pg, doc.pages.length - 1);
  sel = objs().some(o => o.id === id) ? id : null;
  try { localStorage.setItem('labels.doc', JSON.stringify(doc)); } catch (e) {}
  draw(); layers();
  if (!$('props').contains(document.activeElement)) props();
}
async function follow() {
  for (;;) {
    try {
      const j = await api(`/api/doc?v=${docV}`);
      if (j.v === docV) continue;
      if (!dirty && !pushing) take(j);
      else await new Promise(r => setTimeout(r, 300));      // ours goes first: it meets theirs as a 409
    } catch (e) { await new Promise(r => setTimeout(r, 3000)); }
  }
}

// ---- phones and tablets: the panels as one sheet under the paper, picked from the tab bar; touch

function showTab(t) {
  tab = t === tab ? null : t;
  const right = tab === 'edit' || tab === 'layers';
  document.body.classList.toggle('sheet-left', !!tab && !right);
  document.body.classList.toggle('sheet-right', right);
  document.body.classList.toggle('tab-edit', tab === 'edit');
  document.body.classList.toggle('tab-layers', tab === 'layers');
  for (const d of document.querySelectorAll('#left details')) { const on = d.dataset.tab === tab; d.classList.toggle('tab-on', on); if (on) d.open = true; }
  tools();
}
$('tabs').onclick = e => { const t = e.target.closest('button')?.dataset.tab; if (t) showTab(t); };
let selBefore;      // something added from a panel: show its properties
$('left').addEventListener('pointerdown', () => { selBefore = sel; }, true);
$('left').addEventListener('click', () => setTimeout(() => {
  if (phone.matches && sel != null && sel !== selBefore && tab !== 'edit') showTab('edit');
}), true);
function tools() {
  const o = sel && find(sel);
  for (const b of document.querySelectorAll('#tools .needsel')) b.disabled = !o;
  $('tUndo').disabled = !undo.length; $('tRedo').disabled = !redo.length;
  $('tPrev').classList.toggle('on', $('preview').checked);
  $('tJoin').classList.toggle('on', !!joining); $('addlink').classList.toggle('on', !!joining);
  for (const b of document.querySelectorAll('#tabs button')) {
    b.classList.toggle('on', b.dataset.tab === tab);
    b.classList.toggle('dot', b.dataset.tab === 'edit' && !!o && tab !== 'edit');
  }
}
$('tUndo').onclick = () => undoStep(true);
$('tRedo').onclick = () => undoStep(false);
$('tFit').onclick = () => zoomFit();
$('tJoin').onclick = $('addlink').onclick = () => toggleJoin();
$('tPrev').onclick = () => { $('preview').checked = !$('preview').checked; draw(); };
$('tTurn').onclick = () => {
  const o = sel && find(sel); if (!o) return;
  if (o.locked) return say('locked');
  commit(); o.rot = normRot((o.rot || 0) + 90); changed();
};
$('tDup').onclick = () => { const o = sel && find(sel); if (o) duplicate(o); };
$('tDel').onclick = () => removeObjs(chosen());

// touch on the paper: an object drags as with a mouse; one finger elsewhere pans, a tap there selects nothing;
// two fingers pinch to zoom round the point between them
const view = $('view'), fingers = new Map();
let pan = null, pinch = null;
const mid = () => { const [a, b] = [...fingers.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }; };
view.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return;
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (fingers.size >= 2) {
    e.stopPropagation();
    if (fingers.size > 2) return;
    if (drag) { const moved = !['move', 'bend'].includes(drag.kind) || drag.moved; if (!moved) undo.pop(); drag = null; if (moved) changed(); }
    pan = null; pinch = { z: zoom, ...mid() };
    return;
  }
  const t = e.target;
  if (t.closest('.obj') || ['handle', 'rothandle', 'lmid'].includes(t.id) || t.classList.contains('lend')) return;      // the stage's own handler
  e.stopPropagation();
  pan = { x: e.clientX, y: e.clientY, sl: view.scrollLeft, st: view.scrollTop, moved: false };
}, true);
view.addEventListener('pointermove', e => {
  if (!fingers.has(e.pointerId)) return;
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && fingers.size === 2) {
    e.stopPropagation();
    const m = mid(); zoomAt(pinch.z * m.d / pinch.d, m.x, m.y);
  } else if (pan) {
    e.stopPropagation();
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) pan.moved = true;
    view.scrollLeft = pan.sl - dx; view.scrollTop = pan.st - dy;
  }
}, true);
// zoom keeping the paper under (cx, cy) on the screen where it was
function zoomAt(z, cx, cy) {
  const at = toMM({ clientX: cx, clientY: cy });
  setZoom(z);
  const m = $('stage').getScreenCTM();
  view.scrollLeft += at.x * m.a + m.e - cx; view.scrollTop += at.y * m.d + m.f - cy;
}
// trackpads: a pinch is Ctrl + wheel (Chrome, Firefox, Edge; Ctrl + mouse wheel too), or gesture events (Safari).
// iOS sends gesture events for a two-finger touch as well: the pointers above zoom then, these only stop the page zoom.
view.addEventListener('wheel', e => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  zoomAt(zoom * Math.exp(-Math.max(-50, Math.min(50, d)) * 0.01), e.clientX, e.clientY);
}, { passive: false });
let gest = null;
view.addEventListener('gesturestart', e => { e.preventDefault(); gest = fingers.size ? null : zoom; });
view.addEventListener('gesturechange', e => { e.preventDefault(); if (gest) zoomAt(gest * e.scale, e.clientX, e.clientY); });
view.addEventListener('gestureend', e => { e.preventDefault(); gest = null; });
function lift(e) {
  if (!fingers.delete(e.pointerId)) return;
  if (pinch) { if (!fingers.size) pinch = null; e.stopPropagation(); return; }
  if (pan) { e.stopPropagation(); if (!pan.moved && e.type === 'pointerup') { if (joining) joinTap(toMM(e)); else if (sel != null || multi.size) { selNone(); changed(); } } pan = null; }
}
view.addEventListener('pointerup', lift, true);
view.addEventListener('pointercancel', lift, true);


// ---- start

(async () => {
  loadLocal();
  try { showStatus(await api('/api/status')); } catch (e) { say('printd: ' + e.message); return; }
  try {
    const j = await api('/api/doc');
    if (j.doc) take(j);
    else { docV = j.v; synced = JSON.stringify({ pages: [[]] }); share(); }     // the first screen: its design (if any) is shared
    follow();
  } catch (e) { say('not shared: ' + e.message); }
  changed(); setZoom(realZoom());
  await loadFonts().catch(e => say(e.message));
  changed();
  listStore().catch(e => say(e.message));
})();
