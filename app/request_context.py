"""
Per-request client IP/device, captured once by middleware and read back by
tracking.create_audit_log() (and login handling) without threading a Request
object through every router and helper call site.
"""

from contextvars import ContextVar

_current_ip: ContextVar[str | None] = ContextVar("_current_ip", default=None)
_current_device: ContextVar[str | None] = ContextVar("_current_device", default=None)


def set_request_meta(ip: str | None, device: str | None) -> None:
    _current_ip.set(ip)
    _current_device.set(device)


def get_client_ip() -> str | None:
    return _current_ip.get()


def get_client_device() -> str | None:
    return _current_device.get()


def extract_client_ip(headers, client_host: str | None) -> str | None:
    # A reverse proxy (nginx, a load balancer) sets X-Forwarded-For; the first
    # entry is the original client. Fall back to the direct connection's address.
    forwarded = headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return client_host
