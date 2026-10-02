// Optional sync of all tracker data to a JSON file in a private GitHub repo,
// using a fine-grained personal access token and the GitHub contents API.
//
// Merge model: every change is timestamped in `meta`. Per-date sections (log,
// exercise, weights) merge day by day; the other sections merge as a whole.
// The newer timestamp wins, so two devices editing different days never clash.
const GitHubSync = (() => {
  "use strict";

  const KEYED = ["log", "exercise", "weights"];
  const WHOLE = ["custom", "settings", "profile", "recent"];
  const API = "https://api.github.com";

  class SyncError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  // ---------- Merge ----------
  function stamp(side, k, d) {
    const t = side.meta?.[k]?.[d];
    if (typeof t === "number") return t;
    return side.data?.[k] && d in side.data[k] ? 0 : -1;
  }

  function merge(local, remote) {
    const out = { data: {}, meta: {} };
    for (const k of KEYED) {
      out.data[k] = {};
      out.meta[k] = {};
      const dates = new Set([
        ...Object.keys(local.data?.[k] || {}), ...Object.keys(local.meta?.[k] || {}),
        ...Object.keys(remote.data?.[k] || {}), ...Object.keys(remote.meta?.[k] || {}),
      ]);
      for (const d of dates) {
        const tl = stamp(local, k, d);
        const tr = stamp(remote, k, d);
        const win = tr > tl ? remote : local;
        if (win.data?.[k] && d in win.data[k]) out.data[k][d] = win.data[k][d];
        const t = Math.max(tl, tr);
        if (t > 0) out.meta[k][d] = t;
      }
    }
    for (const k of WHOLE) {
      const tl = local.meta?.[k] || 0;
      const tr = remote.meta?.[k] || 0;
      out.data[k] = (tr > tl ? remote : local).data?.[k] ?? null;
      const t = Math.max(tl, tr);
      if (t > 0) out.meta[k] = t;
    }
    return out;
  }

  // JSON with sorted keys, so identical data always serialises identically.
  function stable(v) {
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    if (v && typeof v === "object") {
      return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined)
        .map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
    }
    return JSON.stringify(v ?? null);
  }

  // ---------- GitHub API ----------
  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromBase64(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  async function api(cfg, method, path, { body, accept } = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        method,
        cache: "no-store",
        headers: {
          Authorization: "Bearer " + cfg.token,
          Accept: accept || "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SyncError("Offline or GitHub unreachable", 0);
    }
    if (res.ok) return res;
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch { /* keep statusText */ }
    if (res.status === 401) msg = "Token is invalid or expired";
    throw new SyncError(msg, res.status);
  }

  const contentsPath = (cfg) =>
    `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path.split("/").map(encodeURIComponent).join("/")}`;

  async function checkRepo(cfg) {
    let repo;
    try {
      repo = await (await api(cfg, "GET", `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`)).json();
    } catch (e) {
      if (e.status === 404) throw new SyncError(`Can't find ${cfg.owner}/${cfg.repo}. Check the name, and that the token has access to this repository.`, 404);
      throw e;
    }
    if (!repo.private) throw new SyncError(`${cfg.owner}/${cfg.repo} is public. Use a private repository so your data stays private.`, 0);
    if (repo.permissions && !repo.permissions.push) throw new SyncError("The token can read but not write. Give it Contents: Read and write.", 403);
  }

  async function getFile(cfg) {
    let meta;
    try {
      meta = await (await api(cfg, "GET", contentsPath(cfg))).json();
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
    let text;
    if (meta.content) {
      text = fromBase64(meta.content);
    } else {
      // Files over 1 MB come back without inline content.
      text = await (await api(cfg, "GET", contentsPath(cfg), { accept: "application/vnd.github.raw+json" })).text();
    }
    return { doc: JSON.parse(text), sha: meta.sha };
  }

  async function putFile(cfg, doc, sha) {
    const body = {
      message: "Update tracker data",
      content: toBase64(JSON.stringify(doc, null, 1)),
      ...(sha ? { sha } : {}),
    };
    const res = await (await api(cfg, "PUT", contentsPath(cfg), { body })).json();
    return res.content.sha;
  }

  // ---------- Sync loop ----------
  // getLocal(): returns {data, meta}. applyMerged(doc): stores merged data locally.
  function create({ getLocal, applyMerged, onStatus }) {
    let cfg = null;
    let running = null;
    let again = false;
    let timer = null;

    async function syncOnce() {
      for (let attempt = 0; attempt < 3; attempt++) {
        const remote = await getFile(cfg);
        const local = getLocal();
        const merged = remote ? merge(local, remote.doc) : merge(local, { data: {}, meta: {} });
        if (stable(merged) !== stable({ data: local.data, meta: local.meta })) applyMerged(merged);
        const remoteSame = remote && stable(merged) === stable({ data: remote.doc.data, meta: remote.doc.meta });
        if (remoteSame) return;
        try {
          await putFile(cfg, { app: "thali-tracker", version: 3, ...merged }, remote?.sha);
          return;
        } catch (e) {
          // Someone else wrote in between: re-read, re-merge, retry.
          if (e.status === 409 || e.status === 422) continue;
          throw e;
        }
      }
      throw new SyncError("Kept clashing with another device; will retry", 409);
    }

    async function syncNow() {
      if (!cfg) return;
      clearTimeout(timer);
      if (running) {
        again = true;
        return running;
      }
      onStatus("syncing");
      running = (async () => {
        try {
          do {
            again = false;
            await syncOnce();
          } while (again);
          onStatus("ok", new Date());
        } catch (e) {
          onStatus(e.status === 0 && /Offline/.test(e.message) ? "offline" : "error", e.message);
        } finally {
          running = null;
        }
      })();
      return running;
    }

    return {
      merge,
      checkRepo,
      configure(c) { cfg = c; },
      get configured() { return !!cfg; },
      syncNow,
      schedule() {
        if (!cfg) return;
        clearTimeout(timer);
        timer = setTimeout(syncNow, 1500);
      },
    };
  }

  return { create, merge, SyncError };
})();
