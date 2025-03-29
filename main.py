import time
import os
import subprocess
import functools
from threading import Timer
from watchdog.events import FileSystemEvent, FileSystemEventHandler, FileCreatedEvent, FileModifiedEvent
from watchdog.observers import Observer


CAN_PRINT = os.path.exists("./PRODUCTION")


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


@debounce(1)
def print_file(path: str):
    print(f"Printing: {path}")
    if CAN_PRINT:
        subprocess.run(["lp", path])

class EventHandler(FileSystemEventHandler):
    def on_any_event(self, event: FileSystemEvent) -> None:
        if isinstance(event, FileModifiedEvent):
            print_file(event.src_path)

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
                subprocess.run(["screen", "-x myTTY1", '-X stuff "pipes.sh^M"'])
                print("saved")


if __name__ == "__main__":
    os.makedirs("./inbox", exist_ok=True)

    event_handler = EventHandler()
    observer = Observer()
    observer.schedule(event_handler, "./inbox", recursive=True)
    observer.start()
    try:
        while True:
            screensaver()
            time.sleep(1)
    finally:
        observer.stop()
        observer.join()
