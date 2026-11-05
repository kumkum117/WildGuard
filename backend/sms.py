"""
SMS gateways for sign-in codes, alert texts and villager broadcasts.

Choose one in the project .env with SMS_PROVIDER (provider-specific keys are
listed on each class). Without SMS_PROVIDER, codes are printed to the server
console so the project still runs out of the box.

All requests use the standard library (urllib) — no extra packages. Every
provider base URL can be overridden (…_BASE_URL) for self-hosted gateways or
for testing against a mock server.
"""

import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request


class SmsError(Exception):
    """Delivery failed; the message is safe to show to the operator."""


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def http_request(method: str, url: str, *, headers: "dict | None" = None, form: "dict | None" = None,
                 json_body=None, basic_auth: "tuple[str, str] | None" = None,
                 timeout: float = 15.0) -> "tuple[int, object]":
    """Minimal HTTP client. Returns (status, parsed JSON or text). Never raises on HTTP status."""
    headers = dict(headers or {})
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
    elif json_body is not None:
        data = json.dumps(json_body).encode()
        headers.setdefault("Content-Type", "application/json")
    if basic_auth:
        token = base64.b64encode(f"{basic_auth[0]}:{basic_auth[1]}".encode()).decode()
        headers["Authorization"] = f"Basic {token}"
    headers.setdefault("Accept", "application/json")
    headers.setdefault("User-Agent", "WildGuard-AI/1.1")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status, raw = resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        status, raw = exc.code, exc.read()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        raise SmsError(f"cannot reach the SMS gateway ({reason})") from exc
    text = raw.decode("utf-8", errors="replace")
    try:
        return status, json.loads(text) if text else {}
    except json.JSONDecodeError:
        return status, text


class SmsGateway:
    """Interface. `delivery` is "sms" for real gateways, "console" otherwise."""

    name = "base"
    label = "base"
    delivery = "sms"
    manages_codes = False     # True: the provider generates + verifies codes (Twilio Verify)
    can_send_text = False     # free-text SMS (alerts, villager broadcasts)

    def send_otp(self, phone: str, code: str, message: str) -> None:
        raise NotImplementedError

    def start_verification(self, phone: str) -> None:
        raise NotImplementedError

    def check_verification(self, phone: str, code: str) -> bool:
        raise NotImplementedError

    def send_text(self, phone: str, text: str) -> None:
        raise SmsError(f"{self.label} cannot send free-text SMS")


class ConsoleGateway(SmsGateway):
    name = "console"
    label = "server console"
    delivery = "console"

    def send_otp(self, phone: str, code: str, message: str) -> None:
        print(f"[Auth] One-time passcode for {phone}: {code} "
              "(no SMS gateway configured — set SMS_PROVIDER in .env to text it)")


def build_gateway() -> SmsGateway:
    """Gateway selected by SMS_PROVIDER in .env (console when unset)."""
    return ConsoleGateway()
