/**
 * Raj Aryan Portfolio - Modern Vanilla JS
 * Features: Dark/Light Mode Theme Switcher, Sticky Navbar, Smooth Scroll, Re-triggerable Entrance Animations, Contact Form AJAX
 */

document.addEventListener('DOMContentLoaded', () => {
  const htmlElement = document.documentElement;
  const themeToggleBtn = document.getElementById('theme-toggle');
  const navbar = document.getElementById('navbar');
  const navToggle = document.getElementById('nav-toggle');
  const navMenu = document.getElementById('nav-menu');
  const navLinks = document.querySelectorAll('.nav-link');
  const contactForm = document.getElementById('contact-form');
  const formStatus = document.getElementById('form-status');
  const submitBtn = document.getElementById('submit-btn');

  // ==========================================
  // 1. DARK / LIGHT MODE THEME TOGGLE LOGIC
  // ==========================================
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    htmlElement.setAttribute('data-theme', 'dark');
  } else {
    htmlElement.setAttribute('data-theme', 'light');
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = htmlElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      htmlElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
    });
  }

  // ==========================================
  // 2. STICKY NAVBAR EFFECT
  // ==========================================
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  // ==========================================
  // 3. MOBILE NAVIGATION MENU TOGGLE
  // ==========================================
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      const isOpen = navMenu.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', isOpen);
    });

    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ==========================================
  // 4. ACTIVE NAV LINK & DYNAMIC ENTRANCE ANIMATIONS
  // ==========================================
  const sections = document.querySelectorAll('section[id]');
  const animatedElements = document.querySelectorAll('.animate-on-scroll');

  if ('IntersectionObserver' in window) {
    // Nav highlight observer
    const navObserverOptions = {
      root: null,
      rootMargin: '-30% 0px -50% 0px',
      threshold: 0
    };

    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const currentId = entry.target.getAttribute('id');
          navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${currentId}`) {
              link.classList.add('active');
            }
          });
        }
      });
    }, navObserverOptions);

    sections.forEach(section => sectionObserver.observe(section));

    // Scroll Entrance Animation Observer (Re-triggers smoothly on navigation)
    const animObserverOptions = {
      root: null,
      rootMargin: '0px 0px -60px 0px',
      threshold: 0.15
    };

    const animObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animated');
        } else {
          // Reset animation so moving back and forth between sections re-triggers entrance transitions
          entry.target.classList.remove('animated');
        }
      });
    }, animObserverOptions);

    animatedElements.forEach(el => animObserver.observe(el));
  } else {
    animatedElements.forEach(el => el.classList.add('animated'));
  }

  // Handle smooth scroll clicks explicitly to trigger section animations smoothly
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const targetElem = document.querySelector(targetId);
      if (targetElem) {
        e.preventDefault();
        targetElem.scrollIntoView({
          behavior: 'smooth'
        });
      }
    });
  });

  // ==========================================
  // 5. CONTACT FORM VALIDATION & AJAX SUBMISSION
  // ==========================================
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      formStatus.className = 'form-status';
      formStatus.style.display = 'none';

      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const subject = document.getElementById('subject').value.trim();
      const message = document.getElementById('message').value.trim();

      if (!name || !email || !message) {
        showStatus('Please fill in all required fields (Name, Email, Message).', 'error');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        showStatus('Please enter a valid email address.', 'error');
        return;
      }

      submitBtn.disabled = true;
      const originalBtnText = submitBtn.innerHTML;
      submitBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"></circle>
        </svg>
        Sending...
      `;

      try {
        const response = await fetch('/contact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ name, email, subject, message })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          showStatus(data.message || 'Message sent successfully!', 'success');
          contactForm.reset();
        } else {
          showStatus(data.error || 'Failed to send message. Please try again.', 'error');
        }
      } catch (err) {
        console.error('Contact form error:', err);
        showStatus('Network error. Please check your connection and try again.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      }
    });
  }

  function showStatus(msg, type) {
    formStatus.textContent = msg;
    formStatus.className = `form-status ${type}`;
    formStatus.style.display = 'block';
  }
});
