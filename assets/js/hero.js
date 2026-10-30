/* ==========================================================================
   NAJMARA — landing page motion engine
   1. A looping canvas "clip": slow cross-dissolve + Ken Burns drift across
      four frames of data centre / industrial site operations.
   2. Scroll progress driver for the 420vh track: headline tilt-and-dissolve
      around its bottom edge, staggered activation of the four process steps,
      and the scroll cue.
   ========================================================================== */

(function () {
  "use strict";

  var track = document.querySelector("[data-hero-track]");
  if (!track) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var sticky = track.querySelector(".hero-sticky");
  var headline = track.querySelector("[data-hero-headline]");
  var steps = Array.prototype.slice.call(track.querySelectorAll("[data-hero-step]"));
  var cue = track.querySelector("[data-hero-cue]");

  /* ------------------------------------------------------ canvas clip ---- */

  var canvas = track.querySelector("[data-hero-canvas]");

  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext("2d");
    var sources = (canvas.getAttribute("data-frames") || "").split(",").filter(Boolean);
    var frames = [];
    var loaded = 0;
    var running = false;
    var rafId = 0;

    var PER_FRAME = 5200;   // ms each frame holds
    var FADE = 1500;        // ms cross-dissolve
    var DPR = Math.min(window.devicePixelRatio || 1, 1.75);

    var resize = function () {
      var w = sticky.clientWidth;
      var h = sticky.clientHeight;
      canvas.width = Math.max(1, Math.round(w * DPR));
      canvas.height = Math.max(1, Math.round(h * DPR));
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    };

    var drawCover = function (img, alpha, zoom, panX, panY) {
      var cw = canvas.width;
      var ch = canvas.height;
      var scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) * zoom;
      var dw = img.naturalWidth * scale;
      var dh = img.naturalHeight * scale;
      var dx = (cw - dw) / 2 + panX * cw;
      var dy = (ch - dh) / 2 + panY * ch;

      ctx.globalAlpha = alpha;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
    };

    var paint = function (now) {
      if (!frames.length) return;

      var total = PER_FRAME * frames.length;
      var elapsed = now % total;
      var index = Math.floor(elapsed / PER_FRAME);
      var local = (elapsed - index * PER_FRAME) / PER_FRAME;
      var current = frames[index % frames.length];
      var next = frames[(index + 1) % frames.length];

      var progress = (index + local) / frames.length; // 0..1 over the loop

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#121312";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (current) {
        drawCover(current, 1, 1.05 + progress * 0.06, Math.sin(progress * Math.PI * 2) * 0.012, -progress * 0.01);
      }

      var fadeStart = 1 - FADE / PER_FRAME;
      if (next && local > fadeStart) {
        var a = (local - fadeStart) / (1 - fadeStart);
        drawCover(next, a, 1.05 + progress * 0.06, Math.sin(progress * Math.PI * 2) * 0.012, -progress * 0.01);
      }
    };

    var loop = function (now) {
      paint(now);
      rafId = requestAnimationFrame(loop);
    };

    sources.forEach(function (src) {
      var img = new Image();
      img.decoding = "async";
      img.onload = img.onerror = function () {
        loaded++;
        if (frames.length && loaded >= sources.length) paint(performance.now());
      };
      img.src = src;
      frames.push(img);
    });

    resize();
    window.addEventListener("resize", function () {
      resize();
      paint(performance.now());
    });

    if (reduceMotion) {
      // static first frame only
      var waitForFirst = function () {
        if (frames[0] && frames[0].complete && frames[0].naturalWidth) {
          paint(0);
        } else {
          requestAnimationFrame(waitForFirst);
        }
      };
      waitForFirst();
    } else {
      // run only while the hero is on screen
      if ("IntersectionObserver" in window) {
        var clipObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting && !running) {
              running = true;
              rafId = requestAnimationFrame(loop);
            } else if (!entry.isIntersecting && running) {
              running = false;
              cancelAnimationFrame(rafId);
            }
          });
        }, { threshold: 0 });
        clipObserver.observe(track);
      } else {
        running = true;
        rafId = requestAnimationFrame(loop);
      }
    }
  }

  /* --------------------------------------------------- scroll progress --- */

  var HEADLINE_END = 0.38;   // p at which the tilt/translate finishes
  var FADE_FROM = 0.10;      // headline starts dissolving
  var FADE_TO = 0.24;        // headline fully gone
  var STEP_AT = [0.26, 0.34, 0.42, 0.50];

  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };

  var ticking = false;

  var update = function () {
    ticking = false;

    var rect = track.getBoundingClientRect();
    var span = rect.height - window.innerHeight;
    var p = span > 0 ? clamp01(-rect.top / span) : 0;

    if (headline) {
      var t = clamp01(p / HEADLINE_END);
      var lift = t * window.innerHeight * 0.07;
      var rot = t * 16;
      var opacity = 1 - clamp01((p - FADE_FROM) / (FADE_TO - FADE_FROM));

      headline.style.transform =
        "translate3d(0," + lift.toFixed(1) + "px,0) rotateX(" + rot.toFixed(2) + "deg)";
      headline.style.opacity = opacity.toFixed(3);
      headline.style.visibility = opacity <= 0.001 ? "hidden" : "visible";
    }

    steps.forEach(function (step, i) {
      step.classList.toggle("is-active", p >= STEP_AT[i]);
    });

    if (cue) cue.style.opacity = p > 0.03 ? "0" : "1";
  };

  var requestUpdate = function () {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  update();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
})();
