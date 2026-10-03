---
layout: makerspace
title: Sign Up
permalink: /signup/
---

<div class="makerspace-panel form-page form-shell">
  <span class="eyebrow">Create account</span>
  <h2>Create a Makerspace account</h2>
  <p class="lead">Use your school email to sign up. Accounts are reviewed by Makerspace staff.</p>
  <form id="signupForm">
    <div class="form-grid">
      <label class="field">
        Full name
        <input type="text" name="name" placeholder="Jane Student" required>
      </label>
      <label class="field">
        School email
        <input type="email" name="email" placeholder="jsmith@stu.powayusd.com" required pattern="^[^@\s]+@stu\.powayusd\.com$" title="Use your Poway school email ending in @stu.powayusd.com">
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
    <div class="form-actions">
      <button type="submit" class="makerspace-action-button">Sign Up</button>
      <a class="makerspace-link-button" href="{{ '/signin/' | relative_url }}">Already have an account?</a>
    </div>
  </form>
</div>
