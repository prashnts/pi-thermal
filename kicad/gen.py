# pi-thermal - generates the label printer's KiCad project: kicad/pi_thermal.kicad_pro, one A5 sheet
#
#   python3 kicad/gen.py [--force] [--check]
#   --check: ERC, the netlist audit (audit.py) and svg/pi_thermal.svg
#
# The printer as built (2026-10-18): a USB-C trigger (12 V) feeds the printer board and the M5 printer's
# DC-DC (5 V for the Pi); the Pi Zero 2 W gets 5 V and USB from pogo pins on its back test pads; the
# Mini PiTFT sits on the header. Planned (dashed, DNP): two MAX4624 swap coil A's wires, for reverse feed.
# Same drawing rules as limn/docs/kicad (kicad_gen/core.py is its copy). Once the schematic is edited
# in KiCad, don't regenerate over it: --force overwrites.
import json
import sys
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from kicad_gen import core                                       # noqa: E402
from kicad_gen.core import Sheet, Q, dump, block, num, font                 # noqa: E402

core.LIB = 'pi_thermal'
PROJECT = 'pi_thermal'
P, B, I, O, PI, PO = 'passive', 'bidirectional', 'input', 'output', 'power_in', 'power_out'

# the Mini PiTFT 1.14" (240x135, ST7789) on the header: 5V on top, GND at the bottom (power symbols there)
TFT = [('2 5V', '5V', PI), ('1 3V3', '3V3', PI), ('15 GPIO22', 'BL', I), ('16 GPIO23', 'BTN 2 Up', O),
       ('18 GPIO24', 'BTN 1 Enter', O), ('19 GPIO10 MOSI', 'MOSI', I), ('22 GPIO25', 'DC', I),
       ('23 GPIO11 SCLK', 'SCLK', I), ('24 GPIO8 CE0', 'CS', I), ('6 GND', 'GND', P)]


def blocks(s):
    trig = s.add_block(*block('USB-C_trigger_12V', 'USB-C PD trigger board, fixed 12 V',
                              left=[('USB-C', P)], right=[('OUT+', PO), ('OUT-', P)], value='USB-C trigger 12 V'))
    dcdc = s.add_block(*block('M5_DC-DC', 'The DC-DC board from the M5 printer: 12 V to 5 V for the Pi',
                              left=[('IN+', PI), ('IN-', P)], right=[('OUT+', PO), ('OUT-', P)], value='M5 printer DC-DC'))
    pogo = s.add_block(*block('Pogo_4', 'Pogo pins in the 3D-printed holder, on the Pi\'s test pads (back)',
                              right=[('5V', P), ('D+', P), ('D-', P), ('GND', P)], value='Pogo (3D print)'))
    pi = s.add_block(*block('Pi_Zero_2_W', 'Raspberry Pi Zero 2 W: printd, the label app, tui.py',
                            left=[('TP 5V', PI), ('TP USB D+', B), ('TP USB D-', B), ('TP GND', P)],
                            right=[(n, PO if n.startswith('1 ') else P if 'GND' in n or n.startswith('2 ') else B)
                                   for n, _, _ in TFT] + [None, None, None, ('37 GPIO26', O)],
                            value='Raspberry Pi Zero 2 W'))
    tft = s.add_block(*block('Mini_PiTFT', 'Adafruit Mini PiTFT 1.14" 240x135 (ST7789, SPI0), two buttons',
                             left=[(n, k) for _, n, k in TFT], value='Adafruit Mini PiTFT 1.14"'))
    prn = s.add_block(*block('Printer_board', 'The M5 printer\'s board (GD32 "micro printer", ESC/POS), its motor driver',
                             left=[('VIN 12V', PI), ('GND', P), ('USB D+', B), ('USB D-', B)],
                             right=[('MOT A1', O), ('MOT A2', O), ('MOT B1', O), ('MOT B2', O)],
                             value='M5 printer board'))
    sw = s.add_block(*block('MAX4624', 'MAX4624 SPDT analog switch, SOT23-6, 1 ohm, 200 mA cont. / 400 mA peak, V+ 1.8-5.5 V',
                            left=[('COM', P, 5), ('IN', I, 1)], right=[('NC', P, 4), ('NO', P, 6)],
                            top=[('V+', PI, 2)], bottom=[('GND', PI, 3)], value='MAX4624'))
    return trig, dcdc, pogo, pi, tft, prn, sw


def move_refs(s, ref, x, y, justify='left'):
    """Reference at (x, y), Value under it."""
    it = [i for i in s.items if i[0] == 'symbol' and any(isinstance(c, list) and c[0] == 'property' and c[2] == ref for c in i)][0]
    for c in it:
        if isinstance(c, list) and c[0] == 'property' and c[1] in ('Reference', 'Value'):
            c[3] = ['at', num(x), num(y + (2.54 if c[1] == 'Value' else 0)), '0']
            c[4] = font(justify=justify)


def refs_left(s, ref):
    """Reference and Value left of a block with top pins (the default puts them above, clear of the pins)."""
    lib_id, x, y, _ = s.refs[ref]
    w, h = s.boxes[lib_id]
    move_refs(s, ref, x - w - 1.27, y - h - 5.08, 'right')


def power_up(s, kind, ref, number):
    """A rail on a side pin, raised: out 2.54 mm, the symbol pointing up (its name clear of the arrow)."""
    pt = s.out(ref, number, 2.54)
    s.wire(s.P(ref, number), pt)
    s.power_at(kind, pt)


def build(s):
    trig, dcdc, pogo, pi, tft, prn, sw = blocks(s)
    s.title_text('PI-THERMAL: the label printer', 12.7, 12.7)

    # supply
    s.place(trig, 'J1', 'USB-C trigger 12 V', 27.94, 33.02)
    power_up(s, '+12V', 'J1', 'OUT+')
    s.power('GND', 'J1', 'OUT-', stub=2.54)
    s.nc('J1', 'USB-C')
    s.place(dcdc, 'U1', 'M5 printer DC-DC', 27.94, 48.26)
    power_up(s, '+12V', 'U1', 'IN+')
    s.power('GND', 'U1', 'IN-', stub=2.54)
    power_up(s, '+5V', 'U1', 'OUT+')
    s.power('GND', 'U1', 'OUT-', stub=2.54)
    s.power_at('GND', (48.26, 54.61), show=False)
    s.wire((48.26, 54.61), (48.26, 52.07))
    s.flag_at((48.26, 52.07))
    s.enclose(12.7, 20.32, 53.34, 57.15, 'Supply')

    # the Pi, the pogo pins, the PiTFT
    s.place(pi, 'U2', 'Raspberry Pi Zero 2 W', 111.76, 38.1)
    py = s.P('U2', 'TP 5V')[1]
    s.place(pogo, 'J2', 'Pogo (3D print)', 66.04, py + s.pins[pogo]['1'][1])
    for a, b in (('5V', 'TP 5V'), ('D+', 'TP USB D+'), ('D-', 'TP USB D-'), ('GND', 'TP GND')):
        pa, pb = s.P('J2', a), s.P('U2', b)
        m = (pa[0] + 3.81, pa[1])
        s.wire(pa, m)
        s.wire(m, pb)
        if a == '5V':
            s.power_at('+5V', m)
        elif a == 'GND':
            s.power_at('GND', m)
        else:
            s.label_at('USB_DP' if a == 'D+' else 'USB_DM', m, 0)

    ty = s.P('U2', '2 5V')[1]
    tx = 172.72
    s.place(tft, 'U3', 'Adafruit Mini PiTFT 1.14"', tx, ty + s.pins[tft]['1'][1])
    for hdr, name, _ in TFT:
        a, b = s.P('U2', hdr), s.P('U3', name)
        if name in ('5V', 'GND'):
            m = (a[0] + 7.62, a[1])
            s.wire(a, m)
            s.wire(m, b)
            s.power_at('+5V' if name == '5V' else 'GND', m)
        else:
            s.wire(a, b)
    s.text('Header 2x12 (pins 1-24), SPI0.\nButtons: gpio-key overlays (tui.py).', 154.94, 50.8)
    s.label('REV', 'U2', '37 GPIO26', stub=5.08)

    # the printer
    s.place(prn, 'U4', 'M5 printer board', 40.64, 80.01)
    power_up(s, '+12V', 'U4', 'VIN 12V')
    s.power('GND', 'U4', 'GND', stub=2.54)
    s.label('USB_DP', 'U4', 'USB D+', stub=2.54)
    s.label('USB_DM', 'U4', 'USB D-', stub=2.54)
    s.text('USB: the custom Mini-B plug, D+/D-\nstraight to the pogo pins.', 17.78, 92.71)
    s.label('OUT_A1', 'U4', 'MOT A1', stub=2.54)
    s.label('OUT_A2', 'U4', 'MOT A2', stub=2.54)
    s.use('Motor', 'Stepper_Motor_bipolar')
    s.place('Motor:Stepper_Motor_bipolar', 'M1', 'Paper feed', 74.93, 86.36)
    move_refs(s, 'M1', 74.93, 95.25)
    s.connect('U4', 'MOT B1', 'M1', '3')
    s.connect('U4', 'MOT B2', 'M1', '4')
    s.label('COIL_A1', 'M1', '1', stub=2.54)
    s.label('COIL_A2', 'M1', '2', stub=2.54)
    s.enclose(12.7, 59.69, 88.9, 102.87, 'The printer (M5)')

    # planned: the coil-A swap
    s.use('Device', 'C')
    for ref, c, x, com, nc, no in (('U5', 'C1', 116.84, 'COIL_A1', 'OUT_A1', 'OUT_A2'),
                                   ('U6', 'C2', 171.45, 'COIL_A2', 'OUT_A2', 'OUT_A1')):
        s.place(sw, ref, 'MAX4624', x, 85.09, dnp=True)
        refs_left(s, ref)
        s.label(com, ref, 'COM', stub=2.54)
        s.label('REV', ref, 'IN', stub=2.54)
        s.label(nc, ref, 'NC', stub=2.54)
        s.label(no, ref, 'NO', stub=2.54)
        s.power('GND', ref, 'GND')
        v, top = s.P(ref, 'V+'), (x, 69.85)
        s.place('Device:C', c, '100n', x + 12.7, 73.66, dnp=True)
        s.wire(v, top)
        s.wire(top, s.P(c, '1'))
        s.power_at('+5V', top)
        s.power('GND', c, '2', show=False)
    s.use('Device', 'R')
    s.place('Device:R', 'R1', '10k', 143.51, 87.63, dnp=True)
    s.label('REV', 'R1', '1')
    s.power('GND', 'R1', '2')
    s.enclose(91.44, 59.69, 198.12, 102.87, 'Planned: reverse feed (DNP)', planned=True)

    s.text('Planned (dashed): REV high = COM to NO on both switches: coil A\n'
           'reversed, so the same blank raster rows feed backwards. R1 keeps\n'
           'it forward while the Pi boots. Switch only with the motor still.\n'
           'MAX4624: 1 ohm, 200 mA cont. / 400 mA peak, COM/NC/NO within\n'
           '0..V+ (5 V). To check first: the driver\'s motor supply <= 5 V and\n'
           'the coil current; if not, the switches go on the driver\'s inputs.\n'
           'Today coil A is wired straight: OUT_A1 = COIL_A1, OUT_A2 = COIL_A2.', 12.7, 105.41)


def main():
    root_uuid = str(uuid.uuid4())
    s = Sheet('Root', 'pi_thermal.kicad_sch', PROJECT, f'/{root_uuid}', 'pi-thermal: the label printer',
              paper='A5', date='2026-10-18', company='pi-thermal')
    s.uuid = root_uuid
    build(s)
    rs = s.sexpr()
    rs.insert(-1, ['sheet_instances', ['path', Q('/'), ['page', Q('1')]]])
    if (HERE / 'pi_thermal.kicad_sch').exists() and '--force' not in sys.argv:
        sys.exit(f'{HERE}/pi_thermal.kicad_sch exists (maybe edited in KiCad): --force to overwrite')
    (HERE / 'pi_thermal.kicad_sch').write_text(dump(rs) + '\n')
    lib = ['kicad_symbol_lib', ['version', '20241209'], ['generator', Q('kicad_symbol_editor')], ['generator_version', Q('9.0')]]
    for lib_id, sym in sorted(s.lib.items()):
        if lib_id.startswith(core.LIB + ':'):
            s2 = list(sym)
            s2[1] = Q(lib_id.split(':')[1])
            lib.append(s2)
    (HERE / 'pi_thermal.kicad_sym').write_text(dump(lib) + '\n')
    (HERE / 'sym-lib-table').write_text('(sym_lib_table\n  (version 7)\n  (lib (name "pi_thermal")(type "KiCad")'
                                        '(uri "${KIPRJMOD}/pi_thermal.kicad_sym")(options "")(descr "pi-thermal boards and modules"))\n)\n')
    (HERE / 'pi_thermal.kicad_pro').write_text(json.dumps({'meta': {'filename': 'pi_thermal.kicad_pro', 'version': 3},
                                                           'sheets': [[root_uuid, 'Root']], 'boards': [],
                                                           'text_variables': {}}, indent=2) + '\n')
    print('wrote pi_thermal.kicad_sch')
    if '--check' in sys.argv:
        check()


def check():
    '''ERC, the netlist audit (shorts ERC can't see) and svg/pi_thermal.svg.'''
    import re
    import shutil
    import subprocess
    import tempfile
    tmp = Path(tempfile.mkdtemp())
    sch = str(HERE / 'pi_thermal.kicad_sch')
    subprocess.run(['kicad-cli', 'sch', 'erc', '--severity-all', '-o', str(tmp / 'erc.rpt'), sch], check=True, capture_output=True)
    rpt = (tmp / 'erc.rpt').read_text()
    print(re.search(r'ERC messages.*', rpt).group(0))
    if '--verbose' in sys.argv:
        print(rpt)
    subprocess.run(['kicad-cli', 'sch', 'export', 'netlist', '--format', 'kicadsexpr', '-o', str(tmp / 'pt.net'), sch],
                   check=True, capture_output=True)
    subprocess.run([sys.executable, str(HERE / 'audit.py'), str(tmp / 'pt.net')])
    shutil.copy(tmp / 'pt.net', HERE / 'svg.net') if '--net' in sys.argv else None
    svg = HERE / 'svg'
    shutil.rmtree(svg, ignore_errors=True)
    subprocess.run(['kicad-cli', 'sch', 'export', 'svg', '-n', '-o', str(svg), sch], check=True, capture_output=True)
    print('svg:', ', '.join(sorted(p.name for p in svg.glob('*.svg'))))


if __name__ == '__main__':
    main()
