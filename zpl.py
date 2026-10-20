# zpl: Zebra's ZPL II, the common subset, read into SVG and drawn by labelapi. The printer is 203 dpi like most
# Zebras: a ZPL dot is one of ours. Each ^XA ... ^XZ is a label (labels: one each; the roll: as long as it needs).
#   fields  ^FO ^FT ^FD ^FS ^FH (hex escapes) ^FB (wrapped block) ^FW ^FX ^FR (taken as normal)
#   text    ^A0 (scalable, bold) ^A A-H (the bitmap fonts, as mono) ^A@ ^CF
#   shapes  ^GB box / line ^GC circle ^GE ellipse ^GD diagonal
#   codes   ^BY ^BC Code 128 ^B3 Code 39 ^BE EAN-13 ^B8 EAN-8 ^BU UPC-A ^B2 ITF ^BQ QR ^BX Data Matrix ^BO Aztec ^B7 PDF417
#   label   ^LH home ^LL length ^PW ^PQ copies; anything else is passed over (and said).
import re

import labelapi
from labelapi import xesc, r2

DPMM = 8
BITMAP = {'A': (9, 5), 'B': (11, 7), 'C': (18, 10), 'D': (18, 10), 'E': (28, 15), 'F': (26, 13), 'G': (60, 40), 'H': (21, 13)}
ROT = {'N': 0, 'R': 90, 'I': 180, 'B': 270}
CODES = {'BC': 'code128', 'B3': 'code39', 'BE': 'ean13', 'B8': 'ean8', 'BU': 'upca', 'B2': 'interleaved2of5',
         'BQ': 'qrcode', 'BX': 'datamatrix', 'BO': 'azteccode', 'B7': 'pdf417'}
IGNORED = {'CI', 'MM', 'MN', 'MT', 'MD', 'PR', 'PO', 'PM', 'LR', 'LS', 'LT', 'JM', 'JU', 'JZ', 'SD', 'TA', 'JS', 'MU', 'PA', 'CW', 'XB', 'FN', 'DF', 'XF'}


def args(s, n):
    a = [x.strip() for x in s.split(',')]
    return (a + [''] * n)[:n]


def num(v, d):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def labels(text):
    '''the stream's labels: each ^XA ... ^XZ'''
    return [m.group(1) for m in re.finditer(r'\^XA(.*?)(?:\^XZ|$)', text, re.S | re.I)]


def label_svg(z, geo):
    '''one ZPL label → (SVG markup in page mm, its length in mm or None, copies, commands passed over)'''
    st = {'fo': (0, 0), 'ft': False, 'font': ('0', 30, 0), 'cf': ('0', 30, 0), 'fw': 'N', 'by': (2, 3.0, 10), 'fb': None,
          'code': None, 'hex': None, 'lh': (0, 0), 'll': None, 'pq': 1, 'fd': None}
    out, skipped, bottom = [], set(), 0.0
    ox = -geo['left']           # ZPL's x 0: the head's dot 0, in the label's mm
    cmds = re.split(r'(?=[\^~])', z)

    def pos():
        x, y = st['fo']
        return ox + (x + st['lh'][0]) / DPMM, (y + st['lh'][1]) / DPMM

    def keep(y):
        nonlocal bottom
        bottom = max(bottom, y)

    def rot_g(inner, x, y, o):
        a = ROT.get(o, 0)
        return '<g transform="rotate(%d %s %s)">%s</g>' % (a, r2(x), r2(y), inner) if a else inner

    def field(data):
        x, y = pos()
        if st['code']:
            kind, p = st['code']
            bw, ratio, bh = st['by']
            o = p.get('o') or st['fw']
            h = (p.get('h') or bh) / DPMM
            attrs = {'data-code': CODES[kind], 'x': r2(x), 'y': r2(y), 'width': 1, 'height': r2(h)}
            if kind == 'BQ':        # "QA,data": the error level, the mode, then the data
                m = re.match(r'^([HQML])?([AM])?,(.*)$', data, re.S)
                if m:
                    data = m.group(3)
                    attrs['data-ec'] = m.group(1) or 'M'
                attrs['data-mod'] = int(p.get('mag') or 3)
            elif kind == 'BX':
                attrs['data-mod'] = int(p.get('h') or 4)
            elif kind == 'BO':
                attrs['data-mod'] = int(p.get('mag') or 4)
            else:
                attrs['data-mod'] = int(bw)
                if p.get('hrt', 'Y') != 'N' and kind in ('BC', 'B3', 'BE', 'B8', 'BU', 'B2'):
                    attrs['data-hrt'] = r2(max(1.8, min(3.5, h * 0.22)))
            if st['ft']:
                attrs['y'] = r2(y - h)
            attrs['data-text'] = data
            out.append(rot_g('<rect %s/>' % ' '.join('%s="%s"' % (k, xesc(str(v))) for k, v in attrs.items()), x, y, o))
            keep(y + h + (3.5 if attrs.get('data-hrt') else 0) if kind not in ('BQ', 'BX', 'BO') else y + 30)
            st['code'] = None
            return
        f, fh, fw = st['font']
        o = st.get('fo_o') or st['fw']
        if f in BITMAP:         # the bitmap fonts: mono, their own proportions
            bh, bwid = BITMAP[f]
            fh = fh or bh
            fam, wt, size = 'DejaVu Sans Mono', 400, fh / DPMM
            sx = (fw / fh) / (bwid / bh) if fw else 1.0
        else:                   # ^A0: a condensed bold; width = height looks like Zebra's
            fam, wt, size = 'DejaVu Sans', 700, fh * 0.92 / DPMM
            sx = 0.82 * (fw / fh) if fw else 0.82
        sx = max(0.3, min(3.0, sx))
        base = y if st['ft'] else y + size * 0.82
        text = data.replace('\\&', '\n')
        if st['fb']:
            w, lines, space, just = st['fb']
            anchor = {'C': 'middle', 'R': 'end'}.get(just, 'start')
            ax = (x + {'C': w / 2, 'R': w}.get(just, 0) / DPMM) / sx      # in the scaled text's own units
            t = ('<text x="%s" y="%s" font-family="%s" font-weight="%d" font-size="%s" text-anchor="%s" data-wrap="%s" data-max-lines="%d" data-lh="%s">%s</text>'
                 % (r2(ax), r2(base), fam, wt, r2(size), anchor, r2(w / DPMM / sx), max(1, lines), r2(1 + space / max(1, fh)), xesc(text)))
            keep(y + lines * size * 1.2)
        else:
            t = ('<text x="%s" y="%s" font-family="%s" font-weight="%d" font-size="%s">%s</text>'
                 % (r2(x / sx), r2(base), fam, wt, r2(size), xesc(text.replace('\n', ' '))))
            keep(base + size * 0.3)
        t = '<g transform="scale(%s 1)">%s</g>' % (r2(sx), t) if abs(sx - 1) > 0.01 else t
        out.append(rot_g(t, x, y, o))

    for c in cmds:
        if len(c) < 3 or c[:1] not in '^~':      # line breaks and stray text between commands
            continue
        cmd, rest = c[1:3].upper(), c[3:]
        if c[:1] == '~':
            skipped.add('~' + cmd)
            continue
        if cmd[0] == 'A' and cmd != 'A@':        # ^A0N,30,30: the font (one letter), then orientation, height, width
            f, (o, h, w) = cmd[1], args(rest, 3)
            st['font'] = (f, int(num(h, st['font'][1])), int(num(w, 0)))
            st['fo_o'] = o[:1].upper() if o else None
        elif cmd == 'A@':
            o, h, w, _ = args(rest, 4)
            st['font'] = ('0', int(num(h, st['font'][1])), int(num(w, 0)))
            st['fo_o'] = o[:1].upper() if o else None
        elif cmd == 'CF':
            f, h, w = args(rest, 3)
            st['cf'] = st['font'] = (f or st['cf'][0], int(num(h, st['cf'][1])), int(num(w, 0)))
        elif cmd in ('FO', 'FT'):
            x, y, _ = args(rest, 3)
            st['fo'], st['ft'], st['fb'], st['fo_o'] = (num(x, 0), num(y, 0)), cmd == 'FT', None, st.get('fo_o')
        elif cmd == 'FW':
            st['fw'] = (rest[:1] or 'N').upper()
        elif cmd == 'FB':
            w, lines, space, just, _ = args(rest, 5)
            st['fb'] = (num(w, 300), int(num(lines, 1)), num(space, 0), (just or 'L')[:1].upper())
        elif cmd == 'FH':
            st['hex'] = rest[:1] or '_'
        elif cmd == 'FD' or cmd == 'FV':
            data = rest
            if st['hex']:
                h = re.escape(st['hex'])
                data = re.sub(h + r'([0-9A-Fa-f]{2})', lambda m: chr(int(m.group(1), 16)), data)
            st['fd'] = data
        elif cmd == 'FS':
            if st['fd'] is not None:
                field(st['fd'])
            st.update({'fd': None, 'hex': None, 'fb': None, 'code': None, 'fo_o': None})
            st['font'] = st['cf']
        elif cmd == 'BY':
            w, r, h = args(rest, 3)
            st['by'] = (num(w, st['by'][0]), num(r, st['by'][1]), num(h, st['by'][2]))
        elif cmd in CODES:
            a = args(rest, 6)
            p = {'o': a[0][:1].upper() or None}
            if cmd == 'BQ':
                p['mag'] = num(a[2], 3)
            elif cmd == 'BX':
                p['h'] = num(a[1], 4)
            elif cmd == 'BO':
                p['mag'] = num(a[1], 4)
            elif cmd == 'B7':
                p['h'] = num(a[1], 0) * 6 or None
            else:
                p['h'] = num(a[1] if cmd != 'B3' else a[2], 0) or None
                p['hrt'] = (a[2] if cmd != 'B3' else a[3])[:1].upper() or 'Y'
            st['code'] = (cmd, p)
        elif cmd == 'GB':
            w, h, t, col, rnd = args(rest, 5)
            x, y = pos()
            t = max(1, num(t, 1))
            w, h = max(num(w, 1), t), max(num(h, 1), t)
            k = '#fff' if col[:1].upper() == 'W' else '#000'
            rx = min(w, h) * num(rnd, 0) / 16 / DPMM
            if t * 2 >= min(w, h):        # all ink: filled
                out.append('<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="%s"/>' % (r2(x), r2(y), r2(w / DPMM), r2(h / DPMM), r2(rx), k))
            else:
                tm = t / DPMM
                out.append('<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="none" stroke="%s" stroke-width="%s"/>'
                           % (r2(x + tm / 2), r2(y + tm / 2), r2(w / DPMM - tm), r2(h / DPMM - tm), r2(max(0, rx - tm / 2)), k, r2(tm)))
            keep(y + h / DPMM)
        elif cmd in ('GC', 'GE'):
            a = args(rest, 4)
            x, y = pos()
            w, h, t, col = (num(a[0], 10), num(a[0], 10), num(a[1], 1), a[2]) if cmd == 'GC' else (num(a[0], 10), num(a[1], 10), num(a[2], 1), a[3])
            k = '#fff' if col[:1].upper() == 'W' else '#000'
            tm = t / DPMM
            fill = t * 2 >= min(w, h)
            out.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" stroke="%s" stroke-width="%s"/>'
                       % (r2(x + w / DPMM / 2), r2(y + h / DPMM / 2), r2(w / DPMM / 2 - (0 if fill else tm / 2)), r2(h / DPMM / 2 - (0 if fill else tm / 2)),
                          k if fill else 'none', 'none' if fill else k, r2(tm)))
            keep(y + h / DPMM)
        elif cmd == 'GD':
            w, h, t, col, o = args(rest, 5)
            x, y = pos()
            w, h = num(w, 10) / DPMM, num(h, 10) / DPMM
            k = '#fff' if col[:1].upper() == 'W' else '#000'
            y0, y1 = (y + h, y) if (o or 'R').upper().startswith('R') else (y, y + h)
            out.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="%s"/>' % (r2(x), r2(y0), r2(x + w), r2(y1), k, r2(num(t, 1) / DPMM)))
            keep(y + h)
        elif cmd == 'LH':
            x, y = args(rest, 2)
            st['lh'] = (num(x, 0), num(y, 0))
        elif cmd == 'LL':
            st['ll'] = num(rest.split(',')[0], 0) / DPMM or None
        elif cmd == 'PQ':
            st['pq'] = max(1, min(20, int(num(rest.split(',')[0], 1))))
        elif cmd in ('PW', 'FR', 'FX', 'XA', 'XZ'):
            pass
        elif cmd not in IGNORED:
            skipped.add('^' + cmd)
    return ''.join(out), st['ll'] or (bottom + 2), st['pq'], skipped


def render(text, geo):
    '''a ZPL stream → (P4 pages, copies); each label at its own place on the paper'''
    ls = labels(text)
    if not ls:
        raise ValueError('no ^XA ... ^XZ label in it')
    if len(ls) > labelapi.LIMITS['pages']:
        raise ValueError('%d labels: %d at most' % (len(ls), labelapi.LIMITS['pages']))
    laid, places, copies = [], [], 1
    W = geo['W']
    for i, z in enumerate(ls):
        body, length, pq, skipped = label_svg(z, geo)
        H = geo['H'] if geo['labels'] else min(labelapi.LIMITS['length_mm'], length)
        svg = '<svg xmlns="%s" width="%smm" height="%smm" viewBox="0 0 %s %s">%s</svg>' % (labelapi.SVG_NS, r2(W), r2(H), r2(W), r2(H), body)
        root, w, h = labelapi.layout(svg)
        laid.append((root, w, h))
        places.append((i, 0, 0))
        copies = max(copies, pq)
    g = dict(geo, H=geo['H'] if geo['labels'] else 0)
    return labelapi.render_laid(laid, g, 0, True, False, places), copies
