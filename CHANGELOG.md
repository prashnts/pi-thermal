# Changelog

Printher: a POS thermal printer (a GD32 "micro printer", ZJ-58 compatible, 48 mm at 8 dots/mm) on a Raspberry Pi Zero
2 W with a PiTFT, turned into a label printer: printd on the Pi, a label editor in the browser. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are dates; the October 2026 work isn't committed
yet. Plans and measurements: [TODO.md](TODO.md).

## [Unreleased]

### 2026-10-19 (night): waiting prints, the printer's state everywhere
- Prints wait for paper instead of failing: a print sent while the sensor sees no paper (the editor's, a reprint, the
  API's, ZPL's) is held in order and prints by itself once paper is in. Held prints are dropped after 10 min, and so are
  CUPS jobs older than that (a February 2025 job sat there), so nothing piles up. CUPS aborts a failing job instead of
  retrying it. `POST /api/pending/clear` empties both; `/api/status` lists them (`pending`, `cups_jobs`, `pending_ttl`).
- Each paper says whether it heeds the sensor (*use the paper sensor* in Paper & roll): the roll does by default,
  labels don't (until it's known what the sensor makes of them).
- The editor: the printer's state in the header, polled every 4 s: Ready (green), No paper (red), N waiting (amber),
  printd away (grey). A tap lists what waits and offers to clear it. A held print says so instead of "printed".
- The PiTFT: the state at the top in big letters on a coloured block (READY green, NO PAPER red, N WAITING yellow,
  OFFLINE blue), a line under it, and *Clear waiting (N)* in the menu while prints wait. The letters are drawn from a 5-dot
  font in full blocks: the console's VGA8x8 font has only the PC character set (no toilet fonts; half blocks blurred). The
  screensaver waits while something's wrong and gives way when paper runs out or prints wait. figlet and toilet are
  installed (apt) but not used.

### 2026-10-19 (evening): paper sensor, test strip
- The paper sensor is read: printd asks the printer (ESC/POS `DLE EOT 4`, straight on `/dev/usb/lp0`; `pi` is in the
  `lp` group now) whether it sees paper, at most every 2 s and never during a CUPS job. `/api/status` says `sensor`:
  `ok`, `out`, or null (no answer). On the roll a print, feed or feed-out is refused with "no paper"; with labels it
  only reports, until it's known what the sensor makes of the gaps. The editor's Paper panel says it too. The tape
  over the QRE sensor is off.
- Test strip on the roll (photos IMG_7332–7336): codes scan from 2-dot modules (1-dot ones don't print well enough),
  so API codes are at least 2 dots a module unless a template sets `data-mod`. Hairlines print from 1 dot (faint);
  text reads from 2 mm. Templates and ZPL came out as previewed.

### 2026-10-19 (later): the API
- A print API for anything on the LAN ([API.md](API.md)): `/api/v1/print/NAME` with JSON fields (one label, or
  `{"data": [...]}` for several, packed across and down), `/api/v1/preview/NAME` returns a PNG of exactly what would print,
  `GET /api/v1/templates` lists the templates and their fields. Options: copies, whole, feed, cut, gap. Plain text, SVG
  and ZPL bodies too.
- Templates are SVG with Mustache fields, and `<metadata>` JSON for the title, the fields' defaults and help, computed
  fields and an example. Layout attributes: wrapped and fitted text (`data-wrap`, `data-fit`), codes on whole dots
  (`data-code`, any bwip-js code), icons (`data-icon`, Home Assistant's `mdi:` names), stacking (`data-flow`), `height="auto"`,
  sums in sizes (`{{_w}}-11`). Common fields fill themselves (date, time, weekday, row number ...).
- Built-in templates (`templates/`): text, notification, QR, Wi-Fi, sensor reading, list (tick boxes), date tag, filament
  spool, asset tag, big word. The editor's saved SVG templates are API templates too.
- ZPL II, the common subset (text in the scalable and bitmap fonts, field blocks, boxes, circles, lines, Code 128 / 39,
  EAN, UPC, ITF, QR, Data Matrix, Aztec, PDF417, home, length, copies), over HTTP and raw on TCP 9100, as a Zebra takes it.
- An MCP server (`mcp/printher_mcp.py`, Python stdlib): printer status, templates, preview (as an image), print.
- Home Assistant set-ups in API.md: a rest command for any template, a notifier, the shopping list, sensor readings,
  guest Wi-Fi, filament labels from the Bambu Lab integration.
- Drawn on the Pi with Debian packages only, nothing running between jobs: rsvg-convert (`librsvg2-bin`, installed),
  Pillow and nodejs (there already). Drawn at 2× and averaged down; text drawn at 10× and scaled, because librsvg rounds
  each letter's advance in the text's own units ("Oat m ilk" at 3.6 units). About 1 s a label, 3 s with a code.
- printd serves only private addresses (the LAN), the web page included; an optional `api_token` guards /api/v1. Limits
  on size, rows, labels, copies and length; one job drawn at a time.
- Editor: *white behind*, a white box under any object (margin, corner) so it reads on black: on by default for codes and
  markers, whose quiet zone has to be white (a QR on an *on black* object didn't scan).
- Editor: dragging a link's line moves its bend.

### 2026-10-19
- Layers: select several. Ctrl/⌘ click adds or removes one, Shift click selects a run, *All* / *None*, and *Select
  several* on phones, where a tap adds a row. Delete (bin), ↑ ↓ ⤒ ⤓ and *to page…* act on the whole selection, keeping
  its order. Dragging a selected row moves all the selected rows. Ctrl ] / [ moves them all too.
- Several selected (on the page or in Layers): *Align* lefts, centres, rights, tops, middles, bottoms; *Space across* /
  *Space down* for equal gaps; *Hide / show*, *Lock / unlock*, *to page*. Ctrl/⌘ click on the page selects too.
- Snap guides: while dragging, the selection's edges and middle catch on other objects' edges and middles, the label's
  edges and middle, the printable band and the tear-zone line, within 6 screen px. A pink line shows what it caught on.
  *snap* in the header turns them off; Alt turns them off for one drag.
- Pinch to zoom on the paper, round the fingers or the pointer: trackpad pinch (Ctrl + wheel in Chrome / Firefox /
  Edge, gesture events in Safari), Ctrl + mouse wheel, and touch on any touch screen, iPads included. The browser no
  longer zooms the whole page instead.
- Screen scale preset for known screens: iPhones (X to 17, Air, SE), iPads, MacBook Pro 14″ / 16″ (2019 on), MacBook
  Air 13″ / 15″, iMac 24″, Studio Display, Pro Display XDR. A screen is told apart by its size and pixel ratio, in any
  "looks like" scaling, with the browser's zoom allowed for (Chrome, Firefox). 1:1 is the real size without a ruler. A
  ruler measurement still wins; *Reset* goes back to the preset. *Paper & roll → Screen scale* says which screen it found.
- The top of the label that is past the head after a tear (the tinted strip) now says so on the page. *use a whole
  label* (on the strip, or *whole label* by Print) prints from the top of the next label; the rest of the label at the
  head is fed through blank.
- Filament spool labels (`F`, *Filament*, two built-in templates): brand, type, colour, product code, temperatures,
  date bought, date opened (or a line to write it on), and a code built from them by a pattern (`{B}-{T}-{yymmdd}-{nn}`
  → `BBL-PLA-261019-01`; brand and type codes known or derived, both can be changed), shown as text and as a Data Matrix
  or QR. Serial numbers optional; Repeat counts them up, and a list in Repeat gives each copy its own colour.
  *type on black* for a Bambu-style bar.
- Links: lines joining two objects (network diagrams: icons with numbered nodes) that follow them when they move. Select
  them in order and press *Join* (`J`): a chain, each to the next. *Join to last* (`Shift J`): a star, each to the last
  one clicked. A link leaves from the side facing the other object (or a side you pick) and goes straight out, then
  takes 45° bends (the diagonal in the middle or at either end), right angles or a straight line. Rounded corners, line
  width, dash, a dot or an arrow at either end; *Use for new links* keeps a look. Links sit under the objects. Deleting
  an object takes its links with it, and duplicating or copying a set joins the copies to each other.
- Links, reshaping: a selected link has handles. Drag the middle one to slide the bend along the way (5 % steps; Alt
  for no steps), or use the *bend* slider. Drag an end to another side of its object.
- Links, joining on phones (and anywhere): the *Join* tool (phone tool bar, *Join* in Add, `J` with nothing selected).
  Tap an object, then the next and the next: each tap links to the last one. Tap empty paper to start a new chain; tap
  *Join* again or press Esc to stop. A tap anywhere in an object's box counts, blank parts of an icon included.
- Line arrows (open chevrons) for links and for the Arrow tool; filled arrows are still there. The line stops inside its
  heads, so no cap pokes past the tip. An end with an arrow runs straight for at least 1.5 head lengths, so the head
  sits centred on the line, not across a bend.
- Recent fonts first in the font picker. Recent text styles (font, size, weight) as chips on a text, in their own face:
  a tap sets the text's style, or every selected text's. A new text starts in the last style used.
- Phones: the tool bar scrolls sideways when it doesn't fit; messages show at the top, off the tool bar. While joining,
  the scale and turn handles are hidden.
- Fixed: Repeat's cut lines stayed on the page when the tiles were deleted. Tiles and their cut lines are now one set,
  and the cut lines go with the last tile on a page (undo brings both back). Cut lines left by earlier versions aren't
  tied to anything: select them in Layers and delete them.
- Fixed: the icons in the Icons panel were black on the dark theme's grey; they follow the text colour now (the page
  still prints them black).

### 2026-10-18 (later)
- The paper opens at its real size (1:1). *Paper & roll → Screen scale* corrects it for a screen (a real ruler held to
  the screen's ruler; kept per browser). `1:1` in the header and the phone toolbar.
- Rulers over and left of the paper, in mm, the pointer marked on them (*ruler* to hide them).
- Wire tags (`W`): *wrap* round a wire (π·d × 1.5 turns, the text along the wire repeated round it, turn marks), or an
  insert for clear heat-shrink (as wide as the tube lies flat). Cut line.
- Pin strips (`P`): pin names round a header or connector. Presets: Dupont 1×N and 2×N (2.54), JST XH and PH,
  terminal blocks 5.08 and 3.5, DIN rail breakers (18 mm). *Wrap* (front, side, back as seen from behind, side, glue),
  *both sides*, *one side*; 2×N puts the odd pins on the front, the even on the back; pin-1 bar, dashed folds.
- Markers (`M`): ArUco 4×4 to 7×7 (as _50 / _100 / _250 / _1000), ArUco original and MIP 36h12, AprilTag 16h5, 25h9,
  36h10, 36h11; ChArUco boards and checkerboards for camera calibration. From OpenCV's tables (`markers.py` →
  `web/markers.json`); bits whole dots, a caption (shortened to `#id` when the marker is small). Checked by detecting
  the rasterized page with OpenCV.
- Repeat (tiles), in any object's properties: across × down, gaps, *Fill label*, how many (more go on to new pages),
  cut lines. `{n}` / `{nnn}` number the copies; a list puts one line on each copy (`{v}`, or the main text).
- Markers in tiles make a series: ids count up from the marker's, or from a list with ranges (`0-9, 20, 30-38/2`); the
  ids it will make shown before *Make*; the dictionary size goes up when the ids need it.
- More built-in templates: wire tags, headers, JST, terminal block and DIN strips, ArUco, AprilTag, ChArUco, checkerboard.

### 2026-10-18
- A number on any icon (in a node, box, filled, circle; above, below, beside, on the corner). *Picks*: network,
  electrical, 3D printing, medical, household, workshop icons from all the packs.
- Recent prints kept on the Pi (the last 30): thumbnails and Reprint in the app and on the PiTFT.
- PiTFT menu (`tui.py`): printer, paper, head, last print; reprint, recent prints, feed out, restart printd, reboot,
  shut down; its own screensaver.
- The PiTFT's screensaver leaves the menu alone (`screensaver.py`); `pth-tty.service` runs the menu.
- Phones: the paper fills the screen, the panels as a sheet picked from a tab bar, touch drag, pan and pinch zoom.
- KiCad sheet of the printer as built, with the planned reverse feed (`kicad/`).

### 2026-10-17
- printd on the Pi (`np_printd`, :8631): ESC/POS raster straight to the printer, no CUPS; label paper profiles,
  *Aligned* from any state of the roll, feed out to the tear bar; the design shared between screens.
- The label editor (`web/`): pages at the label's size in mm; text, box, line, arrow, shapes, images (dithered), SVG
  templates with editable texts, cable flags with *Arrange*; groups, layers, undo, shortcuts, copy and paste between
  tabs; *as printed* preview.
- Fonts from limn plot's store, loaded when used; Material Symbols, MDI, Phosphor, Tabler and brand icons.
- Codes (QR, Micro QR, Data Matrix, Aztec, PDF417, Code 128/39, EAN, UPC, ITF), modules whole dots; logo tag;
  *on black* for any object.
- Test strip (`teststrip.py`): scale, print width and head-to-tear-bar distance measured.

## [2025.05.03]
- Labels test (`labels.py`): a 58 × 80 mm page of 5 × 8 Aztec codes (12 mm, random `it-<uuid>`) as a PDF into the inbox;
  Data Matrix tried first. A pure-Python Aztec generator (`aztec_code_generator.py`).

## [2025.03.30]
- Screensaver on the PiTFT console: `pipes.sh` in tty1's `screen` session when nobody is at the console (from `w`),
  moved out of `main.py` into `screensaver.py`, then an alternate between screensavers, stopping whatever runs first.
- `pth-tty.service`: the tty1 `screen` session under systemd.
- Runs on the Pi's Python 3.9.

## [2025.03.01]
- The inbox printer (`main.py`): a file dropped or changed in `inbox/` is sent to CUPS with `lp`, debounced 1 s; it only
  prints when a `PRODUCTION` file is there. Supervisor config (`printer-spool.conf`).

## [2025.02.21]
- The repository.
