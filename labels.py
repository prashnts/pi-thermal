from uuid import uuid4
from ppf.datamatrix import DataMatrix
import fpdf

from aztec_code_generator import AztecCode, SvgFactory

pdf = fpdf.FPDF(format=(58, 80))
pdf.add_page()

for y in range(8):
    for x in range(5):
        dm = DataMatrix(f"it-{uuid4()}")
        ac = AztecCode(f"it-{uuid4()}")
        code = SvgFactory.create_svg(ac.matrix, 3)
        # svg = fpdf.svg.SVGObject(dm.svg())
        svg = fpdf.svg.SVGObject(code.svg_str)
        svg.transform_to_rect_viewport(1, 12, 12)
        svg.draw_to_page(pdf, x * 12, y * 12)

pdf.output('inbox/labels.pdf')