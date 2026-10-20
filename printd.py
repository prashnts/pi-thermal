# printd: the label printer, dot for dot. Python 3.9 stdlib only (the Pi Zero 2 W).
#   python3 printd.py [--port 8631] [--device lp:printherm | /dev/usb/lp0] [--dry]
#
# The firmware (a GD32 "micro printer", CUPS calls it a ZJ-58) takes ESC @ and GS v 0 raster, 384 dots wide,
# 8 dots/mm. It ignores ESC J / ESC K / ESC e: no feed command, no reverse. Paper moves only by printing
# rows, so a feed is blank rows. No sensor either: where the head is on the roll is kept here (state.json).
#
# Positions are in dots along the paper, in the current label's own coordinates: 0 is its leading edge,
# `length` its trailing edge, `length + gap` the next label's leading edge. `tear` (mm): head to tear bar.
# `cut` (mm): how far past the tear bar a feed-out brings the gap's middle (room for scissors).
#
#   GET  /api/status                 the paper, where the head is, what is selected
#   POST /api/print?label=auto       body: a PBM (P4), up to 384 wide; in label mode one label, its top at
#                                    row 0. `next`: on the next label; `here`: on this one from the head down,
#                                    the top cut; `auto`: here when the image is blank down to the head, or
#                                    nothing was printed on this label since the tear (its top ~tear mm cut)
#                                    &out=1: feed out after it (as /api/tear)
#                                    &job=ID&i=0&n=2&name=...: page i of n of a job, kept in jobs/ (the last 30)
#   GET  /api/jobs                   the jobs kept, newest first; GET /api/jobs/ID/i.pbm a page
#   POST /api/reprint?id=ID          print that job again (its feed-out as it was, or &out=0/1)
#   POST /api/feed?mm=5              blank rows
#   POST /api/tear                   bring the paper out to cut: labels, the next gap's middle `cut` mm past the
#                                    tear bar; continuous, the end `cut` mm past it
#   POST /api/align?mm=0             "a label's leading edge is `mm` past the tear bar now" (any label: the one
#                                    sticking out, partial or not; a negative mm: still inside, that far)
#   PUT  /api/paper                  {"name", "mode": "labels"|"continuous", "length", "gap", "width", "left", "tear", "cut"}
#   GET  /api/doc?v=N                the shared design {v, doc}; with v: waits (up to 25 s) until it is not N
#   PUT  /api/doc?base=N             body: the design; 409 with the current one if it changed since N
#   POST /api/select?name=           use that paper
#   GET  /api/store/<kind>           files of a kind (fonts, templates, designs), served at /store/<kind>/<name>
#   PUT  /api/store/<kind>/<name>    body: the file;  DELETE: gone
#   GET  /api/fonts                  the fonts' families, weights, styles, PostScript names (read from their
#                                    name and OS/2 tables, kept in store/fonts/.index.json)
#
# The API for others (Home Assistant, scripts, Claude: API.md; labelapi.py draws, zpl.py reads ZPL):
#   GET  /api/v1/templates           the templates, their fields; GET /api/v1/templates/NAME its SVG
#   POST /api/v1/print/NAME          JSON: the fields (one label), or {"data": [{...}, ...]} (one each); options as
#                                    _copies _whole _feed _cut _gap, or in the query; a form or the query works too
#   POST /api/v1/preview/NAME        the same, a PNG of what would print; GET /api/v1/preview/NAME?field=...
#   POST /api/v1/print/svg           an SVG (mm), the template features in it, fields from the query; also /preview/svg
#   POST /api/v1/print/zpl           ZPL (Zebra), also on TCP 9100; also /preview/zpl
#   POST /api/v1/print/text          plain text: the `text` template
# Only from private addresses (the LAN); with a file `api_token` here, /api/v1 wants it (Authorization: Bearer ...).
import argparse
import ipaddress
import json
import os
import re
import select
import socket
import socketserver
import struct
import zlib
import subprocess
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

HERE = Path(__file__).resolve().parent
STATE = HERE / 'state.json'
DOC = HERE / 'doc.json'
JOBS = HERE / 'jobs'
KEEP_JOBS = 30
JOB_ID = re.compile(r'^[\w-]{1,40}$')
WEB = HERE / 'web'
STORE = WEB / 'store'
KINDS = ('fonts', 'templates', 'designs')
NAME = re.compile(r'^[\w][\w .()+,-]{0,119}$')
W, DPMM = 384, 8
ROW = W // 8

DEFAULT = {
    'paper': {
        # left: where the label's left edge is from dot 0, mm (−1.8: the label starts 1.8 mm left of dot 0)
        'label-50x80': {'mode': 'labels', 'length': 80, 'gap': 4, 'width': 50, 'left': -1.8, 'tear': 8, 'cut': 4},
        'roll-58': {'mode': 'continuous', 'length': 0, 'gap': 0, 'width': 48, 'left': 0, 'tear': 8, 'cut': 4},
    },
    'selected': 'label-50x80',
    'pos': None,        # dots, in the current label; None: not aligned yet
    'fresh': False,     # nothing printed on the current label since an align / feed-out: its top is just lost
}
PAPER_KEYS = ('length', 'gap', 'width', 'left', 'tear', 'cut')

lock = threading.Lock()
drawing = threading.Semaphore(1)      # one label job drawn at a time: the Pi stays responsive
MAX_BODY = 1 << 20


def lan(ip):
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return False
    if getattr(a, 'ipv4_mapped', None):
        a = a.ipv4_mapped
    return a.is_private or a.is_loopback or a.is_link_local


def token():
    try:
        return (HERE / 'api_token').read_text().strip() or None
    except OSError:
        return None


class Shared:
    '''the design everyone edits: kept in doc.json, a version number, waiters woken on a change'''
    def __init__(self):
        self.cv = threading.Condition()
        try:
            d = json.loads(DOC.read_text())
            self.v, self.doc = d['v'], d['doc']
        except (OSError, ValueError, KeyError):
            self.v, self.doc = 0, None

    def get(self, v=None, wait=25):
        end = time.time() + wait
        with self.cv:
            while v is not None and v == self.v and time.time() < end:
                self.cv.wait(end - time.time())
            return self.v, self.doc

    def put(self, base, doc):
        with self.cv:
            if base != self.v:
                return False, self.v, self.doc
            self.v, self.doc = self.v + 1, doc
            fd, tmp = tempfile.mkstemp(dir=str(HERE), prefix='.doc')
            with os.fdopen(fd, 'w') as f:
                json.dump({'v': self.v, 'doc': doc}, f, separators=(',', ':'))
            os.replace(tmp, str(DOC))
            self.cv.notify_all()
            return True, self.v, doc


shared = Shared()


def load():
    try:
        s = json.loads(STATE.read_text())
    except (OSError, ValueError):
        s = {}
    out = json.loads(json.dumps(DEFAULT))
    paper = dict(out['paper'], **s.pop('paper', {}))     # the built-in papers, and what was saved
    out.update(s)
    out['paper'] = paper
    return out


def save(s):
    fd, tmp = tempfile.mkstemp(dir=str(HERE), prefix='.state')
    with os.fdopen(fd, 'w') as f:
        json.dump(s, f, indent=1)
    os.replace(tmp, str(STATE))


def dots(mm):
    return int(round(mm * DPMM))


def pbm(data):
    '''P4 → (width, height, rows of bytes), each row padded out to 384 dots.'''
    fields, i = [], 2
    if data[:2] != b'P4':
        raise ValueError('not a P4 PBM')
    while len(fields) < 2:
        while data[i:i + 1].isspace():
            i += 1
        if data[i:i + 1] == b'#':
            i = data.index(b'\n', i)
            continue
        j = i
        while not data[j:j + 1].isspace():
            j += 1
        fields.append(int(data[i:j]))
        i = j
    i += 1
    w, h = fields
    if not 0 < w <= W:
        raise ValueError('width %d: 1..%d dots' % (w, W))
    stride = (w + 7) // 8
    body = data[i:i + stride * h]
    if len(body) < stride * h:
        raise ValueError('short PBM')
    pad = bytes(ROW - stride)
    rows = []
    for y in range(h):
        r = bytearray(body[y * stride:(y + 1) * stride])
        if w % 8:
            r[-1] &= (0xff << (8 - w % 8)) & 0xff
        rows.append(bytes(r) + pad)
    return w, h, rows


def _tables(f):
    '''sfnt / TTC / WOFF → {tag: bytes} for name and OS/2, read by seeking (WOFF2: None, its tables are brotli)'''
    def at(off, n):
        f.seek(off)
        return f.read(n)
    sig, want = at(0, 4), (b'name', b'OS/2')
    out = {}
    if sig == b'wOFF':
        n = struct.unpack('>H', at(12, 2))[0]
        d = at(44, 20 * n)
        for i in range(n):
            tag, off, clen, olen, _ = struct.unpack('>4sIIII', d[20 * i:20 * i + 20])
            if tag in want:
                t = at(off, clen)
                out[tag] = zlib.decompress(t) if clen < olen else t
        return out
    if sig == b'ttcf':
        base = struct.unpack('>I', at(12, 4))[0]
    elif sig in (b'\x00\x01\x00\x00', b'OTTO', b'true'):
        base = 0
    else:
        return None
    n = struct.unpack('>H', at(base + 4, 2))[0]
    d = at(base + 12, 16 * n)
    for i in range(n):
        tag, _, off, ln = struct.unpack('>4sIII', d[16 * i:16 * i + 16])
        if tag in want:
            out[tag] = at(off, ln)
    return out


def font_info(path):
    stem = path.stem
    info = {'file': path.name, 'family': stem, 'style': 'Regular', 'weight': 400, 'italic': False, 'ps': stem}
    try:
        with open(str(path), 'rb') as f:
            t = _tables(f)
    except (OSError, struct.error, zlib.error):
        t = None
    if not t:
        return info
    names = {}
    nm = t.get(b'name')
    if nm:
        _, count, base = struct.unpack('>HHH', nm[:6])
        for i in range(count):
            pid, eid, lid, nid, ln, off = struct.unpack('>HHHHHH', nm[6 + 12 * i:18 + 12 * i])
            raw = nm[base + off:base + off + ln]
            if pid == 3 and lid in (0x409, 0):
                rank, txt = 0, raw.decode('utf-16-be', 'replace')
            elif pid == 0:
                rank, txt = 1, raw.decode('utf-16-be', 'replace')
            elif pid == 1 and lid == 0:
                rank, txt = 2, raw.decode('latin-1')
            else:
                continue
            if nid not in names or rank < names[nid][0]:
                names[nid] = (rank, txt.strip())
    get = lambda *ids: next((names[i][1] for i in ids if i in names and names[i][1]), None)
    info['family'] = get(16, 1) or stem
    info['style'] = get(17, 2) or 'Regular'
    info['ps'] = get(6) or stem
    os2 = t.get(b'OS/2')
    if os2 and len(os2) >= 64:
        info['weight'] = struct.unpack('>H', os2[4:6])[0] or 400
        info['italic'] = bool(struct.unpack('>H', os2[62:64])[0] & 1)
    info['italic'] = info['italic'] or bool(re.search('italic|oblique', info['style'], re.I))
    return info


def font_index():
    d = STORE / 'fonts'
    d.mkdir(parents=True, exist_ok=True)
    cache_f = d / '.index.json'
    try:
        cache = json.loads(cache_f.read_text())
    except (OSError, ValueError):
        cache = {}
    out, fresh = [], {}
    for f in sorted(d.iterdir()):
        if f.name.startswith('.') or f.suffix.lower() not in ('.ttf', '.otf', '.woff', '.woff2', '.ttc'):
            continue
        key = '%s:%d:%d' % (f.name, f.stat().st_size, int(f.stat().st_mtime))
        fresh[key] = cache.get(key) or font_info(f)
        out.append(fresh[key])
    if fresh.keys() != cache.keys():
        cache_f.write_text(json.dumps(fresh))
    return out


def raster(rows):
    out = bytearray()
    for y in range(0, len(rows), 256):
        band = rows[y:y + 256]
        out += b'\x1dv0\x00' + bytes([ROW, 0, len(band) & 255, len(band) >> 8])
        out += b''.join(band)
    return bytes(out)


def blank(n):
    return raster([bytes(ROW)] * n) if n > 0 else b''


class Printer:
    def __init__(self, device, dry):
        self.device, self.dry = device, dry

    def send(self, data):
        data = b'\x1b@' + data
        if self.dry:
            (HERE / 'last.bin').write_bytes(data)
            return
        if self.device.startswith('lp:'):
            subprocess.run(['lp', '-d', self.device[3:], '-o', 'raw', '-s'], input=data, check=True)
        else:
            with open(self.device, 'wb') as f:
                f.write(data)


def paper(s):
    p = s['paper'][s['selected']]
    p.setdefault('cut', 4)
    return p


def out_pos(p):
    '''where the head is in the next label after a feed-out: its leading edge (cut − gap/2) mm past the tear bar'''
    return max(0, dots(p['tear'] + p['cut'] - p['gap'] / 2))


# the paper sensor (a QRE reflective sensor under the paper path), asked with ESC/POS DLE EOT 4: bits 5-6 paper end,
# 2-3 near end. 0x12 paper there, 0x72 none (tried 2026-10-19). Asked straight on /dev/usb/lp0 (pi is in lp), never
# while CUPS has a job going, at most every 2 s. With labels on a clear liner it may see the gaps as no paper: so far
# only the roll refuses to print without it.
DEV = '/dev/usb/lp0'
_sensor = {'t': 0.0, 'v': None, 'cups': 0}
dry_run = False


def sensor():
    '''"ok", "out", or None (no answer, busy, a dry run)'''
    if dry_run:
        return None
    if time.time() - _sensor['t'] < 2:
        return _sensor['v']
    v = None
    try:
        busy = subprocess.run(['lpstat', '-o'], capture_output=True, text=True, timeout=3, env=dict(os.environ, LC_ALL='C')).stdout.strip()
        _sensor['cups'] = len(busy.splitlines()) if busy else 0
        if not busy:
            fd = os.open(DEV, os.O_RDWR | os.O_NONBLOCK)
            try:
                while True:      # anything left over from before
                    try:
                        if not os.read(fd, 64):
                            break
                    except BlockingIOError:
                        break
                os.write(fd, b'\x10\x04\x04')
                got, end = b'', time.time() + 0.6
                while not got and time.time() < end:
                    if select.select([fd], [], [], 0.15)[0]:
                        try:
                            got = os.read(fd, 1)
                        except BlockingIOError:
                            pass
                if got:
                    v = 'out' if got[0] & 0x60 else 'ok'
            finally:
                os.close(fd)
    except (OSError, subprocess.SubprocessError):
        v = None
    _sensor.update(t=time.time(), v=v)
    return v


def uses_sensor(p):
    '''a paper heeds the sensor if it says so ("sensor" in its profile); by default the roll does, labels don't (a
    clear liner may look like no paper)'''
    return p.get('sensor', p['mode'] != 'labels')


def blocked(s):
    return uses_sensor(paper(s)) and sensor() == 'out'


def need_paper(s):
    if blocked(s):
        raise ValueError('no paper: the sensor sees none (load it)')


# ---- jobs held while there's no paper: printed in order once the sensor sees paper, dropped after PENDING_TTL. CUPS's
# own queue is kept short too: its jobs older than that are cancelled (and it aborts a job that fails, not retries).
PENDING_TTL = 600
pending = []        # {'id', 'name', 'time', 'kind', 'args'}; touched under `lock`


def held(s):
    return bool(pending) or blocked(s)


def hold(kind, name, args):
    pending.append({'id': format(int(time.time() * 1000), 'x') + str(len(pending)), 'name': name, 'time': time.time(), 'kind': kind, 'args': args})
    print('held (no paper): %s, %d waiting' % (name, len(pending)), flush=True)
    return len(pending)


def queued_reply(s, n):
    return dict(status(s), queued=True, pending=n,
                note='no paper: it waits, and prints once paper is loaded (%d waiting; dropped after %d min)' % (n, PENDING_TTL // 60))


def run_job(printer, s, kind, args):
    '''a print, now: the editor's page, a reprint, or rendered pages (the API, ZPL); s changed in place'''
    if kind == 'page':
        return run_page(printer, s, *args)
    if kind == 'reprint':
        data, notes = reprint(s, *args)
        printer.send(data)
        return {'note': notes[0] if notes else None}
    return run_pages(printer, s, *args)


def keeper(printer):
    '''every few seconds: drop what waited too long; print what waits once there's paper; trim CUPS's queue'''
    last_cups = 0.0
    while True:
        time.sleep(3)
        try:
            with lock:
                now = time.time()
                for j in [j for j in pending if now - j['time'] > PENDING_TTL]:
                    pending.remove(j)
                    print('dropped (waited %d min): %s' % (PENDING_TTL // 60, j['name']), flush=True)
                if pending and sensor() == 'ok':
                    s = load()
                    while pending and not blocked(s):
                        j = pending.pop(0)
                        run_job(printer, s, j['kind'], j['args'])
                        save(s)
                        print('printed, it had waited: %s' % j['name'], flush=True)
                        _sensor['t'] = 0      # ask again before the next
            if time.time() - last_cups > 30:
                last_cups = time.time()
                cups_trim()
        except Exception as e:        # keep going whatever one round met
            print('keeper: %r' % e, flush=True)


def cups_jobs():
    '''CUPS's jobs for this printer: [(id, submitted time)]'''
    out = subprocess.run(['lpstat', '-o'], capture_output=True, text=True, timeout=5, env=dict(os.environ, LC_ALL='C')).stdout
    jobs = []
    for line in out.splitlines():
        m = re.match(r'^(\S+)\s+\S+\s+\d+\s+(.+?)\s*$', line)
        if m:
            try:
                jobs.append((m.group(1), time.mktime(time.strptime(m.group(2), '%a %b %d %H:%M:%S %Y'))))
            except ValueError:
                jobs.append((m.group(1), None))
    return jobs


def cups_trim(all_=False):
    n = 0
    for jid, t in cups_jobs():
        if all_ or (t and time.time() - t > PENDING_TTL):
            subprocess.run(['cancel', jid], capture_output=True, timeout=5)
            print('cancelled the CUPS job %s%s' % (jid, '' if all_ else ' (too old)'), flush=True)
            n += 1
    if n:
        _sensor['t'] = 0
    return n


def status(s):
    p = paper(s)
    out = {'selected': s['selected'], 'paper': s['paper'], 'pos_mm': None, 'dpmm': DPMM, 'width': W, 'fresh': s['fresh'],
           'last': s.get('last'), 'usb': os.path.exists('/dev/usb/lp0'), 'sensor': sensor(), 'uses_sensor': uses_sensor(p),
           'pending': [{'id': j['id'], 'name': j['name'], 'age': int(time.time() - j['time'])} for j in pending],
           'pending_ttl': PENDING_TTL, 'cups_jobs': _sensor.get('cups', 0)}
    if s['pos'] is not None:
        out['pos_mm'] = s['pos'] / DPMM
    if p['mode'] == 'labels':     # the top of a label already past the head: this one's when fresh, else after a feed-out
        out['lost_mm'] = (s['pos'] if s['fresh'] and s['pos'] is not None else out_pos(p)) / DPMM
    return out


def feed_out(s):
    '''the rows that bring the paper out to cut, and the head's position after'''
    p = paper(s)
    if p['mode'] != 'labels':
        return dots(p['tear'] + p['cut']), None
    P, to = dots(p['length'] + p['gap']), out_pos(p)
    pos = s['pos'] if s['pos'] is not None else dots(p['tear'])
    n = P - pos + to
    if n > P:           # the gap's middle not yet past the head: no need to go a whole label further
        n -= P
    return n, to


def do_print(s, rows, where):
    p = paper(s)
    if p['mode'] != 'labels':
        while rows and not any(rows[-1]):
            rows.pop()
        return raster(rows), None, len(rows)
    L, P = dots(p['length']), dots(p['length'] + p['gap'])
    rows = rows[:L]
    pos = s['pos'] if s['pos'] is not None else dots(p['tear'])
    first = next((i for i, r in enumerate(rows) if any(r)), len(rows))
    out, note = b'', None
    fresh = s['fresh'] or s['pos'] is None     # nothing printed on it since the align / feed-out
    if pos < L and (where == 'here' or where == 'auto' and (pos <= first or fresh)):
        start = pos
    else:
        out += blank(P - pos) if pos > 0 else b''    # pos 0: at a leading edge already
        start = 0
    last = max((i + 1 for i, r in enumerate(rows) if any(r)), default=start)
    out += raster(rows[start:last]) if last > start else b''
    if first < start:
        note = '%.1f mm at the top could not print (already past the head)' % ((start - first) / DPMM)
    return out, note, max(last, start)


def job_meta(d):
    try:
        return json.loads((d / 'meta.json').read_text())
    except (OSError, ValueError):
        return None


def jobs():
    JOBS.mkdir(exist_ok=True)
    out = [m for m in (job_meta(d) for d in JOBS.iterdir() if d.is_dir()) if m]
    return sorted(out, key=lambda m: -m['time'])


def keep_page(q, body, out):
    '''a printed page, kept with its job: jobs/ID/i.pbm and meta.json'''
    jid = q.get('job', '')
    if not JOB_ID.match(jid):
        return None
    d = JOBS / jid
    d.mkdir(parents=True, exist_ok=True)
    i, n = int(q.get('i', 0)), int(q.get('n', 1))
    (d / ('%d.pbm' % i)).write_bytes(body)
    m = job_meta(d) or {'id': jid, 'name': q.get('name', '')[:80], 'pages': n, 'time': time.time(), 'prints': 1}
    m['out'] = out
    (d / 'meta.json').write_text(json.dumps(m))
    for old in jobs()[KEEP_JOBS:]:
        for f in (JOBS / old['id']).iterdir():
            f.unlink()
        (JOBS / old['id']).rmdir()
    return m


def reprint(s, jid, out):
    d = JOBS / jid
    m = job_meta(d) if JOB_ID.match(jid) else None
    if not m:
        raise ValueError('no job %r' % jid)
    out = m.get('out', True) if out is None else out
    data, notes = b'', []
    for i in range(m['pages']):
        _, _, rows = pbm((d / ('%d.pbm' % i)).read_bytes())
        part, note, end = do_print(s, rows, 'auto' if i == 0 else 'next')
        data += part
        notes += [note] if note else []
        if paper(s)['mode'] == 'labels':
            s['pos'], s['fresh'] = end, False
    if out:
        n, to = feed_out(s)
        data += blank(n)
        if paper(s)['mode'] == 'labels':
            s['pos'], s['fresh'] = to, True
    m['prints'] = m.get('prints', 1) + 1
    m['time'] = time.time()
    (d / 'meta.json').write_text(json.dumps(m))
    s['last'] = m
    return data, notes


def geo(s):
    '''the paper as labelapi sees it, mm'''
    p, st = paper(s), status(s)
    if p['mode'] == 'labels':
        return {'labels': True, 'W': p['width'], 'H': p['length'], 'left': p['left'], 'PW': W / DPMM, 'lost': st.get('lost_mm') or 0}
    return {'labels': False, 'W': W / DPMM, 'H': 0, 'left': 0, 'PW': W / DPMM, 'lost': 0}


def print_pages(printer, pages, name, whole=False, out=True):
    '''P4 pages: printed now, or held while there's no paper'''
    with lock:
        s = load()
        if held(s):
            return queued_reply(s, hold('pages', name, (pages, name, whole, out)))
        r = run_pages(printer, s, pages, name, whole, out)
        save(s)
        return dict(status(s), **r)


def run_pages(printer, s, pages, name, whole=False, out=True):
    '''P4 pages: on the labels (the first where the head is, or the next whole one), fed out after; kept as a job'''
    labels = paper(s)['mode'] == 'labels'
    data, notes = b'', []
    jid = 'a' + format(int(time.time() * 1000), 'x')
    for i, body in enumerate(pages):
        _, _, rows = pbm(body)
        part, note, end = do_print(s, rows, 'next' if i or whole else 'auto')
        data += part
        notes += [note] if note else []
        if labels:
            s['pos'], s['fresh'] = end, False
        m = keep_page({'job': jid, 'i': i, 'n': len(pages), 'name': name}, body, out)
        if m:
            s['last'] = m
    if out:
        n, to = feed_out(s)
        data += blank(n)
        if labels:
            s['pos'], s['fresh'] = to, True
    printer.send(data)
    return {'printed': len(pages), 'job': jid, 'note': notes[0] if notes else None}


def run_page(printer, s, body, q):
    '''the editor's page (a PBM), as /api/print got it'''
    labels = paper(s)['mode'] == 'labels'
    _, h, rows = pbm(body)
    data, note, end = do_print(s, rows, q.get('label', 'auto'))
    fed = None
    if labels:
        s['pos'], s['fresh'] = end, False
    if q.get('out') == '1':
        n, to = feed_out(s)
        data += blank(n)
        fed = n / DPMM
        if labels:
            s['pos'], s['fresh'] = to, True
    printer.send(data)
    m = keep_page(q, body, q.get('out') == '1')
    if m:
        s['last'] = m
    return {'note': note, 'fed_mm': fed}


def options(q, body):
    '''the print options: in the query, as _name in the JSON, or in its "options"'''
    o = {k: v for k, v in q.items()}
    if isinstance(body, dict):
        o.update({k[1:]: v for k, v in body.items() if k.startswith('_')})
        o.update(body.get('options') or {})
    yes = lambda v, d: d if v is None else str(v).strip().lower() not in ('0', 'false', 'no', 'off', '')
    try:
        copies = max(1, min(20, int(o.get('copies', 1))))
        gap = max(0.0, min(10.0, float(o.get('gap', 1))))
    except ValueError:
        raise ValueError('copies: 1 to 20, gap: mm')
    return {'copies': copies, 'whole': yes(o.get('whole'), False), 'out': yes(o.get('feed'), True), 'cut': yes(o.get('cut'), False),
            'gap': gap, 'preview': yes(o.get('preview'), False)}


def rows_of(body):
    '''the rows to print: {"data": [...]} / {"data": {...}} / {"rows": [...]} / the fields themselves'''
    if isinstance(body, list):
        return body
    if not isinstance(body, dict):
        return [{}]
    d = body.get('data', body.get('rows'))
    if not (isinstance(d, dict) or (isinstance(d, list) and d and all(isinstance(r, dict) for r in d))):
        d = None        # "data" as a field's name (a string): the fields are the body
    if d is None:
        d = {k: v for k, v in body.items() if not k.startswith('_') and k != 'options'}
    rows = d if isinstance(d, list) else [d]
    if not all(isinstance(r, dict) for r in rows):
        raise ValueError('each row: an object of fields')
    return rows


class Handler(SimpleHTTPRequestHandler):
    printer = None

    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(WEB), **k)

    def reply(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def store(self):
        '''/api/store/<kind>[/<name>] → (dir, name or None)'''
        parts = urlparse(self.path).path.split('/')[3:]
        if not parts or parts[0] not in KINDS or len(parts) > 2:
            raise ValueError('store: one of %s' % ', '.join(KINDS))
        d = STORE / parts[0]
        d.mkdir(parents=True, exist_ok=True)
        name = None
        if len(parts) == 2:
            from urllib.parse import unquote
            name = unquote(parts[1])
            if not NAME.match(name):
                raise ValueError('bad name %r' % name)
        return d, name

    def body(self):
        return self.rfile.read(int(self.headers.get('Content-Length') or 0))

    def lan_only(self):
        if lan(self.client_address[0]):
            return True
        self.reply({'error': 'only from the local network'}, 403)
        return False

    def authed(self):
        t = token()
        if not t:
            return True
        got = self.headers.get('Authorization', '').replace('Bearer ', '').strip() or parse_qs(urlparse(self.path).query).get('token', [''])[0]
        if got == t:
            return True
        self.reply({'error': 'needs the API token (Authorization: Bearer ...)'}, 401)
        return False

    def send_bytes(self, b, ctype, code=200):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_HEAD(self):
        if self.lan_only():
            super().do_HEAD()

    def v1(self, method):
        '''the API: templates, previews, prints'''
        import labelapi
        u = urlparse(self.path)
        q = {k: v[-1] for k, v in parse_qs(u.query).items() if k != 'token'}
        parts = [unquote(x) for x in u.path.split('/')[3:]]
        try:
            if method == 'GET' and parts == ['templates']:
                return self.reply({'templates': labelapi.templates(), 'common': labelapi.COMMON_HELP})
            if method == 'GET' and len(parts) == 2 and parts[0] == 'templates':
                return self.send_bytes(labelapi.template_file(parts[1]).read_bytes(), 'image/svg+xml')
            if len(parts) != 2 or parts[0] not in ('print', 'preview') or (method == 'GET' and parts[0] == 'print'):
                return self.reply({'error': 'no such thing: see GET /api/v1/templates and API.md'}, 404)
            n = int(self.headers.get('Content-Length') or 0)
            if n > MAX_BODY:
                return self.reply({'error': 'over 1 MB'}, 413)
            raw = self.rfile.read(n) if n else b''
            ctype = self.headers.get('Content-Type', '')
            kind, name = parts
            if name == 'text' and ('json' in ctype or raw[:1] in (b'{', b'[')):
                name = 'text.svg'      # fields for the text template, not text to print
            if name in ('svg', 'zpl', 'text'):
                body = raw.decode('utf-8', 'replace')
            elif 'json' in ctype or raw[:1] in (b'{', b'['):
                body = json.loads(raw or b'{}')
            elif raw:
                body = {k: v[-1] for k, v in parse_qs(raw.decode('utf-8', 'replace')).items()}
            else:
                body = {}
            if method == 'GET':
                body = {k: v for k, v in q.items() if k != 'preview'}
            opt = options(q, body if isinstance(body, dict) else {})
            preview = kind == 'preview' or opt['preview']
            if not drawing.acquire(timeout=60):
                return self.reply({'error': 'busy drawing another job: try again'}, 503)
            try:
                with lock:
                    g = geo(load())
                if name == 'svg':
                    pages = labelapi.render_svg(body, g, {k: v for k, v in q.items() if k not in ('copies', 'whole', 'feed', 'preview')}, opt['whole'])
                elif name == 'zpl':
                    import zpl
                    pages, zc = zpl.render(body, g)
                    opt['copies'] = max(opt['copies'], zc)
                elif name == 'text':
                    pages = labelapi.render_rows(labelapi.template_file('text').read_text(), [dict(q, text=body)], g, opt['gap'], opt['whole'], opt['cut'])
                else:
                    t = labelapi.template_file(name[:-4] if name == 'text.svg' else name).read_text()
                    pages = labelapi.render_rows(t, rows_of(body), g, opt['gap'], opt['whole'], opt['cut'])
            finally:
                drawing.release()
            pages = pages * opt['copies']
            if preview:
                return self.send_bytes(labelapi.preview_png(pages), 'image/png')
            label = name.replace('.svg', '') if name not in ('svg', 'zpl', 'text') else name.upper()
            return self.reply(print_pages(self.printer, pages, 'API: %s' % label, opt['whole'], opt['out']))
        except KeyError as e:
            return self.reply({'error': str(e).strip('"\'')}, 404)
        except (ValueError, json.JSONDecodeError, subprocess.SubprocessError, OSError) as e:
            return self.reply({'error': str(e)}, 400)

    def do_GET(self):
        if not self.lan_only():
            return
        u = urlparse(self.path)
        if u.path.startswith('/api/v1/'):
            return self.v1('GET') if self.authed() else None
        if u.path == '/api/status':
            with lock:
                return self.reply(status(load()))
        if u.path == '/api/doc':
            q = parse_qs(u.query)
            v, d = shared.get(int(q['v'][0]) if 'v' in q else None)
            return self.reply({'v': v, 'doc': d})
        if u.path == '/api/jobs':
            with lock:
                return self.reply({'jobs': jobs()})
        m = re.match(r'^/api/jobs/([\w-]{1,40})/(\d+)\.pbm$', u.path)
        if m:
            f = JOBS / m.group(1) / ('%s.pbm' % m.group(2))
            if not f.is_file():
                return self.reply({'error': 'no such page'}, 404)
            b = f.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'image/x-portable-bitmap')
            self.send_header('Content-Length', str(len(b)))
            self.end_headers()
            self.wfile.write(b)
            return
        if u.path == '/api/fonts':
            with lock:
                return self.reply({'fonts': font_index()})
        if u.path.startswith('/api/store/'):
            try:
                d, _ = self.store()
            except ValueError as e:
                return self.reply({'error': str(e)}, 400)
            files = [{'name': f.name, 'size': f.stat().st_size, 'mtime': f.stat().st_mtime}
                     for f in sorted(d.iterdir()) if f.is_file() and not f.name.startswith('.')]
            return self.reply({'files': files})
        gz = self.translate_path(u.path) + '.gz'      # a big file kept gzipped too (the icons): sent as it is
        if 'gzip' in self.headers.get('Accept-Encoding', '') and os.path.isfile(gz):
            body = Path(gz).read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(u.path))
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def do_DELETE(self):
        if not self.lan_only():
            return
        try:
            d, name = self.store()
            if not name:
                raise ValueError('which file?')
            (d / name).unlink()
        except (ValueError, OSError) as e:
            return self.reply({'error': str(e)}, 400)
        return self.reply({'ok': True})

    def do_PUT(self):
        if not self.lan_only():
            return
        if urlparse(self.path).path.startswith('/api/store/'):
            try:
                d, name = self.store()
                n = int(self.headers.get('Content-Length') or 0)
                if not name or n > 30 << 20:
                    raise ValueError('a name, and up to 30 MB')
                tmp = d / ('.' + name)
                tmp.write_bytes(self.rfile.read(n))
                os.replace(str(tmp), str(d / name))
            except (ValueError, OSError) as e:
                return self.reply({'error': str(e)}, 400)
            return self.reply({'ok': True})
        u = urlparse(self.path)
        if u.path == '/api/doc':
            try:
                base = int(parse_qs(u.query)['base'][0])
                doc = json.loads(self.body())
                if not isinstance(doc, dict) or not isinstance(doc.get('pages'), list):
                    raise ValueError('a design: {"pages": [...]}')
            except (ValueError, KeyError) as e:
                return self.reply({'error': str(e)}, 400)
            ok, v, d = shared.put(base, doc)
            return self.reply({'v': v, 'doc': None if ok else d}, 200 if ok else 409)
        if u.path != '/api/paper':
            return self.reply({'error': 'no such thing'}, 404)
        try:
            p = json.loads(self.body())
            name = str(p.pop('name'))
            if p.get('mode') not in ('labels', 'continuous'):
                raise ValueError('mode: labels or continuous')
            new = {k: float(p.get(k, 4 if k == 'cut' else 0)) for k in PAPER_KEYS}
            new['mode'] = p['mode']
            if 'sensor' in p:        # heed the paper sensor (else: the roll yes, labels no)
                new['sensor'] = bool(p['sensor'])
        except (ValueError, KeyError, TypeError) as e:
            return self.reply({'error': str(e)}, 400)
        with lock:
            s = load()
            s['paper'][name] = new
            save(s)
            return self.reply(status(s))

    def do_POST(self):
        if not self.lan_only():
            return
        u = urlparse(self.path)
        if u.path.startswith('/api/v1/'):
            return self.v1('POST') if self.authed() else None
        q = {k: v[-1] for k, v in parse_qs(u.query).items()}
        with lock:
            s = load()
            p = paper(s)
            labels = p['mode'] == 'labels'
            P = dots(p['length'] + p['gap'])
            try:
                if u.path == '/api/pending/clear':        # the held jobs, and CUPS's queue: gone
                    n = len(pending)
                    pending.clear()
                    c = cups_trim(all_=True)
                    return self.reply(dict(status(s), note='cleared: %d waiting, %d in CUPS' % (n, c)))
                if u.path == '/api/reprint':
                    out = {'0': False, '1': True}.get(q.get('out'))
                    jid = q.get('id', '')
                    if held(s):
                        m = job_meta(JOBS / jid) if JOB_ID.match(jid) else None
                        return self.reply(queued_reply(s, hold('reprint', 'reprint: %s' % ((m or {}).get('name') or jid), (jid, out))))
                    r = run_job(self.printer, s, 'reprint', (jid, out))
                    save(s)
                    return self.reply(dict(status(s), **r))
                if u.path == '/api/print':
                    body = self.body()
                    pbm(body)        # a bad one is said now, not when it's printed later
                    if held(s):
                        return self.reply(queued_reply(s, hold('page', q.get('name') or 'label', (body, q))))
                    r = run_page(self.printer, s, body, q)
                    save(s)
                    return self.reply(dict(status(s), **r))
                if u.path == '/api/feed':
                    need_paper(s)
                    n = dots(float(q.get('mm', 5)))
                    self.printer.send(blank(n))
                    if labels and s['pos'] is not None:
                        s['pos'] = (s['pos'] + n) % P if P else None
                        s['fresh'] = s['fresh'] or s['pos'] < n     # went on to the next label: nothing on it
                    save(s)
                    return self.reply(status(s))
                if u.path == '/api/tear':
                    need_paper(s)
                    n, to = feed_out(s)
                    if labels:
                        s['pos'], s['fresh'] = to, True
                    self.printer.send(blank(n))
                    save(s)
                    return self.reply(dict(status(s), fed_mm=n / DPMM))
                if u.path == '/api/align':
                    if not labels:
                        raise ValueError('continuous paper: nothing to align')
                    s['pos'] = dots(p['tear'] + float(q.get('mm', 0))) % P
                    s['fresh'] = True
                    save(s)
                    return self.reply(status(s))
                if u.path == '/api/select':
                    if q.get('name') not in s['paper']:
                        raise ValueError('no paper %r' % q.get('name'))
                    s['selected'] = q['name']
                    s['pos'] = None
                    save(s)
                    return self.reply(status(s))
            except (ValueError, KeyError, subprocess.CalledProcessError, OSError) as e:
                return self.reply({'error': str(e)}, 400)
        return self.reply({'error': 'no such thing'}, 404)


class ZplHandler(socketserver.BaseRequestHandler):
    '''raw ZPL on TCP (9100, as a Zebra listens): read until the sender stops, draw, print. The LAN only; ZPL has no
    way to send a token, so with one set this port still takes any sender on the LAN (--zpl 0 turns it off).'''
    printer = None

    def handle(self):
        if not lan(self.client_address[0]):
            return
        sock, buf = self.request, b''
        sock.settimeout(5)
        try:
            while len(buf) < MAX_BODY:
                chunk = sock.recv(65536)
                if not chunk:
                    break
                buf += chunk
                if re.search(rb'\^XZ\s*$', buf, re.I):
                    sock.settimeout(0.6)      # it looks done: a moment more for anything after
        except socket.timeout:
            pass
        text = buf.decode('utf-8', 'replace')
        if '^XA' not in text.upper():
            return
        import zpl
        if not drawing.acquire(timeout=120):
            print('zpl from %s: busy, dropped' % self.client_address[0], flush=True)
            return
        try:
            with lock:
                g = geo(load())
            pages, copies = zpl.render(text, g)
        except (ValueError, subprocess.SubprocessError, OSError) as e:
            print('zpl from %s: %s' % (self.client_address[0], e), flush=True)
            return
        finally:
            drawing.release()
        try:
            r = print_pages(self.printer, pages * copies, 'ZPL', False, True)
        except (ValueError, subprocess.SubprocessError, OSError) as e:
            print('zpl from %s: %s' % (self.client_address[0], e), flush=True)
            return
        print('zpl from %s: %s%s' % (self.client_address[0], 'held, no paper' if r.get('queued') else '%d label(s)' % r['printed'], ', ' + r['note'] if r.get('note') and not r.get('queued') else ''), flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8631)
    ap.add_argument('--device', default='lp:printherm')
    ap.add_argument('--dry', action='store_true', help='write last.bin instead of printing')
    ap.add_argument('--zpl', type=int, default=9100, help='raw ZPL on this TCP port (0: none)')
    a = ap.parse_args()
    WEB.mkdir(exist_ok=True)
    Handler.printer = Printer(a.device, a.dry)
    global dry_run
    dry_run = a.dry
    print('printd on :%d → %s%s' % (a.port, a.device, ' (dry)' if a.dry else ''), flush=True)
    threading.Thread(target=keeper, args=(Handler.printer,), daemon=True).start()
    if a.device.startswith('lp:') and not a.dry:
        subprocess.run(['/usr/sbin/lpadmin', '-p', a.device[3:], '-o', 'printer-error-policy=abort-job'], capture_output=True, timeout=10)
    if a.zpl:
        ZplHandler.printer = Handler.printer
        socketserver.ThreadingTCPServer.allow_reuse_address = True
        try:
            z = socketserver.ThreadingTCPServer(('0.0.0.0', a.zpl), ZplHandler)
            z.daemon_threads = True
            threading.Thread(target=z.serve_forever, daemon=True).start()
            print('ZPL on :%d' % a.zpl, flush=True)
        except OSError as e:
            print('ZPL on :%d: %s' % (a.zpl, e), flush=True)
    ThreadingHTTPServer(('0.0.0.0', a.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
