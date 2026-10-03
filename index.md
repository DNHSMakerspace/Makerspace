---
layout: page
title: Nel Norte Makerspace
permalink: /
---

<link rel="stylesheet" href="{{ '/assets/css/makerspace.css' | relative_url }}">

<div class="makerspace-shell">
  <header class="makerspace-topbar">
    <div class="makerspace-topbar-inner">
      <a class="makerspace-brand" href="{{ '/' | relative_url }}">
        <span class="makerspace-brand-mark">3D</span>
        <span>Nel Norte Makerspace</span>
      </a>

      <nav class="makerspace-nav" aria-label="Main navigation">
        <a href="{{ '/about' | relative_url }}">About</a>
        <a href="{{ '/requests' | relative_url }}">Requests</a>
        <a href="{{ '/signup' | relative_url }}">Sign Up</a>
        <a href="{{ '/signin' | relative_url }}">Sign In</a>
      </nav>
    </div>
  </header>

  <main class="makerspace-hero">
    <div class="makerspace-panel hero-copy">
      <span class="eyebrow">Student-made ideas</span>
      <h1>Turn classroom ideas into real objects.</h1>
      <p>
        Nel Norte High School Makerspace helps students design, prototype, and 3D print projects for STEM classes,
        clubs, and creative problem-solving challenges.
      </p>

      <div class="hero-actions">
        <a class="makerspace-button" href="{{ '/signup' | relative_url }}">Join the club</a>
        <a class="makerspace-link-button" href="{{ '/requests' | relative_url }}">Submit a request</a>
      </div>

      <div class="hero-stats">
        <div class="stat-pill">
          <strong>240+</strong>
          <span>Prints finished</span>
        </div>
        <div class="stat-pill">
          <strong>18</strong>
          <span>Student makers</span>
        </div>
        <div class="stat-pill">
          <strong>4.8/5</strong>
          <span>Print quality</span>
        </div>
      </div>
    </div>

    <div class="makerspace-panel hero-visual">
      <div class="print-card">
        <div class="print-card-header">
          <strong>Printer Queue</strong>
          <span class="status-dot" aria-label="Printer online"></span>
        </div>
        <div class="print-display">
          <div class="model"><span>Model</span><span>MiniBot v3</span></div>
          <div class="cube"><div class="cube-shape"></div></div>
          <div class="model"><span>Progress</span><span>82%</span></div>
        </div>
      </div>
    </div>
  </main>
</div>
