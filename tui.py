# The printer's little screen (Adafruit mini PiTFT, 240x135, the console at 8x8: 30 x 17): the printer's state, the
# last prints to print again, feed out, restart printd, reboot, shut down. Python 3.9 stdlib, talks to printd.
# At the top a block in big letters says the state: READY (green), NO PAPER (red), N WAITING (yellow: prints held
# for paper, Clear waiting in the menu), OFFLINE. The console font is the kernel's VGA8x8 (fbcon=font:VGA8x8, the PC
# character set only: no heavy box lines or quadrants, so no toilet fonts): the letters are drawn here, 5 dots high,
# a dot a cell in full blocks (half blocks, two dots a cell, blurred P into F at this size).
#   python3 tui.py [--url http://127.0.0.1:8631] [--idle 120]
#
# The two buttons are gpio-key overlays (config.txt): button 2, GPIO 23 = Up, button 1, GPIO 24 = Enter (the user's
# numbering, 2026-10-18). 2 goes to the next item, 1 picks it. Arrows, j/k, Enter work on a keyboard too; q quits (to the shell).
# Idle for --idle seconds: a screensaver (pipes.sh / cmatrix -s, as screensaver.py has them), until a key or a print.
import argparse
import curses
import json
import os
import random
import subprocess
import time
import urllib.request

ap = argparse.ArgumentParser()
ap.add_argument('--url', default='http://127.0.0.1:8631')
ap.add_argument('--idle', type=float, default=120)
A = ap.parse_args()
SAVERS = [['pipes.sh'], ['cmatrix', '-s', '-b']]
os.environ.setdefault('ESCDELAY', '25')
NEXT, PREV, OK = 'next', 'prev', 'ok'

# big letters: 5 rows of dots each ('#' ink), a dot a cell
GLYPHS = {
    'A': ['.#.', '#.#', '###', '#.#', '#.#'], 'B': ['##.', '#.#', '##.', '#.#', '##.'], 'C': ['.##', '#..', '#..', '#..', '.##'],
    'D': ['##.', '#.#', '#.#', '#.#', '##.'], 'E': ['###', '#..', '##.', '#..', '###'], 'F': ['###', '#..', '##.', '#..', '#..'],
    'G': ['.##', '#..', '#.#', '#.#', '.##'], 'H': ['#.#', '#.#', '###', '#.#', '#.#'], 'I': ['#', '#', '#', '#', '#'],
    'J': ['..#', '..#', '..#', '#.#', '.#.'], 'K': ['#.#', '#.#', '##.', '#.#', '#.#'], 'L': ['#..', '#..', '#..', '#..', '###'],
    'M': ['#.#', '###', '###', '#.#', '#.#'], 'N': ['##.', '#.#', '#.#', '#.#', '#.#'], 'O': ['.#.', '#.#', '#.#', '#.#', '.#.'],
    'P': ['##.', '#.#', '##.', '#..', '#..'], 'Q': ['.#.', '#.#', '#.#', '##.', '.##'], 'R': ['##.', '#.#', '##.', '#.#', '#.#'],
    'S': ['.##', '#..', '.#.', '..#', '##.'], 'T': ['###', '.#.', '.#.', '.#.', '.#.'], 'U': ['#.#', '#.#', '#.#', '#.#', '###'],
    'V': ['#.#', '#.#', '#.#', '#.#', '.#.'], 'W': ['#.#', '#.#', '###', '###', '#.#'], 'X': ['#.#', '#.#', '.#.', '#.#', '#.#'],
    'Y': ['#.#', '#.#', '.#.', '.#.', '.#.'], 'Z': ['###', '..#', '.#.', '#..', '###'],
    '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'],
    '3': ['##.', '..#', '.#.', '..#', '##.'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'],
    '6': ['.##', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'],
    '9': ['###', '#.#', '###', '..#', '##.'], ' ': ['..', '..', '..', '..', '..'], '!': ['#', '#', '#', '.', '#'], '?': ['##.', '..#', '.#.', '...', '.#.'],
}


def big(text):
    '''text in big letters: 5 lines, a column between letters (none next to a space: it is one)'''
    rows, prev = ['', '', '', '', ''], None
    for ch in text.upper():
        g = GLYPHS.get(ch, GLYPHS['?'])
        gap = '.' if prev not in (None, ' ') and ch != ' ' else ''
        for r in range(5):
            rows[r] += gap + g[r]
        prev = ch
    return [r.replace('#', '█').replace('.', ' ') for r in rows]


def fits(w, *texts):
    '''the first that's at most w wide in big letters'''
    for t in texts:
        if len(big(t)[0]) <= w:
            return t
    return texts[-1]


def api(path, post=False):
    req = urllib.request.Request(A.url + path, data=b'' if post else None, method='POST' if post else 'GET')
    with urllib.request.urlopen(req, timeout=60 if post else 3) as r:
        return json.loads(r.read())


def ip():
    try:
        return subprocess.run(['hostname', '-I'], capture_output=True, text=True, timeout=2).stdout.split()[0]
    except (OSError, IndexError, subprocess.SubprocessError):
        return '-'


def ago(t):
    s = time.time() - t
    return 'just now' if s < 90 else '%d min ago' % (s / 60) if s < 5400 else '%d h ago' % (s / 3600) if s < 129600 else '%d d ago' % (s / 86400)


class UI:
    def __init__(self, scr):
        self.scr, self.st, self.err, self.msg, self.msg_t = scr, None, None, '', 0
        self.screen, self.cur, self.jobs, self.ask = 'home', 0, [], None
        self.touched, self.polled, self.addr = time.time(), 0, ip()
        curses.curs_set(0)
        curses.start_color()
        curses.use_default_colors()
        for i, c in enumerate((curses.COLOR_GREEN, curses.COLOR_RED, curses.COLOR_YELLOW, curses.COLOR_CYAN), 1):
            curses.init_pair(i, c, -1)
        for i, (fg, bg) in enumerate(((curses.COLOR_BLACK, curses.COLOR_GREEN), (curses.COLOR_WHITE, curses.COLOR_RED),
                                      (curses.COLOR_BLACK, curses.COLOR_YELLOW), (curses.COLOR_WHITE, curses.COLOR_BLUE)), 5):
            curses.init_pair(i, fg, bg)      # the state block: ready, no paper, waiting, offline
        scr.timeout(500)
        scr.keypad(True)

    def poll(self):
        try:
            self.st, self.err = api('/api/status'), None
        except Exception as e:      # printd down, restarting
            self.st, self.err = None, str(getattr(e, 'reason', e))[:40]
        self.polled = time.time()

    def say(self, m):
        self.msg, self.msg_t = m, time.time()

    # ---- what each screen offers: (label, action)

    def items(self):
        if self.ask:
            return [('No', self.back), ('Yes, ' + self.ask[0], self.ask[1])]
        if self.screen == 'jobs':
            return [('%-17.17s %s' % (j['name'] or 'label', ago(j['time'])[:8]), lambda j=j: self.confirm('print ' + (j['name'] or 'label')[:19], lambda: self.reprint(j)))
                    for j in self.jobs[:9]] + [('< back', self.home)]
        last = self.st and self.st.get('last')
        out = [('Reprint last', lambda: self.reprint(last))] if last else []
        n = self.waiting()
        if n:
            out.insert(0, ('Clear waiting (%d)' % n, lambda: self.confirm('clear %d waiting' % n, self.clear)))
        return out + [('Recent prints', self.recent), ('Feed out', self.feed_out),
                      ('Restart printd', lambda: self.confirm('restart', lambda: self.run(['sudo', '-n', 'supervisorctl', 'restart', 'np_printd'], 'printd restarted'))),
                      ('Reboot', lambda: self.confirm('reboot', lambda: self.run(['sudo', '-n', 'reboot'], 'rebooting'))),
                      ('Shut down', lambda: self.confirm('shut down', lambda: self.run(['sudo', '-n', 'shutdown', '-h', 'now'], 'shutting down')))]

    def confirm(self, what, fn):
        self.ask, self.cur = (what, fn), 0       # "No" first: a stray 1 does nothing

    def back(self):
        self.ask, self.cur = None, 0

    def home(self):
        self.screen, self.cur, self.ask = 'home', 0, None

    def recent(self):
        try:
            self.jobs = api('/api/jobs')['jobs']
            self.screen, self.cur = 'jobs', 0
        except Exception as e:
            self.say('printd: %s' % e)

    def reprint(self, j):
        self.ask = None
        self.say('printing ...')
        self.draw()
        try:
            r = api('/api/reprint?id=%s' % j['id'], post=True)
            self.say(r.get('note') or 'printed: %s' % (j['name'] or 'label')[:18])
            self.st = r
        except Exception as e:
            self.say('failed: %s' % e)
        self.home()

    def waiting(self):
        st = self.st or {}
        return len(st.get('pending') or []) + (st.get('cups_jobs') or 0)

    def state(self):
        '''(big words, a line under them, colour pair) for the block'''
        st, w = self.st, self.scr.getmaxyx()[1]
        if not st:
            return 'OFFLINE', 'printd does not answer', 8
        n = self.waiting()
        out = st.get('sensor') == 'out'
        if n:
            return fits(w, '%d WAITING' % n, '%d WAIT' % n, 'WAIT %d' % n), ('load paper to print them' if out else 'printing ...')[:w], 7
        if not st.get('usb', True):
            return 'NO USB', 'the printer is not plugged in', 6
        if out:
            p = st['paper'][st['selected']]
            return 'NO PAPER', 'load the %s' % ('labels' if p['mode'] == 'labels' else 'roll'), 6
        return 'READY', 'paper in' if st.get('sensor') == 'ok' else '', 5

    def clear(self):
        self.ask = None
        try:
            r = api('/api/pending/clear', post=True)
            self.say(r.get('note') or 'cleared')
            self.st = r
        except Exception as e:
            self.say('failed: %s' % e)
        self.home()

    def feed_out(self):
        try:
            r = api('/api/tear', post=True)
            self.say('fed %.0f mm' % r.get('fed_mm', 0))
            self.st = r
        except Exception as e:
            self.say('failed: %s' % e)

    def run(self, cmd, m):
        self.ask = None
        self.say(m)
        self.draw()
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode:
            self.say(('failed: ' + (r.stderr or r.stdout)).strip()[:58])
        self.home()

    # ---- drawing

    def put(self, y, x, s, a=0):
        h, w = self.scr.getmaxyx()
        if 0 <= y < h and x < w:
            try:
                self.scr.addstr(y, x, s[:w - x], a)
            except curses.error:      # the bottom right cell
                pass

    def draw(self):
        s, w = self.scr, self.scr.getmaxyx()[1]
        view = (self.screen, bool(self.ask), bool(self.st))
        if view != getattr(self, 'view', None):      # another screen: paint it all again, no leftovers
            s.clear()
            self.view = view
        else:
            s.erase()
        self.put(0, 0, (' LABELS' + time.strftime('%H:%M ').rjust(w - 7)).ljust(w), curses.A_REVERSE)
        y = 1
        st = self.st
        if self.screen == 'home' and not self.ask:       # the state, big: a coloured block
            words, under, pair = self.state()
            a = curses.color_pair(pair)
            lines = big(words)
            pad = max(0, (w - len(lines[0])) // 2)
            for k, ln in enumerate(lines):      # white letters bright (bold) on red and blue
                self.put(y + k, 0, (' ' * pad + ln).ljust(w), a | (curses.A_BOLD if pair in (6, 8) else 0))
            self.put(y + 5, 0, under.center(w), a | (curses.A_BOLD if pair in (6, 8) else 0))
            y += 6
        if not st:
            pass
        elif self.screen == 'home' and not self.ask:
            p = st['paper'][st['selected']]
            self.put(y, 1, 'paper', curses.A_DIM)
            self.put(y, 9, '%gx%g gap %g' % (p['width'], p['length'], p['gap']) if p['mode'] == 'labels' else 'roll %g mm' % p['width'])
            y += 1
            if p['mode'] == 'labels':
                self.put(y, 1, 'head', curses.A_DIM)
                if st['pos_mm'] is None:
                    self.put(y, 9, 'not aligned', curses.color_pair(3))
                else:
                    self.put(y, 9, '%.1f mm%s' % (st['pos_mm'], ', fresh' if st.get('fresh') else ''))
                y += 1
            last = st.get('last')
            if last:        # one line: the name, when
                when = ago(last['time']).replace(' ago', '')
                self.put(y, 1, 'last', curses.A_DIM)
                self.put(y, 9, (last['name'] or 'label')[:w - 11 - len(when)])
                self.put(y, w - len(when), when, curses.A_DIM)
                y += 1
        elif self.ask:
            self.put(y + 1, 1, (self.ask[0].capitalize() + '?'), curses.A_BOLD)
            y += 3
        else:
            self.put(y, 1, 'Recent prints', curses.A_BOLD)
            y += 1
        self.put(y, 0, '─' * w, curses.A_DIM)
        y += 1
        its = self.items()
        self.cur %= len(its)
        h = s.getmaxyx()[0]
        room = h - 2 - y
        top = max(0, min(self.cur - room + 1, len(its) - room))
        for i, (label, _) in enumerate(its[top:top + room], top):
            on = i == self.cur
            self.put(y, 0, ('► ' if on else '  ') + label.ljust(w - 2), (curses.A_REVERSE if on else 0) | (curses.color_pair(2) if label.startswith('Yes') else 0))
            y += 1
        msg = self.msg if time.time() - self.msg_t < 6 else ''
        self.put(h - 1, 0, (msg or '1 ok  2 next').ljust(w - len(self.addr) - 1)[:w - len(self.addr) - 1], curses.color_pair(4) if msg else curses.A_DIM)
        self.put(h - 1, w - len(self.addr), self.addr, curses.A_DIM)
        s.refresh()

    # ---- the screensaver: the console handed to it until a key (it exits on one) or a print

    def save_screen(self):
        last = self.st and self.st.get('last') and self.st['last']['time']
        curses.endwin()
        try:
            p = subprocess.Popen(random.choice(SAVERS))
        except OSError:
            self.touched = time.time()
            return
        while p.poll() is None:
            time.sleep(2)
            try:
                st = api('/api/status')
                if st.get('last') and st['last']['time'] != last:       # a print: show it
                    p.terminate()
                if st.get('sensor') == 'out' or st.get('pending') or st.get('cups_jobs'):     # no paper, or prints waiting: show it
                    p.terminate()
            except Exception:
                pass
        try:
            p.wait(3)
        except subprocess.TimeoutExpired:
            p.kill()
        self.scr.clear()
        curses.flushinp()       # the rest of the key that woke it
        self.touched = time.time()
        self.home()
        self.poll()

    def key(self):
        '''a key, arrows read by hand: the console in screen sends ESC [ A or ESC O A, curses knows only one'''
        k = self.scr.getch()
        if k == 27:
            self.scr.timeout(60)
            a, b = self.scr.getch(), self.scr.getch()
            self.scr.timeout(500)
            if a in (ord('['), ord('O')) and b in (ord('A'), ord('B')):
                return NEXT                      # button 2 (Up), or a keyboard's down
            return 'esc'
        if k in (curses.KEY_UP, curses.KEY_DOWN, ord('j'), ord(' '), 9):
            return NEXT
        if k == ord('k'):
            return PREV
        if k in (10, 13, curses.KEY_ENTER):
            return OK                            # button 1 (Enter)
        return k

    def loop(self):
        self.poll()
        while True:
            if time.time() - self.polled > 2:
                self.poll()
            self.draw()
            k = self.key()
            if k == -1:
                if time.time() - self.touched > A.idle and self.state()[2] == 5:      # only when all is well
                    self.save_screen()
                continue
            self.touched = time.time()
            if k in (ord('q'), ord('Q')):
                return
            its = self.items()
            if k == NEXT:
                self.cur = (self.cur + 1) % len(its)
            elif k == PREV:
                self.cur = (self.cur - 1) % len(its)
            elif k == OK:
                its[self.cur % len(its)][1]()
            elif k == 'esc':
                self.home()


if __name__ == '__main__':
    curses.wrapper(lambda scr: UI(scr).loop())
