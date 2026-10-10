import hmac
import json
import os
import re
import secrets
import smtplib
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from email.message import EmailMessage

from a2wsgi import WSGIMiddleware
from dotenv import load_dotenv
from flask import (Flask, abort, flash, g, jsonify, redirect, render_template,
                   request, send_file, session, url_for)

# Load environment variables from .env file if present
load_dotenv()

# Runtime data (contact messages, admin edits, uploaded résumé) lives in the
# instance folder, which is gitignored, so deploys never conflict with it.
app = Flask(
    __name__,
    instance_relative_config=True,
    instance_path=os.environ.get("PORTFOLIO_INSTANCE_PATH") or None,
)
os.makedirs(app.instance_path, exist_ok=True)


def require_env(name):
    """Fail fast instead of silently falling back to a guessable secret."""
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} must be set (see README.md).")
    return value


app.secret_key = require_env("SECRET_KEY")
ADMIN_PASSWORD = require_env("ADMIN_PASSWORD")

app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024  # 5 MB upload cap
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

ADMIN_PATH = "/" + os.environ.get("ADMIN_PATH", "/admin").strip("/")
if ADMIN_PATH == "/":
    ADMIN_PATH = "/admin"

# Data File Paths — committed defaults, overridden by instance copies if present
DEFAULT_DATA_FILE = os.path.join(app.root_path, "resume_data.json")
DEFAULT_RESUME_PDF = os.path.join(app.root_path, "static", "resume.pdf")
DATA_FILE = os.path.join(app.instance_path, "resume_data.json")
MESSAGES_FILE = os.path.join(app.instance_path, "contact_messages.json")
RESUME_PDF_PATH = os.path.join(app.instance_path, "resume.pdf")

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
FIELD_LIMITS = {"name": 100, "email": 254, "subject": 150, "message": 5000}

_file_lock = threading.Lock()


def git_build_id():
    """Short commit hash of the running code, shown in the page colophon."""
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=app.root_path,
                             capture_output=True, text=True, timeout=2)
        return out.stdout.strip() or None
    except Exception:
        return None


app.jinja_env.globals["build_id"] = git_build_id()


@app.before_request
def start_timer():
    g.request_started = time.perf_counter()


@app.template_global()
def elapsed_ms():
    """Milliseconds since this request started — real server render time."""
    return (time.perf_counter() - g.get("request_started", time.perf_counter())) * 1000


@app.template_filter("components")
def components(text):
    """Split an architecture string like 'A + B (note) + C.' into (name, note) pairs."""
    parts = []
    for raw in str(text or "").rstrip(". ").split(" + "):
        raw = raw.strip()
        if not raw:
            continue
        match = re.match(r"^(.*?)\s*\((.*)\)$", raw)
        parts.append((match.group(1), match.group(2)) if match else (raw, None))
    return parts


# ==========================================
# HELPERS
# ==========================================

def write_json_atomic(path, data):
    """Write JSON via a temp file so a crash never leaves a half-written file."""
    fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, path)
    except BaseException:
        os.unlink(tmp_path)
        raise


def read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default
    except Exception as e:
        app.logger.error(f"Error loading {path}: {e}")
        return default


def load_resume_data():
    """Load portfolio data, preferring the admin-edited copy if one exists."""
    path = DATA_FILE if os.path.exists(DATA_FILE) else DEFAULT_DATA_FILE
    return read_json(path, {})


def save_resume_data(data):
    """Save updated portfolio data to the instance copy."""
    with _file_lock:
        write_json_atomic(DATA_FILE, data)


def load_messages():
    return read_json(MESSAGES_FILE, [])


def save_message(entry):
    """Append a contact submission to the instance messages file."""
    with _file_lock:
        messages = load_messages()
        messages.append(entry)
        write_json_atomic(MESSAGES_FILE, messages)


def notify_by_email(entry):
    """Email a contact submission if SMTP is configured. Never raises."""
    host = os.environ.get("SMTP_HOST")
    recipient = os.environ.get("NOTIFY_EMAIL")
    if not host or not recipient:
        return

    user = os.environ.get("SMTP_USER", "")
    msg = EmailMessage()
    msg["Subject"] = f"[portfolio] {entry['subject']} — from {entry['name']}"
    msg["From"] = os.environ.get("SMTP_FROM") or user or recipient
    msg["To"] = recipient
    msg["Reply-To"] = entry["email"]
    msg.set_content(f"From: {entry['name']} <{entry['email']}>\n\n{entry['message']}")

    try:
        with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", "587")), timeout=10) as smtp:
            smtp.starttls()
            if user:
                smtp.login(user, os.environ.get("SMTP_PASSWORD", ""))
            smtp.send_message(msg)
    except Exception as e:
        app.logger.error(f"Error sending contact notification: {e}")


# Simple in-memory sliding-window rate limiter (per process).
_rate_buckets = {}
_rate_lock = threading.Lock()


def rate_limited(bucket, limit, window_seconds, record=True):
    """Return True if this client exceeded `limit` events in the window."""
    key = (bucket, request.remote_addr)
    now = time.monotonic()
    with _rate_lock:
        events = [t for t in _rate_buckets.get(key, []) if now - t < window_seconds]
        if len(events) >= limit:
            _rate_buckets[key] = events
            return True
        if record:
            events.append(now)
        _rate_buckets[key] = events
        return False


def record_event(bucket):
    with _rate_lock:
        _rate_buckets.setdefault((bucket, request.remote_addr), []).append(time.monotonic())


def csrf_token():
    if "_csrf" not in session:
        session["_csrf"] = secrets.token_urlsafe(32)
    return session["_csrf"]


app.jinja_env.globals["csrf_token"] = csrf_token


@app.before_request
def csrf_protect():
    """Every state-changing admin request must carry the session's CSRF token."""
    if request.method == "POST" and request.path.startswith(ADMIN_PATH + "/"):
        expected = session.get("_csrf", "")
        sent = request.form.get("csrf_token", "")
        if not expected or not hmac.compare_digest(expected, sent):
            abort(400, description="Invalid or missing CSRF token.")


# ==========================================
# PUBLIC SITE
# ==========================================

@app.route("/")
def index():
    """Render the single-page portfolio index with dynamic data."""
    portfolio_data = load_resume_data()
    return render_template("index.html", portfolio=portfolio_data, current_year=datetime.now().year)


@app.route("/resume")
def resume():
    """Serve the uploaded résumé if there is one, else the committed default."""
    path = RESUME_PDF_PATH if os.path.exists(RESUME_PDF_PATH) else DEFAULT_RESUME_PDF
    return send_file(path, mimetype="application/pdf", as_attachment=False)


@app.route("/contact", methods=["POST"])
def contact():
    """Handle contact form submissions via POST request."""
    data = request.get_json(silent=True) if request.is_json else request.form
    if not hasattr(data, "get"):  # malformed JSON or a non-object body
        data = {}

    # Honeypot: real visitors never fill this hidden field.
    if (data.get("website") or "").strip():
        return jsonify({"success": True, "message": "Thanks — your message is on its way."}), 200

    fields = {k: str(data.get(k) or "").strip() for k in FIELD_LIMITS}
    fields["subject"] = fields["subject"] or "General Inquiry"

    if not fields["name"] or not fields["email"] or not fields["message"]:
        return jsonify({
            "success": False,
            "error": "Please provide your name, email, and message."
        }), 400

    if not EMAIL_RE.match(fields["email"]):
        return jsonify({
            "success": False,
            "error": "Please provide a valid email address."
        }), 400

    for key, limit in FIELD_LIMITS.items():
        if len(fields[key]) > limit:
            return jsonify({
                "success": False,
                "error": f"Your {key} is too long (max {limit} characters)."
            }), 400

    if rate_limited("contact", limit=5, window_seconds=600):
        return jsonify({
            "success": False,
            "error": "Too many messages in a short time. Please try again later."
        }), 429

    entry = {"timestamp": datetime.now().isoformat(timespec="seconds"), **fields}
    try:
        save_message(entry)
    except Exception as e:
        app.logger.error(f"Error saving contact message: {e}")
        return jsonify({
            "success": False,
            "error": "An error occurred while saving your message. Please try again later."
        }), 500

    threading.Thread(target=notify_by_email, args=(entry,), daemon=True).start()
    return jsonify({
        "success": True,
        "message": f"Thanks, {fields['name']} — your message is on its way. I'll get back to you soon."
    }), 200


# ==========================================
# LIVE STATUS FOR DEPLOYED EXPERIMENTS
# Pinged from the server in the background and cached, so visitors never
# wait on (or multiply requests to) the deployed apps.
# ==========================================

STATUS_TTL_SECONDS = 300
STATUS_TIMEOUT_SECONDS = 8
_status = {"checked_at": None, "results": {}, "refreshing": False}
_status_lock = threading.Lock()


def check_url(url):
    """Return {'state': 'up'|'idle'|'down', 'ms': int|None} for one URL."""
    started = time.perf_counter()
    req = urllib.request.Request(url, headers={"User-Agent": "portfolio-status-check/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=STATUS_TIMEOUT_SECONDS) as resp:
            code = resp.status
    except urllib.error.HTTPError as e:
        code = e.code
    except Exception:
        # No answer within the timeout — free-tier hosts sleep when idle.
        return {"state": "idle", "ms": None}
    ms = round((time.perf_counter() - started) * 1000)
    return {"state": "up" if code < 500 else "down", "ms": ms}


def refresh_statuses(urls):
    with ThreadPoolExecutor(max_workers=max(1, len(urls))) as pool:
        results = dict(zip(urls, pool.map(check_url, urls)))
    with _status_lock:
        _status["results"] = results
        _status["checked_at"] = datetime.now().isoformat(timespec="seconds")
        _status["last_refresh"] = time.monotonic()
        _status["refreshing"] = False


@app.route("/status.json")
def live_status():
    urls = [p["live_url"] for p in load_resume_data().get("live_projects", []) if p.get("live_url")]
    with _status_lock:
        stale = time.monotonic() - _status.get("last_refresh", float("-inf")) > STATUS_TTL_SECONDS
        if urls and stale and not _status["refreshing"]:
            _status["refreshing"] = True
            threading.Thread(target=refresh_statuses, args=(urls,), daemon=True).start()
        return jsonify({
            "checked_at": _status["checked_at"],
            "pending": _status["refreshing"],
            "results": {u: _status["results"][u] for u in urls if u in _status["results"]},
        })


# ==========================================
# SECURED ADMIN PORTAL & RESUME UPLOADER
# ==========================================

def admin_required():
    if not session.get("admin_logged_in"):
        abort(401)


@app.route(ADMIN_PATH, methods=["GET"])
def admin_dashboard():
    """Admin Dashboard Page (Protected)."""
    if not session.get("admin_logged_in"):
        return render_template("admin.html", logged_in=False)

    portfolio_data = load_resume_data()
    return render_template(
        "admin.html",
        logged_in=True,
        portfolio_json=json.dumps(portfolio_data, indent=2, ensure_ascii=False),
        messages=list(reversed(load_messages())),
        has_data_override=os.path.exists(DATA_FILE),
        has_resume_override=os.path.exists(RESUME_PDF_PATH),
    )


@app.route(f"{ADMIN_PATH}/login", methods=["POST"])
def admin_login():
    """Authenticate Admin user (5 failed attempts per 15 minutes per IP)."""
    if rate_limited("login", limit=5, window_seconds=900, record=False):
        flash("Too many failed attempts. Try again in 15 minutes.", "danger")
        return redirect(url_for("admin_dashboard"))

    password = request.form.get("password", "")
    if hmac.compare_digest(password.encode(), ADMIN_PASSWORD.encode()):
        session.clear()  # fresh session (and CSRF token) after privilege change
        session["admin_logged_in"] = True
        flash("Successfully logged in to Admin Dashboard!", "success")
    else:
        record_event("login")
        flash("Invalid password! Please try again.", "danger")
    return redirect(url_for("admin_dashboard"))


@app.route(f"{ADMIN_PATH}/logout", methods=["POST"])
def admin_logout():
    """Log out Admin user."""
    session.clear()
    flash("Logged out successfully.", "info")
    return redirect(url_for("admin_dashboard"))


@app.route(f"{ADMIN_PATH}/upload-resume", methods=["POST"])
def upload_resume():
    """Upload a new PDF résumé into the instance folder."""
    admin_required()

    file = request.files.get("resume_file")
    if not file or file.filename == "":
        flash("No file selected.", "danger")
        return redirect(url_for("admin_dashboard"))

    is_pdf = file.filename.lower().endswith(".pdf") and file.stream.read(5) == b"%PDF-"
    file.stream.seek(0)
    if not is_pdf:
        flash("Only PDF files (.pdf) are allowed.", "danger")
        return redirect(url_for("admin_dashboard"))

    tmp_path = RESUME_PDF_PATH + ".tmp"
    file.save(tmp_path)
    os.replace(tmp_path, RESUME_PDF_PATH)
    flash("New résumé PDF uploaded and published.", "success")
    return redirect(url_for("admin_dashboard"))


@app.route(f"{ADMIN_PATH}/update-portfolio", methods=["POST"])
def update_portfolio():
    """Update portfolio JSON data directly from Admin Portal."""
    admin_required()

    json_raw = request.form.get("portfolio_json")
    if json_raw:
        try:
            parsed_data = json.loads(json_raw)
            if not isinstance(parsed_data, dict):
                raise ValueError("Top-level JSON must be an object.")
            save_resume_data(parsed_data)
            flash("Portfolio data updated and saved successfully! Your website sections are now updated live.", "success")
        except json.JSONDecodeError as e:
            flash(f"Invalid JSON format: {e}", "danger")
        except Exception as e:
            flash(f"Error saving data: {e}", "danger")

    return redirect(url_for("admin_dashboard"))


@app.route(f"{ADMIN_PATH}/reset-portfolio", methods=["POST"])
def reset_portfolio():
    """Discard admin edits and fall back to the committed resume_data.json."""
    admin_required()
    if os.path.exists(DATA_FILE):
        os.remove(DATA_FILE)
    flash("Admin edits discarded — the site now uses resume_data.json from the repository.", "info")
    return redirect(url_for("admin_dashboard"))


# ASGI Wrapper for Uvicorn deployments
asgi_app = WSGIMiddleware(app)


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
