---
layout: page
title: Sign Up
permalink: /signup
---

<link rel="stylesheet" href="{{ '/assets/css/makerspace.css' | relative_url }}">
<script src="{{ '/assets/js/makerspace.js' | relative_url }}"></script>

<div class="makerspace-shell" style="padding-top: 48px;">
  <div class="makerspace-panel form-shell" style="max-width: 720px; margin: 0 auto;">
    <h2 style="margin-top: 0; color: var(--makerspace-navy);">Create a Makerspace account</h2>
    <form id="signupForm">
      <div class="form-grid">
        <label class="field">
          Full name
          <input type="text" name="name" placeholder="Jane Student" required>
        </label>
        <label class="field">
          School email
          <input type="email" name="email" placeholder="jsmith@stu.powayusd.com" required>
        </label>
        <label class="field">
          School ID
          <input type="text" name="schoolId" placeholder="1954321" required pattern="^19\d{5}$" title="Enter a 7-digit ID starting with 19">
        </label>
        <label class="field">
          Password
          <input type="password" name="password" placeholder="Create a secure password" required>
        </label>
      </div>
      <div id="signupAlert" class="alert" aria-live="polite"></div>
      <div style="margin-top: 18px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
        <button type="submit" class="makerspace-action-button">Sign Up</button>
        <a class="makerspace-link-button" href="{{ '/signin' | relative_url }}">Already have an account?</a>
      </div>
    </form>
  </div>
</div>
