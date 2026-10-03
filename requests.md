---
layout: page
title: Print Requests
permalink: /requests
---

<link rel="stylesheet" href="{{ '/assets/css/makerspace.css' | relative_url }}">
<script src="{{ '/assets/js/makerspace.js' | relative_url }}"></script>

<div class="makerspace-shell" style="padding-top: 48px;">
  <div class="makerspace-panel form-shell" style="max-width: 900px; margin: 0 auto;">
    <div class="section-header" style="margin-bottom: 20px;">
      <h2 style="margin: 0; color: var(--makerspace-navy);">Print Requests</h2>
      <a class="makerspace-button" href="{{ '/' | relative_url }}">Home</a>
    </div>
    <form id="requestForm" class="request-form" style="margin-bottom:18px;">
      <div class="form-grid">
        <label class="field">
          Project name
          <input type="text" name="projectName" placeholder="Class prototype or part name" required>
        </label>
        <label class="field">
          Material
          <input type="text" name="material" placeholder="PLA / PETG / Resin" required>
        </label>
        <label class="field">
          Dimensions
          <input type="text" name="dimensions" placeholder="e.g. 120x60x40 mm" required>
        </label>
        <label class="field field-full">
          Description
          <textarea name="description" placeholder="Describe the part, tolerances, and any notes" rows="3" required></textarea>
        </label>
        <label class="field">
          Needed by
          <input type="date" name="deadline">
        </label>
        <label class="field">
          Upload STL / 3MF
          <input type="file" name="file" accept=".stl,.3mf" required>
        </label>
      </div>
      <div id="requestAlert" class="alert" aria-live="polite"></div>
      <div style="margin-top:12px; display:flex; gap:12px;">
        <button type="submit" class="makerspace-action-button">Submit Request</button>
        <a class="makerspace-link-button" href="{{ '/' | relative_url }}">Cancel</a>
      </div>
    </form>
    <div id="requestList" class="request-list"></div>
  </div>
</div>
