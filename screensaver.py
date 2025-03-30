import time
import os
import subprocess
import functools
from threading import Timer

def debounce(timeout: float):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            wrapper.func.cancel()
            wrapper.func = Timer(timeout, func, args, kwargs)
            wrapper.func.start()
        
        wrapper.func = Timer(timeout, lambda: None)
        return wrapper
    return decorator


@debounce(5)
def screensaver():
    result = subprocess.run(['w'], stdout=subprocess.PIPE)
    stdout = result.stdout.decode()
    for line in stdout.splitlines():
        if ':console' not in line:
            continue
        if 's' not in line.split()[4]:
            print("saving screen")
            if 'bash /u' not in line:
                subprocess.run(['screen', '-x myTTY1', '-X stuff', "pipes.sh^M"])
                print("saved")


if __name__ == "__main__":
    while True:
        screensaver()
        time.sleep(1)
