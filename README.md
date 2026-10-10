# personal_website

Raj Aryan's portfolio — a single-page Flask app. All content comes from
`resume_data.json`; the templates and scripts contain no hardcoded portfolio data.

## Run locally

```sh
uv sync
cp .env.example .env   # then fill in real values
uv run python app.py   # http://127.0.0.1:5000
```

## Configuration (`.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `SECRET_KEY` | yes | Flask session signing key. Generate with `python -c "import secrets; print(secrets.token_hex(32))"`. |
| `ADMIN_PASSWORD` | yes | Password for the admin portal. |
| `ADMIN_PATH` | no | URL of the admin portal (default `/admin`). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `NOTIFY_EMAIL` | no | If `SMTP_HOST` and `NOTIFY_EMAIL` are set, each contact-form message is also emailed to `NOTIFY_EMAIL` (STARTTLS, port 587 by default). For Gmail use an [app password](https://myaccount.google.com/apppasswords). |

The app refuses to start without `SECRET_KEY` and `ADMIN_PASSWORD`.

## Content and runtime data

- `resume_data.json` and `static/resume.pdf` in the repo are the defaults.
- Everything written at runtime goes to `instance/` (gitignored):
  - `instance/contact_messages.json` — contact form submissions (also visible in the admin portal)
  - `instance/resume_data.json` — created when you save content in the admin portal; **overrides** the repo file until you click "Reset to repository version"
  - `instance/resume.pdf` — created when you upload a résumé in the admin portal; overrides `static/resume.pdf`

## Tests

```sh
uv run python -m unittest discover -s tests -v
```

## Deploy

Pushing to `main` runs the tests, then deploys to the Oracle VM over SSH
(`.github/workflows/deploy.yml`): `git pull`, `uv sync --locked`, restart the
`personal_website` systemd service, which runs Gunicorn from the project venv:
`.venv/bin/gunicorn --workers 3 --bind 127.0.0.1:8000 app:app` (nginx proxies to it).
All server dependencies, including Gunicorn, must be declared in `pyproject.toml`:
`uv sync --locked` removes anything else.
