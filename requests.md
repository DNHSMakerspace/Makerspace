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
        <select name="material" required>
          <option value="PLA">PLA</option>
          <option value="PETG">PETG</option>
          <option value="SILK+">SILK+</option>
        </select>
      </label>
      <label class="field">
        Needed by
        <input type="date" name="deadline" title="Optional">
        <span class="field-hint">Optional — leave blank if there isn’t a hard deadline.</span>
      </label>
      <label class="field field-full">
        Description
        <textarea name="description" placeholder="Describe the part, tolerances, and any notes. Put dimensions here only if they aren’t already clear from the uploaded model file." rows="3" required></textarea>
        <span class="field-hint">Dimensions should already be specified in your STL/3MF file — add size notes here only if needed.</span>
      </label>
      <label class="field">
        Upload STL or 3MF
        <input type="file" name="file" accept=".stl,.3mf" required>
      </label>
    </div>
    <div class="inline-note">
      After you submit, we’ll message you in the print request chat to confirm the price before printing begins.
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
