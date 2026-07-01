/* ConnectQuote extended intake — shared across segment Netlify sites */
(function () {
  const cfg = window.CONNECTQUOTE || {};
  const API = cfg.api || "https://cid-pdf-api.onrender.com";
  const SEGMENT = cfg.segment || "electrical";
  const ASSET_V = "20260701b";

  const FALLBACK_CLASSES = {
    electrical: [
      {
        key: "electric_contracting",
        label: "Electrical contracting (primary work)",
      },
    ],
    plumber: [
      {
        key: "plumbing_contractor",
        label: "Plumbing contracting (primary work)",
      },
    ],
    hvac: [
      {
        key: "hvac_contractor",
        label: "HVAC contracting (primary work)",
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
  let paymentBindReady = false;
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

  function ensureContactPhoneField() {
    if ($("contact_phone")) return;
    const emailInput = $("contact_email");
    if (!emailInput || !emailInput.parentNode) return;
    const label = document.createElement("label");
    label.setAttribute("for", "contact_phone");
    label.textContent = "Phone";
    const input = document.createElement("input");
    input.name = "contact_phone";
    input.id = "contact_phone";
    input.type = "tel";
    input.required = true;
    input.autocomplete = "tel";
    input.inputMode = "tel";
    const anchor = emailInput.nextSibling;
    emailInput.parentNode.insertBefore(label, anchor);
    emailInput.parentNode.insertBefore(input, anchor);
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
      ph: "contact_phone",
      phone: "contact_phone",
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
    const st = ($("state") && $("state").value) || "";
    const r = await fetch(
      API +
        "/api/coterie/intake-schema/" +
        SEGMENT +
        "/" +
        encodeURIComponent(bc) +
        "?is_owner=" +
        (owner ? "true" : "false") +
        (st ? "&state=" + encodeURIComponent(st) : ""),
    );
    const j = await r.json();
    return j.schema || null;
  }

  function bindLocationTypeUi() {
    const loc = document.getElementById("f_location_type");
    if (!loc) return;
    const sync = () => {
      document.querySelectorAll("[data-show-when-location]").forEach((wrap) => {
        const need = wrap.dataset.showWhenLocation;
        const show = need === loc.value;
        wrap.style.display = show ? "" : "none";
        wrap.querySelectorAll(".cq-ext-field").forEach((el) => {
          if (show) el.setAttribute("required", "");
          else {
            el.removeAttribute("required");
            el.value = "";
            el.classList.remove("prefilled");
          }
        });
      });
    };
    if (loc.dataset.locationBound !== "1") {
      loc.dataset.locationBound = "1";
      loc.addEventListener("change", sync);
    }
    sync();
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
    const exclusive =
      schema.coverage?.instantSelection === "one" && instant.length > 1;
    if (!instant.length && !extras.length) return "";

    let html =
      '<div class="cq-block"><p class="cq-block-title">Coverage options' +
      (exclusive
        ? ' <span class="cq-hint">Choose one — instant quote includes a single product</span>'
        : "") +
      '</p><div class="cov-toggle"' +
      (exclusive ? ' data-cov-exclusive="true"' : "") +
      ">";

    instant.forEach((c) => {
      const on = c.defaultOn !== false;
      const req = c.required && !exclusive ? " data-cov-required='true'" : "";
      const solo = instant.length === 1 && c.required;
      html += '<div class="cov-chip-row">';
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
      if (c.help) {
        html +=
          '<button type="button" class="cov-help-btn" data-cov-help-id="' +
          c.id +
          '" aria-label="Learn about ' +
          c.id +
          ' coverage">?</button>';
      }
      html += "</div>";
    });
    html += "</div>";
    if (instant.some((c) => c.help)) {
      html +=
        '<div class="cov-help-blurb" id="cov-help-blurb" hidden role="status"></div>';
    }
    if (extras.length) {
      html += '<div class="cov-toggle cov-toggle-extras">';
    }
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
    if (extras.length) {
      html += "</div>";
    }
    html += "</div>";
    return html;
  }

  function parseCurrencyDigits(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return NaN;
    return Number(digits);
  }

  function formatCurrencyDigits(raw) {
    const n = parseCurrencyDigits(raw);
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString("en-US");
  }

  function fieldInitialValue(field, pre) {
    if (pre) return pre;
    if (field.legacyYearPrefillParam) {
      const p = new URLSearchParams(location.search);
      const ys = p.get(field.legacyYearPrefillParam);
      if (ys && /^\d{4}$/.test(String(ys))) return ys + "-01";
    }
    if (field.defaultPreselect && field.default) return String(field.default);
    return "";
  }

  function resolveFieldPrefill(field) {
    const p = new URLSearchParams(location.search);
    if (field.prefillParam) {
      const v = p.get(field.prefillParam);
      if (v) return v;
    }
    if (field.legacyYearPrefillParam) {
      const ys = p.get(field.legacyYearPrefillParam);
      if (ys && /^\d{4}$/.test(String(ys))) return ys + "-01";
    }
    return null;
  }

  function wrapConditionalField(field, inner) {
    if (!field.showWhenLocationType) return inner;
    return (
      '<div class="cq-conditional-field" data-show-when-location="' +
      field.showWhenLocationType +
      '" style="display:none">' +
      inner +
      "</div>"
    );
  }

  function renderField(field) {
    const pre = resolveFieldPrefill(field);
    const val = fieldInitialValue(field, pre);
    if (field.type === "select") {
      let opts = "";
      if (!val) {
        opts =
          '<option value="" disabled selected>Select…</option>';
      }
      opts += field.options
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
      const prefilled = pre ? ' class="cq-ext-field prefilled"' : ' class="cq-ext-field"';
      return wrapConditionalField(
        field,
        '<label for="f_' +
          field.name +
          '">' +
          field.label +
          '</label><select name="' +
          field.name +
          '" id="f_' +
          field.name +
          '"' +
          prefilled +
          ' data-section="' +
          field.section +
          '" required>' +
          opts +
          "</select>",
      );
    }
    if (field.type === "month") {
      const dv = val || "";
      const prefilled = pre ? ' class="cq-ext-field prefilled"' : ' class="cq-ext-field"';
      return (
        '<label for="f_' +
        field.name +
        '">' +
        field.label +
        '</label><input type="month" name="' +
        field.name +
        '" id="f_' +
        field.name +
        '"' +
        prefilled +
        ' data-section="' +
        field.section +
        '" value="' +
        dv +
        '" required/>'
      );
    }
    if (field.type === "date") {
      const dv = pre || "";
      const prefilled = pre ? ' class="cq-ext-field prefilled"' : ' class="cq-ext-field"';
      return (
        '<label for="f_' +
        field.name +
        '">' +
        field.label +
        '</label><input type="date" name="' +
        field.name +
        '" id="f_' +
        field.name +
        '"' +
        prefilled +
        ' data-section="' +
        field.section +
        '" value="' +
        dv +
        '" required/>'
      );
    }
    if (field.type === "number" && field.format === "currency") {
      const raw = val || "";
      const display = formatCurrencyDigits(raw);
      const prefilled =
        (pre || (field.defaultPreselect && field.default)) ? " prefilled" : "";
      const placeholder = field.placeholder
        ? ' placeholder="' + String(field.placeholder).replace(/"/g, "&quot;") + '"'
        : "";
      const minAttr =
        field.min != null ? ' data-min="' + String(field.min) + '"' : "";
      const maxAttr =
        field.max != null ? ' data-max="' + String(field.max) + '"' : "";
      return wrapConditionalField(
        field,
        '<label for="f_' +
          field.name +
          '">' +
          field.label +
          '</label><div class="cq-money-wrap"><span class="cq-money-prefix" aria-hidden="true">$</span><input type="text" name="' +
          field.name +
          '" id="f_' +
          field.name +
          '" class="cq-ext-field cq-currency-input' +
          prefilled +
          '" data-currency="true"' +
          minAttr +
          maxAttr +
          placeholder +
          ' inputmode="numeric" autocomplete="off" data-section="' +
          field.section +
          '" value="' +
          display +
          '" required/></div>',
      );
    }
    if (field.type === "number") {
      const dv = val || "";
      const prefilled = pre ? ' class="cq-ext-field prefilled"' : ' class="cq-ext-field"';
      const min =
        field.min != null ? ' min="' + String(field.min) + '"' : "";
      const max =
        field.max != null ? ' max="' + String(field.max) + '"' : "";
      const step =
        field.step != null ? ' step="' + String(field.step) + '"' : ' step="1"';
      const placeholder = field.placeholder
        ? ' placeholder="' + String(field.placeholder).replace(/"/g, "&quot;") + '"'
        : "";
      return (
        '<label for="f_' +
        field.name +
        '">' +
        field.label +
        '</label><input type="number" name="' +
        field.name +
        '" id="f_' +
        field.name +
        '"' +
        prefilled +
        min +
        max +
        step +
        placeholder +
        ' inputmode="numeric" data-section="' +
        field.section +
        '" value="' +
        dv +
        '" required/>'
      );
    }
    return "";
  }

  function isExtendedFieldVisible(el) {
    const conditional = el.closest(".cq-conditional-field");
    if (conditional && conditional.style.display === "none") return false;
    const section = el.closest(".cq-section");
    if (section && section.style.display === "none") return false;
    return true;
  }

  function validateExtendedFields() {
    const missing = [];
    document.querySelectorAll(".cq-ext-field").forEach((el) => {
      if (!isExtendedFieldVisible(el)) return;
      const label = el.id
        ? document.querySelector('label[for="' + el.id + '"]')
        : null;
      const labelText = label ? label.textContent : el.name;
      if (!el.value) {
        missing.push(labelText);
        return;
      }
      if (el.dataset.currency === "true") {
        const n = parseCurrencyDigits(el.value);
        const min = el.dataset.min ? Number(el.dataset.min) : null;
        const max = el.dataset.max ? Number(el.dataset.max) : null;
        if (!Number.isFinite(n) || (min != null && n < min)) {
          missing.push(labelText);
        } else if (max != null && n > max) {
          missing.push(labelText + " (max $" + max.toLocaleString("en-US") + ")");
        }
        return;
      }
      if (el.type === "number") {
        const n = Number(el.value);
        const min = el.min ? Number(el.min) : null;
        if (!Number.isFinite(n) || (min != null && n < min)) {
          missing.push(labelText);
        }
      }
    });
    if (missing.length) {
      showErr("Please complete: " + missing.join(", ") + ".");
      return false;
    }
    return true;
  }

  function renderSections(schema) {
    let html = renderCoverageToggles(schema);

    if (schema.sections?.rating) {
      html +=
        '<details class="cq-section" id="section-rating" open><summary>Business rating details <span class="cq-hint">Revenue, payroll &amp; month started — required by Coterie</span></summary><div class="cq-section-body">';
      schema.fields
        .filter((f) => f.section === "rating")
        .forEach((f) => {
          html += renderField(f);
        });
      html += "</div></details>";
    }

    if (schema.sections?.bop) {
      html +=
        '<details class="cq-section" id="section-bop" open><summary>Property coverage (BOP)</summary><div class="cq-section-body">';
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
    bindCurrencyInputs();
    bindLocationTypeUi();
    applyCoveragePrefill();
  }

  function applyCoveragePrefill() {
    const p = new URLSearchParams(location.search);
    const exclusive = document.querySelector('[data-cov-exclusive="true"]');
    if (p.get("cov_bop") === "1") {
      const el = document.querySelector('[data-cov-id="BOP"]');
      if (el && !el.disabled) el.checked = true;
    }
    if (p.get("cov_gl") === "1") {
      const el = document.querySelector('[data-cov-id="GL"]');
      if (el && !el.disabled) {
        if (exclusive && coverageChecked("BOP")) {
          const bop = document.querySelector('[data-cov-id="BOP"]');
          if (bop) bop.checked = false;
        }
        el.checked = true;
      }
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
    const rating = $("section-rating");
    const bopToggle = document.querySelector('[data-cov-id="BOP"]');
    const glToggle = document.querySelector('[data-cov-id="GL"]');
    const bopOn = !bopToggle || coverageChecked("BOP");
    const glOn = !glToggle || coverageChecked("GL");
    if (rating) rating.style.display = bopOn || glOn ? "" : "none";
    if (bop) bop.style.display = bopOn ? "" : "none";
    if (gl) gl.style.display = glOn ? "" : "none";
  }

  function bindCoverageUi() {
    const exclusive = document.querySelector('[data-cov-exclusive="true"]');
    const helpTexts = {};
    if (currentSchema?.coverage?.instant) {
      currentSchema.coverage.instant.forEach((c) => {
        if (c.help) helpTexts[c.id] = c.help;
      });
    }

    document.querySelectorAll("[data-cov-id]").forEach((input) => {
      input.addEventListener("change", () => {
        if (exclusive && input.dataset.covInstant === "true") {
          if (input.checked) {
            document
              .querySelectorAll('[data-cov-id][data-cov-instant="true"]')
              .forEach((other) => {
                if (other !== input) other.checked = false;
              });
          } else {
            const anyChecked = [
              ...document.querySelectorAll('[data-cov-id][data-cov-instant="true"]'),
            ].some((el) => el.checked);
            if (!anyChecked) input.checked = true;
          }
        } else if (input.dataset.covRequired === "true" && !input.checked) {
          input.checked = true;
        }
        syncCovChips();
        updateSectionVisibility();
      });
    });

    document.querySelectorAll(".cov-help-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.covHelpId;
        const blurb = $("cov-help-blurb");
        const text = helpTexts[id] || "";
        if (!blurb || !text) return;
        const open = blurb.dataset.active === id && !blurb.hidden;
        document.querySelectorAll(".cov-help-btn").forEach((b) => {
          b.setAttribute("aria-expanded", "false");
        });
        if (open) {
          blurb.hidden = true;
          blurb.dataset.active = "";
          blurb.textContent = "";
        } else {
          blurb.textContent = text;
          blurb.hidden = false;
          blurb.dataset.active = id;
          btn.setAttribute("aria-expanded", "true");
        }
      });
    });

    syncCovChips();
    updateSectionVisibility();
  }

  function bindCurrencyInputs() {
    document.querySelectorAll("[data-currency='true']").forEach((el) => {
      if (el.dataset.currencyBound === "1") return;
      el.dataset.currencyBound = "1";
      el.addEventListener("input", () => {
        el.classList.remove("prefilled");
        const formatted = formatCurrencyDigits(el.value);
        el.value = formatted;
      });
      el.addEventListener("blur", () => {
        el.value = formatCurrencyDigits(el.value);
      });
    });
  }

  function formPayload() {
    const fd = new FormData($("cq-form"));
    const o = {};
    fd.forEach((v, k) => {
      o[k] = v;
    });
    ["gross_annual_sales", "annual_payroll", "building_limit", "bpp_limit"].forEach((key) => {
      if (o[key] != null && o[key] !== "") {
        const n = parseCurrencyDigits(o[key]);
        if (Number.isFinite(n)) o[key] = String(n);
      }
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
    if (!validateExtendedFields()) return false;
    const phone = $("contact_phone");
    if (phone && !String(phone.value || "").trim()) {
      showErr("Phone number is required.");
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
    paymentBindReady = !!j.paymentBindReady;
    if (j.stripePublishableKey && window.Stripe && paymentBindReady) {
      stripe = Stripe(j.stripePublishableKey);
      cardElement = stripe.elements().create("card");
      cardElement.mount("#card-element");
    }
    if (demoEnabled) {
      const demoBtn = $("demo-btn");
      if (demoBtn) {
        demoBtn.style.display = "block";
        demoBtn.textContent = paymentBindReady
          ? "Skip payment — demo only"
          : "Complete bind — demo (no charge)";
      }
      if (!paymentBindReady) {
        applyInterimDemoPaymentUi();
      }
    }
    onConfigReady();
  }

  function applyInterimDemoPaymentUi() {
    const noticeId = "interim-demo-notice";
    const paySection = $("payment-section");
    if (paySection && !document.getElementById(noticeId)) {
      const el = document.createElement("p");
      el.id = noticeId;
      el.className = "interim-demo-notice";
      el.textContent =
        "Live card payment is coming soon. Use the button below to finish and open CID Connect — no charge.";
      paySection.insertBefore(el, paySection.firstChild);
    }
    const cardHost = document.getElementById("card-element");
    if (cardHost) {
      cardHost.style.display = "none";
      const cardLabel = cardHost.previousElementSibling;
      if (cardLabel && cardLabel.tagName === "LABEL") {
        cardLabel.style.display = "none";
      }
    }
    const payBtn = $("pay-btn");
    if (payBtn) payBtn.style.display = "none";
    const demoBtn = $("demo-btn");
    if (demoBtn) {
      demoBtn.style.display = "block";
      demoBtn.textContent = paymentBindReady
        ? "Skip payment — demo only"
        : "Complete bind — demo (no charge)";
    }
  }

  async function callDemoFinalize() {
    const res = await fetch(API + "/api/coterie/demo-finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submission_public_id: session.submission_public_id,
        quote_id: session.quote_id,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.message || data.error || "Demo finalize failed");
    }
    return data;
  }

  function showSuccess(connectUrl) {
    $("err-box").classList.remove("show");
    $("err-box").textContent = "";
    $("quote-box").classList.remove("show");
    $("payment-section")?.classList.remove("show");
    const demoBtn = $("demo-btn");
    if (demoBtn) demoBtn.style.display = "none";
    const formCard = $("cq-form")?.closest(".card");
    if (formCard) formCard.style.display = "none";

    const successBox = $("success-box");
    if (successBox) {
      const h2 = successBox.querySelector("h2");
      if (h2) h2.textContent = "Congratulations — you're covered!";
      successBox.classList.add("show");
      successBox.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const connectBtn = $("connect-btn");
    if (connectBtn) connectBtn.textContent = "Sign up for CID Connect";

    const base = connectUrl || "https://app.cid.famous.ai";
    const url =
      base +
      (base.includes("?") ? "&" : "?") +
      "email=" +
      encodeURIComponent(session.email || "");
    if (connectBtn) {
      connectBtn.onclick = () => {
        location.href = url;
      };
    }
  }

  function wireForm() {
    $("is_owner").addEventListener("change", refreshDynamicForm);
    $("business_class").addEventListener("change", refreshDynamicForm);
    const stateEl = $("state");
    if (stateEl) stateEl.addEventListener("change", refreshDynamicForm);

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
          const coterieErr =
            (Array.isArray(q?.errors) && q.errors[0]) ||
            data.coterie?.bindBlocked?.message ||
            data.message ||
            "Quote unavailable";
          throw new Error(coterieErr);
        }
        session.submission_public_id = data.submission_public_id;
        session.quote_id = q.quoteId;
        session.email = formPayload().contact_email;
        session.quote = q;
        updatePremiumDisplay();
        $("quote-box").classList.add("show");
        $("payment-section").classList.add("show");
        if (demoEnabled && !paymentBindReady) {
          applyInterimDemoPaymentUi();
        }
        $("quote-box").scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (err) {
        showErr(err.message || String(err));
      } finally {
        $("quote-btn").disabled = false;
      }
    });

    $("pay-btn").addEventListener("click", async () => {
      if (!stripe || !cardElement) {
        showErr(
          demoEnabled
            ? "Use Complete bind — demo (no charge) below."
            : "Payment not configured — contact support.",
        );
        return;
      }
      $("pay-btn").disabled = true;
      if ($("demo-btn")) $("demo-btn").disabled = true;
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
        if (data.ok && data.connect_url) {
          showSuccess(data.connect_url);
          return;
        }

        // Sandbox: payment token accepted but Coterie bind may still fail — finalize policy spine automatically.
        if (demoEnabled) {
          const demo = await callDemoFinalize();
          showSuccess(demo.connect_url);
          return;
        }

        const bindMsg =
          data.message ||
          data.error ||
          data.coterie?.errors?.[0]?.message ||
          data.coterie?.errors?.[0] ||
          "Bind failed";
        throw new Error(
          data.hint ? bindMsg + " " + data.hint : bindMsg,
        );
      } catch (err) {
        if (demoEnabled && session.submission_public_id) {
          try {
            const demo = await callDemoFinalize();
            showSuccess(demo.connect_url);
            return;
          } catch (_) {
            /* fall through to error below */
          }
        }
        showErr(err.message || String(err));
      } finally {
        $("pay-btn").disabled = false;
        if ($("demo-btn") && !$("success-box")?.classList.contains("show")) {
          $("demo-btn").disabled = false;
        }
      }
    });

    $("demo-btn").addEventListener("click", async () => {
      $("demo-btn").disabled = true;
      try {
        const data = await callDemoFinalize();
        showSuccess(data.connect_url);
      } catch (err) {
        showErr(err.message || String(err));
      } finally {
        if (!$("success-box")?.classList.contains("show")) {
          $("demo-btn").disabled = false;
        }
      }
    });

  }

  async function init() {
    ensureContactPhoneField();
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
    await loadConfig().catch(() => {});
  }

  /** Re-apply interim demo UI when quote box is already open before config returned. */
  function onConfigReady() {
    if (demoEnabled && !paymentBindReady && $("quote-box")?.classList.contains("show")) {
      applyInterimDemoPaymentUi();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
