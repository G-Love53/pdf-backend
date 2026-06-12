/* ConnectQuote extended intake — shared across segment Netlify sites */
(function () {
  const cfg = window.CONNECTQUOTE || {};
  const API = cfg.api || "https://cid-pdf-api.onrender.com";
  const SEGMENT = cfg.segment || "electrical";
  const ASSET_V = "20260612";

  const FALLBACK_CLASSES = {
    electrical: [
      {
        key: "electric_contracting",
        label: "Electrical contracting (primary work)",
      },
    ],
    fitness: [
      { key: "yoga_studio", label: "Yoga studio" },
      { key: "pilates_studio", label: "Pilates / mind-body studio" },
      { key: "personal_trainer", label: "Personal trainer / fitness instructor" },
    ],
  };

  let stripe = null;
  let cardElement = null;
  let session = { submission_public_id: null, quote_id: null, email: null, quote: null };
  let demoEnabled = false;
  let registryCache = null;
  let currentSchema = null;

  function $(id) {
    return document.getElementById(id);
  }

  function defaultStartDate() {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }

  function redirectTraditional(message, reason) {
    showErr(message || "This needs our detailed application — redirecting…");
    setTimeout(() => {
      const q = location.search ? location.search + "&" : "?";
      location.href = "index.html" + q + "rail=traditional&reason=" + encodeURIComponent(reason || "coterie");
    }, 2500);
  }

  function showErr(msg) {
    const el = $("err-box");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
  }

  function prefillValue(param, raw) {
    if (!raw) return raw;
    if (param === "em" && raw.includes("@")) {
      const at = raw.indexOf("@");
      return raw.slice(0, at).replace(/ /g, "+") + raw.slice(at);
    }
    return raw;
  }

  function applyPrefill() {
    const p = new URLSearchParams(location.search);
    const map = {
      fn: "first_name",
      ln: "last_name",
      em: "contact_email",
      bn: "insured_name",
      ad: "premise_street",
      ct: "premise_city",
      st: "state",
      zp: "zip",
    };
    let count = 0;
    Object.entries(map).forEach(([param, id]) => {
      const v = prefillValue(param, p.get(param));
      if (!v) return;
      const el = $(id);
      if (el) {
        el.value = v;
        el.classList.add("prefilled");
        count++;
      }
    });
    if (p.get("src")) $("traffic_source").value = p.get("src");
    if (p.get("cid")) $("campaign_id").value = p.get("cid");
    if (count >= 3 && $("bridge-text")) {
      $("bridge-text").textContent = "We've loaded your info — confirm details and choose coverages.";
    }
  }

  async function loadRegistry() {
    if (registryCache) return registryCache;
    const r = await fetch(API + "/api/coterie/registry/" + SEGMENT);
    registryCache = await r.json();
    return registryCache;
  }

  async function loadBusinessClasses() {
    const sel = $("business_class");
    const p = new URLSearchParams(location.search);
    const bcPrefill = p.get("bc") || p.get("business_class");
    sel.innerHTML = '<option value="" selected disabled>Select…</option>';
    let loaded = false;
    try {
      const j = await loadRegistry();
      const rows = (j.businessClasses || []).filter((c) => !c.prohibited && c.akHash);
      if (rows.length) {
        rows.forEach((c) => {
          const opt = document.createElement("option");
          opt.value = c.key;
          opt.textContent = c.label;
          sel.appendChild(opt);
        });
        loaded = true;
      }
    } catch (err) {
      console.warn("[connectquote] registry load failed", err);
    }
    if (!loaded && FALLBACK_CLASSES[SEGMENT]) {
      FALLBACK_CLASSES[SEGMENT].forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.key;
        opt.textContent = c.label;
        sel.appendChild(opt);
      });
    }
    if (bcPrefill && [...sel.options].some((o) => o.value === bcPrefill)) {
      sel.value = bcPrefill;
    }
  }

  function isOwnerSelected() {
    return $("is_owner").value === "yes";
  }

  function selectedBusinessClass() {
    return $("business_class").value;
  }

  async function fetchSchema() {
    const bc = selectedBusinessClass();
    if (!bc) return null;
    const owner = isOwnerSelected();
    const r = await fetch(
      API +
        "/api/coterie/intake-schema/" +
        SEGMENT +
        "/" +
        encodeURIComponent(bc) +
        "?is_owner=" +
        (owner ? "true" : "false"),
    );
    const j = await r.json();
    return j.schema || null;
  }

  function coverageChecked(id) {
    const el = document.querySelector('[data-cov-id="' + id + '"]');
    return el ? el.checked : false;
  }

  function selectedInstantCoverages() {
    return [...document.querySelectorAll("[data-cov-id][data-cov-instant='true']")]
      .filter((el) => el.checked)
      .map((el) => el.dataset.covId);
  }

  function selectedExtraCoverages() {
    return [...document.querySelectorAll("[data-cov-id][data-cov-instant='false']")]
      .filter((el) => el.checked)
      .map((el) => el.dataset.covId);
  }

  function renderCoverageToggles(schema) {
    const instant = schema.coverage?.instant || [];
    const extras = schema.coverage?.extras || [];
    if (!instant.length && !extras.length) return "";

    let html =
      '<div class="cq-block"><p class="cq-block-title">Coverage options</p><div class="cov-toggle">';
    instant.forEach((c) => {
      const on = c.defaultOn !== false;
      const req = c.required ? " data-cov-required='true'" : "";
      const solo = instant.length === 1 && c.required;
      html +=
        '<label class="cov-chip' +
        (on ? " on" : "") +
        (solo ? " solo" : "") +
        '">' +
        '<input type="checkbox" data-cov-id="' +
        c.id +
        '" data-cov-instant="true"' +
        req +
        (on ? " checked" : "") +
        (solo ? " disabled" : "") +
        "/>" +
        "<span>" +
        c.label +
        "</span></label>";
    });
    extras.forEach((c) => {
      html +=
        '<label class="cov-chip cov-extra">' +
        '<input type="checkbox" data-cov-id="' +
        c.id +
        '" data-cov-instant="false" data-cov-message="' +
        (c.message || "").replace(/"/g, "&quot;") +
        '"/>' +
        "<span>" +
        c.label +
        " <em>(full application)</em></span></label>";
    });
    html += "</div></div>";
    return html;
  }

  function renderField(field) {
    const p = new URLSearchParams(location.search);
    const pre = field.prefillParam ? p.get(field.prefillParam) : null;
    const val = pre || field.default || "";
    if (field.type === "select") {
      let opts = field.options
        .map(
          (o) =>
            '<option value="' +
            o.value +
            '"' +
            (String(o.value) === String(val) ? " selected" : "") +
            ">" +
            o.label +
            "</option>",
        )
        .join("");
      return (
        '<label for="f_' +
        field.name +
        '">' +
        field.label +
        '</label><select name="' +
        field.name +
        '" id="f_' +
        field.name +
        '" class="cq-ext-field" data-section="' +
        field.section +
        '">' +
        opts +
        "</select>"
      );
    }
    if (field.type === "date") {
      const dv = pre || defaultStartDate();
      return (
        '<label for="f_' +
        field.name +
        '">' +
        field.label +
        '</label><input type="date" name="' +
        field.name +
        '" id="f_' +
        field.name +
        '" class="cq-ext-field" data-section="' +
        field.section +
        '" value="' +
        dv +
        '"/>'
      );
    }
    return "";
  }

  function renderSections(schema) {
    let html = renderCoverageToggles(schema);

    if (schema.sections?.bop) {
      html +=
        '<details class="cq-section" id="section-bop" open><summary>BOP rating details <span class="cq-hint">Coterie uses these to price property &amp; operations</span></summary><div class="cq-section-body">';
      schema.fields
        .filter((f) => f.section === "bop")
        .forEach((f) => {
          html += renderField(f);
        });
      html += "</div></details>";
    }

    if (schema.sections?.gl) {
      html +=
        '<details class="cq-section" id="section-gl" open><summary>General liability limits</summary><div class="cq-section-body">';
      schema.fields
        .filter((f) => f.section === "gl")
        .forEach((f) => {
          html += renderField(f);
        });
      html += "</div></details>";
    }

    html +=
      '<details class="cq-section" id="section-policy" open><summary>Policy timing</summary><div class="cq-section-body">';
    schema.fields
      .filter((f) => f.section === "policy")
      .forEach((f) => {
        html += renderField(f);
      });
    html += "</div></details>";

    return html;
  }

  async function refreshDynamicForm() {
    const host = $("cq-dynamic");
    if (!host) return;
    const bc = selectedBusinessClass();
    if (!bc || !$("is_owner").value) {
      host.innerHTML =
        '<p class="cq-placeholder">Select business type and ownership to see coverage options.</p>';
      currentSchema = null;
      return;
    }
    currentSchema = await fetchSchema();
    if (!currentSchema) {
      host.innerHTML = "";
      return;
    }
    host.innerHTML = renderSections(currentSchema);
    bindCoverageUi();
    applyCoveragePrefill();
  }

  function applyCoveragePrefill() {
    const p = new URLSearchParams(location.search);
    if (p.get("cov_bop") === "1") {
      const el = document.querySelector('[data-cov-id="BOP"]');
      if (el && !el.disabled) el.checked = true;
    }
    if (p.get("cov_gl") === "1") {
      const el = document.querySelector('[data-cov-id="GL"]');
      if (el && !el.disabled) el.checked = true;
    }
    syncCovChips();
    updateSectionVisibility();
  }

  function syncCovChips() {
    document.querySelectorAll(".cov-chip").forEach((chip) => {
      const input = chip.querySelector("input");
      if (!input || input.disabled) return;
      chip.classList.toggle("on", input.checked);
    });
  }

  function updateSectionVisibility() {
    const bop = $("section-bop");
    const gl = $("section-gl");
    const bopToggle = document.querySelector('[data-cov-id="BOP"]');
    if (bop) bop.style.display = !bopToggle || coverageChecked("BOP") ? "" : "none";
    if (gl) {
      const glToggle = document.querySelector('[data-cov-id="GL"]');
      gl.style.display = !glToggle || coverageChecked("GL") ? "" : "none";
    }
  }

  function bindCoverageUi() {
    document.querySelectorAll("[data-cov-id]").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.dataset.covRequired === "true" && !input.checked) {
          input.checked = true;
        }
        syncCovChips();
        updateSectionVisibility();
      });
    });
    syncCovChips();
    updateSectionVisibility();
  }

  function formPayload() {
    const fd = new FormData($("cq-form"));
    const o = {};
    fd.forEach((v, k) => {
      o[k] = v;
    });
    o.is_owner = isOwnerSelected();
    o.application_types = selectedInstantCoverages();
    o.extra_coverages = selectedExtraCoverages();
    return o;
  }

  function validateBeforeQuote() {
    const extras = selectedExtraCoverages();
    if (extras.includes("PL")) {
      redirectTraditional(
        "Professional liability requires our full application — redirecting…",
        "professional_liability",
      );
      return false;
    }
    const types = selectedInstantCoverages();
    if (!types.length) {
      showErr("Select at least one coverage option to continue.");
      return false;
    }
    return true;
  }

  function selectedPaymentPlan() {
    return ($("payment_plan") && $("payment_plan").value) || "Annual";
  }

  function setPaymentPlan(plan) {
    if ($("payment_plan")) $("payment_plan").value = plan;
    document.querySelectorAll("[data-plan]").forEach((el) => {
      el.classList.toggle("selected", el.dataset.plan === plan);
    });
    updatePremiumSummary();
    updatePayButtonLabel();
  }

  function updatePayButtonLabel() {
    const q = session.quote;
    const btn = $("pay-btn");
    if (!q || !btn) return;
    const plan = selectedPaymentPlan();
    const yr = Number(q.premium || q.totalYearlyOwed || 0);
    const mo = Number(q.monthlyOwed || q.monthlyPremium || 0);
    if (plan === "Monthly" && mo) {
      btn.textContent = "Pay $" + mo.toFixed(2) + "/mo & bind coverage";
    } else if (yr) {
      btn.textContent = "Pay $" + yr.toLocaleString() + " & bind coverage";
    } else {
      btn.textContent = "Pay & bind coverage";
    }
  }

  function renderPaymentPlanPicker() {
    const q = session.quote;
    const host = $("payment-plan-picker");
    if (!q || !host) return;

    const yr = Number(q.premium || q.totalYearlyOwed || 0);
    const mo = Number(q.monthlyOwed || q.monthlyPremium || 0);
    const hasMonthly = mo > 0;

    let html =
      '<button type="button" class="plan-card" data-plan="Annual">' +
      '<span class="plan-name">Pay annually</span>' +
      '<span class="plan-price">' +
      (yr ? "$" + yr.toLocaleString() : "—") +
      "</span>" +
      '<span class="plan-period">per year</span>' +
      '<span class="plan-note">One payment for the full policy year · simplest option</span>' +
      "</button>";

    if (hasMonthly) {
      html +=
        '<button type="button" class="plan-card" data-plan="Monthly">' +
        '<span class="plan-name">Pay monthly</span>' +
        '<span class="plan-price">$' +
        mo.toFixed(2) +
        "</span>" +
        '<span class="plan-period">per month</span>' +
        '<span class="plan-note">About $' +
        yr.toLocaleString() +
        "/yr total · billed monthly through Coterie</span>" +
        "</button>";
    }

    host.innerHTML = html;
    host.querySelectorAll("[data-plan]").forEach((btn) => {
      btn.addEventListener("click", () => setPaymentPlan(btn.dataset.plan));
    });
    setPaymentPlan(hasMonthly ? selectedPaymentPlan() : "Annual");
  }

  function updatePremiumSummary() {
    const q = session.quote;
    if (!q) return;
    const plan = selectedPaymentPlan();
    const yr = Number(q.premium || q.totalYearlyOwed || 0);
    const mo = Number(q.monthlyOwed || q.monthlyPremium || 0);
    if (plan === "Monthly" && mo) {
      $("premium-display").textContent = "$" + mo.toFixed(2) + " / mo";
      $("premium-detail").textContent =
        "About $" +
        yr.toLocaleString() +
        "/yr total · " +
        (q.policyType || "GL") +
        " · " +
        (q.carrier || "Coterie");
    } else {
      $("premium-display").textContent = yr ? "$" + yr.toLocaleString() + " / yr" : "—";
      $("premium-detail").textContent =
        (mo ? "Or $" + mo.toFixed(2) + "/mo available · " : "") +
        (q.policyType || "GL") +
        " · " +
        (q.carrier || "Coterie");
    }
  }

  function updatePremiumDisplay() {
    renderPaymentPlanPicker();
    updatePremiumSummary();
    updatePayButtonLabel();
  }

  async function loadConfig() {
    const r = await fetch(API + "/api/coterie/config");
    const j = await r.json();
    demoEnabled = !!j.demoFinalizeEnabled;
    if (j.stripePublishableKey && window.Stripe) {
      stripe = Stripe(j.stripePublishableKey);
      cardElement = stripe.elements().create("card");
      cardElement.mount("#card-element");
    }
    if (demoEnabled) $("demo-btn").style.display = "block";
  }

  function showSuccess(connectUrl) {
    $("err-box").classList.remove("show");
    $("err-box").textContent = "";
    $("quote-box").classList.remove("show");
    $("success-box").classList.add("show");
    const base = connectUrl || "https://app.cid.famous.ai";
    const url =
      base +
      (base.includes("?") ? "&" : "?") +
      "email=" +
      encodeURIComponent(session.email || "");
    $("connect-btn").onclick = () => {
      location.href = url;
    };
  }

  function wireForm() {
    $("is_owner").addEventListener("change", refreshDynamicForm);
    $("business_class").addEventListener("change", refreshDynamicForm);

    $("cq-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!validateBeforeQuote()) return;
      $("err-box").classList.remove("show");
      $("quote-btn").disabled = true;
      try {
        const res = await fetch(API + "/api/coterie/connectquote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            segment: SEGMENT,
            business_class: selectedBusinessClass(),
            site_domain: location.hostname,
            formData: formPayload(),
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || data.error || "Quote failed");
        if (data.rail === "traditional") {
          redirectTraditional(
            data.message || "Redirecting to our full application…",
            data.reason,
          );
          return;
        }
        const q = data.coterie?.quote;
        if (!q?.isSuccess) {
          throw new Error(
            data.coterie?.bindBlocked?.message || data.message || "Quote unavailable",
          );
        }
        session.submission_public_id = data.submission_public_id;
        session.quote_id = q.quoteId;
        session.email = formPayload().contact_email;
        session.quote = q;
        updatePremiumDisplay();
        $("quote-box").classList.add("show");
        $("payment-section").classList.add("show");
        $("quote-box").scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (err) {
        showErr(err.message || String(err));
      } finally {
        $("quote-btn").disabled = false;
      }
    });

    $("pay-btn").addEventListener("click", async () => {
      if (!stripe || !cardElement) {
        showErr("Payment not configured — use Demo bind in sandbox or contact support.");
        return;
      }
      $("pay-btn").disabled = true;
      try {
        const tokenResult = await stripe.createToken(cardElement);
        if (tokenResult.error) throw new Error(tokenResult.error.message);
        const res = await fetch(API + "/api/coterie/bind", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submission_public_id: session.submission_public_id,
            quote_id: session.quote_id,
            stripe_token: tokenResult.token.id,
            payment_plan: selectedPaymentPlan(),
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          throw new Error(
            data.message || data.error || data.coterie?.errors?.[0] || "Bind failed",
          );
        }
        showSuccess(data.connect_url);
      } catch (err) {
        showErr(err.message || String(err));
      } finally {
        $("pay-btn").disabled = false;
      }
    });

    $("demo-btn").addEventListener("click", async () => {
      $("demo-btn").disabled = true;
      try {
        const res = await fetch(API + "/api/coterie/demo-finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submission_public_id: session.submission_public_id,
            quote_id: session.quote_id,
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || data.error || "Demo finalize failed");
        showSuccess(data.connect_url);
      } catch (err) {
        showErr(err.message || String(err));
      } finally {
        $("demo-btn").disabled = false;
      }
    });

  }

  async function init() {
    applyPrefill();
    await loadBusinessClasses();
    wireForm();
    await refreshDynamicForm();
    if (selectedBusinessClass() && !$("is_owner").value) {
      const host = $("cq-dynamic");
      if (host) {
        host.innerHTML =
          '<p class="cq-placeholder">Select ownership above to see coverage options and Coterie rating questions.</p>';
      }
    }
    loadConfig().catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
