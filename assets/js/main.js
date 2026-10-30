/* ==========================================================================
   NAJMARA — shared interactions
   Nav state, mobile menu, scroll reveals, 3D tilt, tabs, form validation.
   No dependencies.
   ========================================================================== */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ------------------------------------------------------------ nav ------ */

  var nav = document.querySelector("[data-nav]");
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle("is-scrolled", window.scrollY > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  var burger = document.querySelector("[data-burger]");
  var menu = document.querySelector("[data-menu]");

  if (burger && menu) {
    var setMenu = function (open) {
      burger.classList.toggle("is-open", open);
      menu.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("menu-open", open);
    };

    burger.addEventListener("click", function () {
      setMenu(!menu.classList.contains("is-open"));
    });

    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setMenu(false);
    });
  }

  /* --------------------------------------------------------- reveals ----- */

  var revealables = document.querySelectorAll("[data-reveal]");

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealables.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ----------------------------------------------------- 3D tilt cards --- */

  var tiltCards = document.querySelectorAll("[data-tilt]");

  if (tiltCards.length && finePointer && !reduceMotion) {
    tiltCards.forEach(function (card) {
      var MAX = 7;

      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        var rx = (0.5 - py) * MAX * 2;
        var ry = (px - 0.5) * MAX * 2;

        card.style.setProperty("--mx", (px * 100).toFixed(2) + "%");
        card.style.setProperty("--my", (py * 100).toFixed(2) + "%");
        card.style.transform =
          "perspective(1000px) rotateX(" + rx.toFixed(2) + "deg) rotateY(" +
          ry.toFixed(2) + "deg) translateZ(0)";
      });

      card.addEventListener("pointerleave", function () {
        card.style.transform = "";
        card.style.setProperty("--mx", "50%");
        card.style.setProperty("--my", "50%");
      });
    });
  }

  /* ------------------------------------------------------------- tabs ---- */

  document.querySelectorAll("[data-tabs]").forEach(function (root) {
    var buttons = Array.prototype.slice.call(root.querySelectorAll("[role='tab']"));
    var panels = Array.prototype.slice.call(root.querySelectorAll("[role='tabpanel']"));

    var select = function (index, focus) {
      buttons.forEach(function (btn, i) {
        var on = i === index;
        btn.setAttribute("aria-selected", String(on));
        btn.tabIndex = on ? 0 : -1;
        if (on && focus) btn.focus();
      });
      panels.forEach(function (panel, i) { panel.hidden = i !== index; });
    };

    buttons.forEach(function (btn, i) {
      btn.addEventListener("click", function () { select(i, false); });
      btn.addEventListener("keydown", function (e) {
        var next = null;
        if (e.key === "ArrowRight") next = (i + 1) % buttons.length;
        if (e.key === "ArrowLeft") next = (i - 1 + buttons.length) % buttons.length;
        if (e.key === "Home") next = 0;
        if (e.key === "End") next = buttons.length - 1;
        if (next !== null) {
          e.preventDefault();
          select(next, true);
        }
      });
    });

    select(0, false);
  });

  /* ------------------------------------------------------- enquiry form -- */

  var form = document.querySelector("[data-enquiry-form]");

  if (form) {
    var status = form.querySelector("[data-form-status]");

    var showError = function (field, message) {
      field.classList.toggle("is-error", Boolean(message));
      var slot = field.querySelector("[data-error]");
      if (slot) slot.textContent = message || "";
    };

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var valid = true;
      var firstInvalid = null;

      form.querySelectorAll("[data-field]").forEach(function (field) {
        var input = field.querySelector("input, select, textarea");
        if (!input) return;

        var value = (input.value || "").trim();
        var message = "";

        if (input.required && !value) {
          message = "This field is required.";
        } else if (input.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
          message = "Enter a valid email address.";
        }

        showError(field, message);
        if (message) {
          valid = false;
          if (!firstInvalid) firstInvalid = input;
        }
      });

      if (!valid) {
        if (firstInvalid) firstInvalid.focus();
        if (status) {
          status.hidden = false;
          status.textContent = "Please complete the highlighted fields.";
        }
        return;
      }

      var field = function (name) {
        var el = form.elements[name];
        return el ? (el.value || "").trim() : "";
      };

      var payload = {
        name: field("name"),
        company: field("company"),
        email: field("email"),
        phone: field("phone"),
        interest: field("interest"),
        message: field("message"),
        website: field("website")
      };

      var endpoint = form.getAttribute("data-endpoint") || "/api/enquiry";
      var button = form.querySelector("button[type='submit']");
      var idleLabel = button ? button.innerHTML : "";

      var setStatus = function (text, tone) {
        if (!status) return;
        status.hidden = !text;
        status.textContent = text || "";
        status.setAttribute("data-tone", tone || "info");
      };

      if (button) {
        button.disabled = true;
        button.textContent = "Sending…";
      }

      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          /* endpoint not present (static preview / not deployed yet) */
          if (res.status === 404 || res.status === 405 || res.status === 501) {
            setStatus(
              "The enquiry API is not running on this preview yet — submissions will be delivered once the " +
              "site is published with its endpoint.",
              "warn"
            );
            return null;
          }

          return res.json().catch(function () { return null; }).then(function (data) {
            if (res.ok && data && data.ok) {
              setStatus(
                "Thank you — your enquiry has been sent. We will come back with a written proposal and a named contact.",
                "ok"
              );
              form.reset();
              form.querySelectorAll("[data-field]").forEach(function (f) { showError(f, ""); });
              return;
            }

            if (data && data.errors) {
              Object.keys(data.errors).forEach(function (key) {
                var input = form.elements[key];
                var wrap = input && input.closest("[data-field]");
                if (wrap) showError(wrap, data.errors[key]);
              });
              setStatus("Please correct the highlighted fields.", "error");
              return;
            }

            setStatus(
              (data && data.error) || "We could not send your enquiry. Please try again.",
              "error"
            );
          });
        })
        .catch(function () {
          setStatus("We could not reach the enquiry service. Check your connection and try again.", "error");
        })
        .then(function () {
          if (button) {
            button.disabled = false;
            button.innerHTML = idleLabel;
          }
        });
    });

    form.querySelectorAll("input, select, textarea").forEach(function (input) {
      input.addEventListener("input", function () {
        var field = input.closest("[data-field]");
        if (field && field.classList.contains("is-error")) showError(field, "");
      });
    });
  }

  /* ------------------------------------------------------------ year ----- */

  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
