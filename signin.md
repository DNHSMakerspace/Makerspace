---
layout: page
title: Sign In
permalink: /signin
---

<link rel="stylesheet" href="{{ '/assets/css/makerspace.css' | relative_url }}">
<script src="{{ '/assets/js/makerspace.js' | relative_url }}"></script>

<div class="makerspace-shell" style="padding-top: 48px;">
  <div class="makerspace-panel form-shell" style="max-width: 560px; margin: 0 auto;">
    <h2 style="margin-top: 0; color: var(--makerspace-navy);">Sign in to the Makerspace</h2>
    <form id="signinForm">
      <div class="form-grid">
        <label class="field field-full">
          School email
          <input type="email" name="email" placeholder="student@stu.powayusd.com" required pattern="^[^@\s]+@stu\.powayusd\.com$" title="Use your school email ending in @stu.powayusd.com">
        </label>
        <label class="field field-full">
          Password
          <input type="password" name="password" placeholder="Enter your password" required>
        </label>
      </div>
      <div id="signinAlert" class="alert" aria-live="polite"></div>
      <div style="margin-top: 18px; display: flex; gap: 12px; flex-wrap: wrap;">
        <button type="submit" class="makerspace-action-button">Sign In</button>
        <a class="makerspace-link-button" href="{{ '/signup' | relative_url }}">Create account</a>
      </div>
    </form>
  </div>
</div>
