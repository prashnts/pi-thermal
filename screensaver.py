import time
import os
import subprocess
import functools
import random

def screensaver():
    result = subprocess.run(['w'], stdout=subprocess.PIPE)
    stdout = result.stdout.decode()
    for line in stdout.splitlines():
        if ':console' not in line:
            continue
        idle_time = line.split()[4]
        if 's' not in idle_time:
            print("saving screen")
            saver = random.choice(['pipes.sh', 'cmatrix'])
            signs = ['bash /u', 'cmatrix']
            if all(sig not in line for sig in signs):
                subprocess.run(['screen', '-x', 'myTTY1', '-X', 'stuff', f'{saver}^M'])
                print("saved")


if __name__ == "__main__":
    while True:
        screensaver()
        time.sleep(5)
