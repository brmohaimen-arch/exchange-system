import secrets
import time


def new_id(prefix: str) -> str:
    """Millisecond timestamp + a short random suffix.

    The codebase used to build IDs from int(datetime.utcnow().timestamp()) —
    1-second resolution. Two requests landing in the same wall-clock second
    (two cashiers transacting at once, or any quick back-to-back calls) collide
    on a primary key and crash with an IntegrityError. This showed up during
    testing, not just in theory. Millisecond resolution plus a random suffix
    makes a collision practically impossible even under bursts.
    """
    return f"{prefix}_{int(time.time() * 1000)}_{secrets.token_hex(3)}"
