import time
from collections import defaultdict

from fastapi import Request

from app.core.errors import BadRequestError

_CLEANUP_INTERVAL = 300  # prune stale keys every 5 minutes


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self._max_requests = max_requests
        self._window = window_seconds
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._last_cleanup = time.monotonic()

    def _get_key(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _cleanup(self, now: float) -> None:
        if now - self._last_cleanup < _CLEANUP_INTERVAL:
            return
        cutoff = now - self._window
        stale_keys = [k for k, v in self._requests.items() if not v or v[-1] <= cutoff]
        for k in stale_keys:
            del self._requests[k]
        self._last_cleanup = now

    def check(self, request: Request) -> None:
        key = self._get_key(request)
        now = time.monotonic()
        cutoff = now - self._window

        self._cleanup(now)

        timestamps = self._requests[key]
        self._requests[key] = [t for t in timestamps if t > cutoff]

        if len(self._requests[key]) >= self._max_requests:
            raise BadRequestError("Too many requests. Please try again later.")

        self._requests[key].append(now)


auth_rate_limiter = RateLimiter(max_requests=10, window_seconds=60)
