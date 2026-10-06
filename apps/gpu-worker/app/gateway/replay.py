"""In-memory `jti` replay cache.

Sufficient because each GPU worker runs a single uvicorn process (Dockerfile
CMD) and a token lives at most max_token_lifetime + skew seconds. A worker
restart clears the cache, but every token minted before the restart expires
within that window anyway.
"""

from __future__ import annotations

import threading
import time


class ReplayCache:
    def __init__(self) -> None:
        self._seen: dict[str, float] = {}
        self._lock = threading.Lock()

    def check_and_add(self, jti: str, forget_at: float) -> bool:
        """Atomically record `jti`. Returns False if it was already used."""
        now = time.time()
        with self._lock:
            if len(self._seen) > 1024:
                self._seen = {k: v for k, v in self._seen.items() if v > now}
            prev = self._seen.get(jti)
            if prev is not None and prev > now:
                return False
            self._seen[jti] = forget_at
            return True
