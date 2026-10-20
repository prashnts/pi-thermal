# Printher API

Printher is a 48 mm thermal label printer (203 dpi, 8 dots/mm, 384 dots across, black only) on a Raspberry Pi
Zero 2 W. Anything on the local network can print on it:

- **HTTP + JSON with templates.** Pick a template, send its fields, get a label. Home Assistant, scripts and `curl`
  all work this way.
- **SVG.** Send your own label drawn in mm.
- **ZPL II,** Zebra's label language, over HTTP or raw TCP on port 9100. Software that prints to a Zebra (InvenTree,
  Snipe-IT, Odoo, label apps) can print here unchanged.
- **MCP,** so Claude and other MCP clients can preview and print.

Base URL: `http://10.0.1.123:8631`. Everything below is under `/api/v1/`.

## Access

- Only private addresses (the LAN, loopback) are served. Anything else gets `403`, on the web page, the API and port
  9100.
- **Token (optional).** Put a token in a file `api_token` next to `printd.py` and `/api/v1/` will want it, as
  `Authorization: Bearer <token>` or `?token=<token>`. The editor's own endpoints don't use it. Raw ZPL can't send a
  token, so port 9100 stays LAN-only either way. Start printd with `--zpl 0` to close that port.
- **Limits.** 1 MB a request, 100 rows, 30 labels, 20 copies, 1.5 m of roll. One job is drawn at a time; another
  request waits up to 60 s, then gets `503`.

## Templates

`GET /api/v1/templates` lists them, with their fields, defaults and an example. `GET /api/v1/templates/NAME` returns
a template's SVG.

| name | for | fields |
|---|---|---|
| `text` | a title and wrapped text; as long as it needs on the roll | title, text, size, footer |
| `notification` | an icon, a title, when, the message | title, message, icon |
| `qr` | a QR code with a caption | text, caption, note, size |
| `wifi` | a Wi-Fi QR code (phones join by scanning it), the network and password written out | ssid, password, security, hidden |
| `sensor` | a reading, big | name, value, unit, icon, when |
| `list` | a title and a list with tick boxes | title, items (a list, or one a line), boxes, size |
| `date` | what it is, and its steps (bagged, frozen, opened): the first dated, the rest a line to write on | item, steps, date |
| `filament` | a Bambu-style spool label with a code built from its fields, plus a Data Matrix | brand, type, color, sku, temps, bought, opened, serial, code |
| `asset` | a thing's name, its id (as a Data Matrix or QR), where it lives | name, id, where, link, code |
| `big` | one word or number as big as the width allows | text, under, max |

**Common fields** fill themselves in every template: `date` (YYYY-MM-DD), `time` (HH:MM), `datetime`, `weekday`,
`day`, `month`, `year`, `n` (the row number, from 1), `count`, `printer`. A field you leave out takes its default.

`icon` takes Home Assistant's icon names (`mdi:washing-machine`), Material Symbols names (`home`), or `phosphor:…`,
`tabler:…`, `brands:…`.

Your own templates: an SVG saved in the editor's store (`web/store/templates/NAME.svg`) is a template too, and it wins
over a built-in one of the same name. See [Writing a template](#writing-a-template).

## Printing and previewing

```
POST /api/v1/print/NAME       prints; returns JSON {printed, job, note, ...}
POST /api/v1/preview/NAME     the same, but returns a PNG of exactly what would print
GET  /api/v1/preview/NAME?title=Hi&message=...    a preview from the query string (handy in a browser)
```

The body can be:

- the fields themselves (one label): `{"title": "Washer", "message": "Done."}`
- several labels: `{"data": [{...}, {...}]}` (one label per object; `rows` works too)
- a form (`application/x-www-form-urlencoded`), or just the query string

**Options** go in the query string, or in the JSON as `_name` or under `"options"`:

| option | default | |
|---|---|---|
| `copies` | 1 | 1 to 20 |
| `whole` | no | start on the next whole label (see [Labels and the roll](#labels-and-the-roll)) |
| `feed` | yes | feed out to the tear bar afterwards |
| `cut` | no | dashed cut lines round each label |
| `gap` | 1 | mm between labels packed together |

Several small labels are packed across and down a label; whatever doesn't fit goes on to the next one. On the roll
they stack into one strip.

```sh
curl -X POST http://10.0.1.123:8631/api/v1/print/notification \
  -H 'Content-Type: application/json' -d '{"title": "Washer", "message": "The washing is done.", "icon": "mdi:washing-machine"}'

curl -X POST 'http://10.0.1.123:8631/api/v1/preview/filament' -d '{"data": [{"type": "PLA Basic", "color": "Black"},
  {"type": "PETG HF", "color": "White"}]}' -o preview.png

curl -X POST http://10.0.1.123:8631/api/v1/print/text --data-binary 'Plain text: printed with the text template'
```

Other things to print:

```
POST /api/v1/print/svg?field=..    an SVG of your own (sizes in mm; the template features work; ?fields fill {{ }})
POST /api/v1/print/zpl             ZPL; also raw on TCP 9100 (printf '^XA^FO20,20^A0N,40,40^FDHi^FS^XZ' | nc 10.0.1.123 9100)
POST /api/v1/print/text            plain text (a JSON body goes to the `text` template instead)
```

All three also exist under `/preview/`.

## Labels and the roll

**With labels loaded** (50 × 80 mm), the printer can't feed backwards. After a tear, the top ~10–16 mm of the label at
the head is already past the head. The API packs labels below that strip. A ZPL label is drawn from its very top, so
its top is lost unless you pass `whole=1`. `whole` skips to the next label, feeding the rest of the current one
through blank.

**With the continuous roll loaded,** labels come out as long as they need, and nothing is lost. `GET /api/status`
says which paper is loaded.

## Home Assistant

**A rest command** that prints any template, in `configuration.yaml`:

```yaml
rest_command:
  printher:
    url: "http://10.0.1.123:8631/api/v1/print/{{ template }}"
    method: post
    content_type: "application/json"
    payload: "{{ fields | tojson }}"
    timeout: 60
    # headers:
    #   Authorization: !secret printher_bearer      # "Bearer <token>", if the printer has one
```

Use it from an automation or script:

```yaml
- action: rest_command.printher
  data:
    template: notification
    fields:
      title: Washer
      message: "Done at {{ now().strftime('%H:%M') }}. Hang it up."
      icon: mdi:washing-machine
```

**As a notifier,** so that `notify.printher` prints `title` and `message`:

```yaml
notify:
  - platform: rest
    name: printher
    resource: http://10.0.1.123:8631/api/v1/print/notification
    method: POST_JSON
    title_param_name: title
    message_param_name: message
    data:
      icon: mdi:home-assistant
```

**The shopping list,** from a to-do list:

```yaml
script:
  print_shopping_list:
    sequence:
      - action: todo.get_items
        target: { entity_id: todo.shopping_list }
        data: { status: needs_action }
        response_variable: todo
      - action: rest_command.printher
        data:
          template: list
          fields:
            title: Shopping
            items: "{{ todo['todo.shopping_list']['items'] | map(attribute='summary') | list }}"
```

**A sensor's reading:**

```yaml
- action: rest_command.printher
  data:
    template: sensor
    fields:
      name: "{{ state_attr('sensor.freezer_temperature', 'friendly_name') }}"
      value: "{{ states('sensor.freezer_temperature') }}"
      unit: "{{ state_attr('sensor.freezer_temperature', 'unit_of_measurement') }}"
      icon: mdi:fridge-industrial
```

**Guest Wi-Fi:**

```yaml
- action: rest_command.printher
  data: { template: wifi, fields: { ssid: Guest, password: !secret guest_wifi_password } }
```

**A filament label when a spool goes into the AMS** (with the Bambu Lab integration; adjust the entity and attribute
names to yours):

```yaml
- action: rest_command.printher
  data:
    template: filament
    fields:
      brand: Bambu Lab
      type: "{{ state_attr('sensor.x1c_ams_1_tray_1', 'type') }}"
      color: "{{ state_attr('sensor.x1c_ams_1_tray_1', 'name') }}"
      temps: "{{ state_attr('sensor.x1c_ams_1_tray_1', 'nozzle_temp_min') }}–{{ state_attr('sensor.x1c_ams_1_tray_1', 'nozzle_temp_max') }} °C"
```

**A preview inside Home Assistant:** a `generic` camera or an image card pointed at
`http://10.0.1.123:8631/api/v1/preview/sensor?name=Test&value=42`.

## Writing a template

A template is an SVG with sizes in mm (`width="46mm"`, or `"{{_w}}mm"` for the paper's printable width) and Mustache
fields:

- `{{field}}`: a value, escaped. `{{{field}}}`: a value, not escaped.
- `{{#field}}…{{/field}}`: shown when the field is set, repeated for each item of a list. Inside a list, `{{.}}` is the
  item, and `_index`, `_first` and `_last` tell where you are.
- `{{^field}}…{{/field}}`: shown when the field is not set. Home Assistant's `off`, `unavailable` and `unknown` count as
  not set.
- **Filters:** `{{field|upper}}`, `lower`, `trim`, `initials`, `pad:3`, `round:1`, `yymmdd`, `default:text`, `wifi`
  (escapes a Wi-Fi QR string), `brand` and `type` (the filament codes).

**Metadata.** A `<metadata>` element holds JSON: `title`, `description`, `fields` (`{"name": {"default", "help",
"type": "list"}}`), `computed` (fields made from other fields, e.g. `"code": "{{brand|brand}}-{{n|pad:2}}"`), and
`example`.

**Layout attributes,** applied after the fields are filled in:

| attribute | on | does |
|---|---|---|
| `data-wrap="W"` | text | wraps to W mm (`data-lh` line height, `data-max-lines` with an ellipsis) |
| `data-fit="shrink"` | text | a word too long for the line shrinks the text |
| `data-fit="line"` + `data-width="W"` | text | one line, as big as fits (not bigger than its size; `data-min`) |
| `data-code="qrcode"` + `data-text` | rect | a code drawn in the rect, its modules whole dots (`data-mod`: dots a module; `data-ec`: the QR error level). Any bwip-js code: `qrcode`, `datamatrix`, `azteccode`, `pdf417`, `code128`, `code39`, `ean13`, ... |
| `data-icon="mdi:fan"` | rect | an icon in the rect |
| `data-flow="down"` | g | its children stacked in order (`data-gap` mm); an empty text takes no room |
| `height="auto"` | svg | as tall as its contents (`data-pad`, 1 mm) |

Sizes and positions can be sums: `x="{{_w}}-11"`. The geometry fields `_w`, `_cx` (the middle) and `_r` (the right
edge less 1 mm) are there for that.

Fonts: anything fontconfig has on the Pi; DejaVu Sans, Serif and Mono are always there. There are no external files:
no links, and images only as `data:` URIs. Scripts are dropped.

## MCP (Claude and other MCP clients)

`mcp/printher_mcp.py` is a stdio MCP server; it needs only the Python standard library and runs on the client's
machine. Its tools: `printer_status`, `list_templates`, `preview_label` (returns an image), `print_label`.

```sh
claude mcp add printher -e PRINTHER_URL=http://10.0.1.123:8631 -- python3 /home/noop/repo/pi-thermal/mcp/printher_mcp.py
# with a token: -e PRINTHER_TOKEN=...
```

## How it draws

- printd fills the template in (`labelapi.py`).
- rsvg-convert (Debian's `librsvg2-bin`) draws it at 2× and Pillow (`python3-pil`) averages it down to the printer's
  dots and thresholds it.
- Codes come from bwip-js (the same library the editor uses) run by Debian's `nodejs`. Node runs only while a job has
  codes in it.

Nothing stays running between jobs. A label takes about 1 s; with a code, about 3 s.
