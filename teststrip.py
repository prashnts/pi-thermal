# Test strip: rulers, edges and density, drawn dot for dot (8 dots/mm), as raw ESC/POS.
#   uv run teststrip.py > strip.bin && lp -d printherm -o raw strip.bin
# Measure: the 10 mm marks across and along (scale), which border dots show (edges), and, before tearing,
# the END line to the tear bar: head to tear bar = FEED_MM - that.
import sys

import numpy as np

W, DPMM = 384, 8
H = 45 * DPMM
FEED_MM = 20

DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
          '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111']


def text(img, x, y, s, k=2):
    for c in s:
        if c.isdigit():
            g = np.array([int(b) for b in DIGITS[int(c)]], bool).reshape(5, 3)
            img[y:y + 5 * k, x:x + 3 * k] |= np.kron(g, np.ones((k, k), bool))
        x += 4 * k


img = np.zeros((H, W), bool)
img[0, :] = img[-1, :] = img[:, 0] = img[:, -1] = True        # border on the outermost dots

for mm in range(W // DPMM + 1):                                 # across: ticks every mm
    x = min(mm * DPMM, W - 1)
    n = 24 if mm % 10 == 0 else 14 if mm % 5 == 0 else 8
    img[1:1 + n, x] = True
    if mm % 10 == 0 and mm:
        text(img, x - 10, 28, str(mm))
for mm in range(H // DPMM + 1):                                 # along: ticks every mm
    y = min(mm * DPMM, H - 1)
    n = 24 if mm % 10 == 0 else 14 if mm % 5 == 0 else 8
    img[y, 1:1 + n] = True
    if mm % 10 == 0 and mm:
        text(img, 28, y - 4, str(mm))

img[80:160, 80:160] = True                                      # 10 x 10 mm square
img[80:160, 176:256] = (np.indices((80, 80)).sum(0) % 2) == 0   # 1-dot checker
img[80:160, 272:352] = ((np.indices((80, 80)) // 2).sum(0) % 2) == 0   # 2-dot checker
img[192:272, 80:160] = (np.indices((80, 80)) % 4 == 0).all(0)   # dot grid, 4 apart
for i, w in enumerate((1, 2, 3, 4)):                            # line widths, 1..4 dots
    x = 176 + i * 40
    img[192:272, x:x + w] = True
img[H - 16:H - 1, 8:W - 8] = True                               # END bar: the last thing printed

out = bytearray(b'\x1b@')                                      # ESC @
for y0 in range(0, H, 128):                                     # GS v 0 in bands
    band = img[y0:y0 + 128]
    out += b'\x1dv0\x00' + bytes([W // 8, 0, len(band) & 255, len(band) >> 8])
    out += np.packbits(band, axis=1).tobytes()
feed = FEED_MM * DPMM
while feed:
    n = min(feed, 255)
    out += b'\x1bJ' + bytes([n])                                # ESC J n: feed n dots
    feed -= n
sys.stdout.buffer.write(out)
