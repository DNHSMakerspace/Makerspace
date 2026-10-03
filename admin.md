---
layout: makerspace
title: Admin Tools
permalink: /admin/
---

<header class="makerspace-panel page-header-block">
  <span class="eyebrow">Staff only</span>
  <h1>Admin Tools</h1>
  <p class="lead">Review print jobs, manage filament inventory, create admin accounts, and search every member on the site.</p>
  <div class="page-header-actions">
    <a class="makerspace-button" href="{{ '/' | relative_url }}">Home</a>
    <a class="makerspace-link-button" href="{{ '/submit/' | relative_url }}">Submit request</a>
    <a class="makerspace-link-button" href="{{ '/requests/' | relative_url }}">Print requests</a>
  </div>
</header>

<section class="makerspace-section" data-role="admin" hidden>
  <div class="section-header">
    <div>
      <span class="eyebrow">Staff tools</span>
      <h2>Admin review</h2>
      <p>Accept requests, mark completed when the print is done, or close them. Completed and closed jobs move to print history.</p>
    </div>
  </div>

  <div class="makerspace-panel form-shell">
    <div id="adminRequestList" class="admin-list"></div>
  </div>

  <div class="makerspace-panel form-shell stacked-panel">
    <div class="section-header">
      <div>
        <span class="eyebrow">Filament stock</span>
        <h3>Print inventory</h3>
        <p>Add colors we have on hand. Students only pick colors listed for the material they choose (PLA, PETG, SILK+).</p>
      </div>
    </div>

    <form id="inventoryForm">
      <div class="form-grid">
        <label class="field">
          Color / stock name
          <input type="text" name="name" placeholder="Orange PLA basic" required>
        </label>
        <label class="field">
          Material
          <select name="material" required>
            <option value="PLA">PLA</option>
            <option value="PETG">PETG</option>
            <option value="SILK+">SILK+</option>
          </select>
        </label>
      </div>
      <div id="inventoryAlert" class="alert" aria-live="polite"></div>
      <div class="form-actions">
        <button type="submit" class="makerspace-action-button">Add inventory item</button>
      </div>
    </form>

    <div id="inventoryList" class="inventory-list"></div>
  </div>

  <div class="makerspace-panel form-shell stacked-panel">
    <div class="section-header">
      <div>
        <span class="eyebrow">Directory</span>
        <h3>Members</h3>
        <p>Search every account. Open a member to view their print history, edit email / school ID / password / role, promote them to admin, or delete the account.</p>
      </div>
    </div>

    <label class="field">
      Search members
      <input type="search" id="memberSearch" placeholder="Name, email, school ID, password, or role" autocomplete="off">
      <span class="field-hint">Searches name, email, school ID, password, and role.</span>
    </label>

    <div id="memberList" class="member-list"></div>
  </div>

  <div class="makerspace-panel form-shell stacked-panel">
    <div class="section-header">
      <div>
        <span class="eyebrow">Admin access</span>
        <h3>Create admin account</h3>
        <p>Only current admins can add other admin accounts.</p>
      </div>
    </div>

    <form id="adminCreateForm">
      <div class="form-grid">
        <label class="field">
          Full name
          <input type="text" name="name" placeholder="Jane Admin" required>
        </label>
        <label class="field">
          School email
          <input type="email" name="email" placeholder="jadmin@stu.powayusd.com" required pattern="^[^@\s]+@stu\.powayusd\.com$" title="Use a Poway school email ending in @stu.powayusd.com">
        </label>
        <label class="field">
          School ID
          <input type="text" name="schoolId" placeholder="1954321" required pattern="^19\d{5}$" title="Enter a 7-digit ID starting with 19">
        </label>
        <label class="field">
          Password
          <input type="password" name="password" placeholder="Create a secure password" required minlength="4">
        </label>
      </div>
      <div id="adminCreateAlert" class="alert" aria-live="polite"></div>
      <div class="form-actions">
        <button type="submit" class="makerspace-action-button">Create admin account</button>
      </div>
    </form>
  </div>
</section>

<section class="makerspace-section" data-auth-area="signed-out">
  <div class="makerspace-panel form-page narrow">
    <span class="eyebrow">Locked</span>
    <h2>Admin sign-in required</h2>
    <p>Sign in with an admin school email to open staff tools.</p>
    <div class="form-actions">
      <a class="makerspace-button" href="{{ '/signin/' | relative_url }}">Sign in</a>
    </div>
  </div>
</section>

<section class="makerspace-section" data-role="member" hidden>
  <div class="makerspace-panel form-page narrow">
    <span class="eyebrow">Locked</span>
    <h2>You need admin access</h2>
    <p>This account can submit print requests, but only admins can open staff tools.</p>
    <div class="form-actions">
      <a class="makerspace-button" href="{{ '/requests/' | relative_url }}">My requests</a>
    </div>
  </div>
</section>
