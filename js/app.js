(() => {
  "use strict";

  const MEALS = [
    { id: "breakfast", label: "Breakfast" },
    { id: "lunch", label: "Lunch" },
    { id: "snacks", label: "Snacks" },
    { id: "dinner", label: "Dinner" },
  ];
  const KEYS = { log: "ct.log", custom: "ct.custom", settings: "ct.settings", recent: "ct.recent" };
  const DEFAULT_SETTINGS = { cal: 2000, p: 75, c: 250, f: 65 };

  // ---------- Storage ----------
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      alert("Could not save data: " + e.message);
    }
  }

  const state = {
    log: load(KEYS.log, {}),
    custom: load(KEYS.custom, []),
    settings: { ...DEFAULT_SETTINGS, ...load(KEYS.settings, {}) },
    recent: load(KEYS.recent, []),
    date: todayStr(),
    meal: null,
    selected: null,
    category: "All",
  };

  // ---------- Helpers ----------
  function todayStr() {
    return toDateStr(new Date());
  }
  function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function shiftDate(str, days) {
    const [y, m, d] = str.split("-").map(Number);
    return toDateStr(new Date(y, m - 1, d + days));
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  const r0 = (n) => Math.round(n);
  const r1 = (n) => Math.round(n * 10) / 10;
  const $ = (sel) => document.querySelector(sel);

  function allFoods() {
    return [...state.custom.map((f) => ({ ...f, cat: "Custom", custom: true })), ...FOODS];
  }
  function entriesFor(date) {
    return state.log[date] || [];
  }
  function totals(entries) {
    return entries.reduce(
      (t, e) => ({
        cal: t.cal + e.cal * e.qty,
        p: t.p + e.p * e.qty,
        c: t.c + e.c * e.qty,
        f: t.f + e.f * e.qty,
      }),
      { cal: 0, p: 0, c: 0, f: 0 }
    );
  }

  // ---------- Tabs ----------
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + btn.dataset.view));
      if (btn.dataset.view === "history") renderHistory();
      if (btn.dataset.view === "settings") renderSettings();
    });
  });

  // ---------- Today view ----------
  const datePicker = $("#date-picker");
  datePicker.addEventListener("change", () => {
    if (datePicker.value) {
      state.date = datePicker.value;
      renderToday();
    }
  });
  $("#prev-day").addEventListener("click", () => { state.date = shiftDate(state.date, -1); renderToday(); });
  $("#next-day").addEventListener("click", () => { state.date = shiftDate(state.date, 1); renderToday(); });
  $("#go-today").addEventListener("click", () => { state.date = todayStr(); renderToday(); });

  function renderToday() {
    datePicker.value = state.date;
    const entries = entriesFor(state.date);
    const t = totals(entries);
    const g = state.settings;

    // Ring
    const circ = 2 * Math.PI * 52;
    const pct = g.cal > 0 ? Math.min(t.cal / g.cal, 1) : 0;
    const ring = $("#ring-fg");
    ring.style.strokeDasharray = circ;
    ring.style.strokeDashoffset = circ * (1 - pct);
    ring.classList.toggle("over", t.cal > g.cal);
    $("#cal-eaten").textContent = r0(t.cal);
    $("#cal-goal").textContent = g.cal;

    const left = g.cal - t.cal;
    $("#cal-remaining").textContent = Math.abs(r0(left));
    $("#remaining-label").textContent = left >= 0 ? "kcal left" : "kcal over";
    $(".remaining").classList.toggle("over", left < 0);

    for (const k of ["p", "c", "f"]) {
      const el = document.querySelector(`.macro[data-macro="${k}"]`);
      el.querySelector(".val").textContent = r0(t[k]);
      el.querySelector(".goal").textContent = g[k];
      el.querySelector(".fill").style.width = (g[k] > 0 ? Math.min(t[k] / g[k], 1) * 100 : 0) + "%";
    }

    // Meals
    const mealsEl = $("#meals");
    mealsEl.innerHTML = MEALS.map((m) => {
      const list = entries.map((e, i) => ({ e, i })).filter(({ e }) => e.meal === m.id);
      const mt = totals(list.map(({ e }) => e));
      const items = list.length
        ? `<ul class="entries">${list.map(({ e, i }) => `
            <li class="entry">
              <div class="entry-main">
                <div class="entry-name">${esc(e.name)}</div>
                <div class="entry-sub">${e.qty} × ${esc(e.serving)} · P ${r1(e.p * e.qty)} · C ${r1(e.c * e.qty)} · F ${r1(e.f * e.qty)}</div>
              </div>
              <span class="entry-cal">${r0(e.cal * e.qty)}</span>
              <button class="del-btn" data-del="${i}" aria-label="Remove ${esc(e.name)}">×</button>
            </li>`).join("")}</ul>`
        : `<div class="empty">Nothing logged yet.</div>`;
      return `
        <div class="card">
          <div class="meal-head">
            <h2>${m.label}<span class="meal-cal">${r0(mt.cal)} kcal</span></h2>
            <button class="btn primary" data-add="${m.id}">+ Add</button>
          </div>
          ${items}
        </div>`;
    }).join("");
  }

  $("#meals").addEventListener("click", (ev) => {
    const add = ev.target.closest("[data-add]");
    if (add) return openAdd(add.dataset.add);
    const del = ev.target.closest("[data-del]");
    if (del) {
      const list = entriesFor(state.date).slice();
      list.splice(Number(del.dataset.del), 1);
      if (list.length) state.log[state.date] = list;
      else delete state.log[state.date];
      save(KEYS.log, state.log);
      renderToday();
    }
  });

  // ---------- Add dialog ----------
  const dialog = $("#add-dialog");
  const searchInput = $("#search");
  const qtyInput = $("#qty");

  function showPane(name) {
    $("#dlg-search-pane").hidden = name !== "search";
    $("#dlg-qty-pane").hidden = name !== "qty";
    $("#custom-form").hidden = name !== "custom";
  }

  function openAdd(mealId) {
    state.meal = mealId;
    $("#dlg-meal").textContent = MEALS.find((m) => m.id === mealId).label;
    searchInput.value = "";
    state.category = "All";
    showPane("search");
    renderChips();
    renderResults();
    dialog.showModal();
    searchInput.focus();
  }
  $("#dlg-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (ev) => { if (ev.target === dialog) dialog.close(); });

  function renderChips() {
    const cats = ["All", "Recent", ...(state.custom.length ? ["Custom"] : []), ...new Set(FOODS.map((f) => f.cat))];
    $("#cat-chips").innerHTML = cats
      .map((c) => `<button class="chip ${c === state.category ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`)
      .join("");
  }
  $("#cat-chips").addEventListener("click", (ev) => {
    const chip = ev.target.closest("[data-cat]");
    if (!chip) return;
    state.category = chip.dataset.cat;
    renderChips();
    renderResults();
  });

  function normalize(s) {
    return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
  }

  function renderResults() {
    const q = normalize(searchInput.value.trim());
    const words = q.split(/\s+/).filter(Boolean);
    let foods = allFoods();

    if (state.category === "Recent") {
      foods = state.recent.map((n) => foods.find((f) => f.name === n)).filter(Boolean);
    } else if (state.category !== "All") {
      foods = foods.filter((f) => f.cat === state.category);
    }
    if (words.length) {
      foods = foods
        .map((f) => {
          const hay = normalize(f.name + " " + f.cat);
          if (!words.every((w) => hay.includes(w))) return null;
          const name = normalize(f.name);
          const score = name.startsWith(words[0]) ? 0 : name.split(" ").some((t) => t.startsWith(words[0])) ? 1 : 2;
          return { f, score };
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score)
        .map((x) => x.f);
    }

    const ul = $("#results");
    if (!foods.length) {
      ul.innerHTML = `<li class="empty">No matches. Try another word, or create a custom food.</li>`;
      return;
    }
    ul.innerHTML = foods.slice(0, 80).map((f, i) => `
      <li tabindex="0" data-idx="${i}">
        <div>
          <div class="r-name">${esc(f.name)}${f.custom ? '<span class="tag">custom</span>' : ""}</div>
          <div class="r-sub">${esc(f.serving)} · P ${f.p} · C ${f.c} · F ${f.f}</div>
        </div>
        <span class="r-cal">${r0(f.cal)} kcal</span>
      </li>`).join("");
    ul._foods = foods;
  }
  searchInput.addEventListener("input", renderResults);

  function pickFromList(ev) {
    const li = ev.target.closest("[data-idx]");
    if (!li) return;
    selectFood($("#results")._foods[Number(li.dataset.idx)]);
  }
  $("#results").addEventListener("click", pickFromList);
  $("#results").addEventListener("keydown", (ev) => { if (ev.key === "Enter") pickFromList(ev); });

  function selectFood(food) {
    state.selected = food;
    $("#sel-name").textContent = food.name;
    $("#sel-serving").textContent = "1 serving = " + food.serving;
    qtyInput.value = 1;
    updateSelMacros();
    showPane("qty");
    qtyInput.focus();
  }

  function updateSelMacros() {
    const f = state.selected;
    const q = Math.max(0, parseFloat(qtyInput.value) || 0);
    $("#sel-macros").innerHTML = `
      <div><b>${r0(f.cal * q)}</b>kcal</div>
      <div><b>${r1(f.p * q)}</b>protein</div>
      <div><b>${r1(f.c * q)}</b>carbs</div>
      <div><b>${r1(f.f * q)}</b>fat</div>`;
  }
  qtyInput.addEventListener("input", updateSelMacros);
  function stepQty(delta) {
    // Quarter steps below 1 serving, half steps above.
    const cur = parseFloat(qtyInput.value) || 0;
    const step = (delta > 0 ? cur < 1 : cur <= 1) ? 0.25 : 0.5;
    qtyInput.value = Math.max(0.25, Math.round((cur + delta * step) * 100) / 100);
    updateSelMacros();
  }
  $("#qty-minus").addEventListener("click", () => stepQty(-1));
  $("#qty-plus").addEventListener("click", () => stepQty(1));
  $("#back-to-search").addEventListener("click", () => showPane("search"));

  $("#confirm-add").addEventListener("click", () => {
    const q = parseFloat(qtyInput.value);
    if (!(q > 0)) {
      qtyInput.focus();
      return;
    }
    const f = state.selected;
    const entry = { meal: state.meal, name: f.name, serving: f.serving, qty: q, cal: f.cal, p: f.p, c: f.c, f: f.f, t: Date.now() };
    (state.log[state.date] ||= []).push(entry);
    save(KEYS.log, state.log);

    state.recent = [f.name, ...state.recent.filter((n) => n !== f.name)].slice(0, 30);
    save(KEYS.recent, state.recent);

    dialog.close();
    renderToday();
  });

  // Custom food creation
  $("#open-custom").addEventListener("click", () => {
    const form = $("#custom-form");
    form.reset();
    if (searchInput.value.trim()) form.name.value = searchInput.value.trim();
    showPane("custom");
    form.name.focus();
  });
  $("#custom-back").addEventListener("click", () => showPane("search"));
  $("#custom-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const food = {
      name: fd.get("name").trim(),
      serving: fd.get("serving").trim(),
      cal: Number(fd.get("cal")) || 0,
      p: Number(fd.get("p")) || 0,
      c: Number(fd.get("c")) || 0,
      f: Number(fd.get("f")) || 0,
    };
    state.custom = [food, ...state.custom.filter((x) => x.name !== food.name)];
    save(KEYS.custom, state.custom);
    selectFood({ ...food, cat: "Custom", custom: true });
  });

  // ---------- History ----------
  function renderHistory() {
    const g = state.settings.cal;
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = shiftDate(todayStr(), -i);
      days.push({ d, t: totals(entriesFor(d)), n: entriesFor(d).length });
    }
    const max = Math.max(g * 1.2, ...days.map((x) => x.t.cal), 1);
    const chart = $("#chart");
    chart.innerHTML =
      days.map(({ d, t, n }) => {
        const h = n ? (t.cal / max) * 100 : 2;
        const cls = !n ? "none" : t.cal > g ? "over" : "";
        const label = d.slice(8);
        return `<div class="col" title="${d}: ${r0(t.cal)} kcal">
          <div class="b ${cls}" style="height:${h}%"></div>
          <span class="lbl">${label}</span>
        </div>`;
      }).join("") + `<div class="goal-line" style="bottom:${(g / max) * 100}%"></div>`;

    const logged = Object.keys(state.log).filter((d) => state.log[d].length);
    const avg = { cal: 0, p: 0, c: 0, f: 0 };
    logged.forEach((d) => {
      const t = totals(state.log[d]);
      for (const k in avg) avg[k] += t[k] / logged.length;
    });
    $("#averages").innerHTML = logged.length
      ? `<div><b>${r0(avg.cal)}</b>kcal / day</div>
         <div><b>${r0(avg.p)} g</b>protein</div>
         <div><b>${r0(avg.c)} g</b>carbs</div>
         <div><b>${r0(avg.f)} g</b>fat</div>
         <div><b>${logged.length}</b>days logged</div>`
      : `<p class="muted">No entries yet.</p>`;
  }

  // ---------- Settings ----------
  const goalsForm = $("#goals-form");
  function renderSettings() {
    for (const k of ["cal", "p", "c", "f"]) goalsForm[k].value = state.settings[k];
    const list = $("#custom-list");
    list.innerHTML = state.custom.length
      ? state.custom.map((f, i) => `
          <div class="custom-item">
            <div><b>${esc(f.name)}</b><div class="muted small">${esc(f.serving)} · ${r0(f.cal)} kcal · P ${f.p} · C ${f.c} · F ${f.f}</div></div>
            <button class="del-btn" data-del-custom="${i}" aria-label="Delete ${esc(f.name)}">×</button>
          </div>`).join("")
      : `<p class="muted small">None yet. Create one from the “Add” dialog.</p>`;
  }
  $("#custom-list").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-del-custom]");
    if (!b) return;
    const f = state.custom[Number(b.dataset.delCustom)];
    if (!confirm(`Delete custom food “${f.name}”? Past log entries are kept.`)) return;
    state.custom.splice(Number(b.dataset.delCustom), 1);
    save(KEYS.custom, state.custom);
    renderSettings();
  });

  goalsForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(goalsForm);
    state.settings = { cal: +fd.get("cal"), p: +fd.get("p"), c: +fd.get("c"), f: +fd.get("f") };
    save(KEYS.settings, state.settings);
    renderToday();
    const btn = goalsForm.querySelector("button");
    btn.textContent = "Saved ✓";
    setTimeout(() => (btn.textContent = "Save goals"), 1500);
  });

  $("#tdee-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const w = +fd.get("weight"), h = +fd.get("height"), a = +fd.get("age");
    const bmr = 10 * w + 6.25 * h - 5 * a + (fd.get("sex") === "m" ? 5 : -161);
    const tdee = bmr * +fd.get("activity");
    const target = Math.max(1200, Math.round((tdee + +fd.get("goal")) / 10) * 10);
    // Protein ~1.6 g/kg (good for most people training or dieting), fat ~25% kcal, rest carbs.
    const p = Math.round(w * 1.6);
    const f = Math.round((target * 0.25) / 9);
    const c = Math.max(0, Math.round((target - p * 4 - f * 9) / 4));
    const out = $("#tdee-result");
    out.hidden = false;
    out.innerHTML = `
      <p>BMR ≈ <b>${r0(bmr)}</b> kcal · Maintenance ≈ <b>${r0(tdee)}</b> kcal</p>
      <p>Suggested target: <b>${target} kcal</b> · P ${p} g · C ${c} g · F ${f} g</p>
      <button class="btn primary" id="apply-tdee">Use these goals</button>`;
    $("#apply-tdee").addEventListener("click", () => {
      state.settings = { cal: target, p, c, f };
      save(KEYS.settings, state.settings);
      renderSettings();
      renderToday();
      out.innerHTML = "<p>Goals updated ✓</p>";
    });
  });

  // ---------- Backup ----------
  $("#export-btn").addEventListener("click", () => {
    const data = { version: 1, exported: new Date().toISOString(), log: state.log, custom: state.custom, settings: state.settings, recent: state.recent };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `thali-tracker-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("#import-file").addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (typeof data.log !== "object" || !Array.isArray(data.custom)) throw new Error("Not a Thali Tracker backup");
      if (!confirm("Replace all current data with this backup?")) return;
      state.log = data.log;
      state.custom = data.custom;
      state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      state.recent = Array.isArray(data.recent) ? data.recent : [];
      save(KEYS.log, state.log);
      save(KEYS.custom, state.custom);
      save(KEYS.settings, state.settings);
      save(KEYS.recent, state.recent);
      renderSettings();
      renderToday();
      alert("Backup imported.");
    } catch (e) {
      alert("Import failed: " + e.message);
    } finally {
      ev.target.value = "";
    }
  });

  renderToday();
})();
