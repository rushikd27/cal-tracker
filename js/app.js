(() => {
  "use strict";

  const MEALS = [
    { id: "breakfast", label: "Breakfast" },
    { id: "lunch", label: "Lunch" },
    { id: "dinner", label: "Dinner" },
    { id: "misc", label: "Misc" },
  ];
  const KEYS = {
    log: "ct.log", custom: "ct.custom", settings: "ct.settings", recent: "ct.recent",
    exercise: "ct.exercise", profile: "ct.profile", weights: "ct.weights",
    meta: "ct.meta", sync: "ct.sync", hidden: "ct.hidden", strava: "ct.strava", stravaId: "ct.stravaClientId",
  };
  const KEYED = ["log", "exercise", "weights"];
  const SECTIONS = ["log", "exercise", "weights", "custom", "settings", "profile", "recent", "hidden"];
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

  // Saves a section and records when it changed (per day for dated sections),
  // so sync can tell which device has the newer version.
  function persist(section, date) {
    save(KEYS[section], state[section]);
    const now = Date.now();
    if (KEYED.includes(section)) (state.meta[section] ||= {})[date] = now;
    else state.meta[section] = now;
    save(KEYS.meta, state.meta);
    sync.schedule();
  }

  const state = {
    log: load(KEYS.log, {}),
    custom: load(KEYS.custom, []),
    settings: { ...DEFAULT_SETTINGS, ...load(KEYS.settings, {}) },
    recent: load(KEYS.recent, []),
    hidden: load(KEYS.hidden, []), // Strava activity ids the user chose not to count
    strava: load(KEYS.strava, null), // read-only copy of strava-activities.json
    exercise: load(KEYS.exercise, {}),
    profile: load(KEYS.profile, null),
    weights: load(KEYS.weights, {}),
    meta: load(KEYS.meta, {}),
    date: todayStr(),
    meal: null,
    selected: null,
    category: "All",
  };

  // Older versions had a "Snacks" meal; it is now "Misc".
  let migrated = false;
  for (const list of Object.values(state.log)) {
    for (const e of list) if (e.meal === "snacks") { e.meal = "misc"; migrated = true; }
  }
  if (migrated) save(KEYS.log, state.log);

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
    return [...state.custom.map((f) => ({ ...f, cat: f.place != null ? "Restaurant" : "Custom", custom: true })), ...FOODS];
  }
  const foodKey = (f) => f.name + "|" + (f.place || "");
  function entriesFor(date) {
    return state.log[date] || [];
  }
  function exerciseFor(date) {
    return state.exercise[date] || [];
  }
  function stravaFor(date, includeHidden = false) {
    return Object.values(state.strava?.activities || {})
      .filter((a) => a.date === date && (includeHidden || !state.hidden.includes(a.id)));
  }
  function burnedOn(date) {
    return [...exerciseFor(date), ...stravaFor(date)].reduce((s, x) => s + x.kcal, 0);
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
    const burned = burnedOn(state.date);
    const budget = g.cal + burned;

    // Ring
    const circ = 2 * Math.PI * 52;
    const pct = budget > 0 ? Math.min(t.cal / budget, 1) : 0;
    const ring = $("#ring-fg");
    ring.style.strokeDasharray = circ;
    ring.style.strokeDashoffset = circ * (1 - pct);
    ring.classList.toggle("over", t.cal > budget);
    $("#cal-eaten").textContent = r0(t.cal);
    $("#cal-goal").textContent = r0(budget);
    $("#budget").textContent = `Goal ${g.cal} + exercise ${r0(burned)} − food ${r0(t.cal)}`;

    const left = budget - t.cal;
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
                <div class="entry-name">${esc(e.name)}${e.place != null ? '<span class="tag">takeout</span>' : ""}</div>
                <div class="entry-sub">${e.place ? esc(e.place) + " · " : ""}${e.qty} × ${esc(e.serving)}${e.p || e.c || e.f ? ` · P ${r1(e.p * e.qty)} · C ${r1(e.c * e.qty)} · F ${r1(e.f * e.qty)}` : ""}</div>
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

    // Exercise
    const ex = exerciseFor(state.date);
    const sv = stravaFor(state.date);
    const hiddenCount = stravaFor(state.date, true).length - sv.length;
    $("#ex-total").textContent = r0(burned) + " kcal";
    const stravaItems = sv.map((a) => `
          <li class="entry">
            <div class="entry-main">
              <div class="entry-name">${esc(a.name)}<span class="tag strava">Strava</span></div>
              <div class="entry-sub">${esc(a.type || "")} · ${a.mins} min${a.kcal ? "" : " · no calorie data"}</div>
            </div>
            <span class="entry-cal burn">−${r0(a.kcal)}</span>
            <button class="del-btn" data-hide-strava="${esc(a.id)}" aria-label="Don't count ${esc(a.name)}">×</button>
          </li>`).join("");
    const manualItems = ex.map((x, i) => `
          <li class="entry">
            <div class="entry-main">
              <div class="entry-name">${esc(x.name)}</div>
              <div class="entry-sub">${x.mins} min</div>
            </div>
            <span class="entry-cal burn">−${r0(x.kcal)}</span>
            <button class="del-btn" data-del-ex="${i}" aria-label="Remove ${esc(x.name)}">×</button>
          </li>`).join("");
    const hiddenNote = hiddenCount
      ? `<p class="muted small">${hiddenCount} Strava workout${hiddenCount > 1 ? "s" : ""} not counted. <button class="link-btn" data-unhide-strava>Count again</button></p>`
      : "";
    $("#ex-list").innerHTML = ex.length || sv.length
      ? `<ul class="entries">${stravaItems}${manualItems}</ul>${hiddenNote}`
      : `<div class="empty">No exercise logged. Calories you burn are added to today's allowance.</div>${hiddenNote}`;
  }

  $("#ex-list").addEventListener("click", (ev) => {
    const hide = ev.target.closest("[data-hide-strava]");
    if (hide) {
      if (!confirm("Don't count this Strava workout? Use this if you've already logged it yourself.")) return;
      state.hidden = [...state.hidden, hide.dataset.hideStrava];
      persist("hidden");
      return renderToday();
    }
    if (ev.target.closest("[data-unhide-strava]")) {
      const ids = new Set(stravaFor(state.date, true).map((a) => a.id));
      state.hidden = state.hidden.filter((id) => !ids.has(id));
      persist("hidden");
      return renderToday();
    }
    const del = ev.target.closest("[data-del-ex]");
    if (!del) return;
    const list = exerciseFor(state.date).slice();
    list.splice(Number(del.dataset.delEx), 1);
    if (list.length) state.exercise[state.date] = list;
    else delete state.exercise[state.date];
    persist("exercise", state.date);
    renderToday();
  });

  // ---------- Exercise dialog ----------
  const exDialog = $("#ex-dialog");
  const exForm = $("#ex-form");
  $("#ex-activity").innerHTML =
    EXERCISES.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join("") +
    `<option value="other">Other (enter calories yourself)</option>`;

  function bodyWeight() {
    return state.profile?.weight || null;
  }
  function updateExEstimate() {
    const v = exForm.activity.value;
    const other = v === "other";
    $("#ex-name-wrap").hidden = !other;
    exForm.name.required = other;
    const w = bodyWeight();
    if (other) {
      $("#ex-hint").textContent = "Enter the calories from your watch or app.";
      return;
    }
    const mins = Number(exForm.mins.value) || 0;
    exForm.kcal.value = Math.round(EXERCISES[v].met * (w || 70) * (mins / 60)) || "";
    $("#ex-hint").textContent = w
      ? `Estimated for your weight (${w} kg). You can edit the number.`
      : "Estimated for 70 kg. Save your weight in Settings → My profile for a better estimate.";
  }
  exForm.activity.addEventListener("change", updateExEstimate);
  exForm.mins.addEventListener("input", updateExEstimate);

  $("#add-ex-btn").addEventListener("click", () => {
    exForm.reset();
    updateExEstimate();
    exDialog.showModal();
  });
  $("#ex-close").addEventListener("click", () => exDialog.close());
  exDialog.addEventListener("click", (ev) => { if (ev.target === exDialog) exDialog.close(); });
  exForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const v = exForm.activity.value;
    const name = v === "other" ? exForm.name.value.trim() : EXERCISES[v].name;
    const entry = { name, mins: Number(exForm.mins.value), kcal: Number(exForm.kcal.value), t: Date.now() };
    (state.exercise[state.date] ||= []).push(entry);
    persist("exercise", state.date);
    exDialog.close();
    renderToday();
  });

  $("#meals").addEventListener("click", (ev) => {
    const add = ev.target.closest("[data-add]");
    if (add) return openAdd(add.dataset.add);
    const del = ev.target.closest("[data-del]");
    if (del) {
      const list = entriesFor(state.date).slice();
      list.splice(Number(del.dataset.del), 1);
      if (list.length) state.log[state.date] = list;
      else delete state.log[state.date];
      persist("log", state.date);
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
    $("#quick-form").hidden = name !== "quick";
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
    const own = [...new Set(allFoods().filter((f) => f.custom).map((f) => f.cat))].sort().reverse();
    const cats = ["All", "Recent", ...own, ...new Set(FOODS.map((f) => f.cat))];
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

  function renderResults() {
    let foods = allFoods();

    if (state.category === "Recent") {
      foods = state.recent.map((k) => foods.find((f) => foodKey(f) === k || f.name === k)).filter(Boolean);
    } else if (state.category !== "All") {
      foods = foods.filter((f) => f.cat === state.category);
    }
    foods = FoodSearch.rank(foods, searchInput.value, (f) => f.name + " " + f.cat + " " + (f.place || ""));

    const ul = $("#results");
    if (!foods.length) {
      ul.innerHTML = `<li class="empty">No matches. Try another word, or create a custom food.</li>`;
      return;
    }
    ul.innerHTML = foods.slice(0, 80).map((f, i) => `
      <li tabindex="0" data-idx="${i}">
        <div>
          <div class="r-name">${esc(f.name)}${f.custom ? `<span class="tag">${f.place != null ? "takeout" : "custom"}</span>` : ""}</div>
          <div class="r-sub">${f.place ? esc(f.place) + " · " : ""}${esc(f.serving)} · P ${f.p} · C ${f.c} · F ${f.f}</div>
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
    logFood(f, q);
  });

  function logFood(f, q) {
    const entry = { meal: state.meal, name: f.name, serving: f.serving, qty: q, cal: f.cal, p: f.p, c: f.c, f: f.f, t: Date.now() };
    if (f.place != null) entry.place = f.place;
    (state.log[state.date] ||= []).push(entry);
    persist("log", state.date);

    const key = foodKey(f);
    state.recent = [key, ...state.recent.filter((k) => k !== key && k !== f.name)].slice(0, 30);
    persist("recent");

    dialog.close();
    renderToday();
  }

  // Restaurant / takeout quick add
  const quickForm = $("#quick-form");
  $("#open-quick").addEventListener("click", () => {
    quickForm.reset();
    if (searchInput.value.trim()) quickForm.name.value = searchInput.value.trim();
    const places = [...new Set(state.custom.map((f) => f.place).filter(Boolean))];
    $("#place-list").innerHTML = places.map((pl) => `<option value="${esc(pl)}">`).join("");
    showPane("quick");
    (quickForm.name.value ? quickForm.cal : quickForm.place).focus();
  });
  $("#quick-back").addEventListener("click", () => showPane("search"));
  quickForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(quickForm);
    const food = {
      name: fd.get("name").trim(),
      place: fd.get("place").trim(),
      serving: "1 item",
      cal: Number(fd.get("cal")) || 0,
      p: Number(fd.get("p")) || 0,
      c: Number(fd.get("c")) || 0,
      f: Number(fd.get("f")) || 0,
    };
    if (fd.get("remember")) {
      state.custom = [food, ...state.custom.filter((x) => foodKey(x) !== foodKey(food))];
      persist("custom");
    }
    logFood(food, Number(fd.get("qty")) || 1);
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
    state.custom = [food, ...state.custom.filter((x) => foodKey(x) !== foodKey(food))];
    persist("custom");
    selectFood({ ...food, cat: "Custom", custom: true });
  });

  // ---------- History ----------
  function renderHistory() {
    const g = state.settings.cal;
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = shiftDate(todayStr(), -i);
      days.push({ d, t: totals(entriesFor(d)), n: entriesFor(d).length, burned: burnedOn(d) });
    }
    const max = Math.max(g * 1.2, ...days.map((x) => x.t.cal), 1);
    const chart = $("#chart");
    chart.innerHTML =
      days.map(({ d, t, n, burned }) => {
        const h = n ? (t.cal / max) * 100 : 2;
        const cls = !n ? "none" : t.cal > g + burned ? "over" : "";
        const label = d.slice(8);
        return `<div class="col" title="${d}: ${r0(t.cal)} kcal eaten, ${r0(burned)} kcal exercise">
          <div class="b ${cls}" style="height:${h}%"></div>
          <span class="lbl">${label}</span>
        </div>`;
      }).join("") + `<div class="goal-line" style="bottom:${(g / max) * 100}%"></div>`;

    const logged = Object.keys(state.log).filter((d) => state.log[d].length);
    const avg = { cal: 0, p: 0, c: 0, f: 0, burned: 0 };
    logged.forEach((d) => {
      const t = { ...totals(state.log[d]), burned: burnedOn(d) };
      for (const k in avg) avg[k] += t[k] / logged.length;
    });
    $("#averages").innerHTML = logged.length
      ? `<div><b>${r0(avg.cal)}</b>kcal / day</div>
         <div><b>${r0(avg.p)} g</b>protein</div>
         <div><b>${r0(avg.c)} g</b>carbs</div>
         <div><b>${r0(avg.f)} g</b>fat</div>
         <div><b>${r0(avg.burned)}</b>kcal exercise / day</div>
         <div><b>${logged.length}</b>days logged</div>`
      : `<p class="muted">No entries yet.</p>`;

    renderWeights();
  }

  // ---------- Weight log ----------
  function recordWeight(date, kg) {
    state.weights[date] = kg;
    persist("weights", date);
  }
  function renderWeights() {
    const dates = Object.keys(state.weights).sort().reverse();
    const p = state.profile;
    const h = p?.height;
    $("#weight-list").innerHTML = dates.length
      ? `<ul class="entries">${dates.slice(0, 30).map((d, i) => {
          const w = state.weights[d];
          const prev = state.weights[dates[i + 1]];
          const diff = prev != null ? r1(w - prev) : null;
          const diffTxt = diff ? ` <span class="muted small">(${diff > 0 ? "+" : ""}${diff})</span>` : "";
          const bmi = h ? ` · BMI ${r1(w / (h / 100) ** 2)}` : "";
          return `<li class="entry">
            <div class="entry-main"><div class="entry-name">${w} kg${diffTxt}</div><div class="entry-sub">${d}${bmi}</div></div>
            <button class="del-btn" data-del-w="${d}" aria-label="Remove weight for ${d}">×</button>
          </li>`;
        }).join("")}</ul>${p?.target ? `<p class="muted small">Target: ${p.target} kg (${r1(Math.abs(state.weights[dates[0]] - p.target))} kg to go)</p>` : ""}`
      : `<p class="muted small">No weights logged yet.</p>`;
  }
  $("#weight-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const kg = r1(Number(ev.target.weight.value));
    recordWeight(todayStr(), kg);
    if (state.profile) {
      state.profile.weight = kg;
      persist("profile");
    }
    ev.target.reset();
    renderWeights();
  });
  $("#weight-list").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-del-w]");
    if (!b) return;
    delete state.weights[b.dataset.delW];
    persist("weights", b.dataset.delW);
    renderWeights();
  });

  // ---------- Settings ----------
  const goalsForm = $("#goals-form");
  const profileForm = $("#profile-form");
  function renderSettings() {
    for (const k of ["cal", "p", "c", "f"]) goalsForm[k].value = state.settings[k];
    const pr = state.profile;
    if (pr) {
      for (const k of ["name", "sex", "age", "height", "weight", "target", "activity", "goal"]) {
        if (pr[k] != null) profileForm[k].value = pr[k];
      }
      showProfileResult();
    } else {
      profileForm.activity.value = "1.2";
      profileForm.goal.value = "0";
    }
    const list = $("#custom-list");
    list.innerHTML = state.custom.length
      ? state.custom.map((f, i) => `
          <div class="custom-item">
            <div><b>${esc(f.name)}</b>${f.place != null ? '<span class="tag">takeout</span>' : ""}<div class="muted small">${f.place ? esc(f.place) + " · " : ""}${esc(f.serving)} · ${r0(f.cal)} kcal · P ${f.p} · C ${f.c} · F ${f.f}</div></div>
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
    persist("custom");
    renderSettings();
  });

  goalsForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(goalsForm);
    state.settings = { cal: +fd.get("cal"), p: +fd.get("p"), c: +fd.get("c"), f: +fd.get("f") };
    persist("settings");
    renderToday();
    const btn = goalsForm.querySelector("button");
    btn.textContent = "Saved ✓";
    setTimeout(() => (btn.textContent = "Save goals"), 1500);
  });

  function suggestGoals(pr) {
    const bmr = 10 * pr.weight + 6.25 * pr.height - 5 * pr.age + (pr.sex === "m" ? 5 : -161);
    const tdee = bmr * pr.activity;
    const cal = Math.max(1200, Math.round((tdee + pr.goal) / 10) * 10);
    // Protein ~1.6 g/kg (good for most people training or dieting), fat ~25% kcal, rest carbs.
    const p = Math.round(pr.weight * 1.6);
    const f = Math.round((cal * 0.25) / 9);
    const c = Math.max(0, Math.round((cal - p * 4 - f * 9) / 4));
    return { bmr, tdee, goals: { cal, p, c, f } };
  }
  function bmiLabel(bmi) {
    // WHO Asian cut-offs, which suit Indian body composition better than the global ones.
    if (bmi < 18.5) return "underweight";
    if (bmi < 23) return "healthy";
    if (bmi < 25) return "overweight";
    return "obese";
  }

  function showProfileResult() {
    const pr = state.profile;
    const { bmr, tdee, goals } = suggestGoals(pr);
    const bmi = pr.weight / (pr.height / 100) ** 2;
    const out = $("#profile-result");
    out.hidden = false;
    out.innerHTML = `
      <p>BMI <b>${r1(bmi)}</b> (${bmiLabel(bmi)}, Asian cut-offs) · BMR ≈ <b>${r0(bmr)}</b> kcal · Maintenance ≈ <b>${r0(tdee)}</b> kcal</p>
      <p>Suggested daily goal: <b>${goals.cal} kcal</b> · P ${goals.p} g · C ${goals.c} g · F ${goals.f} g</p>
      <p class="muted small">Workouts aren't included here. Log them under Exercise on the Today tab and they're added to that day's allowance.</p>
      <button type="button" class="btn primary" id="apply-goals">Use these goals</button>`;
    $("#apply-goals").addEventListener("click", () => {
      state.settings = goals;
      persist("settings");
      renderSettings();
      renderToday();
      $("#apply-goals").replaceWith(Object.assign(document.createElement("p"), { textContent: "Goals updated ✓" }));
    });
  }

  profileForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(profileForm);
    const target = Number(fd.get("target"));
    state.profile = {
      name: fd.get("name").trim(),
      sex: fd.get("sex"),
      age: Number(fd.get("age")),
      height: Number(fd.get("height")),
      weight: r1(Number(fd.get("weight"))),
      target: target > 0 ? r1(target) : null,
      activity: Number(fd.get("activity")),
      goal: Number(fd.get("goal")),
    };
    persist("profile");
    const latest = Object.keys(state.weights).sort().pop();
    if (!latest || state.weights[latest] !== state.profile.weight) recordWeight(todayStr(), state.profile.weight);
    renderSettings();
    const btn = profileForm.querySelector("button[type=submit]");
    btn.textContent = "Saved ✓";
    setTimeout(() => (btn.textContent = "Save profile"), 1500);
  });

  // ---------- Backup ----------
  $("#export-btn").addEventListener("click", () => {
    const data = {
      version: 2, exported: new Date().toISOString(),
      log: state.log, custom: state.custom, settings: state.settings, recent: state.recent,
      exercise: state.exercise, profile: state.profile, weights: state.weights, hidden: state.hidden,
    };
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
      state.exercise = data.exercise || {};
      state.profile = data.profile || null;
      state.weights = data.weights || {};
      state.hidden = Array.isArray(data.hidden) ? data.hidden : [];
      for (const list of Object.values(state.log)) for (const e of list) if (e.meal === "snacks") e.meal = "misc";
      // An imported backup counts as the newest version of everything in it.
      for (const k of SECTIONS) {
        if (!KEYED.includes(k)) persist(k);
        else for (const d of new Set([...Object.keys(state[k]), ...Object.keys(state.meta[k] || {})])) persist(k, d);
      }
      renderSettings();
      renderToday();
      alert("Backup imported.");
    } catch (e) {
      alert("Import failed: " + e.message);
    } finally {
      ev.target.value = "";
    }
  });

  // ---------- GitHub sync ----------
  let stravaReady = false; // set once the Strava section below has initialised
  const DEFAULTS = { log: {}, exercise: {}, weights: {}, custom: [], settings: DEFAULT_SETTINGS, profile: null, recent: [], hidden: [] };

  function getLocal() {
    const data = {};
    for (const k of SECTIONS) data[k] = state[k];
    return { data, meta: state.meta };
  }

  function applyMerged(doc) {
    for (const k of SECTIONS) {
      let v = doc.data[k] ?? DEFAULTS[k];
      if (k === "settings") v = { ...DEFAULT_SETTINGS, ...v };
      state[k] = v;
      save(KEYS[k], v);
    }
    state.meta = doc.meta;
    save(KEYS.meta, state.meta);
    refreshViews();
  }

  function refreshViews() {
    renderToday();
    const active = document.querySelector(".view.active")?.id;
    if (active === "view-history") renderHistory();
    // Don't overwrite a form the user is in the middle of editing.
    if (active === "view-settings" && !document.activeElement?.closest("#view-settings form")) renderSettings();
  }

  const chip = $("#sync-chip");
  let syncInfo = { status: "idle", detail: "" };
  function onStatus(status, detail) {
    syncInfo = { status, detail };
    if (status === "ok") syncInfo.at = detail;
    renderSyncStatus();
  }
  function renderSyncStatus() {
    const cfg = syncCfg;
    if (stravaReady) renderStravaCard();
    chip.hidden = !cfg;
    $("#sync-connected").hidden = !cfg;
    $("#sync-form").hidden = !!cfg;
    if (!cfg) return;
    $("#sync-where").textContent = `${cfg.owner}/${cfg.repo} → ${cfg.path}`;
    const { status, detail, at } = syncInfo;
    const time = at ? at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    const label = { syncing: "⟳ Syncing…", ok: "☁ Synced", offline: "☁ Offline", error: "⚠ Sync error", idle: "☁ Sync" }[status];
    chip.textContent = label;
    chip.classList.toggle("error", status === "error");
    chip.title = status === "error" ? detail : time ? "Last synced " + time : "";
    $("#sync-detail").textContent =
      status === "error" ? "Problem: " + detail :
      status === "offline" ? "You're offline. Changes are saved on this device and will sync when you're back online." :
      status === "syncing" ? "Syncing…" :
      time ? "Last synced at " + time : "";
  }

  let syncCfg = load(KEYS.sync, null);
  const sync = GitHubSync.create({
    getLocal, applyMerged, onStatus,
    extras: {
      "strava-activities.json": (doc) => {
        if (JSON.stringify(doc) === JSON.stringify(state.strava)) return;
        state.strava = doc;
        save(KEYS.strava, doc);
        refreshViews();
        renderStravaCard();
      },
    },
  });

  chip.addEventListener("click", () => {
    if (syncInfo.status === "error") document.querySelector('.tab[data-view="settings"]').click();
    else sync.syncNow();
  });
  $("#sync-now").addEventListener("click", () => sync.syncNow());
  $("#sync-disconnect").addEventListener("click", () => {
    if (!confirm("Disconnect from GitHub on this device? Your data stays on this device and in the GitHub repository; only the token is removed.")) return;
    syncCfg = null;
    localStorage.removeItem(KEYS.sync);
    sync.configure(null);
    renderSyncStatus();
  });

  $("#sync-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const fd = new FormData(form);
    const cfg = {
      owner: fd.get("owner").trim().replace(/^@/, ""),
      repo: fd.get("repo").trim().replace(/^.*\//, ""),
      token: fd.get("token").trim(),
      path: "thali-tracker.json",
    };
    const err = $("#sync-error");
    const btn = form.querySelector("button[type=submit]");
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = "Connecting…";
    try {
      await sync.checkRepo(cfg);
      sync.configure(cfg);
      syncCfg = cfg;
      save(KEYS.sync, cfg);
      form.token.value = "";
      renderSyncStatus();
      await sync.syncNow();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Connect & sync";
    }
  });

  if (syncCfg) {
    sync.configure(syncCfg);
    sync.syncNow();
  }
  renderSyncStatus();
  // Pick up changes made on other devices when the app comes back to the foreground.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync.syncNow(); });
  window.addEventListener("online", () => sync.syncNow());

  // ---------- Strava (COROS workouts) ----------
  const siteUrl = location.origin + location.pathname.replace(/index\.html$/, "");
  const stravaClientInput = $("#strava-client-id");
  stravaClientInput.value = load(KEYS.stravaId, "");
  let stravaWorkflowYaml = null;

  function renderStravaCard() {
    document.querySelectorAll(".js-site").forEach((el) => (el.textContent = siteUrl));
    document.querySelectorAll(".js-host").forEach((el) => (el.textContent = location.hostname));
    const cfg = syncCfg;
    $("#strava-needs-sync").hidden = !!cfg;
    const repoUrl = cfg ? `https://github.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}` : null;
    const secrets = document.querySelector(".js-secrets");
    secrets.href = repoUrl ? repoUrl + "/settings/secrets/actions" : "#strava-card";
    const wf = document.querySelector(".js-workflow");
    wf.href = repoUrl
      ? `${repoUrl}/new/main?filename=${encodeURIComponent(".github/workflows/strava-import.yml")}` +
        (stravaWorkflowYaml ? "&value=" + encodeURIComponent(stravaWorkflowYaml) : "")
      : "#strava-card";

    const acts = Object.values(state.strava?.activities || {});
    const status = $("#strava-status");
    $("#strava-actions").hidden = !cfg;
    if (acts.length) {
      const updated = state.strava.updated ? new Date(state.strava.updated).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
      status.textContent = `✓ ${acts.length} workouts imported${updated ? ", last new data " + updated : ""}.`;
    } else {
      status.textContent = cfg ? "No Strava data in your data repo yet." : "Not set up.";
    }
    if (!acts.length && !$("#strava-setup").dataset.touched) $("#strava-setup").open = true;
  }
  $("#strava-setup").addEventListener("toggle", (ev) => (ev.target.dataset.touched = "1"));

  // The workflow file lives next to the app, so the pre-filled link always matches the current version.
  fetch("importer/strava-import.yml")
    .then((r) => (r.ok ? r.text() : null))
    .then((t) => { stravaWorkflowYaml = t; renderStravaCard(); })
    .catch(() => {});

  $("#strava-authorize").addEventListener("click", () => {
    const id = stravaClientInput.value.trim();
    if (!/^\d+$/.test(id)) {
      stravaClientInput.focus();
      return alert("Enter the numeric Client ID from strava.com/settings/api first.");
    }
    save(KEYS.stravaId, id);
    const url = new URL("https://www.strava.com/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: id, response_type: "code", redirect_uri: siteUrl,
      approval_prompt: "force", scope: "read,activity:read_all", state: "thali-strava",
    });
    location.href = url;
  });

  // Back from Strava's consent page: ?state=thali-strava&code=...&scope=...
  const params = new URLSearchParams(location.search);
  let stravaCode = null;
  if (params.get("state") === "thali-strava") {
    history.replaceState(null, "", location.pathname);
    document.querySelector('.tab[data-view="settings"]').click();
    $("#strava-setup").open = true;
    const hint = $("#strava-token-hint");
    if (params.get("error")) {
      hint.textContent = "Strava access was not granted. Try Authorize again.";
    } else if (!/activity:read_all/.test(params.get("scope") || "")) {
      hint.textContent = "Please authorise again and keep “View data about your private activities” ticked.";
    } else {
      stravaCode = params.get("code");
      hint.textContent = "Authorised ✓. Now paste the Client Secret from the same Strava page.";
      $("#strava-exchange").hidden = false;
    }
    setTimeout(() => $("#strava-step-token").scrollIntoView({ block: "center" }), 50);
  }

  $("#strava-get-token").addEventListener("click", async () => {
    const id = stravaClientInput.value.trim();
    const secret = $("#strava-client-secret").value.trim();
    if (!secret) return $("#strava-client-secret").focus();
    const btn = $("#strava-get-token");
    btn.disabled = true;
    try {
      const res = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        body: new URLSearchParams({ client_id: id, client_secret: secret, code: stravaCode, grant_type: "authorization_code" }),
      });
      const json = await res.json();
      if (!res.ok || !json.refresh_token) throw new Error(json.message || "Strava refused the request");
      $("#strava-refresh").value = json.refresh_token;
      $("#strava-token-out").hidden = false;
      $("#strava-exchange").hidden = true;
      $("#strava-client-secret").value = "";
      $("#strava-token-hint").textContent = "Done ✓. Copy it for the next step.";
    } catch (e) {
      if (e instanceof TypeError) {
        // Network/CORS failure: fall back to a command the user can run themselves.
        $("#strava-curl-cmd").textContent =
          `curl -X POST https://www.strava.com/oauth/token -d client_id=${id} -d client_secret=YOUR_CLIENT_SECRET -d code=${stravaCode} -d grant_type=authorization_code`;
        $("#strava-curl").hidden = false;
      } else {
        $("#strava-token-hint").textContent = "Strava said: " + e.message + ". Check the Client Secret, or authorise again (codes expire quickly).";
      }
    } finally {
      btn.disabled = false;
    }
  });

  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-copy]");
    if (!b) return;
    const input = $(b.dataset.copy);
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
      document.execCommand("copy");
    }
    b.textContent = "Copied ✓";
    setTimeout(() => (b.textContent = "Copy"), 1500);
  });

  $("#strava-run").addEventListener("click", async () => {
    const msg = $("#strava-run-msg");
    const btn = $("#strava-run");
    msg.hidden = true;
    btn.disabled = true;
    btn.textContent = "Starting…";
    try {
      await sync.runWorkflow("strava-import.yml");
      btn.textContent = "Importing… (about a minute)";
      // The run takes ~30–60 s; pick up its result.
      for (const wait of [40000, 30000, 30000]) {
        await new Promise((r) => setTimeout(r, wait));
        await sync.syncNow();
      }
    } catch (e) {
      msg.textContent = e.message;
      msg.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Import now";
    }
  });

  stravaReady = true;
  renderStravaCard();
  renderToday();
})();
