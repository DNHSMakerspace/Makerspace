---
layout: makerspace
title: My Print Requests
permalink: /requests/
---

<header class="makerspace-panel page-header-block">
  <span class="eyebrow">Your dashboard</span>
  <h1>Print Requests</h1>
  <p class="lead">Chat with staff about active jobs and review print history. You only see your own requests.</p>
  <div class="page-header-actions">
    <a class="makerspace-button" href="{{ '/submit/' | relative_url }}">Submit a request</a>
    <a class="makerspace-link-button" href="{{ '/' | relative_url }}">Home</a>
  </div>
</header>

<div class="makerspace-panel form-page wide form-shell">
  <div>
    <h3 class="request-subhead">Active requests</h3>
    <div id="requestsEmpty" class="makerspace-empty" hidden></div>
    <div id="requestList" class="request-list"></div>

    <h3 class="request-subhead">Print history</h3>
    <div id="printHistory" class="request-list"></div>
  </div>
</div>
