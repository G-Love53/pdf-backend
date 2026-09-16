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

  function buildGuardPanelHtml() {
    return (
      "<h3>Workers' Comp — indication &amp; bind</h3>" +
      '<p class="guard-wc-lead">Indication first (NBQ), then underwriting questions and FEIN for bindable quote (NBS/BND). Carrier bills directly.</p>' +
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
      "<label>Include owner on WC?</label>" +
      '<select id="guard-owner"><option value="no">No — employees only</option><option value="yes">Yes</option></select>' +
      '<button type="button" id="guard-indicate-btn">Get WC indication</button>' +
      '<p class="guard-wc-premium" id="guard-premium" hidden></p>' +
      '<div id="guard-q-host" hidden></div>' +
      '<div id="guard-bind-fields" hidden>' +
      "<label>FEIN</label>" +
      '<input id="guard-fein" inputmode="numeric" maxlength="10" placeholder="XX-XXXXXXX"/>' +
      '<label class="guard-clickwrap"><input type="checkbox" id="guard-agree"/> Authorized; answers true.</label>' +
      '<input id="guard-sign-name" placeholder="Typed name"/>' +
      '<button type="button" id="guard-quote-btn">Get bindable quote</button>' +
      '<button type="button" class="secondary" id="guard-bind-btn" hidden>Bind WC</button>' +
      "</div>"
    );
  }

  function showGuardQuoteReady(box, prem) {
    const hero = document.createElement("div");
    hero.id = "guard-wc-ready";
    hero.className = "guard-wc-ready";
    hero.innerHTML =
      '<p class="guard-wc-ready-kicker">Bindable WC quote ready</p>' +
      '<p class="guard-wc-ready-amount" id="guard-wc-ready-amount"></p>' +
      '<p class="guard-wc-ready-note">Carrier sends billing separately.</p>';
    const bindFields = $("guard-bind-fields");
    if (bindFields) bindFields.insertAdjacentElement("beforebegin", hero);
    const amtEl = hero.querySelector("#guard-wc-ready-amount");
    if (amtEl && prem != null) {
      amtEl.textContent = "$" + Number(prem).toLocaleString() + " / yr";
    }
    const bindBtn = $("guard-bind-btn");
    if (bindBtn) bindBtn.hidden = false;
    guardWcStatus(box, "", "");
  }

  function showGuardBound(box, data) {
    const g = (data && data.guard) || {};
    const hero = document.createElement("div");
    hero.id = "guard-wc-bound";
    hero.className = "guard-wc-bound";
    hero.innerHTML =
      '<p class="guard-wc-bound-kicker">Workers\' Comp bound</p>' +
      '<p class="guard-wc-bound-detail" id="guard-wc-bound-detail"></p>';
    const bindFields = $("guard-bind-fields");
    if (bindFields) bindFields.insertAdjacentElement("beforebegin", hero);
    const detail = hero.querySelector("#guard-wc-bound-detail");
    if (detail) {
      detail.textContent =
        (g.policyNumber ? "Policy " + g.policyNumber : "Bound") +
        (data.premium != null
          ? " · $" + Number(data.premium).toLocaleString() + " / yr"
          : "");
    }
    guardWcStatus(box, "ok", "Bind complete on P-env.");
  }

  function wireGuardBox(box) {
    $("guard-indicate-btn").addEventListener("click", () => executeIndicate(box));
    $("guard-quote-btn").addEventListener("click", async () => {
      const btn = $("guard-quote-btn");
      btn.disabled = true;
      guardWcStatus(box, "", "Submitting NBS…");
      try {
        const res = await fetch(apiUrl("/api/guard/wc/quote"), {
          method: "POST",
          headers: partnerHeaders(),
          body: JSON.stringify({
            submission_public_id: session.submission_public_id,
            legal_entity: $("guard-legal").value,
            fein: $("guard-fein").value,
            answers: collectGuardAnswers($("guard-q-host")),
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || data.error || "Quote failed");
        if (data.bindable) {
          if (data.guard && data.guard.premium != null) {
            session.guardPremium = Number(data.guard.premium);
          }
          showGuardQuoteReady(box, data.guard && data.guard.premium);
        } else {
          guardWcStatus(box, "err", "Not instant-bind — " + (data.guard?.uwDecision || "refer/decline"));
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
        showGuardBound(box, { guard: data.guard, premium: session.guardPremium });
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
    guardWcStatus(box, "", "Getting indication…");
    try {
      const res = await fetch(apiUrl("/api/guard/wc/indicate"), {
        method: "POST",
        headers: partnerHeaders(),
        body: JSON.stringify({
          submission_public_id: session.submission_public_id,
          segment: session.segment,
          legal_entity: $("guard-legal").value,
          years_in_business: $("guard-years").value,
          owner_on_wc: ownerOn,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || data.error || "Indication failed");
      const premEl = $("guard-premium");
      premEl.hidden = false;
      const prem = data.guard && data.guard.premium;
      if (prem) {
        session.guardPremium = Number(prem);
        premEl.textContent =
          "Indication: $" + Number(prem).toLocaleString() + " / yr (not bindable yet)";
      } else {
        premEl.textContent = "Indication submitted — see GUARD response in logs if no premium.";
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
    } catch (err) {
      guardWcStatus(box, "err", err.message || String(err));
    }
  }

  let registry = null;

  function updateClassBox() {
    const seg = $("segment").value;
    const entry = (registry?.segments || []).find((s) => s.segment === seg);
    const box = $("class-box");
    if (!entry) {
      box.classList.remove("show");
      return;
    }
    box.innerHTML =
      "<strong>WC class (CO):</strong> " +
      (entry.ratingClassificationCd || "—") +
      " — " +
      (entry.classDescription || "") +
      (entry.digitalDecisionNote
        ? "<br><em>" + entry.digitalDecisionNote + "</em>"
        : "");
    box.classList.add("show");
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
    updateClassBox();
  }

  $("segment").addEventListener("change", updateClassBox);

  $("start-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    showErr($("start-err"), "");
    showOk($("start-ok"), "");
    const btn = $("start-btn");
    btn.disabled = true;
    try {
      session.segment = $("segment").value;
      const body = {
        segment: session.segment,
        state: $("state").value,
        first_name: $("first_name").value,
        last_name: $("last_name").value,
        email: $("email").value,
        business_name: $("business_name").value,
        location_street: $("location_street").value,
        location_zip: $("location_zip").value,
        mailing_street: $("mailing_street").value,
        mailing_zip: $("mailing_zip").value,
        city: "Denver",
        num_employees: $("num_employees").value,
        payroll: $("payroll").value,
      };
      const res = await fetch(apiUrl("/api/guard/wc/partner/start"), {
        method: "POST",
        headers: partnerHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || data.error || "Start failed");
      session.submission_public_id = data.submission_public_id;
      $("submission-id").textContent = data.submission_public_id;
      showOk($("start-ok"), "Started — class " + (data.ratingClassificationCd || "—"));
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
})();
