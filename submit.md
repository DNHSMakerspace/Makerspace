---
layout: makerspace
title: Submit a Print Request
permalink: /submit/
---

<header class="makerspace-panel page-header-block">
  <span class="eyebrow">New job</span>
  <h1>Submit a Print Request</h1>
  <p class="lead">Upload an STL or 3MF, pick a stocked material and color, and we’ll confirm the price in chat before printing.</p>
  <div class="page-header-actions">
    <a class="makerspace-button" href="{{ '/' | relative_url }}">Home</a>
    <a class="makerspace-link-button" href="{{ '/requests/' | relative_url }}">Active requests</a>
  </div>
</header>

<div class="makerspace-panel form-page wide form-shell">
  <p id="welcomeUser">Sign in to start printing</p>
  <p class="section-note">
    Once a request is submitted, you’ll get a message in the print request chat to confirm the price before printing begins.
  </p>

  <form id="requestForm" class="request-form">
    <div class="form-grid">
      <label class="field">
        Project name
        <input type="text" name="projectName" placeholder="Example: Robotics Battery Holder" required>
      </label>
      <label class="field">
        Material
        <select id="requestMaterial" name="material" required>
          <option value="PLA">PLA</option>
          <option value="PETG">PETG</option>
          <option value="SILK+">SILK+</option>
        </select>
      </label>
      <label class="field">
        Color
        <select id="requestColor" name="color" required>
          <option value="">Select a material first</option>
        </select>
        <span class="field-hint" id="requestColorHint">Color options come from what staff currently stock for the selected material.</span>
      </label>
      <label class="field">
        Needed by
        <input type="date" name="deadline" title="Optional">
        <span class="field-hint">Optional — leave blank if there isn’t a hard deadline.</span>
      </label>
      <div class="field field-full">
        <label for="requestDescription">Description</label>
        <textarea id="requestDescription" name="description" placeholder="Describe the part, tolerances, and any notes. Put dimensions here only if they aren’t already clear from the uploaded model file." required></textarea>
        <span class="field-hint">Dimensions should already be specified in your STL/3MF file — add size notes here only if needed.</span>
      </div>
      <label class="field field-full">
        Model file (STL or 3MF only)
        <input type="file" name="file" accept=".stl,.3mf" required>
      </label>
    </div>
    <div class="inline-note">
      Sign in with your school email before submitting. Files must be .stl or .3mf.
      After you submit, we’ll message you in the print request chat to confirm the price before printing begins.
    </div>
    <div id="requestAlert" class="alert" aria-live="polite"></div>
    <div class="form-actions">
      <button type="submit" class="makerspace-action-button">Submit print request</button>
    </div>
  </form>
</div>
