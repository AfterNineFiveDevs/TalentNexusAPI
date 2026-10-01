/*
 * CareerNexus prototype runtime. Vanilla JS, no build step.
 * - Injects the app shell (nav, mobile tab bar, trial banner) from <body data-shell data-active data-root>.
 * - Keeps prototype state in localStorage (fake; nothing is sent anywhere).
 * - Mirrors the real sign-up rules from TalentNexusContract/src/auth.ts (signupRequestSchema).
 */
(function () {
  'use strict';

  var KEY = 'careernexus-prototype';
  var DEFAULTS = { signedIn: false, simDay: 0, trialStart: null, saved: ['senior-accountant', 'finance-officer'], shareOn: true };
  function load() { try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode: prototype still works for this page */ } }
  var state = load();

  var body = document.body;
  var root = body.dataset.root || '';
  var shell = body.dataset.shell || 'none';
  var active = body.dataset.active || '';

  var ICON = {
    logo: '<path d="M4 5c4 0 6 2 8 6 2-4 4-6 8-6"/><path d="M12 11v9"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>'
  };
  function icon(name, size, color) {
    return '<svg width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="' + (color || 'currentColor') +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
  }
  function link(href, label, key) {
    return '<a href="' + root + href + '"' + (key === active ? ' aria-current="page"' : '') + '>' + label + '</a>';
  }

  // ---------- Trial maths (7-day opt-in trial) ----------
  function trialDaysLeft() { return state.trialStart === null ? null : 7 - (state.simDay - state.trialStart); }
  function trialStatus() {
    var d = trialDaysLeft();
    if (d === null) return 'none';
    return d > 0 ? 'active' : 'ended';
  }
  function premiumActive() { return trialStatus() === 'active'; }

  // ---------- Shell ----------
  var NAVS = {
    candidate: { brand: 'CareerNexus', home: 'profile/profile.html', links: [['profile/profile.html', 'Profile', 'profile'], ['cv/cvs.html', 'My CVs', 'cvs'], ['jobs/job-search.html', 'Jobs', 'jobs'], ['jobs/saved-jobs.html', 'Saved', 'saved']] },
    recruiter: { brand: 'CareerNexus for employers', home: 'recruiter/verify-company.html', links: [['recruiter/verify-company.html', 'Company', 'company'], ['recruiter/post-job.html', 'Jobs', 'rjobs'], ['recruiter/applicants.html', 'Applicants', 'applicants'], ['recruiter/find-candidates.html', 'Find candidates', 'find']] },
    admin: { brand: 'CareerNexus admin', home: 'admin/jobs.html', dark: true, links: [['admin/jobs.html', 'Jobs', 'ajobs'], ['admin/reports.html', 'Reports', 'reports'], ['admin/verification.html', 'Verification', 'verification'], ['admin/users.html', 'Users', 'users'], ['admin/subscriptions.html', 'Subscriptions', 'subscriptions'], ['admin/analytics.html', 'Analytics', 'analytics']] }
  };

  function renderShell() {
    if (shell === 'none') return;
    var header = document.createElement('header');
    if (shell === 'public') {
      header.className = 'topnav';
      header.innerHTML = '<a class="brand" href="' + root + 'public/landing.html">' + icon('logo', 22, 'var(--primary)') + 'CareerNexus</a>' +
        '<div class="row" style="margin-left: auto; --gap: 8px"><a class="btn btn--ghost" href="' + root + 'public/sign-in.html">Sign in</a>' +
        '<a class="btn btn--primary btn--sm hide-mobile" href="' + root + 'public/sign-up.html">Create free account</a></div>';
      body.prepend(header);
      return;
    }
    var nav = NAVS[shell];
    header.className = 'topnav' + (nav.dark ? ' topnav--dark' : '');
    var links = nav.links.map(function (l) { return link(l[0], l[1], l[2]); }).join('');
    var menu = shell === 'candidate'
      ? link('account/sharing-privacy.html', 'Sharing and privacy') + link('account/account-settings.html', 'Account settings') + link('account/plans.html', 'Plan') + '<a href="' + root + 'public/sign-in.html" data-sign-out>Sign out</a>'
      : '<a href="' + root + 'public/sign-in.html" data-sign-out>Sign out</a>';
    header.innerHTML = '<a class="brand" href="' + root + nav.home + '">' + icon('logo', 22, nav.dark ? '#ffffff' : 'var(--primary)') + nav.brand + '</a>' +
      '<nav aria-label="Main" class="topnav__links">' + links + '</nav>' +
      '<div class="menu"><button type="button" class="avatar" aria-haspopup="true" aria-expanded="false" aria-label="Account menu">' + (shell === 'admin' ? 'SS' : 'TA') + '</button>' +
      '<div class="menu__panel" hidden>' + menu + '</div></div>';
    body.prepend(header);

    if (shell === 'candidate') {
      var tb = document.createElement('nav');
      tb.className = 'tabbar';
      tb.setAttribute('aria-label', 'Tabs');
      tb.innerHTML = [['profile/profile.html', 'Profile', 'profile', 'user'], ['cv/cvs.html', 'CVs', 'cvs', 'doc'], ['jobs/job-search.html', 'Jobs', 'jobs', 'search'], ['jobs/saved-jobs.html', 'Saved', 'saved', 'bookmark']]
        .map(function (t) { return '<a href="' + root + t[0] + '"' + (t[2] === active ? ' aria-current="page"' : '') + '>' + icon(t[3], 22) + t[1] + '</a>'; }).join('');
      body.appendChild(tb);

      var st = trialStatus();
      if (st !== 'none') {
        var d = trialDaysLeft();
        var bar = document.createElement('div');
        bar.setAttribute('role', 'status');
        if (st === 'active') {
          bar.className = 'trialbar' + (d <= 2 ? ' trialbar--ending' : '');
          bar.innerHTML = '<span>Premium trial: ' + d + (d === 1 ? ' day' : ' days') + ' left</span><a href="' + root + (d <= 2 ? 'account/trial-reminder.html' : 'account/plans.html') + '">What happens next</a>';
        } else {
          bar.className = 'trialbar';
          bar.innerHTML = '<span>Your premium trial has ended. Everything you made stays yours.</span><a href="' + root + 'account/trial-ended.html">See what changed</a>';
        }
        header.after(bar);
      }
    }
  }

  // ---------- Prototype control panel ----------
  function renderProtoPanel() {
    if (body.dataset.noProto !== undefined) return;
    var d = document.createElement('details');
    d.className = 'proto';
    var ts = trialStatus();
    d.innerHTML = '<summary>Prototype · day ' + state.simDay + '</summary><div class="proto__panel">' +
      '<span>Trial: ' + (ts === 'none' ? 'not started' : ts === 'active' ? trialDaysLeft() + ' days left' : 'ended') + '</span>' +
      '<button type="button" data-sim-day="0">Simulate day 0</button>' +
      '<button type="button" data-sim-day="5">Simulate day 5 (reminder)</button>' +
      '<button type="button" data-sim-day="8">Simulate day 8 (trial over)</button>' +
      '<button type="button" data-reset>Reset prototype</button>' +
      '<a href="' + root + 'index.html" target="_top">Open flow map</a></div>';
    body.appendChild(d);
  }

  // ---------- Toast ----------
  var toastTimer;
  function toast(msg) {
    var t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  // ---------- Sign-up rules: same as signupRequestSchema ----------
  var SIGNUP_RULES = {
    username: function (v) {
      var t = v.trim();
      if (!t) return 'Username is required';
      if (t.length < 3) return 'Username must be at least 3 characters';
      if (t.length > 50) return 'Username cannot exceed 50 characters';
      if (!/^[a-zA-Z\s]+$/.test(t)) return 'Username can only contain letters and spaces';
      if (t.replace(/\s/g, '').length < 3) return 'Username must contain at least 3 non-space characters';
      return '';
    },
    email: function (v) {
      var t = v.trim().toLowerCase();
      if (!t) return 'Email is required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return 'Invalid email format';
      if (t.length > 255) return 'Email is too long';
      return '';
    },
    password: function (v) {
      if (!v) return 'Password is required';
      if (v.length < 8) return 'Password must be at least 8 characters long';
      if (v.length > 128) return 'Password must not exceed 128 characters';
      if (!/[A-Z]/.test(v)) return 'Password must contain at least one uppercase letter';
      if (!/[a-z]/.test(v)) return 'Password must contain at least one lowercase letter';
      if (!/[0-9]/.test(v)) return 'Password must contain at least one number';
      if (!/[^A-Za-z0-9]/.test(v)) return 'Password must contain at least one special character';
      return '';
    },
    confirmPassword: function (v, form) {
      if (!v) return 'Please confirm your password';
      if (v !== form.elements.password.value) return 'Passwords do not match';
      return '';
    },
    termsAccepted: function (v, form) { return form.elements.termsAccepted.checked ? '' : 'You must accept the terms and conditions'; }
  };
  function validateField(form, name) {
    var el = form.elements[name];
    var msg = SIGNUP_RULES[name](el.type === 'checkbox' ? '' : el.value, form);
    var out = document.getElementById(name + '-error');
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (out) { out.textContent = msg; out.hidden = !msg; }
    return !msg;
  }
  function wireSignup() {
    var form = document.getElementById('signup-form');
    if (!form) return;
    Object.keys(SIGNUP_RULES).forEach(function (name) {
      var el = form.elements[name];
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'blur', function () { validateField(form, name); });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = Object.keys(SIGNUP_RULES).map(function (n) { return validateField(form, n); }).every(Boolean);
      if (!ok) { var first = form.querySelector('[aria-invalid="true"]'); if (first) first.focus(); return; }
      state.signedIn = true; save(state);
      location.href = form.dataset.next;
    });
  }

  // ---------- Generic interactions ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button, a, [data-sim-day]');
    if (!t) return;

    if (t.matches('.avatar')) {
      var p = t.nextElementSibling; p.hidden = !p.hidden; t.setAttribute('aria-expanded', String(!p.hidden)); return;
    }
    if (t.hasAttribute('data-sign-out')) { state.signedIn = false; save(state); return; }
    if (t.hasAttribute('data-sim-day')) { state.simDay = Number(t.dataset.simDay); save(state); location.reload(); return; }
    if (t.hasAttribute('data-reset')) { try { localStorage.removeItem(KEY); } catch (err) {} location.reload(); return; }
    if (t.hasAttribute('data-start-trial')) {
      if (state.trialStart !== null) { e.preventDefault(); toast('You have already used your free trial.'); return; }
      state.trialStart = state.simDay; save(state); return; // follows its href
    }
    if (t.hasAttribute('data-premium') && !premiumActive()) {
      e.preventDefault();
      location.href = root + (trialStatus() === 'none' ? 'account/trial-start.html' : 'account/trial-ended.html');
      return;
    }
    if (t.dataset.openDialog) { var dlg = document.getElementById(t.dataset.openDialog); if (dlg && dlg.showModal) dlg.showModal(); return; }
    if (t.hasAttribute('data-close-dialog')) { var c = t.closest('dialog'); if (c) c.close(); if (t.dataset.toast) toast(t.dataset.toast); return; }
    if (t.dataset.saveJob) {
      var id = t.dataset.saveJob, i = state.saved.indexOf(id);
      if (i >= 0) state.saved.splice(i, 1); else state.saved.push(id);
      save(state); syncSaved(); toast(i >= 0 ? 'Removed from saved jobs' : 'Saved. Find it under Saved.'); return;
    }
    if (t.dataset.accept) {
      var target = document.getElementById(t.dataset.accept);
      var sug = t.closest('.suggestion');
      if (target && sug) { target.textContent = sug.querySelector('[data-suggested]').textContent; sug.hidden = true; }
      toast('Suggestion applied. You can still edit it.'); return;
    }
    if (t.dataset.dismiss) { var s2 = document.getElementById(t.dataset.dismiss); if (s2) s2.hidden = true; toast('Kept your wording'); return; }
    if (t.closest('.seg')) { t.closest('.seg').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === t)); }); return; }
    if (t.matches('.filter-pill')) { t.setAttribute('aria-pressed', String(t.getAttribute('aria-pressed') !== 'true')); return; }
    if (t.dataset.toast && t.tagName === 'BUTTON') { toast(t.dataset.toast); }
    if (t.dataset.go) { location.href = t.dataset.go; }
  });

  document.addEventListener('click', function (e) {
    var m = document.querySelector('.menu__panel');
    if (m && !m.hidden && !e.target.closest('.menu')) { m.hidden = true; document.querySelector('.avatar').setAttribute('aria-expanded', 'false'); }
  });

  function syncSaved() {
    document.querySelectorAll('[data-save-job]').forEach(function (b) {
      var on = state.saved.indexOf(b.dataset.saveJob) >= 0;
      b.setAttribute('aria-pressed', String(on));
      var lbl = b.querySelector('[data-save-label]');
      if (lbl) lbl.textContent = on ? 'Saved' : 'Save this job';
      if (b.classList.contains('icon-btn')) b.setAttribute('aria-label', on ? 'Remove from saved jobs' : 'Save job');
      b.style.color = on ? 'var(--primary)' : '';
    });
    document.querySelectorAll('[data-saved-only]').forEach(function (card) { card.hidden = state.saved.indexOf(card.dataset.savedOnly) < 0; });
    var empty = document.getElementById('saved-empty');
    if (empty) empty.hidden = document.querySelectorAll('[data-saved-only]:not([hidden])').length > 0;
  }

  function syncTrialBlocks() {
    var st = trialStatus();
    document.querySelectorAll('[data-trial]').forEach(function (el) { el.hidden = el.dataset.trial.split(' ').indexOf(st) < 0; });
    document.querySelectorAll('[data-trial-days]').forEach(function (el) { el.textContent = Math.max(trialDaysLeft() || 0, 0); });
    document.querySelectorAll('[data-premium]').forEach(function (el) {
      if (!premiumActive()) { el.setAttribute('aria-describedby', 'premium-hint'); }
    });
  }

  function wireForms() {
    document.querySelectorAll('form[data-next]').forEach(function (f) {
      if (f.id === 'signup-form') return;
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (f.dataset.signIn !== undefined) { state.signedIn = true; save(state); }
        location.href = f.dataset.next;
      });
    });
    var share = document.getElementById('share-toggle');
    if (share) {
      var sync = function () { document.getElementById('share-body').hidden = !share.checked; document.getElementById('share-state').textContent = share.checked ? 'On' : 'Off'; };
      share.checked = state.shareOn; sync();
      share.addEventListener('change', function () { state.shareOn = share.checked; save(state); sync(); toast(share.checked ? 'Link turned on' : 'Link turned off. It no longer works.'); });
    }
    var up = document.getElementById('upload-input');
    if (up) up.addEventListener('change', function () { if (up.files.length) location.href = up.dataset.next; });
  }

  // ---------- Landing: the one orchestrated motion moment ----------
  function wireReveal() {
    var box = document.querySelector('.reveal-ev');
    if (!box || !('IntersectionObserver' in window)) { if (box) box.querySelectorAll('.ev').forEach(function (r) { r.classList.add('is-lit'); }); return; }
    var rows = box.querySelectorAll('.ev');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        rows.forEach(function (r, i) { setTimeout(function () { r.classList.add('is-lit'); }, i * 220); });
        io.disconnect();
      });
    }, { threshold: 0.4 });
    io.observe(box);
  }

  renderShell();
  renderProtoPanel();
  wireSignup();
  wireForms();
  syncSaved();
  syncTrialBlocks();
  wireReveal();
})();
