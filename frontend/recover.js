(function () {
  var P = "cc.v1.", MAX = 7 * 864e5;
  function $(id) { return document.getElementById(id); }
  function api() { return window.API_BASE || ""; }
  function store() { try { return window.localStorage; } catch (e) { return null; } }
  function get(k) {
    try { var v = JSON.parse(store().getItem(P + k)); return v && Date.now() - v.at < MAX ? v : null; }
    catch (e) { return null; }
  }
  function put(k, v) { try { v.at = Date.now(); store().setItem(P + k, JSON.stringify(v)); } catch (e) {} }
  function drop(k) { try { store().removeItem(P + k); } catch (e) {} }
  window.saveReviewRecovery = function (record) {
    if (!record || !record.text || !record.result) return;
    put("review", { text: String(record.text), result: record.result });
    put("t_reviewtext", { text: String(record.text) });
  };
  function wipe() {
    try { Object.keys(store()).filter(function (k) { return k.indexOf(P) === 0; })
      .forEach(function (k) { store().removeItem(k); }); } catch (e) {}
  }
  function debounce(f, ms) { var t; return function () { clearTimeout(t); t = setTimeout(f, ms); }; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function note(t) { var m = $("msg"); if (m) m.textContent = t; else alert(t); }

  var css = document.createElement("style");
  css.textContent =
    "#ccresume{position:fixed;top:0;left:0;right:0;z-index:60;background:#17233b;color:#fff;padding:12px 16px;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;font:15px system-ui,sans-serif}" +
    "#ccresume button,#ccbar button,.ccretry{font:600 13px system-ui,sans-serif;padding:7px 14px;border-radius:999px;border:1px solid #17233b;background:#fff;color:#17233b;cursor:pointer}" +
    "#ccresume button.go{background:#e8a33d;border-color:#e8a33d}" +
    "#ccresume small{opacity:.8}" +
    "#ccbar{position:fixed;left:14px;bottom:14px;z-index:40;display:flex;gap:6px;flex-wrap:wrap}" +
    "#ccbar button{box-shadow:0 2px 8px rgba(0,0,0,.15)}" +
    ".ccretry{margin-left:8px}" +
    "@media print{#ccresume,#ccbar{display:none!important}}";
  document.head.appendChild(css);

  // 1. Autosave what the user typed
  ["desc", "reviewtext"].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    var saved = get("t_" + id);
    if (saved && !el.value.trim()) el.value = saved.text;
    el.addEventListener("input", debounce(function () {
      if (el.value.trim()) put("t_" + id, { text: el.value }); else drop("t_" + id);
    }, 500));
  });

  // 2. Autosave the contract being worked on
  function haveS() { return typeof S !== "undefined" && S && S.type_id && S.clauses; }
  function snap() {
    if (!haveS()) return null;
    var f = Object.assign({}, S.fields);
    (S.field_defs || []).forEach(function (d) {
      var el = $("f_" + d.key);
      if (el) f[d.key] = el.value.trim();
    });
    return { type_id: S.type_id, name: S.type_name, fields: f, variants: S.variants || {}, custom: S.custom || {} };
  }
  function toggleBar() { var b = $("ccsave"); if (b) b.style.display = haveS() ? "" : "none"; }
  var saveNow = function () { var s = snap(); if (s) put("draft", s); toggleBar(); };
  var baseRender = window.render;
  if (typeof baseRender === "function") {
    window.render = function () { var r = baseRender.apply(this, arguments); saveNow(); return r; };
  }
  document.addEventListener("input", debounce(saveNow, 700));
  document.addEventListener("visibilitychange", function () { if (document.hidden) saveNow(); });
  window.addEventListener("pagehide", saveNow);

  // 3. Resume a saved draft
  async function resume(sn) {
    try {
      var r = await fetch(api() + "/api/build", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type_id: sn.type_id, fields: sn.fields || {}, variants: sn.variants || {}, custom: sn.custom || {} })
      });
      var d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Could not restore the draft.");
      S = Object.assign({}, d, { variants: sn.variants || {}, custom: sn.custom || {}, history: [] });
      render();
      document.body.classList.add("has-draft");
      var w = $("work"); if (w) w.scrollIntoView({ behavior: "smooth" });
      var b = $("ccresume"); if (b) b.remove();
    } catch (e) { note(e.message || "Could not restore the draft."); }
  }
  function ago(ms) {
    var m = Math.round((Date.now() - ms) / 60000);
    return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago";
  }
  setTimeout(function () {
    var d = haveS() ? null : get("draft"), review = get("review");
    if (!d && !review) return;
    var bar = document.createElement("div");
    bar.id = "ccresume";
    bar.setAttribute("role", "status");
    var useReview = review && (!d || review.at >= d.at);
    if (useReview) {
      bar.innerHTML = "<span>Resume your saved <b>contract review</b> (saved " + ago(review.at) +
        ")? <small>Text and findings stay in this browser only.</small></span><button class='go'>Resume review</button><button class='no'>Discard</button>";
      bar.querySelector(".go").onclick = function () {
        if (window.restoreReviewReport) window.restoreReviewReport(review);
        bar.remove();
      };
      bar.querySelector(".no").onclick = function () { drop("review"); drop("t_reviewtext"); bar.remove(); };
    } else {
      bar.innerHTML = "<span>Resume your unfinished <b>" + esc(d.name || "contract") + "</b> (saved " + ago(d.at) +
        ")? <small>Drafts stay in this browser only.</small></span><button class='go'>Resume</button><button class='no'>Discard</button>";
      bar.querySelector(".go").onclick = function () { resume(d); };
      bar.querySelector(".no").onclick = function () { drop("draft"); bar.remove(); };
    }
    document.body.appendChild(bar);
  }, 400);

  // 4. Save and open a draft file
  var tools = document.createElement("div");
  tools.id = "ccbar";
  tools.innerHTML = "<button id='ccsave' style='display:none'>Save draft file</button><button id='ccopen'>Open draft file</button>" +
    "<button id='ccwipe'>Clear saved data</button><input type='file' id='ccfile' accept='.json,application/json' hidden>";
  document.body.appendChild(tools);
  $("ccsave").onclick = function () {
    var s = snap(); if (!s) return;
    var blob = new Blob([JSON.stringify({ app: "ClientClause", v: 1, snapshot: s }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "clientclause-draft-" + String(s.type_id).replace(/[^a-z0-9_-]/gi, "") + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000);
  };
  $("ccopen").onclick = function () { $("ccfile").click(); };
  $("ccfile").onchange = function () {
    var f = this.files[0]; this.value = "";
    if (!f) return;
    if (f.size > 300000) { note("That file is too large to be a ClientClause draft."); return; }
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var o = JSON.parse(rd.result), sn = o && o.snapshot;
        if (!o || o.app !== "ClientClause" || !sn || typeof sn.type_id !== "string" || !sn.fields || typeof sn.fields !== "object") throw 0;
        resume(sn);
      } catch (e) { note("That file is not a valid ClientClause draft."); }
    };
    rd.readAsText(f);
  };
  $("ccwipe").onclick = function () {
    if (confirm("Delete saved drafts, review results, and text from this browser?")) { wipe(); var b = $("ccresume"); if (b) b.remove(); }
  };
  toggleBar();

  // 5. Clear network errors, a time limit, and one quiet retry
  var orig = window.fetch.bind(window);
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  window.fetch = async function (url, opts) {
    var u = typeof url === "string" ? url : (url && url.url) || "";
    if (u.indexOf("/api/") < 0 || (opts && opts.signal)) return orig(url, opts);
    var quiet = u.indexOf("health") >= 0;
    var ms = u.indexOf("transcribe") >= 0 ? 120000 : quiet ? 15000 : 90000;
    var m = $("msg"), hint = null, shown = false;
    if (!quiet && m) hint = setTimeout(function () {
      if (!m.textContent) { m.textContent = "Still working. The free server may be waking up, which can take up to a minute."; shown = true; }
    }, 8000);
    try {
      for (var i = 0; i < 2; i++) {
        var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms);
        try {
          var r = await orig(url, Object.assign({}, opts, { signal: ctl.signal }));
          clearTimeout(t);
          return r;
        } catch (e) {
          clearTimeout(t);
          if (e && e.name === "AbortError") throw new Error("This is taking longer than expected. Your work is saved, so please try again in a moment.");
          if (i === 0 && !quiet) { await sleep(3500); continue; }
          throw new Error("Can't reach the server. Check your connection, then try again. Your work is saved.");
        }
      }
    } finally {
      if (hint) clearTimeout(hint);
      if (shown && m && m.textContent.indexOf("Still working") === 0) m.textContent = "";
    }
  };

  // 6. A Try again button on recoverable errors
  var msg = $("msg");
  if (msg) new MutationObserver(function () {
    var t = msg.textContent;
    if (!/try again/i.test(t) || /microphone|speech/i.test(t) || msg.querySelector(".ccretry")) return;
    if (typeof window.draft !== "function") return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "ccretry"; b.textContent = "Try again";
    b.onclick = function () { msg.textContent = ""; window.draft(); };
    msg.appendChild(b);
  }).observe(msg, { childList: true, characterData: true, subtree: true });
})();
