# The fiducial dictionaries (ArUco, AprilTag) for the label app: web/markers.json (+ .gz for printd).
# From OpenCV's own tables, so a printed marker is what cv2.aruco detects. Run with the limn venv (OpenCV 5):
#   ~/repo/limn/.venv/bin/python markers.py
# Each marker: its inner bits (n x n, row by row, 1 = black) as hex; the black border is added by the app.
# DICT_4X4_50/100/250 are the first ids of DICT_4X4_1000 (checked): one list per family, the app limits the ids.
import gzip
import json
from pathlib import Path

import cv2
import numpy as np

A = cv2.aruco
DICTS = {      # key: (OpenCV dict, name, sizes offered)
    'aruco4': ('DICT_4X4_1000', 'ArUco 4×4', [50, 100, 250, 1000]),
    'aruco5': ('DICT_5X5_1000', 'ArUco 5×5', [50, 100, 250, 1000]),
    'aruco6': ('DICT_6X6_1000', 'ArUco 6×6', [50, 100, 250, 1000]),
    'aruco7': ('DICT_7X7_1000', 'ArUco 7×7', [50, 100, 250, 1000]),
    'original': ('DICT_ARUCO_ORIGINAL', 'ArUco original', [1024]),
    'mip36h12': ('DICT_ARUCO_MIP_36h12', 'ArUco MIP 36h12', [250]),
    'tag16h5': ('DICT_APRILTAG_16h5', 'AprilTag 16h5', [30]),
    'tag25h9': ('DICT_APRILTAG_25h9', 'AprilTag 25h9', [35]),
    'tag36h10': ('DICT_APRILTAG_36h10', 'AprilTag 36h10', [2320]),
    'tag36h11': ('DICT_APRILTAG_36h11', 'AprilTag 36h11', [587]),
}


def bits(d, i):
    n = d.markerSize
    im = A.generateImageMarker(d, i, n + 2, borderBits=1)[1:-1, 1:-1]
    b = ''.join('1' if v < 128 else '0' for v in im.flatten())
    return '%0*x' % ((n * n + 3) // 4, int(b, 2))


out = {}
for k, (cv, name, sizes) in DICTS.items():
    d = A.getPredefinedDictionary(getattr(A, cv))
    out[k] = {'name': name, 'cv': cv, 'n': d.markerSize, 'sizes': sizes,
              'codes': [bits(d, i) for i in range(d.bytesList.shape[0])]}
    print(k, d.markerSize, len(out[k]['codes']))
p = Path(__file__).parent / 'web' / 'markers.json'
s = json.dumps(out, separators=(',', ':'))
p.write_text(s)
p.with_suffix('.json.gz').write_bytes(gzip.compress(s.encode(), 9))
print(p, len(s))
