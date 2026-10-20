# Labels: plan (2026-10-17)

## What's there (checked on the Pi, read-only)

- Pi Zero 2 W (armv7l, 426 MB, Python 3.9), `pi-thermal` at 10.0.1.123.
- Printer: USB 28e9:0289 "gezhiweixin micro printer" (GD32), usblp → `/dev/usb/lp0` (root:lp; `pi` is not in `lp`).
- CUPS queue `printherm`: driver Zijiang ZJ-58 (`rastertozj`), 203 dpi, pages 48×65/105/210/297 mm or Custom,
  `FeedDist` 12 mm after the job, `BlankSpace` on. Every PDF is fitted to a fixed page: the wrong scale and
  the blank paper both come from this.
- 48 mm printable = 384 dots at 8 dots/mm (to confirm with a test strip: `teststrip.py`).
- The working jobs in `inbox/` (Sketch, macOS PDFs) are 165 pt = 58.2 mm wide, 210 pt (74 mm) or 227 pt (80 mm)
  long, a few long strips (1087, 1452 pt). CUPS fits 58.2 mm into the 48 mm print width: everything prints at
  ~0.82 of its size. Most have the design in the top half and blank below.
- What they are: equipment tags (title, letter/number badges, icons: disk, invader, key, tree, calendar),
  cable flags (text + the same text rotated 180°, a fold between, a tail outline), cut outlines, a black bar
  across the top. → templates: *tag*, *cable flag* (fold line, mirrored half, tail length), *grid of codes*.

## Test strip, 2026-10-17 (job 311, photo ~/limn-shot/IMG_7301.JPG)

- Paper: white die-cut labels, rounded corners, ~50 mm wide, on a clear liner (~58 mm). The QRE paper
  sensor is taped over: it can't see through the clear liner.
- Width: dot 0 is ~1.8 mm in from the label's left edge; the right border (dot 383) landed just off the label,
  on the liner (no coating: nothing shows). Print area ≈ label from −1.8 to 48.1 mm: keep art inside ~dots 0..375.
- Scale: the 10 mm square comes out square, rulers agree across and along (within the photo's perspective).
  Absolute: to check with a real ruler (0→40 on the strip).
- Head → tear bar ≈ 8 mm: the END bar (45 mm) stayed inside and the visible print ends at ~37 mm. The 20 mm
  `ESC J` feed never happened (job 312 shows it), so the bar was at the head. To confirm with a blank-row feed.
- The print began ~9 mm into the label: where the last job left the paper.
- Density fine at defaults: 1-dot lines, 1-dot checker (grey, some waviness), dot grid all print.
- Job 312 (photo IMG_7303): bars 1, 2, 3 printed back to back, right after the strip's END bar. So the firmware
  ignores `ESC J n` (forward feed), `ESC K n` and `ESC e n` (reverse): **no reverse**, and **feed = blank raster
  rows** (GS v 0 of zeros), the one thing known to move the paper by an exact amount.
- Scale vs a steel rule (IMG_7303): 10 mm on the strip ≈ 10 mm on the rule, within the photo's ~2–3 %.
- Labels: **50 × 80 mm, gap 4 mm** (the user, 2026-10-17; was guessed 70/5) → pitch 84 mm. No reverse: a tear at the gap leaves the
  head ~8 mm into the next label; that top strip of it can't be printed (or print labels in a run, tear once).

## Shape

```
 Mac / any browser                                Pi Zero 2 W
 ┌─────────────────────────────┐   1-bit raster   ┌────────────────────────┐
 │ label app (web UI)          │ ───────────────▶ │ printd: ESC/POS        │
 │ templates, symbols, fonts,  │   HTTP POST      │ GS v 0 → lp0 (or       │
 │ images → exact 8 dots/mm    │                  │ `lp -o raw`), paper    │
 └─────────────────────────────┘                  │ state, feed, align     │
                                                  └────────────────────────┘
```

- **printd** (Pi, stdlib only): takes a PBM (384 wide) + paper profile, writes ESC/POS raster bands, feeds by
  exact dots (blank raster rows: this firmware ignores `ESC J`). No CUPS in the path, no scaling, no page size, no feed-after-job unless asked.
  The `inbox/` folder watch stays: PDFs/PNGs dropped there are rasterized at 203 dpi, 1:1, not fitted.
- **label app**: separate, label-only UI (the user's choice); imports `limn/plot` as a library for SVG
  reading (Sketch quirks), fonts (TTF via HarfBuzz, Hershey line fonts), dithering. Renders to a bitmap at
  exactly 8 dots/mm, so what the screen shows is what prints, dot for dot.

## Paper profiles (per roll, picked per job)

- `continuous`: width 48 mm print area. Labels are packed along and across the strip with cut marks; the
  strip ends right after the last label + the tear lead. Batch several labels per feed-out: the head-to-tear
  distance D is lost once per batch, not per label.
- `labels`: length L, gap G, width W, offset. No sensor: printd keeps the position on the roll (persisted),
  *Aligned* button = "the gap is at the tear bar now". It can't feed backwards, so after a tear the head is D into
  the next label: print in batches, or the first D mm of a label after a tear stays blank (the UI shows it).
- Measure once per printer: D (head → tear bar), true dots/mm along the feed (stepper scale), print-width offset.

## Designer

- Templates: SVG with `{{field}}` placeholders, batch from a list/CSV; Data Matrix / Aztec codes (already here).
- Sketch: artboard 384 × N px = 1 px per dot (a template file to start from); or mm-sized SVG, read as mm.
- Symbols: Material Symbols (Apache 2.0, ligatures: `home` → glyph, through HarfBuzz) + own SVG shapes folder.
- Fonts: limn plot's fonts store (TTF/OTF + Hershey).
- Images: dither at the printer's dots (Atkinson / Floyd–Steinberg / threshold), gamma for dot gain,
  preview as the paper will look.

## Steps

- [ ] Test strip (needs OK to print): ruler every 1 mm / 10 mm, a dot grid, width marks → dots/mm, D, edges.
- [x] printd (2026-10-17): on the Pi under supervisor (`np_printd`, :8631), page in `web/` (paper, Aligned/Tear/Feed,
  image → dither → print). Not yet printed through it.
- [x] Label app (2026-10-17, `web/app.js`): pages in mm at the paper's real size; drop SVG / image / font / design;
  drag, scale, rotate; an SVG's `<text>`s editable (templates); text, box, line; cable flags (`big | small`
  per line) + *Arrange* (two staggered columns, tails interlocked, overflow → new pages); *as printed* preview;
  store on the Pi (`web/store/{fonts,templates,designs}`). Not yet printed on paper.
- [x] (2026-10-17) Free rotation (knob, 15° steps; `[ ]`), shortcuts (`?` lists them), copy/paste between tabs, a font
  picker (families in their own face, search, the family's weights). Fonts: limn plot's (`limn/.plot-data/fonts`,
  621 unique of 735) copied to `web/store/fonts`; printd indexes them (`/api/fonts`: family, weight, italic,
  PostScript name, from the name/OS/2 tables); loaded when used; a print embeds only the faces on its page.
- [x] (2026-10-17) Material Symbols: 7858 icons × outlined / rounded / sharp, filled or not (`icons.py` packs
  @material-symbols/svg-400 into `web/icons/*.json`, gzipped for printd); an *icon* object, a path, prints crisp.
- [x] (2026-10-17) Layers panel (top first: select, drag to reorder, hide, lock, rename; Ctrl ]/[ one step,
  Ctrl Shift ]/[ to front/back). *Arrange* is a first-fit packer against everything on the page (no overlaps,
  mixed flag sizes); new objects go to the first free spot.
- [x] (2026-10-17) Codes (`web/vendor/bwip-js`, MIT, loaded when first used): QR, Micro QR, Data Matrix (square,
  oblong), Aztec, PDF417, Code 128, Code 39, EAN-13/8, UPC-A, ITF. Modules whole dots, the code on the head's
  dot grid, quarter turns only; border + padding + rounded corners. Rendered as printed and decoded with
  zxing-cpp: all 12 read at 2- and 1-dot modules (1 dot only digitally: dot gain on paper, to try). Logo tag
  (box, Material icon, title, line under). Cable box starts filled in (remembered per browser).
- [x] (2026-10-17) *On black*, per object (checkbox, `N`): a black box (object + margin, corner radius) with the
  object as its mask, so it prints white on black; a code's quiet zone is black too. Decoded from the raster with
  zxing-cpp: QR, Data Matrix (2 and 3-dot modules), Aztec read inverted; Code 128 reads once inverted (zxing's
  try_invert skips 1D; handheld scanners need "reverse video" on). On paper: black spreads, white modules
  shrink → try 3-dot modules. Not printed yet.
- [x] (2026-10-17) Paper `label-50x80` (printd default, selected on the Pi). **Align from any state**: feed until a
  label's leading edge is out past the tear bar, enter how far (mm), *Aligned* (`/api/align?mm=`; a partial label
  works). **Feed out** (`cut`, default 4 mm): the gap's middle that far past the bar, for scissors; after a print
  when *feed out* is ticked (`/api/print?...&out=1`). `fresh` in state: nothing printed since → print here, its top
  (the red band, `lost_mm`) skipped.
- [x] (2026-10-17) Shared canvas: the design lives on the Pi (`doc.json`, `/api/doc` long-poll + versioned PUT, 409 →
  the other screen's wins). Print *all pages* / *this page*; page numbers struck through don't print; the button
  counts labels.
- [x] (2026-10-17) Icons: + Material Design Icons (community), Phosphor (regular/bold/fill), Tabler (outline stroked,
  line width / filled), Simple Icons brands (`icons.py`). Tag icon field takes `mdi:` / `phosphor:` / `tabler:` / `brands:`.
- [x] (2026-10-17) Shapes (ellipse, triangles, diamond, hexagon, star, block arrow, chevron, arrow tag; rounded
  corners), line ends (arrow, open, dot, bar) + *Arrow* (A). Shift click multi-select, Ctrl A, Ctrl G group with a
  frame (box / pill / ellipse, padding, line, dash; on black takes the frame's shape), Ctrl Shift G ungroup.
  Connectors that stay attached (elbows with a small radius, isometric): the user's wishlist for here and limn plot,
  written up in `~/repo/limn/TODO.md` *Connectors* (2026-10-18), not started.
- [x] (2026-10-18) A number on any icon (the user's own tags: the IP's last octet in a box on a node, "96" above a
  NAS): *number*, in a node / box / filled / circle, above / below / left / right / on the corner, size, font.
  *Picks*: network, electrical, 3D printing, medical, household, workshop (239 icons from all packs, `PICKS` in
  `icons.py` → `icons/picks.json`, 44 kB).
- [x] (2026-10-18) Jobs kept on the Pi (`jobs/`, the last 30, a name from the first page): *Recent prints* in the app
  (thumbnails, Reprint) and on the PiTFT.
- [x] (2026-10-18) The PiTFT (mini, 240x135, console 30x17 at 8x8): `tui.py` in the tty1 screen session
  (`pth-tty.service`, restarted if it fails, `q` → zsh): printer / paper / head / last print; Reprint last, Recent
  prints, Feed out, Restart printd, Reboot, Shut down (asked, *No* first). Buttons are gpio-key overlays: the user's button 2
  (GPIO 23) = Up = next, button 1 (GPIO 24) = Enter = ok. Its own screensaver after 2 min (pipes.sh / cmatrix -s), woken by a key or a
  print; `screensaver.py` leaves tui.py alone. Shot: `~/limn-shot/pitft-tui-1.png`.
- [x] (2026-10-18) KiCad: `kicad/` (A5, `python3 kicad/gen.py --force --check`, same rules as limn/docs/kicad; core copied
  from there). The printer as built + planned reverse feed: 2x MAX4624 (SOT23-6, DNP) swap coil A, IN = REV = GPIO26
  (pin 37, below the PiTFT), 10k pull-down, V+ 5 V. Render: `~/limn-shot/kicad-pi_thermal-20261018.png`.
- [ ] Reverse feed: open the printer, find the motor driver and its motor supply. The MAX4624 only fits in the coil if
  VM <= 5 V (COM/NC/NO clamp above V+) and the coil current <= 200 mA (400 mA peak); else switch the driver's
  inputs (IN1/IN2, or DIR). Then `/api/reverse?mm=` in printd (REV high, blank rows, wait, REV low; backlash: over-reverse, 1 mm forward).
  2026-10-18: the user doesn't want the MAX4624 (the sheet still draws it: redraw once chosen). Options, to pick after
  a photo of the printer board (driver chip, motor voltage, how the GD32 drives it):
  - XOR on the driver's inputs: one 74LVC2G86 in the two coil-A input traces (or one 74LVC1G86 on DIR if STEP/DIR),
    REV on the other inputs. Smallest, logic level, motor voltage/current don't matter; needs two trace cuts.
  - DPDT signal relay in coil A (Omron G6K-2F-Y 5V / Panasonic TQ2-5V, latching G6KU / TQ2-L2): AO3400 or 2N7002 from
    GPIO26 + flyback diode. No cuts, any voltage, ~0 ohm; switch only with the motor still. My pick without cuts.
  - H-bridge re-drive of coil A: printer OUT_A1/A2 through dividers -> swap (dual 2:1 mux, or 74LVC2G86: turns coast
    into brake) -> DRV8837 (VM <= 11 V) / DRV8871 (12 V, ILIM resistor) -> coil A. 5-7 parts; not an exact copy if
    the printer's driver chops current. Worth it only if the Pi / an MCU takes over the motor later.
- [x] (2026-10-18) Phones (≤ 860 px; desktop unchanged): two-row header (pages + Print / which, copies, feed out), the
  paper fills the screen (fit on load and on rotate), a tab bar (Edit, Add, Icons, Cables, Layers, Paper, Templates,
  Recent, Designs, Fonts) opens one panel as a sheet under the paper; adding something jumps to Edit. Toolbar: undo,
  redo, fit, dots (as printed), turn 90°, duplicate, delete. Touch: one finger on an object drags it, elsewhere pans
  (a tap deselects), two fingers pinch-zoom; bigger handles on touch screens; 16 px inputs (no iOS zoom).
  Shots: `~/limn-shot/labels-mobile-*.png`. No Shift-click multi-select on touch yet (Layers could do it).
- [x] (2026-10-18) **Real size**: the paper opens at 1:1 (96 px/inch × a per-browser screen scale: *Paper & roll → Screen
  scale*, read a real ruler against the screen's ruler; `1:1` in the header and the phone toolbar). **Rulers** over and left
  of the paper (mm, numbered every 10, the pointer marked on them; *ruler* toggle).
- [x] (2026-10-18) **Wire tags** (W): *wrap* round the wire (π·d × 1.5 turns, Brady's rule; the text along the wire, repeated
  so a row faces you from any side; turn marks) or *heat-shrink insert* (as wide as the tube lies flat, π·d/2, less slack).
  **Pin strips** (P): names over a row of pins, presets Dupont 1×N / 2×N (2.54), JST XH / PH, terminal blocks 5.08 / 3.5,
  DIN breakers 18 mm; *wrap* (front, side, back with the pins last-first as seen from behind, side, glue), *both*, *one*;
  2×N: odd pins front, even back; pin-1 bar, names along the wire or across, folds dashed.
- [x] (2026-10-18) **Markers** (M): ArUco 4×4…7×7 (as _50/_100/_250/_1000), original, MIP 36h12, AprilTag 16h5 / 25h9 /
  36h10 / 36h11 (`markers.py` dumps OpenCV's tables into `web/markers.json`), ChArUco boards (OpenCV's layout: top-left
  black, ids row by row in the white squares), checkerboards; bits whole dots on the head grid, caption, cut line.
  Rasterized as printed and detected with cv2 (ArUco ids, AprilTag, 6×6 #123, ChArUco 24/24 corners, checker 40/40).
  Not printed on paper yet: try 3+ dot bits.
- [x] (2026-10-18) **Repeat (tiles)** in any object's properties: across × down, gaps, *Fill label*, how many (more → next
  pages), `{n}` / `{nnn}` numbering (markers count their id up, the dictionary size raised to hold them), or a list (one line a
  copy: `{v}`, else the main text), dashed cut lines in the gaps. Markers: a series from their id, or id ranges
  (`0-9, 20, 30-38/2`), the ids shown before Make. Covers the `{{field}}` batch below.
- [ ] Hershey line fonts.
- [ ] Pack & cut layout for any objects, not only cables.
- [ ] Drop CUPS for this printer (AirPrint is no longer needed once the app prints).

Decided: the app runs in the browser (templates as SVG, fonts as @font-face incl. Material Symbols, Hershey
as a JSON of strokes, dithering, 384-dot bitmap); the Pi only serves `web/` and prints. No limn/plot import.
Open: the gap (~5 mm, to measure).

## API (2026-10-19)

- [x] `/api/v1`: SVG + Mustache templates (`templates/`), previews, ZPL (HTTP and TCP 9100), MCP server, Home Assistant
  examples. All in [API.md](API.md).
- [x] Test print on the roll (2026-10-19): codes from 2-dot modules, hairlines from 1 dot (faint), text from 2 mm.
- [ ] Labels without the tape (the user thinks theirs aren't see-through; untested): what the sensor says over a label and over a gap (DLE EOT 4), and whether the firmware
  still prints when it sees a gap. If it does: auto-align from the gaps; if not, the tape goes back for labels.
- [x] The PiTFT menu shows the paper sensor (2026-10-19), held prints and a clear.
- [ ] ZPL `^FR` (reverse field) is printed as normal for now; `^A0` is DejaVu Sans Bold condensed: compare with a Zebra.
- [ ] Register the MCP server (`claude mcp add printher ...`) once the user says so.
- [ ] Labels: the strip past the head after a tear costs ZPL labels their top (no way to send `whole` over TCP); the
  reverse feed (kicad/) would fix it.
