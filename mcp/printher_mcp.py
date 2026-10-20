#!/usr/bin/env python3
# printher_mcp: an MCP server (stdio) for Printher, the label printer: Claude (or any MCP client) lists its templates,
# previews a label as an image, and prints. Python stdlib only; it talks to printd's HTTP API (API.md).
#   claude mcp add printher -e PRINTHER_URL=http://10.0.1.123:8631 -- python3 /path/to/printher_mcp.py
#   PRINTHER_TOKEN: the API token, if the printer has one (api_token next to printd.py).
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

URL = os.environ.get('PRINTHER_URL', 'http://10.0.1.123:8631').rstrip('/')
TOKEN = os.environ.get('PRINTHER_TOKEN', '')
VERSION = '2025-06-18'

LABEL = {
    'template': {'type': 'string', 'description': 'a template name from list_templates (text, notification, qr, wifi, sensor, list, date, filament, asset, big, ...)'},
    'data': {'description': 'the fields: an object for one label, or an array of objects for one each', 'anyOf': [{'type': 'object'}, {'type': 'array', 'items': {'type': 'object'}}]},
    'svg': {'type': 'string', 'description': 'instead of a template: an SVG in mm (labelapi features allowed: data-wrap, data-code, data-icon, data-flow, height="auto")'},
    'zpl': {'type': 'string', 'description': 'instead of a template: ZPL II (^XA ... ^XZ); the printer is 203 dpi, 384 dots wide'},
    'cut': {'type': 'boolean', 'description': 'dashed cut lines round each label'},
    'whole': {'type': 'boolean', 'description': 'start on the next whole label (the part-used one at the head is fed through)'},
}
TOOLS = [
    {'name': 'printer_status', 'description': 'The label printer: the paper loaded (labels: size; or the continuous roll), where the head is on the label, the last print.',
     'inputSchema': {'type': 'object', 'properties': {}}},
    {'name': 'list_templates', 'description': 'The label templates: names, what each is for, their fields and defaults, an example. Common fields (date, time, ...) fill themselves.',
     'inputSchema': {'type': 'object', 'properties': {}}},
    {'name': 'preview_label', 'description': 'Draw a label without printing: returns an image of exactly what would print (black and white, 8 dots per mm). Check it before print_label.',
     'inputSchema': {'type': 'object', 'properties': LABEL}},
    {'name': 'print_label', 'description': 'Print a label (uses paper). One of template (+ data), svg or zpl. Preview first unless the user asked to print right away.',
     'inputSchema': {'type': 'object', 'properties': dict(LABEL, copies={'type': 'integer', 'minimum': 1, 'maximum': 20},
                                                             feed={'type': 'boolean', 'description': 'feed out to the tear bar after (default true)'})}},
]


def call(method, path, body=None, ctype='application/json'):
    req = urllib.request.Request(URL + path, data=body, method=method, headers={'Content-Type': ctype} if body is not None else {})
    if TOKEN:
        req.add_header('Authorization', 'Bearer ' + TOKEN)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read(), r.headers.get('Content-Type', '')
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            msg = json.loads(raw).get('error', raw.decode())
        except ValueError:
            msg = raw.decode(errors='replace')
        raise RuntimeError('printer: %s (HTTP %d)' % (msg, e.code))
    except urllib.error.URLError as e:
        raise RuntimeError('printer not reachable at %s: %s' % (URL, e.reason))


def label(kind, a):
    q = {k: ('1' if a[k] else '0') for k in ('cut', 'whole', 'feed') if k in a}
    if a.get('copies'):
        q['copies'] = str(int(a['copies']))
    qs = ('?' + urllib.parse.urlencode(q)) if q else ''
    if a.get('zpl'):
        return call('POST', '/api/v1/%s/zpl%s' % (kind, qs), a['zpl'].encode(), 'text/plain')
    if a.get('svg'):
        return call('POST', '/api/v1/%s/svg%s' % (kind, qs), a['svg'].encode(), 'image/svg+xml')
    if not a.get('template'):
        raise RuntimeError('give a template (and data), an svg or zpl')
    d = a.get('data') or {}
    return call('POST', '/api/v1/%s/%s%s' % (kind, urllib.parse.quote(a['template']), qs), json.dumps({'data': d} if isinstance(d, list) else d).encode())


def tool(name, a):
    if name == 'printer_status':
        s = json.loads(call('GET', '/api/status')[0])
        p = s['paper'][s['selected']]
        what = ('labels %s × %s mm, gap %s mm' % (p['width'], p['length'], p['gap'])) if p['mode'] == 'labels' else 'the continuous roll, 48 mm printable'
        txt = 'Paper: %s (%s). ' % (s['selected'], what)
        if p['mode'] == 'labels' and s.get('pos_mm') is not None:
            txt += 'The head is %.1f mm into the label; its top %.1f mm is past the head (a print starting there loses it; whole=true uses the next label). ' % (s['pos_mm'], s.get('lost_mm') or 0)
        if s.get('last'):
            txt += 'Last print: %s.' % s['last'].get('name')
        return [{'type': 'text', 'text': txt}]
    if name == 'list_templates':
        d = json.loads(call('GET', '/api/v1/templates')[0])
        return [{'type': 'text', 'text': json.dumps(d, indent=1, ensure_ascii=False)}]
    if name == 'preview_label':
        png, _ = label('preview', a)
        return [{'type': 'image', 'data': base64.b64encode(png).decode(), 'mimeType': 'image/png'},
                {'type': 'text', 'text': 'Preview: 384 dots = 48 mm wide; grey bars separate labels.'}]
    if name == 'print_label':
        r = json.loads(label('print', a)[0])
        if r.get('queued'):
            return [{'type': 'text', 'text': 'Not printed yet: %s' % r.get('note')}]
        return [{'type': 'text', 'text': 'Printed %s label(s), job %s.%s' % (r.get('printed'), r.get('job'), (' Note: ' + r['note']) if r.get('note') else '')}]
    raise RuntimeError('no tool %r' % name)


def reply(i, result=None, error=None):
    m = {'jsonrpc': '2.0', 'id': i}
    m.update({'error': error} if error else {'result': result})
    sys.stdout.write(json.dumps(m) + '\n')
    sys.stdout.flush()


def main():
    for line in sys.stdin:
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        i, method, p = msg.get('id'), msg.get('method'), msg.get('params') or {}
        if i is None:       # notifications (initialized, cancelled): nothing to say
            continue
        if method == 'initialize':
            reply(i, {'protocolVersion': p.get('protocolVersion', VERSION), 'capabilities': {'tools': {}},
                      'serverInfo': {'name': 'printher', 'version': '1.0'},
                      'instructions': 'Printher is a 48 mm thermal label printer (8 dots/mm, black only). Use list_templates, preview_label to check, then print_label.'})
        elif method == 'ping':
            reply(i, {})
        elif method == 'tools/list':
            reply(i, {'tools': TOOLS})
        elif method == 'tools/call':
            try:
                reply(i, {'content': tool(p.get('name'), p.get('arguments') or {})})
            except (RuntimeError, ValueError, KeyError) as e:
                reply(i, {'content': [{'type': 'text', 'text': str(e)}], 'isError': True})
        else:
            reply(i, error={'code': -32601, 'message': 'no method %s' % method})


if __name__ == '__main__':
    main()
