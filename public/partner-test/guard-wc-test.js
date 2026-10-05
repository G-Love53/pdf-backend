(function () {
  const cfg = window.GUARD_PARTNER_TEST || {};
  const API = (cfg.api || "https://cid-pdf-api-sandbox.onrender.com").replace(
    /\/$/,
    "",
  );
  const TOKEN = cfg.token || "";

  const session = {
    submission_public_id: null,
    segment: "plumber",
    guardPremium: null,
    guardWcBound: false,
    policyNumber: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function apiUrl(path) {
    const sep = path.includes("?") ? "&" : "?";
    if (!TOKEN) return API + path;
    return API + path + sep + "token=" + encodeURIComponent(TOKEN);
  }

  function partnerHeaders() {
    const h = { "Content-Type": "application/json" };
    if (TOKEN) h["X-Partner-Test-Token"] = TOKEN;
    return h;
  }

  function showErr(el, msg) {
    el.textContent = msg || "";
    el.classList.toggle("show", Boolean(msg));
  }

  function showOk(el, msg) {
    el.textContent = msg || "";
    el.classList.toggle("show", Boolean(msg));
  }

  function digitsOnly(s) {
    return String(s || "").replace(/\D/g, "");
  }

  function formatFein(s) {
    const d = digitsOnly(s).slice(0, 9);
    if (d.length <= 2) return d;
    return d.slice(0, 2) + "-" + d.slice(2);
  }

  function feinError(s) {
    const d = digitsOnly(s);
    if (!d.length) return "Enter the 9-digit FEIN.";
    if (d.length !== 9) return "FEIN must be 9 digits (xx-xxxxxxx).";
    return null;
  }

  function money(n) {
    return "$" + Number(n).toLocaleString();
  }

  function guardExperienceModValue() {
    const years = Number($("guard-years") && $("guard-years").value);
    if (Number.isFinite(years) && years > 0 && years < 3) return undefined;
    const el = $("guard-emr");
    const raw = el && String(el.value || "").trim();
    return raw || undefined;
  }

  function syncGuardEmrVisibility() {
    const wrap = $("guard-emr-wrap");
    const yearsEl = $("guard-years");
    if (!wrap || !yearsEl) return;
    const years = Number(yearsEl.value);
    wrap.hidden = Number.isFinite(years) && years > 0 && years < 3;
  }

  function mountGuardCapitaButton(host, capita) {
    if (!host) return;
    let el = host.querySelector(".guard-capita-btn");
    if (!capita || !capita.payUrl) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("a");
      el.className = "guard-capita-btn";
      el.target = "_blank";
      el.rel = "noopener noreferrer";
      host.appendChild(el);
    }
    el.href = capita.payUrl;
    el.textContent = "Pay with GUARD / Capita";
  }

  function popupGuardKickout(message) {
    const text =
      message ||
      "NOTICE: This risk will require underwriting review.";
    try {
      window.alert(text);
    } catch (_) {}
  }

  function guardWcStatus(box, kind, text) {
    let el = box.querySelector(".guard-wc-status");
    if (!el) {
      el = document.createElement("p");
      el.className = "guard-wc-status";
      box.appendChild(el);
    }
    el.className = "guard-wc-status" + (kind ? " " + kind : "");
    el.textContent = text || "";
  }

  function renderGuardQuestions(host, questions) {
    host.innerHTML = "";
    (questions || []).forEach((q) => {
      const wrap = document.createElement("div");
      wrap.className = "guard-q";
      const lab = document.createElement("label");
      lab.textContent = q.questionText || q.questionCd || "Question";
      wrap.appendChild(lab);
      const type = String(q.type || "SelectOne").toLowerCase();
      if (type === "number" || type === "percentage") {
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.dataset.qcd = q.questionCd || "";
        input.dataset.qtype = "num";
        wrap.appendChild(input);
      } else if (q.options && q.options.length) {
        const sel = document.createElement("select");
        sel.dataset.qcd = q.questionCd || "";
        sel.dataset.qtype = "choice";
        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "Select";
        sel.appendChild(blank);
        q.options.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt.value;
          o.textContent = opt.label || opt.value;
          sel.appendChild(o);
        });
        wrap.appendChild(sel);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.dataset.qcd = q.questionCd || "";
        input.dataset.qtype = "text";
        wrap.appendChild(input);
      }
      host.appendChild(wrap);
    });
  }

  function collectGuardAnswers(host) {
    const answers = [];
    host.querySelectorAll("[data-qcd]").forEach((el) => {
      const cd = el.dataset.qcd;
      const val = el.value;
      if (!cd || val === "") return;
      if (el.dataset.qtype === "num") {
        answers.push({ questionCd: cd, num: val });
      } else {
        answers.push({ questionCd: cd, response: val });
      }
    });
    return answers;
  }

  function toggleOwnerPayroll() {
    const wrap = $("guard-officer-wrap");
    if (!wrap) return;
    wrap.hidden = $("guard-owner").value !== "yes";
  }

  function wireFeinInput() {
    const el = $("guard-fein");
    if (!el || el.dataset.wired === "1") return;
    el.dataset.wired = "1";
    el.addEventListener("input", () => {
      const start = el.selectionStart;
      const before = el.value;
      el.value = formatFein(el.value);
      if (start != null && before.length <= el.value.length) {
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
    el.addEventListener("blur", () => {
      const err = feinError(el.value);
      const hint = $("guard-fein-hint");
      if (hint) {
        hint.textContent = err || "";
        hint.hidden = !err;
      }
    });
  }

  function buildGuardPanelHtml() {
    return (
      "<h3>Workers' Comp — indication &amp; bind</h3>" +
      '<p class="guard-wc-lead">First you get a premium indication. Then answer a few questions and enter the FEIN for a full quote. If GUARD can bind it online, you will see their quote and policy code. The carrier bills you directly.</p>' +
      '<div class="row">' +
      "<div><label>Legal entity</label>" +
      '<select id="guard-legal">' +
      '<option value="LL">LLC</option>' +
      '<option value="SolePrp">Sole proprietor</option>' +
      '<option value="CP">Corporation</option>' +
      '<option value="SS">S Corp</option>' +
      "</select></div>" +
      "<div><label>Years in business</label>" +
      '<input id="guard-years" type="number" min="1" max="80" value="3"/></div>' +
      "</div>" +
      '<div id="guard-emr-wrap">' +
      '<label>Experience mod (optional)</label>' +
      '<input id="guard-emr" type="number" min="0.50" max="3" step="0.01" placeholder="Leave blank if unknown"/>' +
      '<p class="guard-field-hint">Leave blank if unknown — we send 1.00. Under 3 years always uses 1.00.</p>' +
      "</div>" +
      "<label>Include owner on WC?</label>" +
      '<select id="guard-owner"><option value="no">No — employees only</option><option value="yes">Yes</option></select>' +
      '<div id="guard-officer-wrap" hidden>' +
      "<label>Officer / owner payroll (if included)</label>" +
      '<input id="guard-officer-payroll" type="number" min="1" step="1" placeholder="Annual remuneration"/>' +
      '<p class="guard-field-hint">If left blank, GUARD applies the state minimum.</p>' +
      "</div>" +
      '<button type="button" id="guard-indicate-btn">Get WC indication</button>' +
      '<p class="guard-wc-premium" id="guard-premium" hidden></p>' +
      '<div id="guard-q-host" hidden></div>' +
      '<div id="guard-bind-fields" hidden>' +
      "<label>FEIN</label>" +
      '<input id="guard-fein" inputmode="numeric" maxlength="10" placeholder="xx-xxxxxxx" autocomplete="off"/>' +
      '<p id="guard-fein-hint" class="guard-field-hint err-inline" hidden></p>' +
      '<label class="guard-clickwrap"><input type="checkbox" id="guard-agree"/> Authorized; answers true.</label>' +
      '<input id="guard-sign-name" placeholder="Typed name"/>' +
      '<button type="button" id="guard-quote-btn">Submit application</button>' +
      '<button type="button" class="secondary" id="guard-bind-btn" hidden>Bind WC</button>' +
      '<button type="button" class="secondary" id="guard-refer-btn" hidden>Send to underwriting</button>' +
      "</div>"
    );
  }

  function removeOutcomeHeroes(box) {
    ["guard-wc-ready", "guard-wc-decision", "guard-wc-bound"].forEach((id) => {
      const el = box.querySelector("#" + id);
      if (el) el.remove();
    });
  }

  function brandBlock(policyNumber) {
    return (
      '<p class="guard-brand">GUARD</p>' +
      (policyNumber
        ? '<p class="guard-policy-code">Policy ' + policyNumber + "</p>"
        : "")
    );
  }

  function showGuardQuoteReady(box, data) {
    removeOutcomeHeroes(box);
    const g = (data && data.guard) || {};
    const prem = g.premium != null ? g.premium : session.guardPremium;
    const hero = document.createElement("div");
    hero.id = "guard-wc-ready";
    hero.className = "guard-wc-ready";
    hero.innerHTML =
      brandBlock(g.policyNumber) +
      '<p class="guard-wc-ready-kicker">Quote ready to bind</p>' +
      '<p class="guard-wc-ready-amount"></p>' +
      '<p class="guard-wc-ready-note">GUARD bills you directly. CID does not collect the card.</p>';
    const bindFields = $("guard-bind-fields");
    if (bindFields) bindFields.insertAdjacentElement("beforebegin", hero);
    const amtEl = hero.querySelector(".guard-wc-ready-amount");
    if (amtEl && prem != null) amtEl.textContent = money(prem) + " / yr";
    mountGuardCapitaButton(hero, data && data.capita);
    const bindBtn = $("guard-bind-btn");
    const referBtn = $("guard-refer-btn");
    if (bindBtn) bindBtn.hidden = false;
    if (referBtn) referBtn.hidden = true;
    guardWcStatus(box, "", "");
  }

  function showGuardDecision(box, data) {
    removeOutcomeHeroes(box);
    const g = (data && data.guard) || {};
    const decision = String(data.decision || "").toLowerCase();
    const isRefer = decision === "refer";
    const hero = document.createElement("div");
    hero.id = "guard-wc-decision";
    hero.className =
      "guard-wc-decision" + (isRefer ? " is-refer" : " is-decline");
    const title = isRefer
      ? "Needs underwriter review"
      : "Coverage not offered";
    hero.innerHTML =
      brandBlock(g.policyNumber) +
      '<p class="guard-wc-decision-kicker">' +
      title +
      "</p>" +
      '<p class="guard-wc-decision-note"></p>';
    const bindFields = $("guard-bind-fields");
    if (bindFields) bindFields.insertAdjacentElement("beforebegin", hero);
    const note = hero.querySelector(".guard-wc-decision-note");
    if (note) {
      note.textContent =
        data.message ||
        "NOTICE: This risk will require underwriting review.";
    }
    const bindBtn = $("guard-bind-btn");
    const referBtn = $("guard-refer-btn");
    if (bindBtn) bindBtn.hidden = true;
    if (referBtn) referBtn.hidden = !isRefer;
    guardWcStatus(box, "", "");
    popupGuardKickout(data.message);
  }

  function showGuardBound(box, data) {
    removeOutcomeHeroes(box);
    const g = (data && data.guard) || {};
    const hero = document.createElement("div");
    hero.id = "guard-wc-bound";
    hero.className = "guard-wc-bound";
    hero.innerHTML =
      brandBlock(g.policyNumber) +
      '<p class="guard-wc-bound-kicker">Workers\' Comp bound</p>' +
      '<p class="guard-wc-bound-detail"></p>';
    const bindFields = $("guard-bind-fields");
    if (bindFields) bindFields.insertAdjacentElement("beforebegin", hero);
    const detail = hero.querySelector(".guard-wc-bound-detail");
    if (detail) {
      detail.textContent =
        (g.policyNumber ? "Policy " + g.policyNumber : "Bound") +
        (data.premium != null ? " · " + money(data.premium) + " / yr" : "");
    }
    mountGuardCapitaButton(hero, data && data.capita);
    const bindBtn = $("guard-bind-btn");
    const referBtn = $("guard-refer-btn");
    if (bindBtn) bindBtn.hidden = true;
    if (referBtn) referBtn.hidden = true;
    guardWcStatus(box, "ok", "Bind complete on P-env.");
  }

  function showGuardReferred(box, data) {
    const g = (data && data.guard) || {};
    removeOutcomeHeroes(box);
    const hero = document.createElement("div");
    hero.id = "guard-wc-decision";
    hero.className = "guard-wc-decision is-refer";
    hero.innerHTML =
      brandBlock(g.policyNumber) +
      '<p class="guard-wc-decision-kicker">Sent to underwriting</p>' +
      '<p class="guard-wc-decision-note"></p>';
    const bindFields = $("guard-bind-fields");
    if (bindFields) bindFields.insertAdjacentElement("beforebegin", hero);
    const note = hero.querySelector(".guard-wc-decision-note");
    if (note) {
      note.textContent =
        data.message ||
        "NOTICE: This risk will require underwriting review.";
    }
    const referBtn = $("guard-refer-btn");
    if (referBtn) referBtn.hidden = true;
    guardWcStatus(box, "ok", "");
    popupGuardKickout(data.message);
  }

  function wireGuardBox(box) {
    $("guard-owner").addEventListener("change", toggleOwnerPayroll);
    toggleOwnerPayroll();
    wireFeinInput();
    const yearsEl = $("guard-years");
    if (yearsEl) {
      yearsEl.addEventListener("input", syncGuardEmrVisibility);
      syncGuardEmrVisibility();
    }

    $("guard-indicate-btn").addEventListener("click", () => executeIndicate(box));
    $("guard-quote-btn").addEventListener("click", async () => {
      const feinErr = feinError($("guard-fein").value);
      if (feinErr) {
        const hint = $("guard-fein-hint");
        if (hint) {
          hint.textContent = feinErr;
          hint.hidden = false;
        }
        guardWcStatus(box, "err", feinErr);
        return;
      }
      const btn = $("guard-quote-btn");
      btn.disabled = true;
      guardWcStatus(box, "", "Submitting your application…");
      try {
        const ownerOn = $("guard-owner").value === "yes";
        const officerEl = $("guard-officer-payroll");
        const res = await fetch(apiUrl("/api/guard/wc/quote"), {
          method: "POST",
          headers: partnerHeaders(),
          body: JSON.stringify({
            submission_public_id: session.submission_public_id,
            legal_entity: $("guard-legal").value,
            fein: $("guard-fein").value,
            experience_mod: guardExperienceModValue(),
            owner_on_wc: ownerOn,
            owner_payroll: ownerOn && officerEl && officerEl.value
              ? officerEl.value
              : undefined,
            answers: collectGuardAnswers($("guard-q-host")),
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || data.error || "Quote failed");
        if (data.guard && data.guard.policyNumber) {
          session.policyNumber = data.guard.policyNumber;
        }
        if (data.bindable) {
          if (data.guard && data.guard.premium != null) {
            session.guardPremium = Number(data.guard.premium);
          }
          showGuardQuoteReady(box, data);
        } else {
          showGuardDecision(box, data);
        }
      } catch (err) {
        guardWcStatus(box, "err", err.message || String(err));
      } finally {
        btn.disabled = false;
      }
    });

    $("guard-bind-btn").addEventListener("click", async () => {
      if (!$("guard-agree").checked) {
        guardWcStatus(box, "err", "Check attestation to bind.");
        return;
      }
      const btn = $("guard-bind-btn");
      btn.disabled = true;
      guardWcStatus(box, "", "Binding your policy…");
      try {
        const res = await fetch(apiUrl("/api/guard/wc/bind"), {
          method: "POST",
          headers: partnerHeaders(),
          body: JSON.stringify({
            submission_public_id: session.submission_public_id,
            clickwrap_agreed: true,
            clickwrap_name: $("guard-sign-name").value || $("first_name").value,
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || data.error || "Bind failed");
        session.guardWcBound = true;
        showGuardBound(box, {
          guard: data.guard,
          premium: session.guardPremium,
          capita: data.capita,
        });
      } catch (err) {
        guardWcStatus(box, "err", err.message || String(err));
        btn.disabled = false;
      }
    });

    $("guard-refer-btn").addEventListener("click", async () => {
      const btn = $("guard-refer-btn");
      btn.disabled = true;
      guardWcStatus(box, "", "Sending to a GUARD underwriter…");
      try {
        const res = await fetch(apiUrl("/api/guard/wc/refer"), {
          method: "POST",
          headers: partnerHeaders(),
          body: JSON.stringify({
            submission_public_id: session.submission_public_id,
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || data.error || "Referral failed");
        showGuardReferred(box, data);
      } catch (err) {
        guardWcStatus(box, "err", err.message || String(err));
        btn.disabled = false;
      }
    });
  }

  async function executeIndicate(box) {
    const employees = Number($("num_employees").value || 0);
    const ownerOn = $("guard-owner").value === "yes";
    if (employees < 1 && !ownerOn) {
      guardWcStatus(box, "err", "Need employees or owner on WC.");
      return;
    }
    guardWcStatus(box, "", "Getting your indication…");
    try {
      const officerEl = $("guard-officer-payroll");
      const res = await fetch(apiUrl("/api/guard/wc/indicate"), {
        method: "POST",
        headers: partnerHeaders(),
        body: JSON.stringify({
          submission_public_id: session.submission_public_id,
          segment: session.segment,
          legal_entity: $("guard-legal").value,
          years_in_business: $("guard-years").value,
          experience_mod: guardExperienceModValue(),
          owner_on_wc: ownerOn,
          owner_payroll: ownerOn && officerEl && officerEl.value
            ? officerEl.value
            : undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || data.error || "Indication failed");
      if (data.popup || data.decision === "refer" || data.decision === "decline") {
        if (data.guard && data.guard.policyNumber) {
          session.policyNumber = data.guard.policyNumber;
        }
        showGuardDecision(box, data);
        return;
      }
      const premEl = $("guard-premium");
      premEl.hidden = false;
      const prem = data.guard && data.guard.premium;
      if (prem) {
        session.guardPremium = Number(prem);
        premEl.textContent =
          "Indication: " + money(prem) + " / yr — not a final quote yet.";
      } else {
        premEl.textContent = "Indication submitted — GUARD did not return a premium yet.";
      }
      if (data.guard && data.guard.policyNumber) {
        session.policyNumber = data.guard.policyNumber;
      }
      guardWcStatus(box, "ok", data.disclaimer || "");
      const qRes = await fetch(apiUrl("/api/guard/wc/questions"), {
        method: "POST",
        headers: partnerHeaders(),
        body: JSON.stringify({
          submission_public_id: session.submission_public_id,
          segment: session.segment,
        }),
      });
      const qData = await qRes.json();
      if (qData.ok && qData.questions && qData.questions.length) {
        $("guard-q-host").hidden = false;
        renderGuardQuestions($("guard-q-host"), qData.questions);
      }
      $("guard-bind-fields").hidden = false;
      wireFeinInput();
    } catch (err) {
      guardWcStatus(box, "err", err.message || String(err));
    }
  }

  let registry = null;

  function syncMailingFields() {
    $("mailing-fields").hidden = $("mailing_same").checked;
  }

  function syncLocation2Fields() {
    $("location2-fields").hidden = !$("add_location2").checked;
  }

  async function loadRegistry() {
    const state = $("state").value || "CO";
    const res = await fetch(apiUrl("/api/guard/wc/registry?state=" + encodeURIComponent(state)));
    registry = await res.json();
    if (!registry.ok) throw new Error(registry.message || "Registry unavailable");
    const sel = $("segment");
    sel.innerHTML = "";
    registry.segments.forEach((s) => {
      if (!s.wcEnabled) return;
      const opt = document.createElement("option");
      opt.value = s.segment;
      opt.textContent = s.label || s.segment;
      if (!s.offerWc) opt.disabled = true;
      sel.appendChild(opt);
    });
    if (registry.pilotStates && registry.pilotStates.length) {
      const stSel = $("state");
      stSel.innerHTML = "";
      registry.pilotStates.forEach((st) => {
        const opt = document.createElement("option");
        opt.value = st;
        opt.textContent = st;
        stSel.appendChild(opt);
      });
    }
  }

  $("mailing_same").addEventListener("change", syncMailingFields);
  $("add_location2").addEventListener("change", syncLocation2Fields);
  syncMailingFields();
  syncLocation2Fields();

  $("start-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    showErr($("start-err"), "");
    showOk($("start-ok"), "");
    if ($("add_location2").checked && !String($("location2_street").value || "").trim()) {
      showErr($("start-err"), "Enter a street for the second location, or uncheck it.");
      return;
    }
    const btn = $("start-btn");
    btn.disabled = true;
    try {
      session.segment = $("segment").value;
      const mailingSame = $("mailing_same").checked;
      const body = {
        segment: session.segment,
        state: $("state").value,
        first_name: $("first_name").value,
        last_name: $("last_name").value,
        email: $("email").value,
        business_name: $("business_name").value,
        location_street: $("location_street").value,
        location_city: $("location_city").value,
        location_zip: $("location_zip").value,
        location_state: $("location_state").value,
        mailing_same: mailingSame,
        mailing_street: mailingSame ? $("location_street").value : $("mailing_street").value,
        mailing_city: mailingSame ? $("location_city").value : $("mailing_city").value,
        mailing_zip: mailingSame ? $("location_zip").value : $("mailing_zip").value,
        mailing_state: mailingSame ? $("location_state").value : $("mailing_state").value,
        city: $("location_city").value,
        num_employees: $("num_employees").value,
        payroll: $("payroll").value,
      };
      if ($("add_location2").checked) {
        body.location2_street = $("location2_street").value;
        body.location2_city = $("location2_city").value;
        body.location2_zip = $("location2_zip").value;
        body.location2_state = $("location2_state").value || $("location_state").value || $("state").value;
      }
      const res = await fetch(apiUrl("/api/guard/wc/partner/start"), {
        method: "POST",
        headers: partnerHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || data.error || "Start failed");
      session.submission_public_id = data.submission_public_id;
      $("submission-id").textContent = data.submission_public_id;
      showOk($("start-ok"), "Ready — continue with the indication below.");
      const box = $("guard-wc-box");
      box.innerHTML = buildGuardPanelHtml();
      wireGuardBox(box);
      $("wc-section").classList.add("show");
      $("start-form").querySelectorAll("input,select,button").forEach((el) => {
        if (el.id !== "start-btn") el.disabled = true;
      });
      btn.disabled = true;
    } catch (err) {
      showErr($("start-err"), err.message || String(err));
      btn.disabled = false;
    }
  });

  loadRegistry().catch((err) => {
    showErr($("start-err"), err.message || "Could not load segment registry.");
  });

  function newPlacesSessionToken() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return String(Date.now());
  }

  function wrapStreetForPlaces(input) {
    if (!input || input.closest(".cq-places-wrap")) return input.parentNode;
    const wrap = document.createElement("div");
    wrap.className = "cq-places-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.setAttribute("autocomplete", "off");
    return wrap;
  }

  function wireAddressAutocomplete(streetId, cityId, stateId, zipId) {
    const street = $(streetId);
    if (!street || street.dataset.placesWired === "1") return;
    street.dataset.placesWired = "1";
    const wrap = wrapStreetForPlaces(street);
    const list = document.createElement("div");
    list.className = "cq-places-list";
    list.hidden = true;
    wrap.appendChild(list);
    let timer = null;
    let sessionToken = newPlacesSessionToken();
    let seq = 0;
    function hideList() {
      list.hidden = true;
      list.innerHTML = "";
    }
    street.addEventListener("input", () => {
      const q = String(street.value || "").trim();
      window.clearTimeout(timer);
      if (q.length < 3) {
        hideList();
        return;
      }
      const mySeq = ++seq;
      timer = window.setTimeout(async () => {
        try {
          const res = await fetch(apiUrl("/api/places/autocomplete"), {
            method: "POST",
            headers: partnerHeaders(),
            body: JSON.stringify({ input: q, sessionToken }),
          });
          const data = await res.json();
          if (mySeq !== seq) return;
          const suggestions = data.ok ? data.suggestions || [] : [];
          if (!suggestions.length) {
            hideList();
            return;
          }
          list.innerHTML = "";
          suggestions.forEach((s) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "cq-places-item";
            btn.textContent = s.text;
            btn.addEventListener("mousedown", async (ev) => {
              ev.preventDefault();
              hideList();
              const det = await fetch(apiUrl("/api/places/details"), {
                method: "POST",
                headers: partnerHeaders(),
                body: JSON.stringify({ placeId: s.placeId, sessionToken }),
              });
              const out = await det.json();
              sessionToken = newPlacesSessionToken();
              if (!out.ok || !out.address) return;
              street.value = out.address.street || street.value;
              if ($(cityId)) $(cityId).value = out.address.city || "";
              if ($(stateId)) $(stateId).value = out.address.state || "";
              if ($(zipId)) $(zipId).value = out.address.zip || "";
            });
            list.appendChild(btn);
          });
          list.hidden = false;
        } catch (_) {
          if (mySeq === seq) hideList();
        }
      }, 280);
    });
    street.addEventListener("blur", () => window.setTimeout(hideList, 180));
  }

  fetch(apiUrl("/api/places/config"))
    .then((r) => r.json())
    .then((cfg) => {
      if (!cfg || !cfg.enabled) return;
      wireAddressAutocomplete(
        "location_street",
        "location_city",
        "location_state",
        "location_zip",
      );
      wireAddressAutocomplete(
        "mailing_street",
        "mailing_city",
        "mailing_state",
        "mailing_zip",
      );
      wireAddressAutocomplete(
        "location2_street",
        "location2_city",
        "location2_state",
        "location2_zip",
      );
    })
    .catch(() => {});
})();
