---
layout: page
title: Sign Out
permalink: /signout
---

<link rel="stylesheet" href="{{ '/assets/css/makerspace.css' | relative_url }}">
<script src="{{ '/assets/js/makerspace.js' | relative_url }}"></script>

<div class="makerspace-shell" style="padding-top: 80px;">
  <div class="makerspace-panel form-shell" style="max-width: 520px; margin: 0 auto; text-align: center;">
    <h2 style="margin-top: 0; color: var(--makerspace-navy);">You have signed out</h2>
    <p style="color: rgba(26,36,51,0.75); margin-bottom: 0;">Thanks for visiting the Del Norte Makerspace.</p>
    <div style="margin-top: 22px; display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
      <a class="makerspace-button" href="{{ '/' | relative_url }}">Back home</a>
      <a class="makerspace-link-button" href="{{ '/signin' | relative_url }}">Sign in again</a>
    </div>
  </div>
</div>

<script>
  document.addEventListener('DOMContentLoaded', function () {
    const state = JSON.parse(localStorage.getItem('makerspace-demo-state') || '{}');
    if (state) state.session = null;
    localStorage.setItem('makerspace-demo-state', JSON.stringify(state));
  });
</script>
