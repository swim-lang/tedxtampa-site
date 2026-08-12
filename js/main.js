/* ==========================================================================
   TEDxTampa — "The Exhibition" interactions
   Loader · headline reveals · scroll reveals · count-up · ticker · nav
   ========================================================================== */

(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------
     LOADER — black slate, counts plates 01→10, then wipes up.
     Full sequence on first visit per session; skipped afterwards.
  ------------------------------------------------------------------ */
  var loader = document.getElementById("loader");

  function dismissLoader(instant) {
    if (!loader) return;
    if (instant) {
      loader.classList.add("is-removed");
      document.body.classList.remove("is-loading");
      revealHero();
      return;
    }
    loader.classList.add("is-done");
    document.body.classList.remove("is-loading");
    loader.addEventListener("transitionend", function () {
      loader.classList.add("is-removed");
    }, { once: true });
    // reveal hero as the curtain lifts
    setTimeout(revealHero, 250);
  }

  function runLoader() {
    if (!loader) { revealHero(); return; }

    if (reducedMotion) {
      dismissLoader(true);
      return;
    }

    var seen = false;
    try { seen = sessionStorage.getItem("tedx-loaded") === "1"; } catch (e) {}
    try { sessionStorage.setItem("tedx-loaded", "1"); } catch (e) {}

    document.body.classList.add("is-loading");

    if (seen) {
      // repeat visit — quick curtain: title already settled, brief hold, wipe
      loader.classList.add("is-quick");
      setTimeout(function () { dismissLoader(false); }, 550);
      return;
    }

    // first visit — full sequence with the plate counter 01 → 10
    var count = document.getElementById("loaderCount");
    var i = 0;
    var tick = setInterval(function () {
      i += 1;
      if (count) count.textContent = "PLATE " + String(i).padStart(2, "0") + " / 10";
      if (i >= 10) clearInterval(tick);
    }, 110);

    setTimeout(function () { dismissLoader(false); }, 1750);
  }

  /* ------------------------------------------------------------------
     HERO REVEAL — headline lines rise once the loader clears
  ------------------------------------------------------------------ */
  function revealHero() {
    document.querySelectorAll(".hero .reveal-lines, .hero-splash .reveal-lines").forEach(function (el) {
      el.classList.add("is-inview");
    });
    var hero = document.querySelector(".hero, .hero-splash");
    if (hero) hero.classList.add("is-inview");
    startMetaStrip();
  }

  /* ------------------------------------------------------------------
     META STRIP — scramble each item into place (letters cycle letters,
     digits cycle digits), then dissolve the row into a slow ticker.
  ------------------------------------------------------------------ */
  var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  var DIGITS = "0123456789";

  function scramble(el, finalText, onDone) {
    var chars = finalText.split("");
    var lockAt = chars.map(function (c, i) { return 260 + i * 42 + Math.random() * 140; });
    var start = null;
    function frame(now) {
      if (!start) start = now;
      var t = now - start;
      var out = "";
      var settled = true;
      for (var i = 0; i < chars.length; i++) {
        var c = chars[i];
        if (t < lockAt[i] && /[A-Za-z]/.test(c)) {
          out += LETTERS[(Math.random() * 26) | 0];
          settled = false;
        } else if (t < lockAt[i] && /[0-9]/.test(c)) {
          out += DIGITS[(Math.random() * 10) | 0];
          settled = false;
        } else {
          out += c;
        }
      }
      el.textContent = out;
      if (!settled) requestAnimationFrame(frame);
      else if (onDone) onDone();
    }
    requestAnimationFrame(frame);
  }

  var metaStarted = false;

  function startMetaStrip() {
    if (metaStarted) return;
    metaStarted = true;

    var strip = document.querySelector(".meta-strip");
    if (!strip) return;

    var spans = Array.prototype.slice.call(strip.querySelectorAll("span"));
    var texts = spans.map(function (s) { return s.textContent.trim(); });

    // wrap the static row so it can crossfade out later
    var staticWrap = document.createElement("div");
    staticWrap.className = "meta-strip__static";
    spans.forEach(function (s) { staticWrap.appendChild(s); });
    strip.appendChild(staticWrap);

    if (reducedMotion) return; // static row stays put

    var remaining = spans.length;
    spans.forEach(function (s, i) {
      var final = texts[i];
      s.textContent = "";
      setTimeout(function () {
        scramble(s, final, function () {
          remaining -= 1;
          if (remaining === 0) setTimeout(function () { morphToTicker(strip, texts, spans.length - 1); }, 900);
        });
      }, i * 150);
    });
  }

  function morphToTicker(strip, texts, redIndex) {
    // build one sequence, repeat until it can fill half the loop, then double it
    var track = document.createElement("div");
    track.className = "mt-track";
    strip.appendChild(track);

    function seqHTML() {
      return texts.map(function (t, i) {
        var cls = i === redIndex ? "mt-item mt-red" : "mt-item";
        return '<span class="' + cls + '">' + t + '</span><span class="mt-sep">·</span>';
      }).join("");
    }

    strip.classList.add("is-fading");
    setTimeout(function () {
      strip.classList.remove("is-fading");
      strip.classList.add("is-ticker");
      var half = seqHTML();
      track.innerHTML = half;
      // ensure one half is at least as wide as the viewport for a seamless -50% loop
      while (track.scrollWidth < window.innerWidth && track.innerHTML.length < 40000) {
        track.innerHTML += half;
      }
      track.innerHTML += track.innerHTML; // two identical halves
    }, 460);
  }

  /* ------------------------------------------------------------------
     SCROLL REVEALS — IntersectionObserver
  ------------------------------------------------------------------ */
  function initObserver() {
    var targets = document.querySelectorAll("[data-reveal], [data-clip], .reveal-lines:not(.hero .reveal-lines):not(.hero-splash .reveal-lines)");
    if (reducedMotion || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) { el.classList.add("is-inview"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-inview");
          if (entry.target.hasAttribute("data-count")) countUp(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -40px 0px" });

    targets.forEach(function (el) { io.observe(el); });

    document.querySelectorAll("[data-count]").forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------
     COUNT-UP — stat values animate to their target
  ------------------------------------------------------------------ */
  function countUp(el) {
    if (el.dataset.counted) return;
    el.dataset.counted = "1";
    var target = parseInt(el.getAttribute("data-count").replace(/[^0-9]/g, ""), 10);
    if (isNaN(target)) return;
    var format = el.getAttribute("data-count").indexOf(",") !== -1;
    var dur = 1200;
    var start = null;

    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = Math.round(target * eased);
      el.textContent = format ? val.toLocaleString("en-US") : String(val);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------
     TICKER — duplicate track content so the loop is seamless
  ------------------------------------------------------------------ */
  function initTicker() {
    document.querySelectorAll(".ticker__track").forEach(function (track) {
      track.innerHTML += track.innerHTML; // 2x for -50% loop
    });
  }

  /* ------------------------------------------------------------------
     NAME PEEK — portrait plate trails the cursor over the speaker wall
  ------------------------------------------------------------------ */
  function initNamePeek() {
    var wall = document.querySelector(".name-wall");
    if (!wall) return;
    if (reducedMotion || window.matchMedia("(pointer: coarse)").matches) return;

    var items = wall.querySelectorAll(".name-wall__item[data-photo]");
    if (!items.length) return;

    var peek = document.createElement("figure");
    peek.className = "name-peek";
    peek.setAttribute("aria-hidden", "true");
    peek.innerHTML = '<img alt=""><figcaption><span class="pk-no"></span><span class="pk-name"></span></figcaption>';
    document.body.appendChild(peek);

    var img = peek.querySelector("img");
    var pkNo = peek.querySelector(".pk-no");
    var pkName = peek.querySelector(".pk-name");

    // preload portraits so the first hover is instant
    items.forEach(function (it) { new Image().src = it.getAttribute("data-photo"); });

    var tx = 0, ty = 0, cx = 0, cy = 0, raf = null, active = false;

    function loop() {
      cx += (tx - cx) * 0.16;
      cy += (ty - cy) * 0.16;
      peek.style.left = cx + "px";
      peek.style.top = cy + "px";
      if (active || Math.abs(tx - cx) > 0.5 || Math.abs(ty - cy) > 0.5) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = null;
      }
    }

    wall.addEventListener("mousemove", function (e) {
      tx = e.clientX;
      ty = e.clientY - 18;
      if (!raf) raf = requestAnimationFrame(loop);
    });

    items.forEach(function (it) {
      it.addEventListener("mouseenter", function () {
        var noEl = it.querySelector(".no");
        var nameEl = it.querySelector(".name");
        img.src = it.getAttribute("data-photo");
        img.style.objectPosition = it.getAttribute("data-photo-pos") || "center";
        pkNo.textContent = "No." + (noEl ? noEl.textContent.trim() : "");
        var parts = nameEl ? nameEl.textContent.trim().split(" ") : [""];
        pkName.textContent = parts[parts.length - 1];
        if (!active) { cx = tx; cy = ty; } // snap on first show, trail afterwards
        active = true;
        peek.classList.add("is-visible");
        if (!raf) raf = requestAnimationFrame(loop);
      });
      it.addEventListener("mouseleave", function () {
        active = false;
        peek.classList.remove("is-visible");
      });
    });
  }

  /* ------------------------------------------------------------------
     TYPEWRITER — curator quote types in on scroll, red block cursor
  ------------------------------------------------------------------ */
  function initTypewriter() {
    var quote = document.querySelector(".typewriter");
    if (!quote) return;

    // wrap every character in a span so layout is fixed before typing starts
    var chars = [];
    function wrapChars(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var frag = document.createDocumentFragment();
          child.textContent.split("").forEach(function (c) {
            var s = document.createElement("span");
            s.className = "tw-char";
            s.textContent = c;
            frag.appendChild(s);
            chars.push(s);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          wrapChars(child);
        }
      });
    }
    wrapChars(quote);

    if (reducedMotion || !("IntersectionObserver" in window)) {
      quote.classList.add("is-done");
      return;
    }

    var cursor = document.createElement("span");
    cursor.className = "tw-cursor";
    cursor.setAttribute("aria-hidden", "true");

    function type() {
      var i = 0;
      function step() {
        if (i >= chars.length) {
          quote.classList.add("is-done");
          setTimeout(function () {
            cursor.classList.add("is-leaving");
            setTimeout(function () { cursor.remove(); }, 700);
          }, 1400);
          return;
        }
        var c = chars[i];
        c.classList.add("is-on");
        c.parentNode.insertBefore(cursor, c.nextSibling);
        i += 1;
        // slight human jitter; brief pause after punctuation
        var ch = c.textContent;
        var delay = 24 + Math.random() * 26;
        if (/[;,—.]/.test(ch)) delay += 140;
        setTimeout(step, delay);
      }
      step();
    }

    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        io.disconnect();
        setTimeout(type, 250);
      }
    }, { threshold: 0.45 });
    io.observe(quote);
  }

  /* ------------------------------------------------------------------
     ACCORDION — catalog rows expand into featured plates
  ------------------------------------------------------------------ */
  function initAccordion() {
    var heads = document.querySelectorAll(".acc__head");
    heads.forEach(function (head) {
      head.addEventListener("click", function () {
        var acc = head.parentElement;
        var opening = !acc.classList.contains("is-open");
        // close any other open row
        document.querySelectorAll(".acc.is-open").forEach(function (other) {
          if (other !== acc) {
            other.classList.remove("is-open");
            other.querySelector(".acc__head").setAttribute("aria-expanded", "false");
          }
        });
        acc.classList.toggle("is-open", opening);
        head.setAttribute("aria-expanded", opening ? "true" : "false");
      });
    });
  }

  /* ------------------------------------------------------------------
     MOBILE NAV
  ------------------------------------------------------------------ */
  function initNav() {
    var burger = document.getElementById("burger");
    var nav = document.getElementById("mobileNav");
    if (!burger || !nav) return;
    burger.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      burger.textContent = open ? "CLOSE" : "MENU";
    });
  }

  /* ------------------------------------------------------------------
     BOOT
  ------------------------------------------------------------------ */
  document.addEventListener("DOMContentLoaded", function () {
    initTicker();
    initNav();
    initObserver();
    initNamePeek();
    initAccordion();
    initTypewriter();
    runLoader();
  });
})();
