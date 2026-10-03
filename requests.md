---
layout: makerspace
title: Print Requests
permalink: /requests/
---

<header class="makerspace-panel page-header-block">
  <span class="eyebrow">Your dashboard</span>
  <h1>Print Requests</h1>
  <p class="lead">Submit jobs, chat with staff, and review your print history. You only see your own requests.</p>
  <div class="page-header-actions">
    <a class="makerspace-button" href="{{ '/' | relative_url }}">Home</a>
  </div>
</header>

<div class="makerspace-panel form-page wide form-shell">
  <form id="requestForm" class="request-form">
    <div class="form-grid">
      <label class="field">
        Project name
        <input type="text" name="projectName" placeholder="Class prototype or part name" required>
      </label>
      <label class="field">
        Material
        <input type="text" name="material" placeholder="PLA / PETG" required>
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
        Upload STL or 3MF
        <input type="file" name="file" accept=".stl,.3mf" required>
      </label>
    </div>
    <div id="requestAlert" class="alert" aria-live="polite"></div>
    <div class="form-actions">
      <button type="submit" class="makerspace-action-button">Submit Request</button>
      <a class="makerspace-link-button" href="{{ '/' | relative_url }}">Cancel</a>
    </div>
  </form>

  <div>
    <h3 class="request-subhead">Active requests</h3>
    <div id="requestsEmpty" class="makerspace-empty" hidden></div>
    <div id="requestList" class="request-list"></div>

    <h3 class="request-subhead">Print history</h3>
    <div id="printHistory" class="request-list"></div>
  </div>
</div>
