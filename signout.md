---
layout: makerspace
title: Sign Out
permalink: /signout
---

<header class="makerspace-panel page-header-block form-page narrow text-center">
  <span class="eyebrow">Session ended</span>
  <h1>You have signed out</h1>
  <p class="lead">Thanks for visiting the Del Norte Makerspace. Come back anytime to print something new.</p>
  <div class="page-header-actions actions-center">
    <a class="makerspace-button" href="{{ '/' | relative_url }}">Back home</a>
    <a class="makerspace-link-button" href="{{ '/signin' | relative_url }}">Sign in again</a>
  </div>
</header>

<script>
  document.addEventListener('DOMContentLoaded', function () {
    const state = JSON.parse(localStorage.getItem('makerspace-demo-state') || '{}');
    if (state) state.session = null;
    localStorage.setItem('makerspace-demo-state', JSON.stringify(state));
  });
</script>
