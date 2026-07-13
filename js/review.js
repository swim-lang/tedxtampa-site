/* TEDxTampa revision/review system — ported from the Off Menu widget
   (which itself mirrors Arc88). Vanilla JS for this static multi-page site.

   Activate by sharing a link with ?review=comment (or ?review=browse), e.g.
   https://…/index.html?review=comment — reviewers click any outlined section
   to leave a note. Comments save to Supabase; the anon key below is PUBLIC
   (safe to ship) — access is gated by row-level security to project =
   'tedxtampa'. Sections opt in with data-review-id="<pagePrefix>-<name>". */

(function () {
  'use strict';

  var REVIEW_CONFIG = {
    supabaseUrl: 'https://kirmozciaosdbmndomhn.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtpcm1vemNpYW9zZGJtbmRvbWhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMDQ3NDksImV4cCI6MjA5ODU4MDc0OX0.cnTG0J6LyCii3gOvnCcc3j7e1EXa80yJxifkpw4h3LU',
    project: 'tedxtampa',
    table: 'tedxtampa_review_comments',
  };

  // pagePrefix (first token of a review id) → page file + friendly label.
  var PAGE_ROUTES = {
    home: 'index.html', talks: 'talks.html', impact: 'impact.html',
    about: 'about.html', partners: 'partners.html',
  };
  var PAGE_LABELS = {
    home: 'Home', talks: 'Talks & Speakers', impact: 'Impact',
    about: 'About & Team', partners: 'Partners',
  };

  var REVIEW_TABLE = REVIEW_CONFIG.table;
  var REVIEW_PROJECT = REVIEW_CONFIG.project;
  var REVIEW_MODE_KEY = 'tedxtampa-review-mode';
  var REVIEW_JUMP_KEY = 'tedxtampa-review-jump';
  var REVIEW_URL = (REVIEW_CONFIG.supabaseUrl || '').replace(/\/$/, '');
  var REVIEW_KEY = REVIEW_CONFIG.supabaseAnonKey || '';
  var HAS_SUPABASE = Boolean(REVIEW_URL && REVIEW_KEY);

  var params = new URLSearchParams(window.location.search);
  var reviewParam = params.get('review');
  var reviewRequested = params.has('review');

  // Only activate for a shared ?review link or once a mode is in this session.
  if (!reviewRequested && !window.sessionStorage.getItem(REVIEW_MODE_KEY)) return;

  var validParamMode = ['browse', 'comment', 'view'].indexOf(reviewParam) !== -1 ? reviewParam : '';
  var state = {
    mode: validParamMode || (reviewRequested ? '' : window.sessionStorage.getItem(REVIEW_MODE_KEY) || ''),
    comments: [],
    activeTarget: null,
    panelOpen: false,
    commentTab: 'open',
    notice: '',
    syncWarning: HAS_SUPABASE ? '' : 'Supabase review database is not configured yet. Comments cannot be saved.',
  };

  var layer = document.createElement('div');
  layer.className = 'review-layer';
  document.body.appendChild(layer);
  var pinLayer = document.createElement('div');
  pinLayer.className = 'review-pins';
  document.body.appendChild(pinLayer);
  var noticeTimer = 0;
  var pinRaf = 0;

  // ---- page helpers (real multi-page site, no SPA routing) -----------------
  var currentFile = function () {
    var file = window.location.pathname.split('/').pop() || 'index.html';
    if (file.indexOf('.html') === -1) file += '.html'; // clean-URL hosts
    return file;
  };
  var pageName = function () {
    for (var key in PAGE_ROUTES) if (PAGE_ROUTES[key] === currentFile()) return key;
    return 'home';
  };
  var prefixOf = function (reviewId) { return (reviewId || '').split('-')[0]; };
  var routeForComment = function (item) { return PAGE_ROUTES[prefixOf(item.reviewId)] || 'index.html'; };
  var commentPageLabel = function (item) { return PAGE_LABELS[prefixOf(item.reviewId)] || 'Home'; };

  var textQuote = function (el) {
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  };

  var escapeHtml = function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  // ---- Supabase row <-> comment mapping ------------------------------------
  var toComment = function (row) {
    return {
      id: row.id, project: row.project, page: row.page, path: row.path,
      reviewId: row.review_id, selector: row.selector, textQuote: row.text_quote || '',
      comment: row.comment, status: row.status || 'open', viewport: row.viewport || null,
      anchor: row.anchor || null,
      createdAt: row.created_at, resolvedAt: row.resolved_at || null,
      reply: row.reply || '', replyAt: row.reply_at || null, replyAck: !!row.reply_ack,
    };
  };
  var toRow = function (item) {
    return {
      id: item.id, project: item.project, page: item.page, path: item.path,
      review_id: item.reviewId, selector: item.selector, text_quote: item.textQuote,
      comment: item.comment, status: item.status, viewport: item.viewport,
      anchor: item.anchor || null,
      created_at: item.createdAt, resolved_at: item.resolvedAt || null,
    };
  };

  var request = function (path, options) {
    options = options || {};
    var headers = {
      apikey: REVIEW_KEY,
      Authorization: 'Bearer ' + REVIEW_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
    for (var h in (options.headers || {})) headers[h] = options.headers[h];
    options.headers = headers;
    return fetch(REVIEW_URL + '/rest/v1/' + path, options).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error(t); });
      if (res.status === 204) return [];
      return res.json();
    });
  };

  var openComments = function () { return state.comments.filter(function (c) { return c.status !== 'resolved'; }); };
  var unrepliedComments = function () { return openComments().filter(function (c) { return !c.reply; }); };
  var repliedComments = function () { return openComments().filter(function (c) { return c.reply; }); };
  var resolvedComments = function () { return state.comments.filter(function (c) { return c.status === 'resolved'; }); };
  var visibleComments = function () {
    if (state.commentTab === 'resolved') return resolvedComments();
    if (state.commentTab === 'reviewed') return repliedComments();
    return unrepliedComments();
  };

  var setMode = function (mode) {
    state.mode = mode;
    state.activeTarget = null;
    window.sessionStorage.setItem(REVIEW_MODE_KEY, mode);
    document.documentElement.dataset.reviewMode = mode || '';
    render();
    if (mode === 'browse' || mode === 'comment') loadComments();
  };

  var showNotice = function (message) {
    state.notice = message;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(function () { state.notice = ''; render(); }, 2800);
    render();
  };

  var markCommentedSections = function () {
    document.querySelectorAll('[data-review-id]').forEach(function (node) {
      var hasComment = state.comments.some(function (c) {
        return c.status !== 'resolved' && c.reviewId === node.dataset.reviewId;
      });
      node.classList.toggle('has-review-comment', hasComment);
    });
    renderPins();
  };

  // One numbered pin per comment, at the exact spot the reviewer clicked.
  // Anchors are stored as {x, y} fractions of the section box, so pins stay
  // glued to the right place across scrolling, resizing, and mobile layouts.
  var renderPins = function () {
    pinLayer.innerHTML = '';
    if (state.mode !== 'browse' && state.mode !== 'comment') return;
    // Oldest comment = pin 1, so numbering stays stable as new notes arrive.
    var ordered = openComments().slice().reverse();
    ordered.forEach(function (comment, index) {
      var node = document.querySelector('[data-review-id="' + CSS.escape(comment.reviewId) + '"]');
      if (!node) return; // comment belongs to a section on another page
      var rect = node.getBoundingClientRect();
      // Legacy comments without an anchor fall back to the section corner.
      var a = comment.anchor && typeof comment.anchor.x === 'number'
        ? comment.anchor : { x: 0, y: 0 };
      var px = rect.left + a.x * rect.width;
      var py = rect.top + a.y * rect.height;
      if (py < 8 || py > window.innerHeight - 8) return; // off-screen
      var pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'review-pin';
      pin.textContent = String(index + 1);
      pin.title = comment.comment.slice(0, 80) + ' · ' + comment.reviewId;
      pin.style.left = Math.max(20, Math.min(window.innerWidth - 20, px)) + 'px';
      pin.style.top = Math.max(20, Math.min(window.innerHeight - 20, py)) + 'px';
      pin.addEventListener('click', function () {
        state.panelOpen = true;
        state.commentTab = comment.reply ? 'reviewed' : 'open';
        render();
        highlightCommentTarget(comment.reviewId);
      });
      pinLayer.appendChild(pin);
    });
  };

  var schedulePins = function () {
    if (pinRaf) return;
    pinRaf = requestAnimationFrame(function () { pinRaf = 0; renderPins(); });
  };

  var loadComments = function () {
    if (!HAS_SUPABASE) {
      state.syncWarning = 'Supabase review database is not configured yet. Comments cannot be saved.';
      render();
      return;
    }
    request(REVIEW_TABLE + '?project=eq.' + REVIEW_PROJECT + '&select=*&order=created_at.desc')
      .then(function (rows) {
        state.comments = rows.map(toComment);
        state.syncWarning = '';
        markCommentedSections();
        render();
        completePendingJump();
      })
      .catch(function (error) {
        console.warn('Could not load TEDxTampa review comments.', error);
        state.syncWarning = 'Could not connect to the review database. Has the tedxtampa_review_comments table been created?';
        render();
      });
  };

  var highlightCommentTarget = function (reviewId) {
    var target = document.querySelector('[data-review-id="' + CSS.escape(reviewId) + '"]');
    if (!target) return false;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('review-jump');
    window.setTimeout(function () { target.classList.remove('review-jump'); }, 1800);
    return true;
  };

  // Cross-page jump: stash the target id, navigate, finish after load.
  var jumpToComment = function (item) {
    var route = routeForComment(item);
    if (route === currentFile()) {
      if (highlightCommentTarget(item.reviewId)) return;
    }
    window.sessionStorage.setItem(REVIEW_JUMP_KEY, item.reviewId);
    window.location.href = route;
  };

  var completePendingJump = function () {
    var reviewId = window.sessionStorage.getItem(REVIEW_JUMP_KEY);
    if (!reviewId) return;
    window.sessionStorage.removeItem(REVIEW_JUMP_KEY);
    window.setTimeout(function () {
      if (!highlightCommentTarget(reviewId)) showNotice('That section could not be found on this page.');
    }, 200);
  };

  var patchComment = function (id, body, apply, okMessage, failMessage) {
    if (!HAS_SUPABASE) { showNotice('Supabase is required.'); return; }
    request(REVIEW_TABLE + '?id=eq.' + encodeURIComponent(id) + '&project=eq.' + REVIEW_PROJECT, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }).then(function (rows) {
      var saved = rows[0] ? toComment(rows[0]) : null;
      state.comments = state.comments.map(function (c) { return c.id === id ? (saved || apply(c)) : c; });
      markCommentedSections();
      showNotice(okMessage);
      render();
    }).catch(function (error) {
      console.warn(failMessage, error);
      showNotice(failMessage);
    });
  };

  var resolveComment = function (id) {
    var resolvedAt = new Date().toISOString();
    patchComment(id, { status: 'resolved', resolved_at: resolvedAt },
      function (c) { c.status = 'resolved'; c.resolvedAt = resolvedAt; return c; },
      'Comment resolved.', 'Could not resolve in Supabase.');
  };

  var unresolveComment = function (id) {
    patchComment(id, { status: 'open', resolved_at: null },
      function (c) { c.status = 'open'; c.resolvedAt = null; return c; },
      'Comment reopened.', 'Could not reopen in Supabase.');
  };

  // Team reply — resets reply_ack so the client reviews it again.
  var addReply = function (id, text) {
    var reply = (text || '').trim();
    if (!reply) return;
    var replyAt = new Date().toISOString();
    patchComment(id, { reply: reply, reply_at: replyAt, reply_ack: false },
      function (c) { c.reply = reply; c.replyAt = replyAt; c.replyAck = false; return c; },
      'Reply sent — client will see it to review.', 'Could not save reply.');
  };

  // Client acknowledges the team reply.
  var acknowledgeReply = function (id) {
    patchComment(id, { reply_ack: true },
      function (c) { c.replyAck = true; return c; },
      'Marked as reviewed.', 'Could not update.');
  };

  var saveComment = function (event) {
    event.preventDefault();
    var textarea = layer.querySelector('[data-review-draft]');
    var draft = textarea ? textarea.value.trim() : '';
    if (!state.activeTarget || !draft) return;
    if (!HAS_SUPABASE) {
      state.syncWarning = 'Supabase review database is not configured. This comment was not saved.';
      showNotice('Supabase is required to save comments.');
      return;
    }
    var item = {
      id: Date.now() + '-' + Math.random().toString(16).slice(2),
      project: REVIEW_PROJECT,
      page: pageName(),
      path: window.location.pathname,
      reviewId: state.activeTarget.reviewId,
      selector: state.activeTarget.selector,
      textQuote: state.activeTarget.textQuote,
      comment: draft,
      status: 'open',
      anchor: state.activeTarget.anchor || null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    request(REVIEW_TABLE, { method: 'POST', body: JSON.stringify(toRow(item)) })
      .then(function (rows) {
        state.comments = [rows[0] ? toComment(rows[0]) : item].concat(state.comments);
        state.activeTarget = null;
        state.panelOpen = true;
        state.syncWarning = '';
        markCommentedSections();
        showNotice('Comment saved.');
        render();
      })
      .catch(function (error) {
        console.warn('Could not save comment.', error);
        state.syncWarning = 'Could not save to the Supabase review database.';
        showNotice('Comment was not saved.');
        render();
      });
  };

  var exportComments = function () {
    var blob = new Blob([JSON.stringify(state.comments, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'tedxtampa-review-comments-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  // ---- markup ---------------------------------------------------------------
  var toolbarMarkup = function () {
    return '<div class="review-toolbar" role="toolbar" aria-label="TEDxTampa review tools">' +
      '<button type="button" data-review-mode="browse" class="' + (state.mode === 'browse' ? 'active' : '') + '">Browse</button>' +
      '<button type="button" data-review-mode="comment" class="' + (state.mode === 'comment' ? 'active' : '') + '">Comment</button>' +
      '<button type="button" data-review-panel>Comments <span class="review-count">' + openComments().length + '</span></button>' +
      '<button type="button" data-review-export>Export</button>' +
      '<button type="button" data-review-close aria-label="Close review tools">Close</button>' +
      '</div>';
  };

  var choiceMarkup = function () {
    return '<div class="review-mode-choice" role="dialog" aria-modal="true" aria-labelledby="reviewChoiceTitle">' +
      '<div class="review-mode-card">' +
      '<span>TEDxTampa private review</span>' +
      '<h2 id="reviewChoiceTitle">Open the site for review.</h2>' +
      '<p>Preview normally, or switch into comment mode to leave notes on any section. Comments save automatically and the team is notified.</p>' +
      '<div class="review-mode-actions">' +
      '<button type="button" data-review-mode="browse">Preview website</button>' +
      '<button type="button" data-review-mode="comment">Leave revisions</button>' +
      '</div>' +
      (state.syncWarning ? '<p class="review-warning">' + state.syncWarning + '</p>' : '') +
      '</div></div>';
  };

  var popoverMarkup = function () {
    if (!state.activeTarget) return '';
    return '<form class="review-popover" style="top:' + state.activeTarget.top + 'px;left:' + state.activeTarget.left + 'px" data-review-popover>' +
      '<span class="review-popover-meta">' + escapeHtml(state.activeTarget.reviewId) + '</span>' +
      '<p>' + escapeHtml(state.activeTarget.textQuote || 'Selected section') + '</p>' +
      '<textarea data-review-draft placeholder="Leave a revision note" autofocus></textarea>' +
      (state.syncWarning ? '<small>' + state.syncWarning + '</small>' : '') +
      '<div class="review-popover-actions">' +
      '<button type="button" data-review-cancel>Cancel</button>' +
      '<button type="submit">Save comment</button>' +
      '</div></form>';
  };

  var panelMarkup = function () {
    if (!state.panelOpen) return '';
    var items = visibleComments();
    return '<aside class="review-panel" aria-label="Review comments">' +
      '<div class="review-panel-header">' +
      '<span>Review comments</span>' +
      '<button type="button" data-review-panel-close aria-label="Close comments panel">Close</button>' +
      '</div>' +
      (state.syncWarning ? '<p class="review-warning">' + state.syncWarning + '</p>' : '') +
      '<div class="review-panel-tabs" role="tablist" aria-label="Comment status">' +
      '<button type="button" data-review-tab="open" class="' + (state.commentTab === 'open' ? 'active' : '') + '">Open <span>' + unrepliedComments().length + '</span></button>' +
      '<button type="button" data-review-tab="reviewed" class="' + (state.commentTab === 'reviewed' ? 'active' : '') + '">Reviewed <span>' + repliedComments().length + '</span></button>' +
      '<button type="button" data-review-tab="resolved" class="' + (state.commentTab === 'resolved' ? 'active' : '') + '">Resolved <span>' + resolvedComments().length + '</span></button>' +
      '</div>' +
      '<div class="review-panel-list">' +
      (items.length ? items.map(function (item) {
        return '<article class="' + (item.status === 'resolved' ? 'is-resolved' : '') + ' ' + (item.reply && !item.replyAck && item.status !== 'resolved' ? 'needs-review' : '') + '">' +
          '<div class="review-panel-meta">' + commentPageLabel(item) + ' · ' + escapeHtml(item.reviewId) +
          (item.reply && !item.replyAck ? ' · <span class="review-flag">Awaiting client review</span>' : '') + '</div>' +
          '<p>' + escapeHtml(item.comment) + '</p>' +
          (item.textQuote ? '<blockquote>' + escapeHtml(item.textQuote) + '</blockquote>' : '') +
          (item.reply ?
            '<div class="review-reply ' + (item.replyAck ? 'is-ack' : 'is-pending') + '">' +
            '<span class="review-reply-label">Reply from the team</span>' +
            '<p>' + escapeHtml(item.reply) + '</p>' +
            (item.replyAck
              ? '<span class="review-reply-status">✓ Reviewed by client</span>'
              : '<button type="button" data-review-ack="' + item.id + '">Mark as reviewed</button>') +
            '</div>' : '') +
          '<form class="review-reply-form" data-review-reply-form="' + item.id + '">' +
          '<textarea data-review-reply-input placeholder="' + (item.reply ? 'Update the reply…' : 'Reply to this comment…') + '"></textarea>' +
          '<button type="submit">' + (item.reply ? 'Update reply' : 'Reply') + '</button>' +
          '</form>' +
          '<div class="review-panel-actions">' +
          '<button type="button" data-review-jump="' + item.id + '">Jump</button>' +
          (item.status !== 'resolved'
            ? '<button type="button" data-review-resolve="' + item.id + '">Resolve</button>'
            : '<button type="button" data-review-unresolve="' + item.id + '">Reopen</button>') +
          '</div></article>';
      }).join('') : '<p>No ' + state.commentTab + ' comments yet.</p>') +
      '</div></aside>';
  };

  var render = function () {
    document.documentElement.dataset.reviewMode = state.mode || '';
    layer.innerHTML = [
      !state.mode ? choiceMarkup() : '',
      state.mode ? toolbarMarkup() : '',
      popoverMarkup(),
      panelMarkup(),
      state.notice ? '<div class="review-toast">' + escapeHtml(state.notice) + '</div>' : '',
    ].join('');
  };

  // ---- events ----------------------------------------------------------------
  layer.addEventListener('click', function (event) {
    var modeButton = event.target.closest('button[data-review-mode]');
    if (modeButton) { setMode(modeButton.dataset.reviewMode); return; }
    if (event.target.closest('[data-review-panel]')) { state.panelOpen = true; render(); return; }
    if (event.target.closest('[data-review-panel-close]')) { state.panelOpen = false; render(); return; }
    var tabButton = event.target.closest('button[data-review-tab]');
    if (tabButton) { state.commentTab = tabButton.dataset.reviewTab; render(); return; }
    if (event.target.closest('[data-review-cancel]')) { state.activeTarget = null; render(); return; }
    if (event.target.closest('[data-review-export]')) { exportComments(); return; }
    if (event.target.closest('[data-review-close]')) {
      state.mode = ''; state.activeTarget = null; state.panelOpen = false;
      window.sessionStorage.removeItem(REVIEW_MODE_KEY);
      document.documentElement.dataset.reviewMode = '';
      layer.remove();
      pinLayer.remove();
      return;
    }
    var jumpButton = event.target.closest('[data-review-jump]');
    if (jumpButton) {
      var comment = state.comments.find(function (c) { return c.id === jumpButton.dataset.reviewJump; });
      if (comment) jumpToComment(comment);
      else showNotice('That comment could not be found.');
      return;
    }
    var ackButton = event.target.closest('[data-review-ack]');
    if (ackButton) { acknowledgeReply(ackButton.dataset.reviewAck); return; }
    var resolveButton = event.target.closest('[data-review-resolve]');
    if (resolveButton) { resolveComment(resolveButton.dataset.reviewResolve); return; }
    var unresolveButton = event.target.closest('[data-review-unresolve]');
    if (unresolveButton) unresolveComment(unresolveButton.dataset.reviewUnresolve);
  });

  layer.addEventListener('submit', function (event) {
    var replyForm = event.target.closest('[data-review-reply-form]');
    if (replyForm) {
      event.preventDefault();
      var input = replyForm.querySelector('[data-review-reply-input]');
      addReply(replyForm.dataset.reviewReplyForm, input ? input.value : '');
      return;
    }
    saveComment(event);
  });

  // Click a section in comment mode → open the note popover.
  document.addEventListener('click', function (event) {
    if (state.mode !== 'comment') return;
    if (event.target.closest('.review-layer, .review-pins, .review-toolbar, .review-panel, .review-popover, .review-mode-choice')) return;
    var target = event.target.closest('[data-review-id]');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    var rect = target.getBoundingClientRect();
    // Exact click point, stored as fractions of the section box.
    var anchor = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
    };
    state.activeTarget = {
      reviewId: target.dataset.reviewId,
      selector: '[data-review-id="' + target.dataset.reviewId + '"]',
      textQuote: textQuote(event.target) || textQuote(target),
      anchor: anchor,
      // Popover opens right at the click, clamped to the viewport.
      top: Math.min(window.innerHeight - 300, Math.max(16, event.clientY + 12)),
      left: Math.min(window.innerWidth - 396, Math.max(16, event.clientX + 12)),
    };
    render();
  }, true);

  // Keep pins glued to their sections as the page scrolls or resizes.
  window.addEventListener('scroll', schedulePins, { passive: true });
  window.addEventListener('resize', schedulePins);

  render();
  if (state.mode === 'browse' || state.mode === 'comment') loadComments();
})();
