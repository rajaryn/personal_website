# Personal Website — Responsive & Visual QA Test Contract

## Purpose

This document is a test-generation contract for Antigravity.

The goal is to generate and execute test cases that verify the redesigned personal website is:

- visually coherent
- responsive
- accessible
- interactive
- performant
- functional
- usable on mobile and desktop
- resilient when animations/media fail

Do NOT treat "the page renders" as sufficient.

---

# 1. Test Matrix

Generate tests across these viewport widths:

```text
320px
360px
375px
390px
414px
480px
768px
834px
1024px
1280px
1440px
1600px
1920px
```

Test both portrait and landscape where relevant.

---

# 2. Required Test Categories

Generate test cases for:

1. visual layout
2. responsive behavior
3. typography
4. navigation
5. hero interaction
6. scroll behavior
7. touch behavior
8. project interactions
9. external links
10. keyboard accessibility
11. focus states
12. reduced motion
13. media failure
14. image loading
15. video loading
16. horizontal overflow
17. content clipping
18. accessibility semantics
19. performance
20. route/navigation integrity

---

# 3. Responsive Tests

For every viewport:

### Test

- page fits viewport width
- no horizontal scrollbar
- no clipped text
- no overlapping content
- no elements extend outside viewport
- navigation remains usable
- buttons remain clickable
- project cards remain readable
- images preserve intended aspect ratio
- hero remains visually balanced
- footer remains readable

### Failure examples

Fail if:

```text
document.scrollWidth > viewport width
```

unless the overflow is an intentional internal carousel.

Fail if:

- text is cut off
- CTA is unreachable
- project metadata overlaps
- navigation covers content
- hero content becomes unreadable
- touch targets become too small

---

# 4. Hero Tests

If the cinematic hero is implemented:

### Desktop

1. Load page.
2. Verify hero fills viewport.
3. Verify initial state is visible.
4. Scroll forward.
5. Verify scroll drives visual progression.
6. Verify title transition.
7. Verify final hero state.
8. Verify normal page scrolling resumes.
9. Scroll back upward.
10. Verify re-entry behavior is intentional.

### Mobile

Repeat using touch scrolling.

Verify:

- touch scrolling works
- no browser scroll lock persists
- no page freeze
- video does not prevent interaction
- hero does not cause horizontal overflow

### Reduced motion

Enable:

```text
prefers-reduced-motion: reduce
```

Expected:

- no forced cinematic animation
- no scroll trap
- final/usable hero state is immediately available
- normal scrolling works

---

# 5. Scroll Lock Safety Tests

If scroll locking exists:

### Test A

Enter hero.

Expected:

- body lock is applied only while required

### Test B

Complete hero.

Expected:

- all body styles are restored

### Test C

Navigate away/unmount component.

Expected:

- body is unlocked
- page scroll position is restored

### Test D

Resize viewport while hero is active.

Expected:

- no permanent lock
- no layout corruption

### Test E

Browser back/forward.

Expected:

- no frozen page
- no persistent body styles

A permanent scroll lock is a critical failure.

---

# 6. Navigation Tests

Verify:

- every navigation item works
- anchor targets exist
- smooth scrolling does not hide headings under fixed navigation
- mobile menu opens
- mobile menu closes
- Escape closes menu where appropriate
- clicking a navigation item closes mobile menu
- keyboard navigation works
- focus is visible

---

# 7. Project Tests

For every project:

Verify:

- title
- description
- category
- technologies
- year/status where available
- live link where available
- GitHub link where available

Test:

```text
Live project → opens correct destination
GitHub → opens correct repository
```

External links must not contain fabricated URLs.

If a project does not have verified metadata, do not test invented metadata.

---

# 8. Live Project Tests

Known live projects:

```text
Hydration Companion
Vesper
Postcards & Little Footnotes
SC&SS Alumni Meet
```

For each:

- verify link exists
- verify link opens
- verify external link behavior
- verify loading state
- verify failure state if deployment is unavailable

Do not fail the portfolio merely because an external Render deployment is temporarily unavailable.

The portfolio should communicate deployment status gracefully.

---

# 9. Accessibility Tests

Run automated accessibility checks.

Verify:

- one logical main heading
- semantic landmarks
- navigation has accessible name
- buttons have accessible names
- links have meaningful text
- images have alt text
- decorative imagery is hidden from screen readers
- sufficient color contrast
- keyboard focus visible
- no keyboard trap
- form controls have labels
- headings follow logical hierarchy

---

# 10. Keyboard Tests

Using keyboard only:

```text
Tab
Shift + Tab
Enter
Space
Escape
Arrow keys where appropriate
```

Verify the entire website can be navigated.

No important functionality may require a mouse.

---

# 11. Touch Tests

On mobile:

- buttons respond to touch
- project interactions work without hover
- menus work
- links are sufficiently large
- no accidental page lock
- no gesture conflict
- cinematic hero does not interfere with normal page navigation

Minimum recommended touch target:

```text
44 × 44 px
```

---

# 12. Hover Tests

Desktop hover states may enhance the experience.

But:

**No essential content may exist only on hover.**

Verify that project descriptions, links and actions remain available without hover.

---

# 13. Media Failure Tests

Simulate:

- video unavailable
- slow video
- image unavailable
- external media timeout

Expected:

- meaningful fallback
- readable hero
- no blank screen
- no layout collapse
- no infinite loading state

---

# 14. Performance Tests

Check:

- initial page load
- largest contentful paint
- cumulative layout shift
- unnecessary JavaScript
- large media
- image sizes
- lazy loading
- unused dependencies

Particular attention:

### Hero video

The video must not make the website unusable on mobile or slow connections.

If necessary:

```text
desktop → cinematic video
mobile → optimized poster/image or lightweight video
```

---

# 15. Visual Regression Tests

Capture screenshots at:

```text
320
390
414
768
1024
1280
1440
1920
```

Compare against the intended design.

Flag:

- unexpected layout shifts
- typography overflow
- incorrect spacing
- missing sections
- broken alignment
- unexpected color changes
- clipped media
- broken animations
- inconsistent card sizing

Do not use pixel-perfect equality as the only criterion.

Allow small rendering differences between browsers.

---

# 16. Content Integrity Tests

Verify that the implementation does not invent portfolio information.

Compare rendered content against the approved source data.

Flag:

- fabricated achievements
- fabricated technologies
- fabricated metrics
- fabricated project claims
- incorrect dates
- incorrect URLs
- incorrect education information

---

# 17. Responsive Typography Tests

For each major heading:

Verify:

- no overflow
- no awkward one-word wrapping where avoidable
- line length remains intentional
- heading remains readable at 320px
- display typography does not consume the entire viewport on mobile

Use fluid typography where appropriate.

---

# 18. Footer Tests

Verify:

- social links work
- GitHub link works
- LinkedIn link works
- email link works if implemented
- resume link works
- no dead navigation links

---

# 19. Contact Tests

If contact form remains:

Test:

```text
valid submission
missing name
missing email
invalid email
missing message
empty submission
network failure
server failure
success state
```

Verify the user receives a clear result.

Do not expose sensitive backend errors to users.

---

# 20. Regression Tests

After every significant design change, rerun:

```text
responsive tests
hero tests
navigation tests
project link tests
accessibility tests
overflow tests
reduced-motion tests
```

Do not assume CSS-only changes cannot break mobile.

---

# 21. Test Case Format

Every generated test must contain:

```text
ID
Category
Viewport
Preconditions
Steps
Expected Result
Severity
```

Example:

```text
ID: RESP-390-001
Category: Responsive
Viewport: 390px
Preconditions: Website loaded

Steps:
1. Open homepage.
2. Inspect viewport.
3. Scroll through all sections.

Expected:
- no horizontal overflow
- no clipped content
- all CTAs accessible
- project layouts stack correctly

Severity:
Critical
```

---

# 22. Severity

Use:

```text
Critical
High
Medium
Low
```

### Critical

- site cannot scroll
- page permanently locked
- major content inaccessible
- mobile unusable
- navigation broken
- JavaScript crash affecting entire page

### High

- major section broken
- project links incorrect
- accessibility blocker
- serious responsive issue

### Medium

- visual inconsistency
- incorrect spacing
- animation issue with fallback available

### Low

- minor visual difference
- tiny alignment issue
- cosmetic inconsistency

---

# 23. Definition of Done

The redesign is complete only when:

```text
All Critical tests pass.

All High tests pass.

No viewport has horizontal overflow.

Mobile works at 320px.

Desktop works at 1920px.

Hero has a working reduced-motion fallback.

Hero cannot permanently lock scrolling.

Keyboard navigation works.

Essential information does not depend on hover.

Live project links are verified.

No fabricated portfolio content exists.

Accessibility checks pass.

No major console errors remain.

External failures have graceful fallbacks.
```

---

# 24. Final Instruction to Antigravity

Do not optimize only for a screenshot.

Optimize for:

```text
real user
real device
real viewport
real network
real keyboard
real touch interaction
real reduced-motion preferences
```

The website should remain excellent even when the cinematic effects are removed.

The design is successful when the experience feels intentional **and** the underlying website remains boringly reliable.
