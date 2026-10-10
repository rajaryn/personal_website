import io
import json
import os
import shutil
import sys
import tempfile
import time
import unittest

# Configure the app before import: test secrets, a known admin path, and a
# throwaway instance folder so tests never touch real runtime data.
INSTANCE_DIR = tempfile.mkdtemp(prefix="portfolio-test-")
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["ADMIN_PASSWORD"] = "test-password"
os.environ["ADMIN_PATH"] = "/admin-test"
os.environ["PORTFOLIO_INSTANCE_PATH"] = INSTANCE_DIR
for var in ("SMTP_HOST", "NOTIFY_EMAIL"):
    os.environ.pop(var, None)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app  # noqa: E402

ADMIN = "/admin-test"


def tearDownModule():
    shutil.rmtree(INSTANCE_DIR, ignore_errors=True)


class PortfolioTestCase(unittest.TestCase):
    def setUp(self):
        self.app = app.app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        app._rate_buckets.clear()
        for name in os.listdir(INSTANCE_DIR):
            os.remove(os.path.join(INSTANCE_DIR, name))

    def csrf(self):
        """Load the admin page so the session gets a CSRF token, and return it."""
        self.client.get(ADMIN)
        with self.client.session_transaction() as sess:
            return sess["_csrf"]

    def login(self, password="test-password"):
        token = self.csrf()
        return self.client.post(f"{ADMIN}/login", data={"password": password, "csrf_token": token})


class TestPublicSite(PortfolioTestCase):
    def test_homepage_status_and_content(self):
        """Verify homepage renders 200 and contains essential sections."""
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)

        self.assertIn('Raj Aryan', html)
        self.assertIn('MindSpace', html)
        self.assertIn('IntelliDocs', html)
        self.assertIn('Hydration Companion', html)
        self.assertIn('Vesper', html)
        self.assertIn('Postcards &amp; Little Footnotes', html)
        self.assertIn('SC&amp;SS Alumni Meet', html)
        self.assertIn('Placement Coordinator', html)
        self.assertIn('Promptverse 2.0', html)
        self.assertIn('Jawaharlal Nehru University', html)
        self.assertIn("building something interesting", html)

    def test_homepage_renders_skills_and_hero(self):
        html = self.client.get('/').get_data(as_text=True)
        self.assertIn('id="zone-skills"', html)
        self.assertIn('Flask', html)
        self.assertIn('class="me-pitch"', html)
        self.assertIn('<h1 class="me-name">', html)

    def test_homepage_does_not_render_phone(self):
        html = self.client.get('/').get_data(as_text=True)
        self.assertNotIn('+91', html)

    def test_resume_pdf_route(self):
        """Verify /resume serves PDF resume correctly."""
        response = self.client.get('/resume')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, 'application/pdf')
        response.close()


class TestSignatureElements(PortfolioTestCase):
    def test_components_filter_splits_architecture(self):
        self.assertEqual(
            app.components("Custom RAG Pipeline + MySQL (User ACID transactions) + MongoDB."),
            [("Custom RAG Pipeline", None), ("MySQL", "User ACID transactions"), ("MongoDB", None)],
        )
        self.assertEqual(app.components(""), [])

    def test_homepage_renders_system_map_trace_and_colophon(self):
        html = self.client.get('/').get_data(as_text=True)
        self.assertIn('class="sysmap"', html)
        self.assertIn('<span class="sysmap-name">Pinecone Vector Store</span>', html)
        self.assertIn('class="me-trace"', html)
        self.assertIn('class="colophon"', html)
        self.assertRegex(html, r'\d+\.\d ms</span> to render')

    def test_status_endpoint_checks_in_background_and_caches(self):
        calls = []
        original = app.check_url
        app.check_url = lambda url: calls.append(url) or {"state": "up", "ms": 42}
        app._status.update({"checked_at": None, "results": {}, "refreshing": False})
        app._status.pop("last_refresh", None)
        try:
            first = self.client.get('/status.json').get_json()
            self.assertTrue(first["pending"])
            for _ in range(50):  # wait for the background refresh
                if not app._status["refreshing"]:
                    break
                time.sleep(0.05)

            second = self.client.get('/status.json').get_json()
            self.assertFalse(second["pending"])
            self.assertEqual(second["results"]["https://vesper-3asy.onrender.com/"], {"state": "up", "ms": 42})

            # Within the TTL, no new checks are made
            n = len(calls)
            self.client.get('/status.json')
            self.assertEqual(len(calls), n)
        finally:
            app.check_url = original


class TestContactForm(PortfolioTestCase):
    valid = {
        'name': 'Test User',
        'email': 'test@example.com',
        'subject': 'Inquiry',
        'message': 'Hello Raj, great portfolio!'
    }

    def test_contact_form_validation(self):
        """Verify contact form validation rules (missing fields, invalid email)."""
        self.assertEqual(self.client.post('/contact', json={}).status_code, 400)
        self.assertEqual(self.client.post('/contact', json=[]).status_code, 400)

        res = self.client.post('/contact', json={**self.valid, 'email': 'invalid-email'})
        self.assertEqual(res.status_code, 400)

        res = self.client.post('/contact', json={**self.valid, 'message': 'x' * 5001})
        self.assertEqual(res.status_code, 400)

    def test_valid_submission_is_saved_to_instance(self):
        res = self.client.post('/contact', json=self.valid)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json().get('success'))

        with open(app.MESSAGES_FILE, encoding='utf-8') as f:
            saved = json.load(f)
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0]['email'], 'test@example.com')

    def test_honeypot_is_silently_dropped(self):
        res = self.client.post('/contact', json={**self.valid, 'website': 'http://spam'})
        self.assertEqual(res.status_code, 200)
        self.assertFalse(os.path.exists(app.MESSAGES_FILE))

    def test_contact_rate_limit(self):
        for _ in range(5):
            self.assertEqual(self.client.post('/contact', json=self.valid).status_code, 200)
        self.assertEqual(self.client.post('/contact', json=self.valid).status_code, 429)


class TestAdmin(PortfolioTestCase):
    def test_admin_login_page_renders(self):
        res = self.client.get(ADMIN)
        self.assertEqual(res.status_code, 200)
        self.assertIn('Admin Access', res.get_data(as_text=True))

    def test_post_without_csrf_token_is_rejected(self):
        res = self.client.post(f"{ADMIN}/login", data={"password": "test-password"})
        self.assertEqual(res.status_code, 400)

    def test_wrong_password_and_lockout(self):
        for _ in range(5):
            self.login("wrong")
        # Even the right password is refused while locked out
        self.login()
        with self.client.session_transaction() as sess:
            self.assertFalse(sess.get("admin_logged_in"))

    def test_protected_actions_require_login(self):
        token = self.csrf()
        res = self.client.post(f"{ADMIN}/update-portfolio",
                               data={"portfolio_json": "{}", "csrf_token": token})
        self.assertEqual(res.status_code, 401)
        self.assertFalse(os.path.exists(app.DATA_FILE))

    def test_login_and_update_portfolio(self):
        self.login()
        with self.client.session_transaction() as sess:
            self.assertTrue(sess.get("admin_logged_in"))
        token = self.csrf()  # login rotates the session, so fetch a fresh token

        data = app.load_resume_data()
        data["name"] = "Edited Name"
        self.client.post(f"{ADMIN}/update-portfolio",
                         data={"portfolio_json": json.dumps(data), "csrf_token": token})
        self.assertIn("Edited Name", self.client.get('/').get_data(as_text=True))

        # Reset falls back to the committed file
        token = self.csrf()
        self.client.post(f"{ADMIN}/reset-portfolio", data={"csrf_token": token})
        self.assertNotIn("Edited Name", self.client.get('/').get_data(as_text=True))

    def test_upload_rejects_non_pdf_content(self):
        self.login()
        token = self.csrf()
        self.client.post(f"{ADMIN}/upload-resume", data={
            "csrf_token": token,
            "resume_file": (io.BytesIO(b"<html>not a pdf</html>"), "resume.pdf"),
        }, content_type="multipart/form-data")
        self.assertFalse(os.path.exists(app.RESUME_PDF_PATH))

    def test_upload_pdf_is_served(self):
        self.login()
        token = self.csrf()
        self.client.post(f"{ADMIN}/upload-resume", data={
            "csrf_token": token,
            "resume_file": (io.BytesIO(b"%PDF-1.4 test"), "resume.pdf"),
        }, content_type="multipart/form-data")
        res = self.client.get('/resume')
        self.assertEqual(res.data, b"%PDF-1.4 test")
        res.close()


if __name__ == '__main__':
    unittest.main()
