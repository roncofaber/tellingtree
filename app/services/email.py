"""Transactional email via SMTP (Brevo or any SMTP relay).

Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL in the environment to enable.
If SMTP_HOST is empty, email sending is silently skipped (dev mode).
"""

import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings


def _enabled() -> bool:
    return bool(settings.smtp_host and settings.smtp_from_email)


def send_email(to: str, subject: str, html: str) -> bool:
    """Send a transactional email. Returns True on success, False otherwise."""
    if not _enabled():
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))

    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            server.ehlo()
            server.starttls(context=ctx)
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_from_email, to, msg.as_string())
        return True
    except Exception:
        return False


def send_password_reset(to: str, reset_url: str) -> bool:
    html = f"""
    <p>Hi,</p>
    <p>Someone requested a password reset for your TellingTree account.</p>
    <p><a href="{reset_url}" style="
        display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;
        text-decoration:none;border-radius:6px;font-weight:600">
      Reset my password
    </a></p>
    <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
    <p>— TellingTree</p>
    """
    return send_email(to, "Reset your TellingTree password", html)
