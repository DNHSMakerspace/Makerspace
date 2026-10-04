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
  <section class="out-of-stock-panel" id="outOfStockPanel" aria-labelledby="outOfStockTitle">
    <h2 class="out-of-stock-title" id="outOfStockTitle">Out of stock colors</h2>
    <p class="out-of-stock-note" id="outOfStockNote">
      These colors aren’t available right now. New requests can only use stocked colors.
    </p>
    <div id="outOfStockList" class="out-of-stock-list"></div>
  </section>

  <section class="inventory-feed-panel" aria-labelledby="inventoryFeedTitle">
    <h2 class="inventory-feed-title" id="inventoryFeedTitle">Inventory updates</h2>
    <p class="inventory-feed-note">Stock notes from staff. Sign in to read and post.</p>
    <form id="inventoryFeedForm" class="inventory-feed-form">
      <label class="field">
        <span class="visually-hidden">Inventory update</span>
        <textarea id="inventoryFeedInput" name="message" rows="3" placeholder="Example: Clear PETG restocked." required></textarea>
      </label>
      <div class="inventory-feed-actions">
        <button type="submit" class="makerspace-action-button">Post update</button>
        <span id="inventoryFeedStatus" class="inventory-feed-status" aria-live="polite"></span>
      </div>
    </form>
    <div id="inventoryFeed" class="inventory-feed"></div>
  </section>

  <div>
    <h3 class="request-subhead">Active requests</h3>
    <div id="requestsEmpty" class="makerspace-empty" hidden></div>
    <div id="requestList" class="request-list"></div>

    <h3 class="request-subhead">Print history</h3>
    <div id="printHistory" class="request-list"></div>
  </div>
</div>
