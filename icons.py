# Icon packs for the label app, from npm, one JSON per pack {name: path d, or SVG markup when it takes more than one
# path}, with a .gz beside each for printd to send, and each pack's licence. The viewBox and how a pack is drawn
# (filled, or stroked like Tabler's outline) are in web/app.js (ICONSETS).
#   python3 icons.py                     → web/icons/*.json(.gz), LICENSE-*
#
#   Material Symbols        @material-symbols/svg-400   Apache 2.0   outlined / rounded / sharp (+ -fill), 0 -960 960 960
#   Material Design Icons   @mdi/svg                    Apache 2.0   the community set, 0 0 24 24
#   Phosphor                @phosphor-icons/core        MIT          regular / bold / fill, 0 0 256 256
#   Tabler                  @tabler/icons               MIT          outline (stroked) / filled, 0 0 24 24
#   Simple Icons            simple-icons                CC0          brand logos, 0 0 24 24
#   Picks                   PICKS below, from the packs: picks.json {"categories": {name: [ref]}, "icons": {ref: drawing}}
import gzip
import io
import json
import re
import tarfile
import urllib.request
from pathlib import Path

PKGS = {      # package: version, {pack: folder in the tarball}, licence file
    '@material-symbols/svg-400': ('0.48.0', {'outlined': 'outlined', 'rounded': 'rounded', 'sharp': 'sharp'}, 'LICENSE'),
    '@mdi/svg': ('7.4.47', {'mdi': 'svg'}, 'LICENSE'),
    '@phosphor-icons/core': ('2.1.1', {'phosphor-regular': 'assets/regular', 'phosphor-bold': 'assets/bold',
                                       'phosphor-fill': 'assets/fill'}, 'LICENSE'),
    '@tabler/icons': ('3.49.0', {'tabler-outline': 'icons/outline', 'tabler-filled': 'icons/filled'}, 'LICENSE'),
    'simple-icons': ('16.35.0', {'brands': 'icons'}, 'LICENSE.md'),
}
PICKS = {      # the Picks set: categories of icons from the packs above, 'pack:name' (Material: outlined, Tabler: outline)
    'network': '''
        material:router material:lan material:dns material:hub material:wifi material:settings_ethernet
        material:cable material:storage material:cloud material:public material:vpn_lock material:nest_wifi_router
        material:device_hub material:cell_tower material:satellite_alt mdi:switch mdi:ethernet mdi:ethernet-cable
        mdi:server-network mdi:server mdi:nas mdi:access-point mdi:access-point-network mdi:router-wireless
        mdi:lan-connect mdi:ip-network mdi:wan mdi:usb mdi:usb-port mdi:raspberry-pi mdi:space-invaders mdi:harddisk
        mdi:sd mdi:sim mdi:antenna mdi:serial-port mdi:hdmi-port tabler:network tabler:topology-star-3
        tabler:server-2 brands:raspberrypi brands:ubiquiti brands:synology brands:proxmox brands:mikrotik
        brands:tplink brands:homeassistant brands:openwrt''',
    'electrical': '''
        material:bolt material:electrical_services material:power material:power_settings_new material:battery_full
        material:outlet material:electric_meter material:solar_power material:energy_savings_leaf mdi:power-plug
        mdi:power-socket-eu mdi:power-socket-de mdi:flash mdi:lightning-bolt mdi:fuse mdi:resistor mdi:led-on
        mdi:current-ac mdi:current-dc mdi:sine-wave mdi:battery mdi:car-battery mdi:solar-panel
        mdi:transmission-tower mdi:electric-switch mdi:meter-electric mdi:soldering-iron mdi:chip
        mdi:integrated-circuit-chip mdi:led-strip-variant tabler:plug tabler:bolt tabler:battery-charging
        tabler:circuit-resistor tabler:circuit-capacitor tabler:circuit-diode tabler:circuit-ground
        tabler:circuit-switch-open tabler:circuit-ammeter tabler:circuit-voltmeter tabler:circuit-cell
        tabler:circuit-motor''',
    '3d printing': '''
        mdi:printer-3d mdi:printer-3d-nozzle mdi:printer-3d-nozzle-outline mdi:printer-3d-nozzle-heat
        mdi:printer-3d-nozzle-alert mdi:printer-3d-off material:view_in_ar material:deployed_code
        material:precision_manufacturing material:build material:handyman material:straighten material:thermostat
        material:mode_fan material:layers mdi:cube-outline mdi:rotate-3d-variant mdi:screw-flat-top
        mdi:screw-machine-flat-top mdi:nut mdi:hexagon-outline mdi:thermometer mdi:fan mdi:axis-arrow mdi:ruler
        mdi:printer-3d-nozzle-heat-outline mdi:engine tabler:cube tabler:ruler-measure tabler:tool tabler:hammer
        tabler:temperature tabler:printer brands:octoprint brands:bambulab''',
    'medical': '''
        material:medication material:pill material:vaccines material:medical_services material:emergency
        material:healing material:health_and_safety material:thermometer material:monitor_heart
        material:prescriptions material:local_hospital material:bloodtype material:sanitizer
        material:medication_liquid material:dentistry material:allergy mdi:pill mdi:bandage mdi:needle
        mdi:medical-bag mdi:hospital-box mdi:stethoscope mdi:thermometer mdi:heart-pulse mdi:tooth mdi:eye
        mdi:allergy mdi:pill-multiple mdi:emoticon-sick mdi:bottle-tonic-plus mdi:water-plus tabler:pill
        tabler:first-aid-kit tabler:vaccine tabler:stethoscope tabler:medicine-syrup''',
    'household': '''
        material:kitchen material:blender material:coffee_maker material:microwave material:local_laundry_service
        material:iron material:bed material:chair material:light material:lightbulb material:faucet material:shower
        material:bathtub material:cleaning_services material:delete material:recycling material:key
        material:door_front material:garage material:yard material:local_florist material:pets material:toys
        material:checkroom material:inventory_2 material:package_2 material:ac_unit material:heat
        material:calendar_month material:park material:nature mdi:washing-machine mdi:dishwasher mdi:fridge mdi:stove
        mdi:toaster mdi:vacuum mdi:broom mdi:spray-bottle mdi:lamp mdi:sofa mdi:key mdi:door mdi:flower mdi:cat
        mdi:dog mdi:food-apple mdi:silverware-fork-knife mdi:tree mdi:pine-tree mdi:floppy mdi:calendar
        tabler:tools-kitchen-2 tabler:bottle tabler:plant-2''',
    'workshop': '''
        mdi:toolbox mdi:screwdriver mdi:wrench mdi:saw-blade mdi:hammer mdi:tape-measure mdi:package-variant
        mdi:archive mdi:file-cabinet mdi:tag mdi:pliers mdi:hand-saw mdi:magnet mdi:tape-drive material:construction
        material:carpenter material:hardware material:plumbing material:inventory material:category tabler:box
        tabler:cut tabler:needle-thread tabler:paperclip''',
}
out = Path(__file__).resolve().parent / 'web' / 'icons'
out.mkdir(parents=True, exist_ok=True)
SUFFIX = {'phosphor-bold': '-bold', 'phosphor-fill': '-fill'}    # Phosphor names its files heart-bold.svg


def shapes(body):
    '''the drawing of one icon: its paths (and circles, lines ...), minus Tabler's invisible 24x24 frame'''
    els = re.findall(r'<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*?)/?>', body, re.S)
    keep = []
    for tag, attrs in els:
        attrs = ' '.join(attrs.split())
        if 'stroke="none"' in attrs and 'fill="none"' in attrs:
            continue
        keep.append((tag, attrs))
    if len(keep) == 1 and keep[0][0] == 'path':
        d = re.search(r'\bd="([^"]+)"', keep[0][1])
        if d and len(re.findall(r'\w+=', keep[0][1])) == 1:
            return d.group(1)
    return ''.join('<%s %s/>' % (t, a.rstrip('/ ')) for t, a in keep)


PICK_FROM = {'material': 'outlined', 'mdi': 'mdi', 'tabler': 'tabler-outline', 'phosphor': 'phosphor-regular', 'brands': 'brands'}
everything = {}
for pkg, (ver, packs, lic) in PKGS.items():
    url = 'https://registry.npmjs.org/%s/-/%s-%s.tgz' % (pkg, pkg.split('/')[-1], ver)
    got = {p: {} for p in packs}
    with tarfile.open(fileobj=io.BytesIO(urllib.request.urlopen(url).read())) as t:
        for m in t.getmembers():
            if m.name == 'package/' + lic:
                (out / ('LICENSE-' + pkg.strip('@').replace('/', '-'))).write_bytes(t.extractfile(m).read())
            if not m.name.endswith('.svg'):
                continue
            folder, name = m.name[len('package/'):].rsplit('/', 1)
            for p, f in packs.items():
                if folder == f:
                    n = name[:-4]
                    if p in SUFFIX and n.endswith(SUFFIX[p]):
                        n = n[:-len(SUFFIX[p])]
                    got[p][n] = shapes(t.extractfile(m).read().decode())
    for p, icons in got.items():
        data = json.dumps(dict(sorted(icons.items())), separators=(',', ':')).encode()
        (out / (p + '.json')).write_bytes(data)
        (out / (p + '.json.gz')).write_bytes(gzip.compress(data, 9))
        print('%-18s %5d  %4d kB gz' % (p, len(icons), len(gzip.compress(data, 9)) >> 10))
        everything[p] = icons
cats, drawn = {}, {}
for cat, refs in PICKS.items():
    cats[cat] = []
    for ref in refs.split():
        pack, name = ref.split(':', 1)
        d = everything[PICK_FROM[pack]].get(name)
        if d is None:
            print('picks: no %s' % ref)
            continue
        cats[cat].append(ref)
        drawn[ref] = d
data = json.dumps({'categories': cats, 'icons': drawn}, separators=(',', ':')).encode()
(out / 'picks.json').write_bytes(data)
(out / 'picks.json.gz').write_bytes(gzip.compress(data, 9))
print('picks', len(drawn), '%d kB gz' % (len(gzip.compress(data, 9)) >> 10))
