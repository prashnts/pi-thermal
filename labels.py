from uuid import uuid4
from ppf.datamatrix import DataMatrix
import fpdf

pdf = fpdf.FPDF(format=(50, 80))
pdf.add_page()

for y in range(8):
    for x in range(5):
        dm = DataMatrix(f"it-{uuid4()}")
        svg = fpdf.svg.SVGObject(dm.svg())
        svg.transform_to_rect_viewport(1, 8, 8)
        svg.draw_to_page(pdf, x * 10, y * 10)

pdf.output('inbox/labels.pdf')