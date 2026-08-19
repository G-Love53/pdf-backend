/* ConnectQuote extended intake — shared across segment Netlify sites */
(function () {
  const cfg = window.CONNECTQUOTE || {};
  const API = cfg.api || "https://cid-pdf-api.onrender.com";
  const SEGMENT = cfg.segment || "electrical";
  const ASSET_V = "20260819b";

  const CHANNEL_QUERY_KEYS = ["ch", "src", "utm_source"];

  /** Keep in sync with src/outreach/normalizeUsPhone.js */
  function normalizeUsPhone(raw) {
    if (raw == null || raw === "") return "";
    let digits = String(raw).replace(/\D+/g, "");
    if (!digits) return "";
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    if (digits.length > 10) digits = digits.slice(-10);
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return "";
    return digits;
  }

  /** Display-only for prefilled tel field */
  function formatUsPhoneDisplay(raw) {
    const d = normalizeUsPhone(raw);
    if (!d) return "";
    return d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6);
  }

  const CONNECT_BENEFITS_HTML = `<div class="connect-benefits" id="connect-benefits" aria-label="Included with CID Connect">
      <p class="connect-benefits-head">Included with <strong>Connect</strong></p>
      <p class="connect-benefits-sub">Bind today — your Connect login is ready same day.</p>
      <ul class="connect-benefits-grid">
        <li class="benefit-coi">
          <span class="connect-benefits-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>
          </span>
          <span class="connect-benefits-copy">
            <span class="connect-benefits-title">Instant COIs</span>
            <span class="connect-benefits-desc">Your COI, sent in seconds</span>
          </span>
        </li>
        <li class="benefit-covered">
          <span class="connect-benefits-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M9.5 9a2.5 2.5 0 0 1 4.2 1.8c0 1.5-2.2 1.8-2.2 3.2"/><path d="M12 17h.01"/></svg>
          </span>
          <span class="connect-benefits-copy">
            <span class="connect-benefits-title">Am I Covered?</span>
            <span class="connect-benefits-desc">Answers to your policy questions</span>
          </span>
        </li>
        <li class="benefit-home">
          <span class="connect-benefits-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/></svg>
          </span>
          <span class="connect-benefits-copy">
            <span class="connect-benefits-title">Policy Home</span>
            <span class="connect-benefits-desc">Your docs, one secure place</span>
          </span>
        </li>
        <li class="benefit-claims">
          <span class="connect-benefits-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
          </span>
          <span class="connect-benefits-copy">
            <span class="connect-benefits-title">Claims Help</span>
            <span class="connect-benefits-desc">Get your claim moving fast</span>
          </span>
        </li>
        <li class="benefit-renewals">
          <span class="connect-benefits-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9c2.4 0 4.6.9 6.3 2.4"/><path d="M21 3v6h-6"/></svg>
          </span>
          <span class="connect-benefits-copy">
            <span class="connect-benefits-title">Easy Renewals</span>
            <span class="connect-benefits-desc">We\u2019ll remind you \u2014 you stay covered</span>
          </span>
        </li>
      </ul>
    </div>`;

  function ensureConnectBenefits() {
    const box = $("quote-box");
    if (!box || $("connect-benefits")) return;
    const heading = box.querySelector("h2");
    if (!heading) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = CONNECT_BENEFITS_HTML.trim();
    const band = wrap.firstElementChild;
    if (band) heading.insertAdjacentElement("afterend", band);
  }

  const MONTH_LABELS = [
    ["01", "January"],
    ["02", "February"],
    ["03", "March"],
    ["04", "April"],
    ["05", "May"],
    ["06", "June"],
    ["07", "July"],
    ["08", "August"],
    ["09", "September"],
    ["10", "October"],
    ["11", "November"],
    ["12", "December"],
  ];

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
    beauty: [
      { key: "hair_salon", label: "Hair salon / beauty shop" },
      { key: "barber_shop", label: "Barber shop" },
      { key: "nail_salon", label: "Nail salon" },
      { key: "esthetician", label: "Esthetician / skin care" },
    ],
    cleaning: [
      { key: "home_cleaning", label: "Home / residential cleaning" },
      { key: "carpet_cleaning", label: "Carpet / upholstery cleaning" },
    ],
    pet: [
      { key: "pet_grooming", label: "Pet grooming" },
      { key: "pet_sitting", label: "Pet sitting / boarding" },
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

  function isPartnerDemo() {
    return !!cfg.partnerDemo;
  }

  function quoteMetaSuffix(q) {
    const policy = q.policyType || "GL";
    if (q.carrier) return policy + " · " + q.carrier;
    return policy;
  }

  function sanitizeQuoteError(msg) {
    if (!msg) return msg;
    return String(msg)
      .replace(/Coterie API \d+[^.]*\.?/gi, "Unable to get a quote right now. ")
      .replace(/\bCoterie\b/gi, "quote service")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function applyPaymentSectionLabels() {
    const paySection = $("payment-section");
    if (!paySection) return;
    paySection.querySelectorAll("label").forEach((label) => {
      const t = label.textContent || "";
      if (/card details/i.test(t)) {
        label.textContent = "Card details (secure payment)";
      }
    });
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
    el.textContent = sanitizeQuoteError(msg);
    el.classList.add("show");
  }

  function prefillValue(param, raw) {
    if (!raw) return raw;
    if (param === "em" && raw.includes("@")) {
      const at = raw.indexOf("@");
      return raw.slice(0, at).replace(/ /g, "+") + raw.slice(at);
    }
    if (param === "ph" || param === "phone") {
      return formatUsPhoneDisplay(raw) || "";
    }
    return raw;
  }

  function readChannelParam(p) {
    for (const key of CHANNEL_QUERY_KEYS) {
      const v = p.get(key);
      if (v) return v;
    }
    return "";
  }

  function applyAttributionFromQuery(p) {
    const channel = readChannelParam(p);
    if (channel) $("traffic_source").value = channel;
    if (p.get("cid")) $("campaign_id").value = p.get("cid");
  }

  /** Keep ch + cid in address bar — src is often stripped by Safari LTP / click trackers. */
  function persistAttributionQuery() {
    const channel = String($("traffic_source")?.value || "").trim();
    const campaign = String($("campaign_id")?.value || "").trim();
    if ((!channel || channel === "direct") && !campaign) return;

    const p = new URLSearchParams(location.search);
    if (channel && channel !== "direct") {
      p.set("ch", channel);
      if (!p.get("src")) p.set("src", channel);
    }
    if (campaign) p.set("cid", campaign);

    const qs = p.toString();
    const next = qs ? `${location.pathname}?${qs}` : location.pathname;
    const current = location.pathname + location.search;
    if (next !== current) {
      history.replaceState(null, "", next);
    }
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
    applyAttributionFromQuery(p);
    persistAttributionQuery();
    const io = p.get("io") || p.get("is_owner");
    if (io && $("is_owner") && (io === "yes" || io === "no")) {
      $("is_owner").value = io;
    }
    if (count >= 3 && $("bridge-text")) {
      $("bridge-text").textContent = "We've loaded your info — confirm details and choose coverages.";
    }
  }

  function applyPartnerDemoDefaults() {
    if (!cfg.partnerDemo) return;
    const p = new URLSearchParams(location.search);
    if (p.get("fn") || p.get("em")) return;
    const defaults = {
      first_name: "Alex",
      last_name: "Demo",
      insured_name: "Peak Pilates Denver LLC",
      premise_street: "1234 Blake St",
      premise_city: "Denver",
      state: "CO",
      zip: "80202",
      contact_phone: "3035550100",
    };
    Object.entries(defaults).forEach(([id, value]) => {
      const el = $(id);
      if (el && !String(el.value || "").trim()) {
        el.value = value;
        el.classList.add("prefilled");
      }
    });
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

  function isOwnerOnlyBlocked() {
    return currentSchema?.ownerOnly && !isOwnerSelected();
  }

  function ownerOnlyNoticeHtml() {
    const label =
      currentSchema?.businessClassLabel || "This business type";
    return (
      '<div class="cq-owner-only-notice" role="alert">' +
      "<strong>Instant quote is for business owners only.</strong> " +
      label +
      " on ConnectQuote requires you to own or operate the business " +
      "(sole proprietor, LLC, etc.). If you are an employee, use our " +
      '<a href="index.html' +
      (location.search || "") +
      '">full application</a> instead — or change ownership above to "Yes" if you are the owner.' +
      "</div>"
    );
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

  function bindMonthYearFields() {
    document.querySelectorAll("[data-month-year-field]").forEach((wrap) => {
      if (wrap.dataset.monthYearBound === "1") return;
      wrap.dataset.monthYearBound = "1";
      const hidden = wrap.querySelector('input[type="hidden"]');
      const monthSel = wrap.querySelector("[data-bsm-month]");
      const yearSel = wrap.querySelector("[data-bsm-year]");
      if (!hidden || !monthSel || !yearSel) return;

      function sync() {
        if (monthSel.value && yearSel.value) {
          hidden.value = yearSel.value + "-" + monthSel.value;
          wrap.classList.remove("prefilled");
        } else {
          hidden.value = "";
        }
      }

      monthSel.addEventListener("change", sync);
      yearSel.addEventListener("change", sync);
      sync();
    });
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

  function isExclusiveCoverageSelection(schema) {
    const instant = schema.coverage?.instant || [];
    if (instant.length <= 1) return false;
    const ids = instant.map((c) => c.id);
    if (cfg.partnerDemo && ids.includes("BOP") && ids.includes("GL")) {
      return true;
    }
    return schema.coverage?.instantSelection === "one";
  }

  function renderCoverageToggles(schema) {
    const instant = schema.coverage?.instant || [];
    const extras = schema.coverage?.extras || [];
    const exclusive = isExclusiveCoverageSelection(schema);
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

  function readCurrencyFieldValue(el) {
    if (!el) return NaN;
    const typed = parseCurrencyDigits(el.value);
    if (Number.isFinite(typed)) return typed;
    const suggested = el.dataset.suggested;
    if (suggested) {
      const n = parseCurrencyDigits(suggested);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
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
      let yearVal = "";
      let monthVal = "";
      if (val && /^\d{4}-\d{2}$/.test(String(val))) {
        const parts = String(val).split("-");
        yearVal = parts[0];
        monthVal = parts[1];
      }
      let monthOpts =
        '<option value="" disabled' + (!monthVal ? " selected" : "") + ">Select month…</option>";
      MONTH_LABELS.forEach(([v, label]) => {
        monthOpts +=
          '<option value="' +
          v +
          '"' +
          (v === monthVal ? " selected" : "") +
          ">" +
          label +
          "</option>";
      });
      const nowYear = new Date().getFullYear();
      let yearOpts =
        '<option value="" disabled' + (!yearVal ? " selected" : "") + ">Select year…</option>";
      for (let y = nowYear; y >= 1980; y--) {
        yearOpts +=
          '<option value="' +
          y +
          '"' +
          (String(y) === yearVal ? " selected" : "") +
          ">" +
          y +
          "</option>";
      }
      const prefilled = pre ? " prefilled" : "";
      return wrapConditionalField(
        field,
        '<label for="f_' +
          field.name +
          '_month">' +
          field.label +
          '</label><div class="cq-month-year' +
          prefilled +
          '" data-month-year-field data-field="' +
          field.name +
          '"><input type="hidden" name="' +
          field.name +
          '" id="f_' +
          field.name +
          '" value="' +
          (val || "") +
          '" data-section="' +
          field.section +
          '"/><select id="f_' +
          field.name +
          '_month" data-bsm-month class="cq-ext-field" aria-label="Month business started" required>' +
          monthOpts +
          '</select><select id="f_' +
          field.name +
          '_year" data-bsm-year class="cq-ext-field" aria-label="Year business started" required>' +
          yearOpts +
          "</select></div>",
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
      const isSuggestedPrefill = Boolean(pre);
      const raw = isSuggestedPrefill ? "" : val || "";
      const display = raw ? formatCurrencyDigits(raw) : "";
      const prefilled =
        !isSuggestedPrefill && (pre || (field.defaultPreselect && field.default))
          ? " prefilled"
          : "";
      const suggestedAttr = isSuggestedPrefill
        ? ' data-suggested="' +
          String(parseCurrencyDigits(pre)).replace(/"/g, "") +
          '"'
        : "";
      const placeholder =
        isSuggestedPrefill && pre
          ? formatCurrencyDigits(pre)
          : field.placeholder || "0";
      const placeholderAttr =
        ' placeholder="' + String(placeholder).replace(/"/g, "&quot;") + '"';
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
          suggestedAttr +
          minAttr +
          maxAttr +
          placeholderAttr +
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
      if (el.dataset.currency === "true") {
        const n = readCurrencyFieldValue(el);
        const min = el.dataset.min ? Number(el.dataset.min) : null;
        const max = el.dataset.max ? Number(el.dataset.max) : null;
        if (!Number.isFinite(n) || (min != null && n < min)) {
          missing.push(labelText);
        } else if (max != null && n > max) {
          missing.push(labelText + " (max $" + max.toLocaleString("en-US") + ")");
        }
        return;
      }
      if (!el.value) {
        missing.push(labelText);
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

  function renderAppetiteKnockouts(schema) {
    const items = schema?.appetiteKnockouts || [];
    if (!items.length) return "";
    let html =
      '<details class="cq-section" id="section-appetite" open><summary>Eligibility <span class="cq-hint">Instant quote — business owners only</span></summary><div class="cq-section-body">';
    html +=
      '<p class="cq-knockout-intro">Answer <strong>Yes</strong> or <strong>No</strong> for each. If any activity applies, we will route you to our full application.</p>';
    items.forEach((item) => {
      const name = "knockout_" + item.id;
      html +=
        '<fieldset class="cq-knockout" data-knockout-id="' +
        item.id +
        '"><legend>' +
        item.question +
        '</legend><label><input type="radio" name="' +
        name +
        '" value="no" required checked> No</label> <label><input type="radio" name="' +
        name +
        '" value="yes"> Yes</label></fieldset>';
    });
    html += "</div></details>";
    return html;
  }

  function appetiteKnockoutFailed() {
    const items = currentSchema?.appetiteKnockouts || [];
    for (const item of items) {
      const picked = document.querySelector(
        'input[name="knockout_' + item.id + '"]:checked',
      );
      if (picked && picked.value === "yes") {
        return item;
      }
    }
    return null;
  }

  function validateAppetiteKnockouts() {
    const failed = appetiteKnockoutFailed();
    if (!failed) return true;
    redirectTraditional(
      "This activity needs our full application — redirecting…",
      "coterie_exclusion_" + failed.id,
    );
    return false;
  }

  function renderSections(schema) {
    let html = renderCoverageToggles(schema);
    html += renderAppetiteKnockouts(schema);

    if (schema.sections?.rating) {
      html +=
        '<details class="cq-section" id="section-rating" open><summary>Business rating details <span class="cq-hint">Revenue, payroll &amp; month started — required for your quote</span></summary><div class="cq-section-body">';
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
    if (isOwnerOnlyBlocked()) {
      host.innerHTML = ownerOnlyNoticeHtml();
      return;
    }
    host.innerHTML = renderSections(currentSchema);
    bindCoverageUi();
    bindCurrencyInputs();
    bindMonthYearFields();
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
      el.addEventListener("focus", () => {
        el.classList.remove("prefilled");
        window.setTimeout(() => {
          try {
            el.select();
          } catch (_) {
            /* iOS may ignore select on focus */
          }
        }, 0);
      });
      el.addEventListener("input", () => {
        el.classList.remove("prefilled");
        delete el.dataset.suggested;
        const formatted = formatCurrencyDigits(el.value);
        el.value = formatted;
      });
      el.addEventListener("blur", () => {
        if (!String(el.value || "").trim() && el.dataset.suggested) {
          return;
        }
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
      const el =
        document.getElementById("f_" + key) ||
        document.querySelector('[name="' + key + '"]');
      let n = NaN;
      if (el && el.dataset.currency === "true") {
        n = readCurrencyFieldValue(el);
      } else if (o[key] != null && o[key] !== "") {
        n = parseCurrencyDigits(o[key]);
      }
      if (Number.isFinite(n)) o[key] = String(n);
    });
    o.is_owner = isOwnerSelected();
    o.application_types = selectedInstantCoverages();
    o.extra_coverages = selectedExtraCoverages();
    if (o.contact_phone) {
      o.contact_phone = normalizeUsPhone(o.contact_phone) || String(o.contact_phone).replace(/\D+/g, "");
    }
    return o;
  }

  function validateBeforeQuote() {
    if (isOwnerOnlyBlocked()) {
      showErr(
        "Instant quotes are for business owners. Select “Yes — I own / operate the business” if you are a sole proprietor, or use our full application for employee coverage.",
      );
      return false;
    }
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
    if (!validateAppetiteKnockouts()) return false;
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
        "/yr total · billed monthly</span>" +
        "</button>";
    }

    host.innerHTML = html;
    host.querySelectorAll("[data-plan]").forEach((btn) => {
      btn.addEventListener("click", () => setPaymentPlan(btn.dataset.plan));
    });
    setPaymentPlan(hasMonthly ? selectedPaymentPlan() : "Annual");
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function exclusionLabel(item) {
    if (item == null || item === "") return "";
    if (typeof item === "string") return item;
    return (
      item.label ||
      item.name ||
      item.description ||
      item.text ||
      item.title ||
      JSON.stringify(item)
    );
  }

  function renderCoterieExclusions(exclusions) {
    let host = $("coterie-exclusions");
    if (!host) {
      host = document.createElement("div");
      host.id = "coterie-exclusions";
      host.className = "coterie-exclusions";
      const anchor = $("premium-detail");
      if (anchor?.parentNode) {
        anchor.parentNode.insertBefore(host, anchor.nextSibling);
      }
    }

    const list = (Array.isArray(exclusions) ? exclusions : [])
      .map(exclusionLabel)
      .filter(Boolean);
    if (!list.length) {
      host.style.display = "none";
      host.innerHTML = "";
      return;
    }

    host.style.display = "block";
    host.innerHTML =
      '<p class="coterie-exclusions-title"><strong>Excluded operations</strong> — informational; you can still bind and pay below.</p>' +
      "<ul>" +
      list.map((line) => "<li>" + escapeHtml(line) + "</li>").join("") +
      "</ul>";
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
        quoteMetaSuffix(q);
    } else {
      $("premium-display").textContent = yr ? "$" + yr.toLocaleString() + " / yr" : "—";
      $("premium-detail").textContent =
        (mo ? "Or $" + mo.toFixed(2) + "/mo available · " : "") + quoteMetaSuffix(q);
    }
  }

  function updatePremiumDisplay() {
    renderPaymentPlanPicker();
    updatePremiumSummary();
    renderCoterieExclusions(session.exclusions);
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
        demoBtn.textContent = isPartnerDemo()
          ? "Complete bind — demo (no charge)"
          : paymentBindReady
            ? "Skip payment — demo only"
            : "Complete bind — demo (no charge)";
      }
      if (!paymentBindReady) {
        applyInterimDemoPaymentUi();
      }
    }
    onConfigReady();
    applyPaymentSectionLabels();
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
      demoBtn.textContent = isPartnerDemo()
        ? "Complete bind — demo (no charge)"
        : paymentBindReady
          ? "Skip payment — demo only"
          : "Complete bind — demo (no charge)";
    }
    applyPaymentSectionLabels();
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
            submission_public_id: session.submission_public_id || undefined,
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
        session.exclusions = data.coterie?.exclusions || [];
        updatePremiumDisplay();
        $("quote-box").classList.add("show");
        $("payment-section").classList.add("show");
        if (demoEnabled && !paymentBindReady) {
          applyInterimDemoPaymentUi();
        } else {
          applyPaymentSectionLabels();
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
      const bindEmail = String(
        formPayload().contact_email || session.email || "",
      ).trim();
      if (!bindEmail) {
        showErr(
          "Email is required before payment. Enter your email above and tap Get instant quote again.",
        );
        return;
      }
      session.email = bindEmail;
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
            contact_email: bindEmail,
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
    ensureConnectBenefits();
    ensureContactPhoneField();
    applyPrefill();
    applyPartnerDemoDefaults();
    await loadBusinessClasses();
    wireForm();
    await refreshDynamicForm();
    if (selectedBusinessClass() && !$("is_owner").value) {
      const host = $("cq-dynamic");
      if (host) {
        host.innerHTML =
          '<p class="cq-placeholder">Select ownership above to see coverage options.</p>';
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
