---
layout: page
title: Del Norte Makerspace
permalink: /
---

<link rel="stylesheet" href="{{ '/assets/css/makerspace.css' | relative_url }}">

<div class="makerspace-shell">
  <header class="makerspace-topbar">
    <div class="makerspace-topbar-inner">
      <nav class="makerspace-nav" aria-label="Main navigation">
        <a href="{{ '/about' | relative_url }}">About</a>
        <a href="{{ '/requests' | relative_url }}">Requests</a>
        <a href="{{ '/signup' | relative_url }}">Sign Up</a>
        <a href="{{ '/signin' | relative_url }}">Sign In</a>
      </nav>
    </div>
  </header>

  <main class="makerspace-home">
    <section class="makerspace-hero">
      <div class="makerspace-panel hero-copy">
        <span class="eyebrow">Student innovation</span>
        <h1>Build what the classroom needs.</h1>
        <p>
          Del Norte Makerspace gives students a place to design, prototype, and create with support from teachers,
          club leaders, and fellow makers.
        </p>

        <div class="hero-actions">
          <a class="makerspace-button" href="{{ '/signup' | relative_url }}">Join the club</a>
          <a class="makerspace-link-button" href="{{ '/requests' | relative_url }}">Submit a request</a>
        </div>
      </div>

      <!-- hero-aside removed per site cleanup -->
    </section>

    <section class="makerspace-services">
      <div class="section-header">
        <h2>What we offer</h2>
      </div>

      <div class="content-grid">
        <article class="makerspace-panel info-card">
          <span class="eyebrow">Design support</span>
          <h3>Prototype ideas</h3>
          <p>Turn rough concepts into printable designs with guidance from club leaders and student mentors.</p>
        </article>

        <article class="makerspace-panel info-card">
          <span class="eyebrow">Club access</span>
          <h3>Print projects</h3>
          <p>Request school-safe builds for classes, clubs, competitions, and creative problem-solving challenges.</p>
        </article>

        <article class="makerspace-panel info-card">
          <span class="eyebrow">Safety first</span>
          <h3>Responsible creation</h3>
          <p>Each request is reviewed for practicality, safety, and school-appropriate use before printing.</p>
        </article>
      </div>
    </section>

    <section class="makerspace-cta">
      <div class="cta-panel">
        <div>
          <span class="eyebrow">Next step</span>
          <h3>Ready to make something?</h3>
        </div>
        <div class="cta-actions">
          <a class="makerspace-button" href="{{ '/signup' | relative_url }}">Create account</a>
          <a class="makerspace-link-button dark" href="{{ '/requests' | relative_url }}">View requests</a>
        </div>
      </div>
    </section>
  </main>
</div>
