import time
import os
import subprocess

from watchdog.events import FileSystemEvent, FileSystemEventHandler, FileCreatedEvent, FileModifiedEvent
from watchdog.observers import Observer


CAN_PRINT = os.path.exists("./PRODUCTION")

class EventHandler(FileSystemEventHandler):
    def on_any_event(self, event: FileSystemEvent) -> None:
        if isinstance(event, FileModifiedEvent):
            print(f"Printing: {event.src_path}")
            if CAN_PRINT:
                subprocess.run(["lp", event.src_path])

if __name__ == "__main__":
    os.makedirs("./inbox", exist_ok=True)

    event_handler = EventHandler()
    observer = Observer()
    observer.schedule(event_handler, "./inbox", recursive=True)
    observer.start()
    try:
        while True:
            time.sleep(1)
    finally:
        observer.stop()
        observer.join()
