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
import re
import threading
import urllib.error
import urllib.parse
import urllib.request


class SmsError(Exception):
    """Delivery failed; the message is safe to show to the operator."""


class PhoneError(ValueError):
    """A phone number that cannot be normalised."""


def default_country_code() -> str:
    return re.sub(r"\D", "", os.environ.get("WILDGUARD_DEFAULT_COUNTRY_CODE", "91")) or "91"


def normalize_phone(phone: str, country_code: "str | None" = None) -> str:
    """Return E.164 (+<country><number>); a bare 10-digit number gets the default country code."""
    cc = country_code or default_country_code()
    raw = (phone or "").strip()
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("+"):
        number = digits
    elif raw.startswith("00"):
        number = digits[2:]
    elif len(digits) == 10:
        number = cc + digits
    elif len(digits) == 11 and digits.startswith("0"):
        number = cc + digits[1:]
    else:
        number = digits
    if not 8 <= len(number) <= 15:
        raise PhoneError("Enter a valid mobile number, e.g. +91 98765 43210")
    if number.startswith("91") and not re.fullmatch(r"91[6-9]\d{9}", number):
        raise PhoneError("Indian mobile numbers have 10 digits and start with 6, 7, 8 or 9")
    return "+" + number


def phone_list(env_name: str) -> "list[str]":
    """Comma-separated numbers from an env var, normalised; invalid entries are skipped."""
    out = []
    for raw in os.environ.get(env_name, "").split(","):
        if raw.strip():
            try:
                out.append(normalize_phone(raw))
            except PhoneError:
                print(f"[SMS] Ignoring invalid number in {env_name}: {raw.strip()!r}")
    return list(dict.fromkeys(out))


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


def send_bulk(gateway: SmsGateway, phones: "list[str]", text: str, on_done=None) -> None:
    """Send the same free-text SMS to many numbers on a background thread.
    on_done(sent, failed, first_error) is called when finished."""

    def run():
        sent, failed, first_error = 0, 0, None
        for phone in phones:
            try:
                gateway.send_text(phone, text)
                sent += 1
            except SmsError as exc:
                failed += 1
                first_error = first_error or str(exc)
        if failed:
            print(f"[SMS] {failed}/{len(phones)} messages failed — {first_error}")
        if on_done:
            on_done(sent, failed, first_error)

    threading.Thread(target=run, daemon=True, name="WildGuard-sms").start()


def _error_text(body) -> str:
    """Pull a human-readable message out of a provider's error body."""
    if isinstance(body, dict):
        for key in ("message", "error", "detail", "more_info"):
            value = body.get(key)
            if isinstance(value, str) and value:
                return value
            if isinstance(value, list) and value:
                return str(value[0])
        return json.dumps(body)[:200]
    return str(body)[:200] or "no details"


def _require(*names: str) -> "list[str]":
    values = [_env(n) for n in names]
    missing = [n for n, v in zip(names, values) if not v]
    if missing:
        raise SmsError(f"missing {', '.join(missing)} in .env")
    return values


class TextBeeGateway(SmsGateway):
    """TextBee (textbee.dev): sends from your own Android phone's SIM; free plan
    50 SMS/day. .env: TEXTBEE_API_KEY, optional TEXTBEE_DEVICE_ID."""

    name = "textbee"
    label = "TextBee (your Android phone)"
    can_send_text = True

    def __init__(self) -> None:
        self.api_key = _require("TEXTBEE_API_KEY")[0]
        self.device_id = _env("TEXTBEE_DEVICE_ID")
        self.base = _env("TEXTBEE_BASE_URL", "https://api.textbee.dev/api/v1").rstrip("/")

    def send_text(self, phone: str, text: str) -> None:
        body = {"recipients": [phone], "message": text}
        if self.device_id:
            body["deviceId"] = self.device_id
        status, data = http_request("POST", f"{self.base}/gateway/send-sms",
                                    headers={"x-api-key": self.api_key}, json_body=body, timeout=30)
        inner = data.get("data") if isinstance(data, dict) else None
        if status >= 300 or (isinstance(inner, dict) and inner.get("success") is False):
            raise SmsError(f"TextBee {status}: {_error_text(data)}")

    def send_otp(self, phone: str, code: str, message: str) -> None:
        self.send_text(phone, message)


class SmsGateGateway(SmsGateway):
    """SMS Gateway for Android (sms-gate.app): open source, sends from your phone.
    .env: SMSGATE_USERNAME, SMSGATE_PASSWORD (shown in the app), optional
    SMSGATE_BASE_URL (cloud by default; http://<phone-ip>:8080 for local mode)."""

    name = "smsgate"
    label = "SMS Gateway for Android"
    can_send_text = True

    def __init__(self) -> None:
        self.user, self.password = _require("SMSGATE_USERNAME", "SMSGATE_PASSWORD")
        self.base = _env("SMSGATE_BASE_URL", "https://api.sms-gate.app/3rdparty/v1").rstrip("/")

    def send_text(self, phone: str, text: str) -> None:
        status, data = http_request("POST", f"{self.base}/message", basic_auth=(self.user, self.password),
                                    json_body={"textMessage": {"text": text}, "phoneNumbers": [phone]})
        if status >= 300:
            raise SmsError(f"SMS Gateway {status}: {_error_text(data)}")

    def send_otp(self, phone: str, code: str, message: str) -> None:
        self.send_text(phone, message)


class _TwilioBase(SmsGateway):
    def __init__(self) -> None:
        self.account_sid, token = _require("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN")
        # An API key + secret also works; otherwise Account SID + Auth Token.
        key, secret = _env("TWILIO_API_KEY"), _env("TWILIO_API_SECRET")
        self.auth = (key, secret) if key and secret else (self.account_sid, token)

    @staticmethod
    def _fail(status: int, data) -> SmsError:
        code = data.get("code") if isinstance(data, dict) else None
        hint = {21608: " (trial accounts can only text verified numbers; verify it in the Twilio console)",
                21211: " (invalid phone number)",
                60203: " (too many attempts; wait before retrying)"}.get(code, "")
        return SmsError(f"Twilio {status}{f' #{code}' if code else ''}: {_error_text(data)}{hint}")


class TwilioVerifyGateway(_TwilioBase):
    """Twilio Verify: Twilio generates, texts and checks the code (and handles
    India's DLT rules). .env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
    TWILIO_VERIFY_SERVICE_SID."""

    name = "twilio_verify"
    label = "Twilio Verify"
    manages_codes = True

    def __init__(self) -> None:
        super().__init__()
        self.service = _require("TWILIO_VERIFY_SERVICE_SID")[0]
        self.base = _env("TWILIO_VERIFY_BASE_URL", "https://verify.twilio.com/v2").rstrip("/")

    def start_verification(self, phone: str) -> None:
        status, data = http_request("POST", f"{self.base}/Services/{self.service}/Verifications",
                                    basic_auth=self.auth, form={"To": phone, "Channel": "sms"})
        if status >= 300:
            raise self._fail(status, data)

    def check_verification(self, phone: str, code: str) -> bool:
        status, data = http_request("POST", f"{self.base}/Services/{self.service}/VerificationCheck",
                                    basic_auth=self.auth, form={"To": phone, "Code": code})
        if status == 404:
            return False            # expired (10 min), already approved, or never started
        if status >= 300:
            raise self._fail(status, data)
        return isinstance(data, dict) and data.get("status") == "approved"


class TwilioSmsGateway(_TwilioBase):
    """Twilio Programmable Messaging: plain SMS from your Twilio number.
    .env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER
    (or TWILIO_MESSAGING_SERVICE_SID)."""

    name = "twilio"
    label = "Twilio SMS"
    can_send_text = True

    def __init__(self) -> None:
        super().__init__()
        self.sender = _env("TWILIO_FROM_NUMBER")
        self.service = _env("TWILIO_MESSAGING_SERVICE_SID")
        if not (self.sender or self.service):
            raise SmsError("missing TWILIO_FROM_NUMBER (or TWILIO_MESSAGING_SERVICE_SID) in .env")
        self.base = _env("TWILIO_API_BASE_URL", "https://api.twilio.com/2010-04-01").rstrip("/")

    def send_text(self, phone: str, text: str) -> None:
        form = {"To": phone, "Body": text}
        if self.service:
            form["MessagingServiceSid"] = self.service
        else:
            form["From"] = self.sender
        status, data = http_request("POST", f"{self.base}/Accounts/{self.account_sid}/Messages.json",
                                    basic_auth=self.auth, form=form)
        if status >= 300:
            raise self._fail(status, data)

    def send_otp(self, phone: str, code: str, message: str) -> None:
        self.send_text(phone, message)


class Fast2SmsGateway(SmsGateway):
    """Fast2SMS (India), "otp" route: fixed template "Your OTP: <code>", Indian
    numbers only, needs a recharged account. .env: FAST2SMS_API_KEY."""

    name = "fast2sms"
    label = "Fast2SMS"

    def __init__(self) -> None:
        self.api_key = _require("FAST2SMS_API_KEY")[0]
        self.url = _env("FAST2SMS_BASE_URL", "https://www.fast2sms.com/dev/bulkV2")

    def send_otp(self, phone: str, code: str, message: str) -> None:
        if not phone.startswith("+91"):
            raise SmsError("Fast2SMS can only text Indian (+91) numbers")
        query = urllib.parse.urlencode({"route": "otp", "variables_values": code,
                                        "numbers": phone[3:], "flash": "0"})
        status, data = http_request("GET", f"{self.url}?{query}", headers={"authorization": self.api_key})
        if status >= 300 or not (isinstance(data, dict) and data.get("return") is True):
            raise SmsError(f"Fast2SMS {status}: {_error_text(data)}")


PROVIDERS = {
    "textbee": TextBeeGateway,
    "smsgate": SmsGateGateway,
    "twilio_verify": TwilioVerifyGateway,
    "twilio": TwilioSmsGateway,
    "fast2sms": Fast2SmsGateway,
}


def build_gateway() -> SmsGateway:
    """Gateway selected by SMS_PROVIDER in .env (console when unset or misconfigured)."""
    name = _env("SMS_PROVIDER").lower()
    if not name or name == "console":
        return ConsoleGateway()
    cls = PROVIDERS.get(name)
    if cls is None:
        print(f"[SMS] Unknown SMS_PROVIDER '{name}'; choose one of {', '.join(PROVIDERS)}. "
              "Codes will be printed to the console.")
        return ConsoleGateway()
    try:
        gateway = cls()
    except SmsError as exc:
        print(f"[SMS] {cls.label} not configured: {exc}. Codes will be printed to the console.")
        return ConsoleGateway()
    print(f"[SMS] Sign-in codes will be texted via {gateway.label}")
    return gateway
