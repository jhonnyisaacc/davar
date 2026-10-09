"""Fake bridge that ignores SIGTERM, then answers after a long sleep."""
import signal
import time

signal.signal(signal.SIGTERM, signal.SIG_IGN)
time.sleep(30)
print("{}")
