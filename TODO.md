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
- [x] Built 2026-10-17..19 (details in CHANGELOG.md, API.md, the code; many not yet printed on paper): printd, Label app, Free rotation, Material Symbols, Layers panel, Codes, On black*, per object, Paper `label-50x80`, Shared canvas, Icons, Shapes, A number on any icon, Jobs kept on the Pi, The PiTFT, KiCad, Phones, Real size, Wire tags, Markers, Repeat (tiles), `/api/v1`, Test print on the roll, The PiTFT menu shows the paper sensor.
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
- [ ] Hershey line fonts.
- [ ] Pack & cut layout for any objects, not only cables.
- [ ] Drop CUPS for this printer (AirPrint is no longer needed once the app prints).

Decided: the app runs in the browser (templates as SVG, fonts as @font-face incl. Material Symbols, Hershey
as a JSON of strokes, dithering, 384-dot bitmap); the Pi only serves `web/` and prints. No limn/plot import.
Open: the gap (~5 mm, to measure).

## API (2026-10-19)

- [ ] Labels without the tape (the user thinks theirs aren't see-through; untested): what the sensor says over a label and over a gap (DLE EOT 4), and whether the firmware
  still prints when it sees a gap. If it does: auto-align from the gaps; if not, the tape goes back for labels.
- [ ] ZPL `^FR` (reverse field) is printed as normal for now; `^A0` is DejaVu Sans Bold condensed: compare with a Zebra.
- [ ] Register the MCP server (`claude mcp add printher ...`) once the user says so.
- [ ] Labels: the strip past the head after a tear costs ZPL labels their top (no way to send `whole` over TCP); the
  reverse feed (kicad/) would fix it.
