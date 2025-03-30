import time
import os
import subprocess
import functools

def screensaver():
    result = subprocess.run(['w'], stdout=subprocess.PIPE)
    stdout = result.stdout.decode()
    for line in stdout.splitlines():
        if ':console' not in line:
            continue
        if 's' not in line.split()[4]:
            print("saving screen")
            if 'bash /u' not in line:
                subprocess.run(['screen', '-x', 'myTTY1', '-X', 'stuff', 'pipes.sh^M'])
                print("saved")


if __name__ == "__main__":
    while True:
        screensaver()
        time.sleep(5)
