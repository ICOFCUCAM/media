"""Background runs for async callers (the video worker's pattern, apps/gpu-worker).

A long batch can outlive the ~100 s an edge proxy keeps one request open
(RunPod's proxy answers 524). With `x-cineforge-async: 1` the service answers
202 + a task id at once; CineForge polls GET /v1/jobs/{taskId}, each poll with
its own status-scope token. In memory: a restart loses running tasks, and the
caller fails the job (UNKNOWN_TASK). Finished tasks are kept for an hour.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from typing import Callable

from fastapi import HTTPException

log = logging.getLogger("cineforge.voice")


class Tasks:
    TTL_SEC = 3600

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tasks: dict[str, dict] = {}

    def submit(self, run: Callable[[Callable[[], None]], dict], *, label: str, sub: str | None) -> str:
        task_id = uuid.uuid4().hex
        with self._lock:
            self._prune()
            self._tasks[task_id] = {"status": "queued", "operation": label, "started": time.time()}
        threading.Thread(target=self._work, args=(task_id, run, sub), name=f"voice-{task_id[:8]}", daemon=True).start()
        return task_id

    def get(self, task_id: str) -> dict | None:
        with self._lock:
            t = self._tasks.get(task_id)
            return None if t is None else {k: v for k, v in t.items() if k not in ("started", "finished")}

    def _work(self, task_id: str, run, sub) -> None:
        try:
            done = {"status": "done", "result": run(lambda: self._mark(task_id, "running"))}
        except HTTPException as e:
            done = {"status": "error", "httpStatus": e.status_code, "detail": e.detail}
        except Exception as e:  # noqa: BLE001 — reported to the caller, never swallowed
            log.exception('{"event":"voice.async_failed","sub":%r}', sub)
            done = {"status": "error", "httpStatus": 500, "detail": {"error": "VOICE_FAILED", "type": type(e).__name__}}
        with self._lock:
            if task_id in self._tasks:
                prev = self._tasks[task_id]
                self._tasks[task_id] = {**done, "operation": prev["operation"], "started": prev["started"], "finished": time.time()}

    def _mark(self, task_id: str, status: str) -> None:
        with self._lock:
            if task_id in self._tasks and self._tasks[task_id]["status"] in ("queued", "running"):
                self._tasks[task_id]["status"] = status

    def _prune(self) -> None:
        cutoff = time.time() - self.TTL_SEC
        for k in [k for k, t in self._tasks.items() if t.get("finished", time.time()) < cutoff]:
            del self._tasks[k]
