import os
import json
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for, session, flash

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "raj_aryan_portfolio_secret_2026")

# Admin credentials (default password: "raj123" - can be overridden via environment variable ADMIN_PASSWORD)
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "raj123")

# Data File Paths
DATA_FILE = os.path.join(app.root_path, "resume_data.json")
MESSAGES_FILE = os.path.join(app.root_path, "contact_messages.json")
RESUME_PDF_PATH = os.path.join(app.root_path, "static", "resume.pdf")


def load_resume_data():
    """Load portfolio data from JSON file with error fallback."""
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            app.logger.error(f"Error loading resume_data.json: {e}")
    return {}


def save_resume_data(data):
    """Save updated portfolio data to JSON file."""
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def save_message(name, email, subject, message):
    """Store contact submissions in a local JSON file."""
    entry = {
        "timestamp": datetime.now().isoformat(),
        "name": name,
        "email": email,
        "subject": subject,
        "message": message
    }
    messages = []
    if os.path.exists(MESSAGES_FILE):
        try:
            with open(MESSAGES_FILE, "r", encoding="utf-8") as f:
                messages = json.load(f)
        except Exception:
            messages = []
    messages.append(entry)
    with open(MESSAGES_FILE, "w", encoding="utf-8") as f:
        json.dump(messages, f, indent=2)


@app.route("/")
def index():
    """Render the single-page portfolio index with dynamic data."""
    portfolio_data = load_resume_data()
    return render_template("index.html", portfolio=portfolio_data, current_year=datetime.now().year)


@app.route("/resume")
def resume():
    """Serve the static PDF resume file."""
    return send_from_directory(
        directory=os.path.join(app.root_path, "static"),
        path="resume.pdf",
        as_attachment=False,
        mimetype="application/pdf"
    )


@app.route("/contact", methods=["POST"])
def contact():
    """Handle contact form submissions via POST request."""
    if request.is_json:
        data = request.get_json()
    else:
        data = request.form

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    subject = (data.get("subject") or "").strip() or "General Inquiry"
    message = (data.get("message") or "").strip()

    if not name or not email or not message:
        return jsonify({
            "success": False,
            "error": "Please provide your name, email, and message."
        }), 400

    if "@" not in email or "." not in email:
        return jsonify({
            "success": False,
            "error": "Please provide a valid email address."
        }), 400

    try:
        save_message(name, email, subject, message)
        return jsonify({
            "success": True,
            "message": f"Thank you, {name}! Your message has been sent successfully. Raj will get back to you shortly."
        }), 200
    except Exception as e:
        app.logger.error(f"Error saving contact message: {e}")
        return jsonify({
            "success": False,
            "error": "An error occurred while saving your message. Please try again later."
        }), 500


# ==========================================
# SECURED ADMIN PORTAL & RESUME UPLOADER
# ==========================================

@app.route("/admin", methods=["GET"])
def admin_dashboard():
    """Admin Dashboard Page (Protected)."""
    if not session.get("admin_logged_in"):
        return render_template("admin.html", logged_in=False)
    
    portfolio_data = load_resume_data()
    portfolio_json_str = json.dumps(portfolio_data, indent=2)
    return render_template("admin.html", logged_in=True, portfolio=portfolio_data, portfolio_json=portfolio_json_str)


@app.route("/admin/login", methods=["POST"])
def admin_login():
    """Authenticate Admin user."""
    password = request.form.get("password", "").strip()
    if password == ADMIN_PASSWORD:
        session["admin_logged_in"] = True
        flash("Successfully logged in to Admin Dashboard!", "success")
    else:
        flash("Invalid password! Please try again.", "danger")
    return redirect(url_for("admin_dashboard"))


@app.route("/admin/logout", methods=["GET", "POST"])
def admin_logout():
    """Log out Admin user."""
    session.pop("admin_logged_in", None)
    flash("Logged out successfully.", "info")
    return redirect(url_for("admin_dashboard"))


@app.route("/admin/upload-resume", methods=["POST"])
def upload_resume():
    """Upload a new PDF resume and update static/resume.pdf."""
    if not session.get("admin_logged_in"):
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    if "resume_file" not in request.files:
        flash("No file part in the request.", "danger")
        return redirect(url_for("admin_dashboard"))

    file = request.files["resume_file"]
    if file.filename == "":
        flash("No selected file.", "danger")
        return redirect(url_for("admin_dashboard"))

    if file and file.filename.lower().endswith(".pdf"):
        os.makedirs(os.path.dirname(RESUME_PDF_PATH), exist_ok=True)
        file.save(RESUME_PDF_PATH)
        flash("New Resume PDF uploaded and published successfully as static/resume.pdf!", "success")
    else:
        flash("Only PDF files (.pdf) are allowed.", "danger")

    return redirect(url_for("admin_dashboard"))


@app.route("/admin/update-portfolio", methods=["POST"])
def update_portfolio():
    """Update portfolio JSON data directly from Admin Portal."""
    if not session.get("admin_logged_in"):
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    json_raw = request.form.get("portfolio_json")
    if json_raw:
        try:
            parsed_data = json.loads(json_raw)
            save_resume_data(parsed_data)
            flash("Portfolio data updated and saved successfully! Your website sections are now updated live.", "success")
        except json.JSONDecodeError as e:
            flash(f"Invalid JSON format: {e}", "danger")
        except Exception as e:
            flash(f"Error saving data: {e}", "danger")
    
    return redirect(url_for("admin_dashboard"))


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
