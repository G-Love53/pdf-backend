/**
 * Hosted on CID-PDF-API: /static/renewal-intake-prefill.js
 *
 * Add to segment Netlify pages (before </body>):
 *   <script src="https://cid-pdf-api.onrender.com/static/renewal-intake-prefill.js" defer></script>
 * Optional staging override:
 *   <script>window.CID_PDF_API_BASE = "https://your-staging.onrender.com";</script>
 */
(function () {
  var API_BASE = window.CID_PDF_API_BASE || "https://cid-pdf-api.onrender.com";

  function findByName(form, name) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      try {
        return form.querySelector('[name="' + CSS.escape(name) + '"]');
      } catch (_) {
        /* fall through */
      }
    }
    var nodes = form.querySelectorAll("[name]");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("name") === name) return nodes[i];
    }
    return null;
  }

  function setControl(el, value) {
    if (!el || value === undefined || value === null) return;
    var v = String(value);
    var tag = (el.tagName || "").toLowerCase();
    var type = (el.type || "").toLowerCase();
    if (tag === "select") {
      el.value = v;
    } else if (type === "checkbox") {
      var t = v.toLowerCase();
      el.checked = t === "true" || t === "1" || t === "yes" || el.value === v;
    } else if (type === "radio") {
      if (el.value === v) el.checked = true;
    } else {
      el.value = v;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function applyFlatObject(form, obj) {
    if (!form || !obj || typeof obj !== "object") return;
    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var val = obj[key];
      if (val === null || val === undefined) continue;
      if (typeof val === "object") continue;
      var el = findByName(form, key);
      if (el) setControl(el, val);
    }
  }

  function run() {
    var params = new URLSearchParams(window.location.search);
    var token = params.get("renewal_token");
    if (!token) return Promise.resolve();

    var url =
      API_BASE.replace(/\/+$/, "") +
      "/api/intake/renewal-prefill?renewal_token=" +
      encodeURIComponent(token);

    return fetch(url, { credentials: "omit" })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        });
      })
      .then(function (body) {
        if (!body.ok || !body.data) {
          console.warn("[CID renewal prefill]", body.error || "bad response");
          return;
        }

        var form =
          document.querySelector("#quoteForm") ||
          document.querySelector("form[method='post']") ||
          document.querySelector("form");
        if (!form) {
          console.warn("[CID renewal prefill] No form found");
          return;
        }

        var d = body.data;
        if (d.prior_intake && typeof d.prior_intake === "object") {
          applyFlatObject(form, d.prior_intake);
        }

        var synth = {};
        if (d.client_first_name || d.client_last_name) {
          synth.applicant_name = [d.client_first_name, d.client_last_name]
            .filter(Boolean)
            .join(" ")
            .trim();
        }
        if (d.client_email) {
          synth.contact_email = d.client_email;
        }
        if (d.client_phone) {
          synth.business_phone = d.client_phone;
        }
        if (d.business_name) {
          synth.premises_name = d.business_name;
          synth.business_name = d.business_name;
        }
        if (d.dba_name) {
          synth.dba_name = d.dba_name;
        }
        if (d.business_state) {
          synth.premise_state = d.business_state;
        }
        if (d.business_entity_type) {
          synth.entity_type = d.business_entity_type;
          synth.business_structure = d.business_entity_type;
        }
        applyFlatObject(form, synth);

        try {
          window.dispatchEvent(new CustomEvent("cidRenewalPrefillApplied", { detail: { ok: true } }));
        } catch (_) {
          /* */
        }
      })
      .catch(function (e) {
        console.warn("[CID renewal prefill] fetch failed", e);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      void run();
    });
  } else {
    void run();
  }
})();
