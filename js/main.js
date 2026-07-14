/* TEDxTampa — scroll interactions
   1. Count-up stats: any [data-count] animates from 0 to its value when scrolled into view.
   2. Typewriter quote: any [data-typewriter] types its text when scrolled into view.
   3. Talk rows: hover video peek + lightbox player.
   4. Desktop/Mobile view toggle (demo tool) — hidden when framed inside mobile.html. */

(function () {
  'use strict';

  /* ---------- Desktop / Mobile view toggle ---------- */

  if (window.self === window.top) {
    var page = window.location.pathname.split('/').pop() || 'index.html';
    if (page.indexOf('.html') === -1) page += '.html';

    var toggle = document.createElement('div');
    toggle.className = 'view-toggle';
    toggle.setAttribute('aria-label', 'Switch preview view');
    toggle.innerHTML =
      '<button class="is-active" type="button">Desktop</button>' +
      '<button type="button">Mobile</button>';
    document.body.appendChild(toggle);

    toggle.children[1].addEventListener('click', function () {
      // Hash survives the static server's clean-URL redirect; a query string doesn't
      window.location.href = 'mobile.html#' + page;
    });
  }

  /* ---------- Parallax intro ---------- */

  var intro = document.querySelector('.intro');
  if (intro && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var skyWrap = intro.querySelector('.intro__wrap--sky');
    var logoWrap = intro.querySelector('.intro__wrap--logo');
    var cityWrap = intro.querySelector('.intro__wrap--city');
    var cityImg = intro.querySelector('.intro__img--city');
    var hint = intro.querySelector('.intro__hint');
    var introTicking = false;

    var introTick = function () {
      introTicking = false;
      var runway = intro.offsetHeight - window.innerHeight;
      var p = Math.min(1, Math.max(0, window.scrollY / Math.max(1, runway)));
      // Sky drifts up; the logo sinks; the skyline starts slightly sunk and
      // rises to swallow the logo — the crossing motions sell the depth.
      var cityBase = cityImg.offsetHeight * 0.18;
      skyWrap.style.transform = 'translateY(' + (p * -8) + 'vh)';
      logoWrap.style.transform = 'translateY(' + (p * 50) + 'vh) scale(' + (1 - p * 0.12) + ')';
      // Fade the logo away as it sinks so it can never peek past the skyline's
      // bottom edge, whatever the screen's aspect ratio.
      logoWrap.style.opacity = p < 0.55 ? '1' : String(Math.max(0, 1 - (p - 0.55) / 0.3));
      // Grows toward the viewer as it rises (origin bottom, so it stays flush)
      cityWrap.style.transform = 'translateY(' + (cityBase * (1 - p)) + 'px) scale(' + (1 + p * 0.07) + ')';
      if (hint) {
        // The load-in animation's `forwards` fill beats inline opacity — clear it when hiding
        if (p > 0.04) { hint.style.animation = 'none'; hint.style.opacity = '0'; }
        else { hint.style.animation = ''; hint.style.opacity = ''; }
      }
    };

    window.addEventListener('scroll', function () {
      if (!introTicking) {
        introTicking = true;
        requestAnimationFrame(introTick);
      }
    }, { passive: true });
    window.addEventListener('resize', introTick);
    introTick();
  } else if (intro) {
    var hintEl = intro.querySelector('.intro__hint');
    if (hintEl) hintEl.style.opacity = '1';
  }

  /* ---------- Big-headline line reveals ---------- */

  var lineEls = document.querySelectorAll('[data-animate-lines]');
  if (lineEls.length) {
    lineEls.forEach(function (el) {
      var parts = el.innerHTML.split(/<br\s*\/?>/i);
      el.innerHTML = parts.map(function (part) {
        return '<span class="line"><span class="line__inner">' + part + '</span></span>';
      }).join('');
    });

    var lineObserver = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-inview');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    lineEls.forEach(function (el) { lineObserver.observe(el); });
  }

  /* ---------- Count-up stats ---------- */

  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };

  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    var useComma = el.getAttribute('data-count').length > 3 || el.textContent.indexOf(',') !== -1;
    var duration = 1400;
    var start = null;

    function frame(now) {
      if (!start) start = now;
      var t = Math.min((now - start) / duration, 1);
      var value = Math.round(easeOut(t) * target);
      el.textContent = useComma ? value.toLocaleString('en-US') : String(value);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  var counters = document.querySelectorAll('[data-count]');
  if (counters.length) {
    var countObserver = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });

    counters.forEach(function (el) {
      el.textContent = '0';
      countObserver.observe(el);
    });
  }

  /* ---------- Reveal (used for the non-numeric "Sold Out" stat) ---------- */

  var reveals = document.querySelectorAll('[data-reveal]');
  if (reveals.length) {
    var revealObserver = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });

    reveals.forEach(function (el) { revealObserver.observe(el); });
  }

  /* ---------- Typewriter quote ---------- */

  function typeInto(el) {
    var live = el.querySelector('.type-live');
    var text = el.getAttribute('data-typewriter');
    var i = 0;
    el.classList.add('is-typing');

    function tick() {
      if (i <= text.length) {
        live.textContent = text.slice(0, i);
        i += 1;
        setTimeout(tick, 26);
      } else {
        el.classList.remove('is-typing');
        el.classList.add('is-typed');
      }
    }
    tick();
  }

  var typers = document.querySelectorAll('[data-typewriter]');
  if (typers.length) {
    var typeObserver = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          typeInto(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    typers.forEach(function (el) { typeObserver.observe(el); });
  }

  /* ---------- Talk rows: hover video peek + lightbox player ---------- */

  var videoRows = document.querySelectorAll('.talk-row[data-video]');
  if (videoRows.length) {
    // Build the single reusable peek card
    var peek = document.createElement('div');
    peek.className = 'video-peek';
    peek.setAttribute('aria-hidden', 'true');
    peek.innerHTML =
      '<img class="video-peek__thumb" alt="">' +
      '<div class="video-peek__bar"><span class="play"></span><span>Watch the talk</span></div>';
    document.body.appendChild(peek);
    var peekThumb = peek.querySelector('.video-peek__thumb');

    // Build the lightbox
    var lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-label', 'Video player');
    lightbox.innerHTML =
      '<button class="lightbox__close" aria-label="Close video">&times;</button>' +
      '<div class="lightbox__frame"></div>';
    document.body.appendChild(lightbox);
    var frame = lightbox.querySelector('.lightbox__frame');

    function openLightbox(videoId) {
      frame.innerHTML = '<iframe src="https://www.youtube.com/embed/' + videoId +
        '?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
      lightbox.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
      lightbox.classList.remove('is-open');
      frame.innerHTML = ''; // stop playback
      document.body.style.overflow = '';
    }

    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox || e.target.classList.contains('lightbox__close')) closeLightbox();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && lightbox.classList.contains('is-open')) closeLightbox();
    });

    // Peek follows the cursor; whole row is clickable
    function movePeek(e) {
      var x = Math.min(e.clientX + 28, window.innerWidth - 340);
      var y = e.clientY - peek.offsetHeight - 20;
      if (y < 12) y = e.clientY + 28;
      peek.style.transform = '';
      peek.style.left = x + 'px';
      peek.style.top = y + 'px';
    }

    videoRows.forEach(function (row) {
      var id = row.getAttribute('data-video');

      row.addEventListener('mouseenter', function (e) {
        peekThumb.src = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
        movePeek(e);
        if (!e.target.closest || !e.target.closest('.btn')) peek.classList.add('is-visible');
      });

      // Hide the peek while the cursor is over the Watch button so it never blocks the click
      row.addEventListener('mousemove', function (e) {
        if (e.target.closest && e.target.closest('.btn')) {
          peek.classList.remove('is-visible');
        } else {
          movePeek(e);
          peek.classList.add('is-visible');
        }
      });

      row.addEventListener('mouseleave', function () {
        peek.classList.remove('is-visible');
      });

      row.addEventListener('click', function (e) {
        e.preventDefault();
        peek.classList.remove('is-visible');
        openLightbox(id);
      });
    });
  }
})();
