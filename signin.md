---
layout: makerspace
title: Sign In
permalink: /signin
---

<div class="makerspace-panel form-page narrow form-shell">
  <span class="eyebrow">Welcome back</span>
  <h2>Sign in to the Makerspace</h2>
  <p class="lead">Sign in with your Poway school email to see and submit print requests.</p>
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
    <div class="form-actions">
      <button type="submit" class="makerspace-action-button">Sign In</button>
      <a class="makerspace-link-button" href="{{ '/signup' | relative_url }}">Create account</a>
    </div>
  </form>
</div>
