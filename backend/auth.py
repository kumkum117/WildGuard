"""
Ranger sign-in with one-time passcodes sent by SMS to the number entered.

Flow
  1. POST /api/auth/send-otp {phone}: the number is normalised to E.164
     (a bare 10-digit Indian number gets +91), checked against the optional
     registered-number list and rate limits, and a 6-digit code is texted to
     it through the gateway configured in .env (see sms.py). With no gateway
     configured the code is printed to the server console instead.
  2. POST /api/auth/verify-otp {phone, otp}: on success a session token is
     issued (returned in JSON and set as an HttpOnly cookie so MJPEG <img>
     streams and the EventSource can authenticate too).

Security
  * codes are stored as salted SHA-256 hashes, expire after 5 minutes and
    lock after 5 wrong attempts;
  * resends are limited (30 s cooldown, 5 per number per hour, 40 overall
    per hour) so nobody can burn through SMS credit;
  * session tokens are random 256-bit values; only their hashes are stored in
    data/sessions.json, so sessions survive a server restart.

The demo code 123456 keeps working while no SMS gateway is configured (so the
project still runs out of the box). Once real SMS is set up it is disabled,
unless WILDGUARD_DEMO_OTP is set explicitly (empty value = always disabled).

Optional .env settings
  WILDGUARD_USERS               registered numbers allowed to sign in, e.g.
                                "+919876543210:Sania:admin, 9812345678:Ravi"
                                (name and role optional; empty = anyone)
  WILDGUARD_DEFAULT_COUNTRY_CODE  default 91
  WILDGUARD_SESSION_DAYS        default 7
  WILDGUARD_RANGER_NAME         name for numbers not in WILDGUARD_USERS
"""

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
from collections import deque
from pathlib import Path

from sms import SmsError, SmsGateway

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SESSIONS_PATH = PROJECT_ROOT / "data" / "sessions.json"

OTP_LENGTH = 6
OTP_TTL_SECONDS = 300
MAX_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 30
MAX_SENDS_PER_NUMBER_PER_HOUR = 5
MAX_SENDS_PER_HOUR = 40


class AuthError(Exception):
    """Sign-in failure with an operator-readable message and HTTP status."""

    def __init__(self, message: str, status: int = 400, code: str = "invalid", **extra) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.extra = extra

    def to_dict(self) -> dict:
        return {"error": self.message, "code": self.code, **self.extra}


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def mask_phone(phone: str) -> str:
    """+919876543210 → +91 ••••• 43210"""
    prefix = phone[:-10] if len(phone) >= 12 else phone[:3]
    return f"{prefix} ••••• {phone[-5:]}"


# ----------------------------------------------------------------------
# Sessions
# ----------------------------------------------------------------------

class SessionStore:
    def __init__(self, path: Path = SESSIONS_PATH, ttl_s: float = 7 * 86400) -> None:
        self.path = path
        self.ttl_s = ttl_s
        self._lock = threading.Lock()
        self._sessions: "dict[str, dict]" = {}
        try:
            self._sessions = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            self._sessions = {}

    def _save(self) -> None:
        now = time.time()
        self._sessions = {k: v for k, v in self._sessions.items() if v["expires"] > now}
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self._sessions, indent=1), encoding="utf-8")
            tmp.replace(self.path)
        except OSError as exc:
            print(f"[Auth] Could not save sessions — {exc}")

    def create(self, user: dict) -> "tuple[str, float]":
        token = secrets.token_urlsafe(32)
        expires = time.time() + self.ttl_s
        with self._lock:
            self._sessions[_digest(token)] = {"user": user, "created": time.time(), "expires": expires}
            self._save()
        return token, expires

    def get(self, token: "str | None") -> "dict | None":
        if not token:
            return None
        with self._lock:
            record = self._sessions.get(_digest(token))
            if record is None:
                return None
            if record["expires"] <= time.time():
                del self._sessions[_digest(token)]
                return None
            return record["user"]

    def revoke(self, token: "str | None") -> None:
        if not token:
            return
        with self._lock:
            if self._sessions.pop(_digest(token), None) is not None:
                self._save()


# ----------------------------------------------------------------------
# One-time passcodes
# ----------------------------------------------------------------------

class AuthService:
    def __init__(self, gateway: SmsGateway) -> None:
        self.gateway = gateway
        self.country_code = re.sub(r"\D", "", os.environ.get("WILDGUARD_DEFAULT_COUNTRY_CODE", "91")) or "91"
        self.ranger_name = os.environ.get("WILDGUARD_RANGER_NAME", "Sania").strip() or "Ranger"
        explicit_demo = os.environ.get("WILDGUARD_DEMO_OTP")
        if explicit_demo is not None:
            self.demo_code = explicit_demo.strip()
        else:
            self.demo_code = "123456" if gateway.delivery == "console" else ""
        self.users = self._parse_users(os.environ.get("WILDGUARD_USERS", ""))
        days = float(os.environ.get("WILDGUARD_SESSION_DAYS", "7") or 7)
        self.sessions = SessionStore(ttl_s=days * 86400)

        self._lock = threading.Lock()
        self._codes: "dict[str, dict]" = {}
        self._sends: "dict[str, deque]" = {}
        self._all_sends: deque = deque()
        self._attempts: "dict[str, int]" = {}   # for gateway-managed (Twilio Verify) codes

        mode = f"SMS via {gateway.label}" if gateway.delivery == "sms" else "printed to this console"
        print(f"[Auth] One-time codes: {mode}"
              + (f" | demo code {self.demo_code} accepted" if self.demo_code else "")
              + (f" | {len(self.users)} registered number(s)" if self.users else ""))

    # ------------------------------------------------------------------

    def _parse_users(self, raw: str) -> "dict[str, dict]":
        users = {}
        for entry in filter(None, (e.strip() for e in raw.split(","))):
            phone, _, rest = entry.partition(":")
            name, _, role = rest.partition(":")
            try:
                number = self.normalize(phone)
            except AuthError:
                print(f"[Auth] Ignoring invalid number in WILDGUARD_USERS: {phone!r}")
                continue
            users[number] = {
                "name": name.strip() or self.ranger_name,
                "role": role.strip().lower() if role.strip().lower() in ("ranger", "admin", "observer") else "ranger",
            }
        return users

    def config(self) -> dict:
        return {
            "delivery": self.gateway.delivery,
            "provider": self.gateway.label,
            "demo_code_enabled": bool(self.demo_code),
            "default_country_code": f"+{self.country_code}",
            "registered_numbers_only": bool(self.users),
            "otp_length": OTP_LENGTH,
            "expires_seconds": OTP_TTL_SECONDS,
            "resend_seconds": RESEND_COOLDOWN_SECONDS,
        }

    def normalize(self, phone: str) -> str:
        """Return E.164 (+<country><number>) or raise AuthError."""
        raw = (phone or "").strip()
        digits = re.sub(r"\D", "", raw)
        if raw.startswith("+"):
            number = digits
        elif raw.startswith("00"):
            number = digits[2:]
        elif len(digits) == 10:
            number = self.country_code + digits
        elif len(digits) == 11 and digits.startswith("0"):
            number = self.country_code + digits[1:]
        else:
            number = digits
        if not 8 <= len(number) <= 15:
            raise AuthError("Enter a valid mobile number, e.g. +91 98765 43210", 400, "invalid_phone")
        if number.startswith("91") and not re.fullmatch(r"91[6-9]\d{9}", number):
            raise AuthError("Indian mobile numbers have 10 digits and start with 6, 7, 8 or 9",
                            400, "invalid_phone")
        return "+" + number

    def _check_registered(self, number: str) -> None:
        if self.users and number not in self.users:
            raise AuthError("This number is not registered for WildGuard. Ask an admin to add it.",
                            403, "not_registered")

    def _rate_limit(self, number: str) -> None:
        now = time.time()
        sends = self._sends.setdefault(number, deque())
        while sends and now - sends[0] > 3600:
            sends.popleft()
        while self._all_sends and now - self._all_sends[0] > 3600:
            self._all_sends.popleft()
        if sends and now - sends[-1] < RESEND_COOLDOWN_SECONDS:
            wait = int(RESEND_COOLDOWN_SECONDS - (now - sends[-1])) + 1
            raise AuthError(f"Please wait {wait} s before requesting another code",
                            429, "too_soon", retry_after=wait)
        if len(sends) >= MAX_SENDS_PER_NUMBER_PER_HOUR:
            wait = int(3600 - (now - sends[0])) + 1
            raise AuthError(f"Too many codes requested for this number. Try again in {wait // 60 + 1} min",
                            429, "rate_limited", retry_after=wait)
        if len(self._all_sends) >= MAX_SENDS_PER_HOUR:
            raise AuthError("Too many sign-in codes sent in the last hour. Try again later",
                            429, "rate_limited", retry_after=600)
        sends.append(now)
        self._all_sends.append(now)

    # ------------------------------------------------------------------

    def send_otp(self, phone: str) -> dict:
        number = self.normalize(phone)
        self._check_registered(number)
        with self._lock:
            self._rate_limit(number)
            code = None
            if not self.gateway.manages_codes:
                code = f"{secrets.randbelow(10 ** OTP_LENGTH):0{OTP_LENGTH}d}"
                salt = secrets.token_hex(8)
                self._codes[number] = {
                    "salt": salt,
                    "hash": _digest(salt + code),
                    "expires": time.time() + OTP_TTL_SECONDS,
                    "attempts": 0,
                }
            self._attempts[number] = 0

        message = (f"{code} is your WildGuard AI sign-in code. It expires in "
                   f"{OTP_TTL_SECONDS // 60} minutes. Do not share it.") if code else ""
        try:
            if self.gateway.manages_codes:
                self.gateway.start_verification(number)
            else:
                self.gateway.send_otp(number, code, message)
        except SmsError as exc:
            with self._lock:
                self._codes.pop(number, None)
                sends = self._sends.get(number)
                if sends:
                    sends.pop()        # a failed send should not count towards the limits
                if self._all_sends:
                    self._all_sends.pop()
            print(f"[Auth] SMS to {mask_phone(number)} failed — {exc}")
            raise AuthError(f"Could not send the SMS: {exc}", 502, "sms_failed") from exc

        return {
            "sent": True,
            "phone": number,
            "masked_phone": mask_phone(number),
            "delivery": self.gateway.delivery,
            "provider": self.gateway.label,
            "demo_code_enabled": bool(self.demo_code),
            "expires_in": OTP_TTL_SECONDS,
            "resend_in": RESEND_COOLDOWN_SECONDS,
        }

    def verify_otp(self, phone: str, otp: str) -> dict:
        number = self.normalize(phone)
        self._check_registered(number)
        code = (otp or "").strip()
        if not re.fullmatch(rf"\d{{{OTP_LENGTH}}}", code):
            raise AuthError(f"Enter the {OTP_LENGTH}-digit code", 400, "invalid_code")

        if self.demo_code and hmac.compare_digest(code, self.demo_code):
            return self._start_session(number)

        if self.gateway.manages_codes:
            with self._lock:
                attempts = self._attempts.get(number, 0)
                if attempts >= MAX_ATTEMPTS:
                    raise AuthError("Too many wrong attempts. Request a new code", 429, "locked")
                self._attempts[number] = attempts + 1
            try:
                approved = self.gateway.check_verification(number, code)
            except SmsError as exc:
                raise AuthError(f"Could not verify the code: {exc}", 502, "sms_failed") from exc
            if not approved:
                left = MAX_ATTEMPTS - self._attempts.get(number, 0)
                raise AuthError(f"Wrong or expired code. {left} attempt{'s' if left != 1 else ''} left",
                                401, "wrong_code", attempts_left=left)
            return self._start_session(number)

        with self._lock:
            record = self._codes.get(number)
            if record is None:
                raise AuthError("No active code for this number. Request a new one", 400, "no_code")
            if time.time() > record["expires"]:
                self._codes.pop(number, None)
                raise AuthError("This code has expired. Request a new one", 400, "expired")
            if record["attempts"] >= MAX_ATTEMPTS:
                raise AuthError("Too many wrong attempts. Request a new code", 429, "locked")
            if not hmac.compare_digest(_digest(record["salt"] + code), record["hash"]):
                record["attempts"] += 1
                left = MAX_ATTEMPTS - record["attempts"]
                if left <= 0:
                    raise AuthError("Too many wrong attempts. Request a new code", 429, "locked")
                raise AuthError(f"Wrong code. {left} attempt{'s' if left != 1 else ''} left",
                                401, "wrong_code", attempts_left=left)
            self._codes.pop(number, None)
        return self._start_session(number)

    def _start_session(self, number: str) -> dict:
        profile = self.users.get(number, {"name": self.ranger_name, "role": "ranger"})
        user = {"id": f"USR-{number[-4:]}", "phone": number, **profile}
        token, expires = self.sessions.create(user)
        return {"token": token, "user": user, "expires_at": expires}

    def user_for(self, token: "str | None") -> "dict | None":
        return self.sessions.get(token)

    def logout(self, token: "str | None") -> None:
        self.sessions.revoke(token)
