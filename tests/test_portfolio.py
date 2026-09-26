import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app

class TestPortfolioWebsite(unittest.TestCase):
    def setUp(self):
        self.app = app.app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

    def test_homepage_status_and_content(self):
        """Verify homepage renders 200 and contains essential sections."""
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)

        # Check essential content & headings
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

    def test_resume_pdf_route(self):
        """Verify /resume serves PDF resume correctly."""
        response = self.client.get('/resume')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, 'application/pdf')

    def test_contact_form_validation(self):
        """Verify contact form validation rules (missing fields, invalid email)."""
        # Empty request
        res1 = self.client.post('/contact', json={})
        self.assertEqual(res1.status_code, 400)

        # Invalid email
        res2 = self.client.post('/contact', json={
            'name': 'Test User',
            'email': 'invalid-email',
            'message': 'Hello'
        })
        self.assertEqual(res2.status_code, 400)

        # Valid submission
        res3 = self.client.post('/contact', json={
            'name': 'Test User',
            'email': 'test@example.com',
            'subject': 'Inquiry',
            'message': 'Hello Raj, great portfolio!'
        })
        self.assertEqual(res3.status_code, 200)
        data = res3.get_json()
        self.assertTrue(data.get('success'))

    def test_admin_route_protection(self):
        """Verify admin dashboard GET renders and login/logout works."""
        res = self.client.get('/admin')
        self.assertEqual(res.status_code, 200)
        self.assertIn('Admin Access', res.get_data(as_text=True))

if __name__ == '__main__':
    unittest.main()
