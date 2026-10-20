# labelapi: labels from templates, for printd's API (and ZPL, see zpl.py). Python 3.9 + Debian packages only.
#
# A template is an SVG (sizes in mm) with Mustache fields: {{field}}, {{{raw}}}, {{#section}}..{{/section}} (a list
# repeats it, a value shows it), {{^none}}..{{/none}}, {{field|filter}}. A <metadata> holds JSON: title, description,
# fields {name: {default, help, type: "list"}}, computed {name: "{{other}} ..."}. After filling in, data-* attributes
# lay it out:
#   <text data-wrap="W">      wrapped to W mm (data-lh line height × size, data-max-lines, data-fit="shrink": a long
#                              word makes the size smaller; data-fit="line": one line, as big as fits, data-min)
#   <rect data-code="qrcode" data-text="..">   a code drawn in the rect, modules whole dots (data-mod: dots a module,
#                              then not centred; data-ec QR level; 1D: bars the rect's height). bwip-js (web/vendor) in
#                              node (Debian's nodejs), one run for all of a job's codes.
#   <rect data-icon="mdi:fan"> an icon from web/icons (mdi:, material: or a bare Material name, phosphor:, tabler:,
#                              brands:); Home Assistant's own icon names are mdi: ones.
#   <g data-flow="down" data-gap="1">   its children stacked down in order (each laid out at y 0); empty texts take no room
#   <svg height="auto">        as tall as what's in it (+ data-pad, 1 mm)
# Common fields: date, time, datetime, weekday, day, month, year, n (the row, from 1), count, printer, _w (the printable
# width, mm), _cx (its middle), _r (its right edge less a margin).
#
# Rows are packed onto the paper (labels: across and down, on to the next label; the roll: one long page), drawn by
# rsvg-convert (librsvg2-bin) at the printer's 8 dots/mm and thresholded with Pillow (python3-pil) into P4 pages.
import io
import json
import math
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
BUILTIN = HERE / 'templates'
STORE = HERE / 'web' / 'store' / 'templates'
ICONS = HERE / 'web' / 'icons'
BWIP = HERE / 'web' / 'vendor' / 'bwip-js-min.js'
SVG_NS, XLINK = 'http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink'
ET.register_namespace('', SVG_NS)
ET.register_namespace('xlink', XLINK)
DPMM, W_DOTS = 8, 384
DOT = 1 / DPMM
LIMITS = {'rows': 100, 'pages': 30, 'length_mm': 1500, 'svg_bytes': 512 * 1024}
NAME = re.compile(r'^[\w][\w .()+,-]{0,119}$')
FALSY = {'', '0', 'false', 'off', 'no', 'none', 'unknown', 'unavailable', 'null'}


def r2(v):
    return round(v * 100) / 100


def snap(v):
    return round(v * DPMM) / DPMM


# ---- Mustache, a subset: variables (escaped, or raw), sections, inverted sections, dotted names, filters

TAG = re.compile(r'\{\{(\{?)\s*([#^/&]?)\s*([\w.]+(?:\|[\w:%.-]+)*|\.)\s*\}?\}\}')
BRANDS = {'bambu lab': 'BBL', 'bambulab': 'BBL', 'prusament': 'PRU', 'polymaker': 'PLM', 'elegoo': 'ELG', 'esun': 'ESN',
          'sunlu': 'SNL', 'overture': 'OVT', 'creality': 'CRE', 'anycubic': 'ANC', 'jayo': 'JYO', 'eryone': 'ERY',
          'hatchbox': 'HTB', 'fiberlogy': 'FBL', 'extrudr': 'EXD', 'colorfabb': 'CFB', 'spectrum': 'SPF', 'fillamentum': 'FLM',
          'das filament': 'DAS', '3djake': '3DJ', 'rosa3d': 'R3D', 'formfutura': 'FFT', 'kingroon': 'KGR', 'geeetech': 'GTH',
          'amolen': 'AML', 'siraya tech': 'SRY', 'kexcelled': 'KXL', 'inland': 'INL', 'generic': 'GEN'}


def brand_code(b):
    b = str(b).strip()
    if b.lower() in BRANDS:
        return BRANDS[b.lower()]
    s = re.sub(r'[^A-Z0-9]', '', b.upper())
    return (s[:1] + ''.join(c for c in s[1:] if c not in 'AEIOU'))[:3] or 'X'


def type_code(t):
    ws = str(t).replace('+', '').split()
    if not ws:
        return 'X'
    if ws[0].lower() == 'support':
        return 'SUP' + re.sub(r'[^A-Z0-9]', '', ''.join(w for w in ws[1:] if w.lower() != 'for').upper())
    rest = ''.join(w if re.match(r'^[A-Z0-9]{1,3}$', w) else w[0].upper() for w in ws[1:] if w.lower() != 'basic')
    return (re.sub(r'[^A-Z0-9]', '', ws[0].upper()) + rest)[:8]


def wifi_esc(s):
    return re.sub(r'([\\;,:"])', r'\\\1', str(s))


FILTERS = {
    'upper': lambda v, a: str(v).upper(), 'lower': lambda v, a: str(v).lower(), 'trim': lambda v, a: str(v).strip(),
    'wifi': lambda v, a: wifi_esc(v), 'brand': lambda v, a: brand_code(v), 'type': lambda v, a: type_code(v),
    'initials': lambda v, a: ''.join(w[0].upper() for w in str(v).split()),
    'yymmdd': lambda v, a: re.sub(r'\D', '', str(v))[2:8], 'pad': lambda v, a: str(v).zfill(int(a or 2)),
    'round': lambda v, a: fmt(round(float(v), int(a or 0))) if num_like(v) else str(v),
    'default': lambda v, a: v if str(v).strip() else (a or ''),
}


def num_like(v):
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


def fmt(v):
    if isinstance(v, bool):
        return 'yes' if v else 'no'
    if isinstance(v, float):
        return str(int(v)) if v == int(v) else ('%.6g' % v)
    if isinstance(v, (list, tuple)):
        return '\n'.join(fmt(x) for x in v)
    return '' if v is None else str(v)


def xesc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def lookup(name, stack):
    name, *filters = name.split('|')
    if name == '.':
        v = stack[-1]
        v = v.get('.', v) if isinstance(v, dict) else v
    else:
        v, parts = None, name.split('.')
        for ctx in reversed(stack):
            if isinstance(ctx, dict) and parts[0] in ctx:
                v = ctx[parts[0]]
                for p in parts[1:]:
                    v = v.get(p) if isinstance(v, dict) else None
                break
    for f in filters:
        fn, _, arg = f.partition(':')
        if fn in FILTERS:
            v = FILTERS[fn](fmt(v) if not isinstance(v, (int, float)) else v, arg)
    return v


def truthy(v):
    if isinstance(v, (list, tuple)):
        return len(v) > 0
    if isinstance(v, str):
        return v.strip().lower() not in FALSY
    return bool(v)


def mustache(t, stack, depth=0):
    if depth > 20:
        raise ValueError('sections nested too deep')
    out, i = [], 0
    while True:
        m = TAG.search(t, i)
        if not m:
            out.append(t[i:])
            return ''.join(out)
        out.append(t[i:m.start()])
        raw, kind, name = m.group(1), m.group(2), m.group(3)
        if kind in ('#', '^'):
            level, j = 1, m.end()
            while level:
                n = TAG.search(t, j)
                if not n:
                    raise ValueError('{{%s%s}} is not closed' % (kind, name))
                if n.group(3) == name:
                    level += 1 if n.group(2) in ('#', '^') else -1 if n.group(2) == '/' else 0
                j = n.end()
            body, v = t[m.end():n.start()], lookup(name, stack)
            if kind == '#' and isinstance(v, (list, tuple)):
                for k, item in enumerate(v):
                    ctx = dict(item) if isinstance(item, dict) else {'.': item}
                    ctx.update({'_index': k + 1, '_first': k == 0, '_last': k == len(v) - 1})
                    out.append(mustache(body, stack + [ctx], depth + 1))
            elif kind == '#' and truthy(v):
                out.append(mustache(body, stack + ([v] if isinstance(v, dict) else []), depth + 1))
            elif kind == '^' and not truthy(v):
                out.append(mustache(body, stack, depth + 1))
            i = j
        elif kind == '/':
            raise ValueError('{{/%s}} without its {{#%s}}' % (name, name))
        else:
            s = fmt(lookup(name, stack))
            out.append(s if raw or kind == '&' else xesc(s))
            i = m.end()


# ---- templates: built in (templates/), and the editor's store (web/store/templates), which wins on a name

META = re.compile(r'<metadata[^>]*>(.*?)</metadata>', re.S)


def meta_of(src):
    m = META.search(src)
    try:
        return json.loads(m.group(1)) if m else {}
    except ValueError as e:
        raise ValueError('the template\'s <metadata> is not JSON: %s' % e)


def fields_of(src, meta):
    found = []
    for m in TAG.finditer(META.sub('', src)):
        n = m.group(3).split('|')[0].split('.')[0]
        if n and n not in found and not n.startswith('_') and n not in meta.get('computed', {}):
            found.append(n)
    out = {}
    for n in list(meta.get('fields', {})) + found:
        out[n] = dict(meta.get('fields', {}).get(n, {}))
        if n in COMMON_HELP:
            out[n].setdefault('help', COMMON_HELP[n]); out[n]['auto'] = True
    return out


COMMON_HELP = {'date': 'today, YYYY-MM-DD', 'time': 'now, HH:MM', 'datetime': 'YYYY-MM-DD HH:MM', 'weekday': 'Monday ...',
               'day': 'DD', 'month': 'MM', 'year': 'YYYY', 'n': 'the row, from 1', 'count': 'how many rows', 'printer': 'Printher'}


def template_file(name):
    if not NAME.match(name or ''):
        raise ValueError('bad template name %r' % name)
    for d in (STORE, BUILTIN):
        f = d / (name + '.svg')
        if f.is_file():
            return f
    raise KeyError('no template %r (GET /api/v1/templates lists them)' % name)


def template_info(f):
    src = f.read_text()
    meta = meta_of(src)
    w, h = (re.search(r'<svg[^>]*\s%s="([^"]*)"' % a, src) for a in ('width', 'height'))
    return {'name': f.stem, 'title': meta.get('title', f.stem), 'description': meta.get('description', ''),
            'width': w.group(1) if w else None, 'height': h.group(1) if h else None, 'builtin': f.parent == BUILTIN,
            'fields': fields_of(src, meta), 'example': meta.get('example')}


def templates():
    seen, out = set(), []
    for d in (STORE, BUILTIN):
        for f in sorted(d.glob('*.svg')) if d.is_dir() else []:
            if f.stem not in seen:
                seen.add(f.stem)
                try:
                    out.append(template_info(f))
                except (ValueError, OSError) as e:
                    out.append({'name': f.stem, 'error': str(e)})
    return out


def common(n=1, count=1, geo=None):
    t = time.localtime()
    c = {'date': time.strftime('%Y-%m-%d', t), 'time': time.strftime('%H:%M', t), 'datetime': time.strftime('%Y-%m-%d %H:%M', t),
         'weekday': time.strftime('%A', t), 'day': time.strftime('%d', t), 'month': time.strftime('%m', t),
         'year': time.strftime('%Y', t), 'n': n, 'count': count, 'printer': 'Printher'}
    if geo:
        x0, x1 = band(geo)
        c.update({'_w': r2(x1 - x0), '_cx': r2((x1 - x0) / 2), '_r': r2(x1 - x0 - 1)})
    return c


def fill(src, row, n, count, geo):
    '''the template's text with this row's fields: common ones, the defaults, the row's, then the computed ones'''
    meta = meta_of(src)
    ctx = common(n, count, geo)
    for k, f in meta.get('fields', {}).items():
        if 'default' in f:      # a default may use the common fields: "{{date}}"
            ctx[k] = mustache(f['default'], [ctx]) if isinstance(f['default'], str) else f['default']
    ctx.update({k: v for k, v in row.items() if not k.startswith('_')})
    for k, f in meta.get('fields', {}).items():      # lists given as text: a line each
        if f.get('type') == 'list' and isinstance(ctx.get(k), str):
            ctx[k] = [x.strip() for x in re.split(r'\n|\s*;\s*', ctx[k]) if x.strip()]
    for k, t in meta.get('computed', {}).items():
        if k not in row:
            ctx[k] = mustache(t, [ctx])
    return mustache(META.sub('', src), [ctx])


# ---- SVG in: parsed, nothing that reaches outside it (scripts, files, the network)

def parse(svg):
    if len(svg) > LIMITS['svg_bytes']:
        raise ValueError('SVG over %d KB' % (LIMITS['svg_bytes'] // 1024))
    if re.search(r'<!(DOCTYPE|ENTITY)', svg, re.I):
        raise ValueError('no DOCTYPE or ENTITY in the SVG')
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as e:
        raise ValueError('not good SVG: %s' % e)
    if local(root) != 'svg':
        raise ValueError('not an SVG')
    clean(root)
    return root


def local(el):
    return el.tag.split('}')[-1] if isinstance(el.tag, str) else ''


def clean(root):
    for parent in root.iter():
        for el in list(parent):
            if local(el) in ('script', 'foreignObject', 'include', 'iframe', 'audio', 'video'):
                parent.remove(el)
                continue
            for a in list(el.attrib):
                v = el.attrib[a]
                if a.split('}')[-1] == 'href' and not (v.startswith('#') or v.startswith('data:image/')):
                    del el.attrib[a]
                elif a.startswith('on'):
                    del el.attrib[a]
                elif 'url(' in v and re.search(r'url\(\s*[\'"]?(?!#|data:)', v):
                    del el.attrib[a]
            if local(el) == 'style' and el.text and re.search(r'@import|url\(\s*[\'"]?(?!#|data:)', el.text):
                el.text = ''


def mm(v, default=0.0):
    if v is None or v == '':
        return default
    m = re.match(r'^\s*(-?[\d.]+)\s*(mm|cm|in|pt|px)?\s*$', str(v))
    if not m:
        return default
    return float(m.group(1)) * {'mm': 1, None: 1, 'cm': 10, 'in': 25.4, 'pt': 25.4 / 72, 'px': 25.4 / 96}[m.group(2)]


def parents(root):
    return {c: p for p in root.iter() for c in p}


def inherited(el, up, attr, default=None):
    while el is not None:
        if attr in el.attrib:
            return el.attrib[attr]
        st = re.search(r'(?:^|;)\s*%s\s*:\s*([^;]+)' % attr, el.attrib.get('style', ''))
        if st:
            return st.group(1).strip()
        el = up.get(el)
    return default


# ---- text: measured with the font fontconfig picks for it (as librsvg will), wrapped, fitted

_fonts = {}


def font_for(family, weight, italic):
    key = (family, weight, italic)
    if key not in _fonts:
        from PIL import ImageFont
        fam = family.split(',')[0].strip().strip('\'"') or 'DejaVu Sans'
        fam = {'sans-serif': 'DejaVu Sans', 'serif': 'DejaVu Serif', 'monospace': 'DejaVu Sans Mono'}.get(fam, fam)
        pat = '%s:weight=%d%s' % (fam, {400: 80, 500: 100, 600: 180, 700: 200, 800: 205, 900: 210}.get(int(weight), 80 if int(weight) < 600 else 200),
                                 ':slant=100' if italic else '')
        try:
            path = subprocess.run(['fc-match', '-f', '%{file}', pat], capture_output=True, text=True, timeout=10).stdout.strip()
            _fonts[key] = ImageFont.truetype(path, 100)
        except (OSError, subprocess.SubprocessError):
            _fonts[key] = None
    return _fonts[key]


def text_width(s, size, family='DejaVu Sans', weight=400, italic=False):
    f = font_for(family, weight, italic)
    if f is None:
        return len(s) * size * 0.56
    return (f.getlength(s) if hasattr(f, 'getlength') else f.getsize(s)[0]) / 100 * size


def font_args(el, up):
    w = inherited(el, up, 'font-weight', '400')
    w = {'normal': 400, 'bold': 700, 'bolder': 800, 'lighter': 300}.get(w, w)
    try:
        w = int(w)
    except ValueError:
        w = 400
    return (inherited(el, up, 'font-family', 'DejaVu Sans'), w, inherited(el, up, 'font-style', '') == 'italic')


def wrap_lines(text, width, size, fa):
    lines = []
    for para in text.split('\n'):
        words, cur = para.split(' '), ''
        for w in words:
            t = (cur + ' ' + w) if cur else w
            if text_width(t, size, *fa) <= width or not cur:
                cur = t
            else:
                lines.append(cur)
                cur = w
            while text_width(cur, size, *fa) > width and len(cur) > 1:      # a word longer than the line: broken
                k = len(cur)
                while k > 1 and text_width(cur[:k], size, *fa) > width:
                    k -= 1
                lines.append(cur[:k])
                cur = cur[k:]
        lines.append(cur)
    return lines


def layout_text(el, up):
    wrap, fit = el.attrib.pop('data-wrap', None), el.attrib.pop('data-fit', None)
    lh, maxl = float(el.attrib.pop('data-lh', 1.2)), el.attrib.pop('data-max-lines', None)
    minsize = mm(el.attrib.pop('data-min', None), 1.2)
    if wrap is None and fit is None:
        if el.get('y') is None:      # no y: its top at 0 (in a flow, where it's put)
            el.set('y', str(r2(mm(inherited(el, up, 'font-size', '4'), 4) * 0.8)))
        return
    text = ''.join(el.itertext()).strip('\n')
    for c in list(el):
        el.remove(c)
    size, fa = mm(inherited(el, up, 'font-size', '4'), 4), font_args(el, up)
    width = mm(wrap, 0) if wrap else mm(el.attrib.pop('data-width', None), 40)
    if fit == 'line':           # one line: as big as the width lets it be (not bigger than its size)
        size = max(minsize, min(size, size * width / max(0.1, text_width(text.replace('\n', ' '), size, *fa))))
        lines = [text.replace('\n', ' ')]
    else:
        if fit == 'shrink':     # the longest word fits a line
            longest = max([text_width(w, size, *fa) for w in text.split()] or [0])
            if longest > width:
                size = max(minsize, size * width / longest)
        lines = wrap_lines(text, width, size, fa)
    if maxl and len(lines) > int(maxl):
        lines = lines[:int(maxl)]
        last = lines[-1]
        while last and text_width(last + '…', size, *fa) > width:
            last = last[:-1]
        lines[-1] = last.rstrip() + '…'
    el.set('font-size', str(r2(size)))
    if el.get('y') is None:
        el.set('y', str(r2(size * 0.8)))
    el.text = None
    x = el.get('x', '0')
    for i, ln in enumerate(lines):
        sp = ET.SubElement(el, '{%s}tspan' % SVG_NS, {'x': x, 'dy': '0' if i == 0 else str(r2(size * lh))})
        sp.text = ln if ln else ' '
    el.set('data-lines', str(len(lines)))
    el.set('data-lhmm', str(r2(size * lh)))


# ---- icons: the packs the editor uses (web/icons/*.json, name → path d or markup)

ICONSETS = {'mdi': ('mdi', '0 0 24 24', None), 'material': ('outlined', '0 -960 960 960', None), 'rounded': ('rounded', '0 -960 960 960', None),
            'sharp': ('sharp', '0 -960 960 960', None), 'phosphor': ('phosphor-regular', '0 0 256 256', None),
            'phosphor-bold': ('phosphor-bold', '0 0 256 256', None), 'phosphor-fill': ('phosphor-fill', '0 0 256 256', None),
            'tabler': ('tabler-outline', '0 0 24 24', 2), 'tabler-filled': ('tabler-filled', '0 0 24 24', None), 'brands': ('brands', '0 0 24 24', None)}
_packs = {}


def icon(ref):
    m = re.match(r'^\s*([a-z-]+):(.+)$', ref or '')
    set_, name = (m.group(1), m.group(2).strip()) if m and m.group(1) in ICONSETS else ('material', (ref or '').strip())
    if not name:
        return None
    file, vb, stroke = ICONSETS[set_]
    if file not in _packs:
        try:
            _packs[file] = json.loads((ICONS / (file + '.json')).read_text())
        except (OSError, ValueError):
            _packs[file] = {}
        if len(_packs) > 3:     # keep memory small: the last few packs
            _packs.pop(next(k for k in _packs if k != file))
    p = _packs[file]
    name = name.lower().replace(' ', '_' if set_ in ('material', 'rounded', 'sharp') else '-')
    d = p.get(name) or p.get(name.replace('-', '_')) or p.get(name.replace('_', '-'))
    return (d, vb, stroke) if d else None


def place_icon(el, up):
    got = icon(el.attrib.get('data-icon'))
    parent = up[el]
    i = list(parent).index(el)
    parent.remove(el)
    if not got:
        return
    d, vb, stroke = got
    color = el.get('fill') if el.get('fill') not in (None, 'none') else '#000'
    body = d if d.startswith('<') else '<path d="%s"/>' % xesc(d)
    g = ('<g fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round">%s</g>' % (color, stroke, body)
         if stroke else '<g fill="%s">%s</g>' % (color, body))
    sv = ET.fromstring('<svg xmlns="%s" x="%s" y="%s" width="%s" height="%s" viewBox="%s">%s</svg>'
                       % (SVG_NS, el.get('x', '0'), el.get('y', '0'), el.get('width', '8'), el.get('height', '8'), vb, g))
    if el.get('transform'):
        sv = wrap_g(sv, el.get('transform'))
    parent.insert(i, sv)


def wrap_g(el, transform):
    g = ET.Element('{%s}g' % SVG_NS, {'transform': transform})
    g.append(el)
    return g


# ---- codes: bwip-js in node, all of a job's at once; modules drawn on whole dots

ALIAS = {'qr': 'qrcode', 'dm': 'datamatrix', 'aztec': 'azteccode', 'code128': 'code128', 'c128': 'code128', 'ean': 'ean13'}
NODE_JS = r'''
global.atob = global.atob || (s => Buffer.from(s, 'base64').toString('binary'));
const B = require(process.argv[1]);
let input = '';
process.stdin.on('data', d => input += d).on('end', () => {
  const out = JSON.parse(input).map(c => {
    try {
      const r = B.raw(c)[0];
      return r.pixs ? { cols: r.pixx, rows: r.pixs.length / r.pixx, rowh: Math.max(1, Math.round(r.pixy / (r.pixs.length / r.pixx))), bits: r.pixs.join('') } : { sbs: r.sbs };
    } catch (e) { return { err: String(e.message || e).replace(/^bwipp\.\w+#\d+:\s*/, '') }; }
  });
  process.stdout.write(JSON.stringify(out));
});
'''


def gen_codes(reqs):
    if not reqs:
        return []
    p = subprocess.run(['node', '-e', NODE_JS, str(BWIP)], input=json.dumps(reqs), capture_output=True, text=True, timeout=60)
    if p.returncode:
        raise ValueError('codes: %s' % (p.stderr.strip().splitlines() or ['node failed'])[-1])
    return json.loads(p.stdout)


def code_req(el):
    bcid = el.get('data-code', 'qrcode').strip().lower()
    req = {'bcid': ALIAS.get(bcid, bcid), 'text': el.get('data-text', '') or ' '}
    if req['bcid'] in ('qrcode', 'microqrcode'):
        req['eclevel'] = el.get('data-ec', 'M')
    return req


MIN_MOD = 2      # dots a module at least, unless data-mod says: 1-dot codes don't print to scan (test strip 2026-10-19)


def code_markup(el, res):
    x, y, w, h = (mm(el.get(a)) for a in ('x', 'y', 'width', 'height'))
    if 'err' in res:
        return ('<text x="%s" y="%s" font-size="1.6" font-family="DejaVu Sans">%s</text>' % (r2(x), r2(y + 2), xesc('code: ' + res['err'])))
    fixed = el.get('data-mod')
    if 'sbs' in res:       # 1D: bars, as wide as fits in whole dots, the rect's height
        units = sum(res['sbs'])
        mod = int(fixed) if fixed else max(MIN_MOD, int(w * DPMM // units))
        m = mod * DOT
        cx = snap(x if fixed else x + (w - units * m) / 2)
        d, at = [], cx
        for i, v in enumerate(res['sbs']):
            if i % 2 == 0:
                d.append('M%s %sh%sv%sh%sz' % (r2(at), r2(snap(y)), r2(v * m), r2(snap(h)), r2(-v * m)))
            at += v * m
        out = '<path d="%s" fill="#000" shape-rendering="crispEdges"/>' % ''.join(d)
        if el.get('data-hrt'):      # the text under the bars (drawn big and scaled: see big_text)
            ts = mm(el.get('data-hrt'), 2.5)
            out += ('<g transform="scale(%s)"><text x="%s" y="%s" text-anchor="middle" font-family="DejaVu Sans Mono" font-size="%s">%s</text></g>'
                    % (1 / TEXT_K, r2((cx + units * m / 2) * TEXT_K), r2((snap(y) + snap(h) + ts * 1.05) * TEXT_K), r2(ts * TEXT_K), xesc(el.get('data-text', ''))))
        return out
    cols, rows, rowh = res['cols'], res['rows'], res.get('rowh', 1)
    mod = int(fixed) if fixed else max(MIN_MOD, int(min(w / cols, h / (rows * rowh)) * DPMM))
    m = mod * DOT
    x0 = snap(x if fixed else x + (w - cols * m) / 2)
    y0 = snap(y if fixed else y + (h - rows * rowh * m) / 2)
    bits, d = res['bits'], []
    for r in range(rows):
        c = 0
        while c < cols:
            if bits[r * cols + c] != '1':
                c += 1
                continue
            c0 = c
            while c < cols and bits[r * cols + c] == '1':
                c += 1
            d.append('M%s %sh%sv%sh%sz' % (r2(x0 + c0 * m), r2(y0 + r * rowh * m), r2((c - c0) * m), r2(rowh * m), r2(-(c - c0) * m)))
    return '<path d="%s" fill="#000" shape-rendering="crispEdges"/>' % ''.join(d)


# ---- flow: children stacked down; heights as laid out

def translate_y(el):
    m = re.search(r'translate\(\s*[-\d.]+[\s,]+(-?[\d.]+)\s*\)', el.get('transform', ''))
    return float(m.group(1)) if m else 0.0


def height_of(el, up):
    if 'data-h' in el.attrib:
        return mm(el.get('data-h'))
    t = local(el)
    if t == 'text':
        if not ''.join(el.itertext()).strip():
            return 0.0
        size = mm(inherited(el, up, 'font-size', '4'), 4)
        n, lhmm = int(el.get('data-lines', '1')), mm(el.get('data-lhmm'), size * 1.2)
        return mm(el.get('y'), size * 0.8) + (n - 1) * lhmm + size * 0.28
    if t in ('rect', 'image', 'svg', 'use', 'foreignObject'):
        return mm(el.get('y')) + mm(el.get('height'))
    if t == 'line':
        return max(mm(el.get('y1')), mm(el.get('y2'))) + mm(el.get('stroke-width'), 0.25) / 2
    if t in ('circle', 'ellipse'):
        return mm(el.get('cy')) + mm(el.get('r') or el.get('ry'))
    if t == 'g':
        if el.get('data-flow-total'):
            return float(el.get('data-flow-total'))
        return max([translate_y(c) + height_of(c, up) for c in el] or [0.0])
    return 0.0


def flow(g, up):
    for c in g:      # inner flows first
        if local(c) == 'g':
            for f in [x for x in c.iter() if x.get('data-flow') is not None][::-1]:
                flow(f, up)
    gap, at = mm(g.attrib.pop('data-gap', None), 1), 0.0
    for c in list(g):
        h = height_of(c, up)
        if h <= 0 and local(c) in ('text', 'g'):
            continue
        c.set('transform', ('translate(0 %s) ' % r2(at)) + c.get('transform', ''))
        at += h + gap
    g.set('data-flow-total', str(r2(max(0.0, at - gap))))
    g.attrib.pop('data-flow')


# ---- a filled template, laid out: (its root, width, height in mm), codes still to draw

GEOM = {'x', 'y', 'width', 'height', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'data-wrap', 'data-width', 'data-h', 'data-gap', 'font-size'}
EXPR = re.compile(r'^[\d.\s+\-*/()]{1,60}$')


def arith(root):
    '''x="{{_w}}-11": plain arithmetic in a size or place, worked out (digits and + - * / ( ) only)'''
    for el in root.iter():
        for a, v in el.attrib.items():
            if a in GEOM and EXPR.match(v) and '**' not in v and re.search(r'[\d)]\s*[-+*/]', v):
                try:
                    el.set(a, str(r2(float(eval(v, {'__builtins__': {}}, {})))))
                except (SyntaxError, ZeroDivisionError, TypeError, ValueError):
                    pass


def layout(svg):
    root = parse(svg)
    arith(root)
    up = parents(root)
    for el in [e for e in root.iter() if 'data-icon' in e.attrib]:
        place_icon(el, up)
    up = parents(root)
    for el in [e for e in root.iter() if local(e) == 'text']:
        layout_text(el, up)
    for g in [e for e in root.iter() if e.get('data-flow') is not None]:      # outermost first; it does the inner ones
        if g.get('data-flow') is not None:
            flow(g, up)
    w = mm(root.get('width'), 40)
    vb = [float(v) for v in re.split(r'[\s,]+', root.get('viewBox', '').strip()) if v] or None
    if root.get('height', '').strip() == 'auto':
        pad = mm(root.attrib.pop('data-pad', None), 1)
        h = max([translate_y(c) + height_of(c, up) for c in root] or [5.0]) + pad
        if vb:
            vb[3] = h
        root.set('height', '%smm' % r2(h))
    h = mm(root.get('height'), 20)
    if not vb:
        vb = [0, 0, w, h]
    root.set('viewBox', ' '.join(str(r2(v)) for v in vb))
    for el in root.iter():
        for a in ('data-lines', 'data-lhmm', 'data-flow-total'):
            el.attrib.pop(a, None)
    big_text(root)
    return root, w, h


TEXT_K = 10


def big_text(root):
    '''librsvg lays text out in its own units, rounding each letter's advance: at 3.6 units a letter is a whole unit
    off ("Oat m ilk"). Each text drawn 10× as big, in a group scaled down by 10: the same place, the letters right.'''
    up = parents(root)
    k = TEXT_K
    sc = lambda v: str(r2(mm(v) * k)) if v is not None and re.match(r'^\s*-?[\d.]+\s*(mm)?\s*$', v) else v
    for el in [e for e in root.iter() if local(e) == 'text']:
        parent = up.get(el)
        if parent is None:
            continue
        size = mm(inherited(el, up, 'font-size', '4'), 4)
        el.set('font-size', str(r2(size * k)))
        for a in ('x', 'y', 'dx', 'dy', 'stroke-width', 'letter-spacing'):
            if el.get(a) is not None:
                el.set(a, sc(el.get(a)))
        for t in el.iter():
            if t is not el:
                for a in ('x', 'y', 'dx', 'dy', 'font-size'):
                    if t.get(a) is not None:
                        t.set(a, sc(t.get(a)))
        own = el.attrib.pop('transform', '')      # its own move (a flow's) outside the scaling
        g = ET.Element('{%s}g' % SVG_NS, {'transform': ('%s scale(%s)' % (own, 1 / k)).strip()})
        i = list(parent).index(el)
        parent.remove(el)
        g.append(el)
        parent.insert(i, g)


# ---- the paper: where things can print, packing, pages

def band(geo):
    return max(0.0, -geo['left']) + 0.4, min(geo['W'], -geo['left'] + geo['PW']) - 0.4


def pack(sizes, geo, gap=1.0, whole=False):
    '''places (page, x, y) for each (w, h): along the rows, down the label, on to the next; the roll: one page'''
    x0, x1 = band(geo)
    top = 0.5 if whole or not geo['labels'] else geo['lost'] + 0.5
    out, pg, x, y, rowh = [], 0, x0, top, 0.0
    for w, h in sizes:
        if x > x0 and x + w > x1 + 1e-6:
            x, y, rowh = x0, y + rowh + gap, 0.0
        if geo['labels'] and y + h > geo['H'] - 0.4 + 1e-6 and (x > x0 or y > 0.5 + 1e-6):
            pg, x, y, rowh = pg + 1, x0, 0.5, 0.0
        out.append((pg, x, y))
        x, rowh = x + w + gap, max(rowh, h)
    return out


IDS = re.compile(r'\bid="([^"]+)"')


def own_ids(s, p):
    s = IDS.sub(lambda m: 'id="%s%s"' % (p, m.group(1)), s)
    s = re.sub(r'url\(\s*#([^)\s]+)\s*\)', lambda m: 'url(#%s%s)' % (p, m.group(1)), s)
    return re.sub(r'((?:xlink:)?href)="#([^"]+)"', lambda m: '%s="#%s%s"' % (m.group(1), p, m.group(2)), s)


def inner_xml(root):
    return ''.join(ET.tostring(c, encoding='unicode') for c in root).replace(' xmlns="%s"' % SVG_NS, '')


def render_rows(src, rows, geo, gap=1.0, whole=False, cut=False):
    '''a template (its source) for each row → pages as P4 PBM bytes'''
    if not rows:
        rows = [{}]
    if len(rows) > LIMITS['rows']:
        raise ValueError('%d rows at most' % LIMITS['rows'])
    laid = [layout(fill(src, r, i + 1, len(rows), geo)) for i, r in enumerate(rows)]
    return render_laid(laid, geo, gap, whole, cut)


def render_svg(svg, geo, fields=None, whole=False):
    return render_laid([layout(mustache(svg, [dict(common(1, 1, geo), **(fields or {}))]) if fields is not None else svg)], geo, 1.0, whole, False)


def render_laid(laid, geo, gap, whole, cut, places=None):
    '''laid-out roots → pages; packed onto the paper, or at the places given (page, x, y)'''
    x0, x1 = band(geo)
    for _, w, h in laid:
        if w > geo['W'] + 0.01:
            raise ValueError('%s mm wide: the paper prints %s mm' % (r2(w), r2(x1 - x0)))
    places = places or pack([(w, h) for _, w, h in laid], geo, gap, whole)
    # codes, every one of the job's in one node run
    codes = [(i, el) for i, (root, _, _) in enumerate(laid) for el in root.iter() if 'data-code' in el.attrib]
    results = gen_codes([code_req(el) for _, el in codes])
    marks = {id(el): code_markup(el, res) for (_, el), res in zip(codes, results)}
    npages = max(p for p, _, _ in places) + 1
    if npages > LIMITS['pages']:
        raise ValueError('%d labels: %d at most' % (npages, LIMITS['pages']))
    pages = []
    for pg in range(npages):
        mine = [(laid[i], places[i]) for i in range(len(laid)) if places[i][0] == pg]
        H = geo['H'] if geo['labels'] else max(y + h for (_, _, h), (_, _, y) in mine) + 1
        if H > LIMITS['length_mm']:
            raise ValueError('%s mm long: %s at most' % (r2(H), LIMITS['length_mm']))
        body = []
        for k, ((root, w, h), (_, x, y)) in enumerate(mine):
            for el in root.iter():
                if id(el) in marks:      # the code's markup in place of its rect
                    el.tag, el.attrib = '{%s}g' % SVG_NS, {'data-code-done': '1'}
                    el.text = None
                    for c in list(el):
                        el.remove(c)
                    el.append(ET.fromstring('<g xmlns="%s">%s</g>' % (SVG_NS, marks[id(el)])))
            vb = root.get('viewBox')
            keep = ''.join(' %s="%s"' % (a, xesc(v)) for a, v in root.attrib.items() if a.split('}')[-1] in ('font-family', 'font-size', 'font-weight', 'fill', 'stroke', 'style'))
            body.append('<svg x="%s" y="%s" width="%s" height="%s" viewBox="%s" overflow="hidden"%s>%s</svg>'
                        % (r2(snap(x)), r2(snap(y)), r2(w), r2(h), vb, keep, own_ids(inner_xml(root), 'i%d-' % k)))
            if cut:
                body.append('<rect x="%s" y="%s" width="%s" height="%s" fill="none" stroke="#000" stroke-width="0.125" stroke-dasharray="0.5 0.5"/>'
                            % (r2(x - gap / 2), r2(y - gap / 2), r2(w + gap), r2(h + gap)))
        pages.append(rasterize(''.join(body), geo, H))
    return pages


def rasterize(body, geo, H):
    Hd = int(round(H * DPMM))
    svg = ('<svg xmlns="%s" xmlns:xlink="%s" width="%d" height="%d" viewBox="%s 0 %s %s"><rect x="%s" y="0" width="%s" height="%s" fill="#fff"/>%s</svg>'
           % (SVG_NS, XLINK, W_DOTS, Hd, r2(-geo['left']), r2(geo['PW']), r2(H), r2(-geo['left']), r2(geo['PW']), r2(H), body))
    return threshold(svg_png(svg, W_DOTS * SS, Hd * SS))      # drawn at 2×, averaged down: letters where they belong


def svg_png(svg, w, h):
    p = subprocess.run(['rsvg-convert', '-w', str(w), '-h', str(h), '-b', 'white'], input=svg.encode(), capture_output=True, timeout=90)
    if p.returncode:
        raise ValueError('could not draw it: %s' % p.stderr.decode(errors='replace').strip()[:200])
    return p.stdout


SS = 2


def threshold(png):
    from PIL import Image
    im = Image.open(io.BytesIO(png)).convert('L')
    if im.width != W_DOTS:
        im = im.resize((W_DOTS, im.height * W_DOTS // im.width), Image.BOX)
    im = im.point(lambda v: 255 if v >= 170 else 0).convert('1')      # a little dark: hairlines (0.125 mm) stay
    raw = bytes(b ^ 0xFF for b in im.tobytes())      # Pillow: 1 = white; PBM: 1 = black
    return b'P4\n%d %d\n' % im.size + raw


def preview_png(pages, geo=None):
    '''the pages as they'll print, one under another, a grey line between'''
    from PIL import Image
    ims = []
    for p in pages:
        w, h = (int(v) for v in p.split(b'\n')[1].split())
        raw = p[len(b'P4\n%d %d\n' % (w, h)):]
        ims.append(Image.frombytes('1', (w, h), bytes(b ^ 0xFF for b in raw)))
    H = sum(i.height for i in ims) + 8 * (len(ims) - 1)
    out = Image.new('L', (W_DOTS, max(1, H)), 160)
    y = 0
    for i in ims:
        out.paste(i.convert('L'), (0, y))
        y += i.height + 8
    b = io.BytesIO()
    out.save(b, 'PNG', optimize=True)
    return b.getvalue()
