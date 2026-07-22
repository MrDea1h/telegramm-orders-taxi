import logging
from email.message import EmailMessage

import aiosmtplib
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from shared.config import get_settings

logger = logging.getLogger(__name__)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((aiosmtplib.SMTPConnectError, aiosmtplib.SMTPTimeoutError)),
)
async def send_email(to: str, subject: str, body: str) -> None:
    settings = get_settings()

    if not settings.SMTP_HOST:
        # Dev fallback: no SMTP configured, don't crash — log the body so a
        # verification code is readable straight from the console.
        logger.warning(
            "SMTP_HOST unset — email not sent (dev no-op): to=%s subject=%s", to, subject
        )
        logger.info("dev email body (would have been sent):\n%s", body)
        return

    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER or None,
        password=settings.SMTP_PASSWORD or None,
        start_tls=settings.SMTP_USE_TLS,
    )
