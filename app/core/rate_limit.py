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

    @staticmethod
    def request_ip(request: Request) -> str:
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

    def check_key(self, key: str) -> None:
        now = time.monotonic()
        cutoff = now - self._window
        self._cleanup(now)

        timestamps = self._requests[key]
        self._requests[key] = [t for t in timestamps if t > cutoff]

        if len(self._requests[key]) >= self._max_requests:
            raise BadRequestError("Too many requests. Please try again later.")

        self._requests[key].append(now)

    def check(self, request: Request) -> None:
        """Convenience: rate-limit by client IP."""
        self.check_key(self.request_ip(request))


class AccountLockout:
    """Per-account failed-login tracker. Survives only in process memory."""

    def __init__(self, max_failures: int, window_seconds: int, lockout_seconds: int):
        self._max_failures = max_failures
        self._window = window_seconds
        self._lockout = lockout_seconds
        # username (lowercased) → list[(ts, was_lockout_marker)]
        self._failures: dict[str, list[float]] = defaultdict(list)
        self._locked_until: dict[str, float] = {}

    @staticmethod
    def _normalize(username: str) -> str:
        return (username or "").strip().lower()

    def check_locked(self, username: str) -> None:
        key = self._normalize(username)
        now = time.monotonic()
        until = self._locked_until.get(key)
        if until is not None:
            if until > now:
                remaining_min = max(1, int((until - now) / 60))
                raise BadRequestError(
                    f"Too many failed attempts. Try again in {remaining_min} minute"
                    + ("s" if remaining_min != 1 else "") + "."
                )
            # Lockout has elapsed — clear it so the user can try again.
            del self._locked_until[key]
            self._failures[key] = []

    def record_failure(self, username: str) -> None:
        key = self._normalize(username)
        now = time.monotonic()
        cutoff = now - self._window
        self._failures[key] = [t for t in self._failures[key] if t > cutoff]
        self._failures[key].append(now)
        if len(self._failures[key]) >= self._max_failures:
            self._locked_until[key] = now + self._lockout

    def record_success(self, username: str) -> None:
        key = self._normalize(username)
        self._failures.pop(key, None)
        self._locked_until.pop(key, None)


auth_rate_limiter = RateLimiter(max_requests=10, window_seconds=60)

# Per-user budget on the avatar endpoint. Generous because avatars are fetched
# many times per page (sidebar + member rows + person hover cards), but caps the
# damage a single approved user can do via mass scraping or DoS.
avatar_rate_limiter = RateLimiter(max_requests=120, window_seconds=60)

# Per-account lockout: 8 failed attempts within 15 minutes locks the account
# for 15 minutes. Defends against credential-stuffing across multiple IPs that
# bypasses the IP-based rate limit.
account_lockout = AccountLockout(
    max_failures=8, window_seconds=15 * 60, lockout_seconds=15 * 60,
)
