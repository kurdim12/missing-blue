"""
Missing Blue (Karak) - one heavy job at a time on this low-memory machine (a vite build or a browser run).

    python scripts/lock.py acquire NAME     # waits (up to 20 min) until the lock is free, then takes it
    python scripts/lock.py release NAME     # gives it back (only if NAME holds it)
    python scripts/lock.py status

The lock is a directory (mkdir is atomic). A lock older than 15 minutes is treated as abandoned.
"""
import sys
import time
from pathlib import Path

LOCK = Path(__file__).resolve().parents[1] / ".qa-lock"
STALE_S = 15 * 60


def holder():
    try:
        return (LOCK / "owner").read_text(encoding="utf-8").strip()
    except OSError:
        return None


def acquire(name, wait_s=20 * 60):
    start = time.time()
    while True:
        try:
            LOCK.mkdir()
            (LOCK / "owner").write_text(name, encoding="utf-8")
            print(f"lock: acquired by {name}")
            return 0
        except FileExistsError:
            try:
                age = time.time() - LOCK.stat().st_mtime
            except OSError:
                continue
            if age > STALE_S:
                print(f"lock: breaking a stale lock held by {holder()} ({age:.0f} s)")
                release(holder() or "", force=True)
                continue
            if time.time() - start > wait_s:
                print(f"lock: still held by {holder()} after {wait_s} s; giving up")
                return 1
            time.sleep(5)


def release(name, force=False):
    who = holder()
    if not force and who not in (name, None):
        print(f"lock: held by {who}, not {name}; not released")
        return 1
    for f in (LOCK / "owner",):
        f.unlink(missing_ok=True)
    try:
        LOCK.rmdir()
    except OSError:
        pass
    print(f"lock: released ({name})")
    return 0


if __name__ == "__main__":
    cmd, who = (sys.argv[1:] + ["status", "?"])[:2]
    if cmd == "acquire":
        sys.exit(acquire(who))
    if cmd == "release":
        sys.exit(release(who))
    print(f"lock: {'held by ' + str(holder()) if LOCK.exists() else 'free'}")
