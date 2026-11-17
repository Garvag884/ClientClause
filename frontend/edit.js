(function () {
  var API = function () { return window.API_BASE || ""; };
  var pending = [];
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var css = document.createElement("style");
  css.textContent =
    "#edfab{position:fixed;right:18px;bottom:18px;z-index:50;display:none;gap:8px;flex-wrap:wrap;justify-content:flex-end}" +
    "#edfab button{font:600 15px system-ui,sans-serif;padding:11px 18px;border-radius:999px;border:1px solid #1c2b45;background:#1c2b45;color:#fff;cursor:pointer;box-shadow:0 6px 18px rgba(28,43,69,.25)}" +
    "#edfab button.ghost{background:#fff;color:#1c2b45}" +
    "#eddlg{border:0;border-radius:14px;padding:0;width:min(620px,94vw);max-height:90vh;color:#1c2b45;font:15px/1.5 system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35)}" +
    "#eddlg::backdrop{background:rgba(28,43,69,.5)}" +
    ".edin{padding:22px;overflow:auto;max-height:90vh}" +
    ".edin h3{margin:0 0 6px;font-size:20px}" +
    ".edin p{margin:0 0 10px;color:#5d6b82;font-size:14px}" +
    ".edin textarea{width:100%;height:110px;padding:10px;font:inherit;border:1px solid #d5dbe5;border-radius:10px;resize:vertical;box-sizing:border-box}" +
    ".edrow{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}" +
    ".edrow button{font:600 14px system-ui,sans-serif;padding:9px 16px;border-radius:8px;border:1px solid #1c2b45;background:#1c2b45;color:#fff;cursor:pointer}" +
    ".edrow button.ghost{background:#fff;color:#1c2b45}" +
    ".edrow button:disabled{opacity:.6;cursor:wait}" +
    ".edchg{margin:10px 0;padding:10px 12px;border:1px solid #d5dbe5;border-radius:10px;font-size:14px}" +
    ".edbef,.edaft{padding:8px 10px;border-radius:8px;margin-top:6px;white-space:pre-wrap;font:13.5px/1.5 Georgia,serif}" +
    ".edbef{background:#fdecea}.edaft{background:#e8f5ee}" +
    ".edwarn{background:#fff6dc;border-radius:8px;padding:8px 10px;font-size:13.5px;color:#6b4b00;margin-top:8px}" +
    ".edmsg{color:#b3261e;margin-top:8px;font-size:14px;min-height:1px}" +
    ".edbadge{font:600 12px system-ui,sans-serif;background:#fff1c9;color:#6b4b00;border-radius:999px;padding:2px 9px}" +
    ".edbadge button{all:unset;cursor:pointer;margin-left:6px;text-decoration:underline}" +
    "@media print{#edfab,#eddlg,.edbadge{display:none!important}}";
  document.head.appendChild(css);

  var fab = document.createElement("div");
  fab.id = "edfab";
  fab.innerHTML = '<button class="ghost" id="edundo" style="display:none">Undo last edit</button><button id="edopen">Edit contract</button>';
  document.body.appendChild(fab);

  var dlg = document.createElement("dialog");
  dlg.id = "eddlg";
  dlg.setAttribute("aria-labelledby", "edtitle");
  dlg.innerHTML =
    '<div class="edin"><h3 id="edtitle">Edit this contract</h3>' +
    '<div id="edstep1"><p>Say what to change, in your own words. For example: "Make the notice period 60 days", "Change the deposit clause to favour the tenant", or "Add a clause that no pets are allowed".</p>' +
    '<textarea id="edtext" aria-label="What would you like to change?"></textarea>' +
    '<div class="edmsg" id="edmsg" role="alert"></div>' +
    '<div class="edrow"><button class="ghost" id="edcancel">Cancel</button><button id="edreview">Review changes</button></div></div>' +
    '<div id="edstep2" style="display:none"><p id="edsum"></p><div id="edlist"></div><div id="edwarn"></div>' +
    '<div class="edrow"><button class="ghost" id="edback">Back</button><button id="edapply">Apply changes</button></div></div></div>';
  document.body.appendChild(dlg);

  function hasState() { return typeof S !== "undefined" && S && S.clauses; }

  function syncFields() {
    S.field_defs.forEach(function (f) {
      var el = $("f_" + f.key);
      if (el) S.fields[f.key] = el.value.trim();
    });
  }

  function push() {
    S.history = S.history || [];
    S.history.push(JSON.stringify({ fields: S.fields, variants: S.variants || {}, custom: S.custom || {} }));
    if (S.history.length > 20) S.history.shift();
  }

  window.rebuild = async function () {
    syncFields();
    var y = window.scrollY;
    try {
      var r = await fetch(API() + "/api/build", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type_id: S.type_id, fields: S.fields, variants: S.variants || {}, custom: S.custom || {} })
      });
      var d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Something went wrong.");
      S = Object.assign({}, S, d);
      render();
      window.scrollTo(0, y);
    } catch (e) { var m = $("msg"); if (m) m.textContent = e.message; }
  };

  window.setVar = function (id, v) {
    S.variants = S.variants || {};
    S.variants[id] = v;
    if (S.custom && S.custom.edits) delete S.custom.edits[id];
    window.rebuild();
  };

  function decorate() {
    if (!hasState()) return;
    fab.style.display = "flex";
    $("edundo").style.display = (S.history && S.history.length) ? "" : "none";
    S.clauses.forEach(function (c) {
      if (!c.custom) return;
      var box = $("c" + c.number);
      if (!box) return;
      var head = box.querySelector(".ctitle") || box;
      var isNew = String(c.id).indexOf("custom_") === 0;
      var b = document.createElement("span");
      b.className = "edbadge";
      b.innerHTML = (isNew ? "Added with AI" : "Edited with AI") + ' <button type="button">' + (isNew ? "Remove" : "Restore original") + "</button>";
      b.querySelector("button").onclick = function () {
        push();
        S.custom = S.custom || {};
        if (isNew) S.custom.added = (S.custom.added || []).filter(function (a) { return a.id !== c.id; });
        else if (S.custom.edits) delete S.custom.edits[c.id];
        window.rebuild();
      };
      head.appendChild(b);
    });
  }

  var baseRender = window.render;
  window.render = function () { baseRender.apply(this, arguments); decorate(); };

  function show(step) {
    $("edstep1").style.display = step === 1 ? "" : "none";
    $("edstep2").style.display = step === 2 ? "" : "none";
  }

  $("edopen").onclick = function () {
    $("edmsg").textContent = "";
    show(1);
    dlg.showModal();
    $("edtext").focus();
  };
  $("edcancel").onclick = function () { dlg.close(); };
  $("edback").onclick = function () { show(1); };

  $("edreview").onclick = async function () {
    var text = $("edtext").value.trim();
    if (text.length < 4) { $("edmsg").textContent = "Please describe the change you want."; return; }
    var btn = $("edreview");
    btn.disabled = true; btn.textContent = "Thinking...";
    $("edmsg").textContent = "";
    try {
      syncFields();
      var r = await fetch(API() + "/api/edit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type_id: S.type_id, fields: S.fields, variants: S.variants || {}, custom: S.custom || {}, instruction: text })
      });
      var d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Could not work out the changes.");
      pending = d.ops || [];
      $("edsum").textContent = d.summary || "";
      var html = "", ai = false;
      (d.changes || []).forEach(function (c) {
        html += '<div class="edchg"><b>' + esc(c.text) + "</b>";
        if (c.before) html += '<div class="edbef">' + esc(c.before) + "</div>";
        if (c.after) { html += '<div class="edaft">' + esc(c.after) + "</div>"; ai = true; }
        html += "</div>";
      });
      if (!pending.length) html = '<div class="edchg">No changes were made. Try describing the change more specifically, such as which clause or detail to change.</div>';
      $("edlist").innerHTML = html;
      $("edwarn").innerHTML = ai ? '<div class="edwarn">This includes wording written by AI. It is not from the vetted clause library, so read it closely and have a lawyer review it.</div>' : "";
      $("edapply").style.display = pending.length ? "" : "none";
      show(2);
    } catch (e) { $("edmsg").textContent = e.message; }
    finally { btn.disabled = false; btn.textContent = "Review changes"; }
  };

  $("edapply").onclick = function () {
    push();
    S.custom = S.custom || {};
    var c = S.custom;
    c.edits = c.edits || {}; c.removed = c.removed || []; c.added = c.added || [];
    S.variants = S.variants || {};
    pending.forEach(function (o) {
      if (o.op === "set_field") {
        S.fields[o.key] = o.value;
        var el = $("f_" + o.key);
        if (el) el.value = o.value;
      } else if (o.op === "set_variant") {
        S.variants[o.clause_id] = o.variant;
        delete c.edits[o.clause_id];
        c.removed = c.removed.filter(function (x) { return x !== o.clause_id; });
      } else if (o.op === "remove_clause") {
        var i = c.added.findIndex(function (a) { return a.id === o.clause_id; });
        if (i >= 0) c.added.splice(i, 1);
        else if (c.removed.indexOf(o.clause_id) < 0) c.removed.push(o.clause_id);
      } else if (o.op === "edit_clause") {
        var a = c.added.find(function (x) { return x.id === o.clause_id; });
        if (a) a.text = o.text; else c.edits[o.clause_id] = o.text;
      } else if (o.op === "add_clause") {
        c.added.push({ id: "custom_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                       title: o.title, text: o.text, after: o.after || null });
      }
    });
    pending = [];
    $("edtext").value = "";
    dlg.close();
    window.rebuild();
  };

  $("edundo").onclick = function () {
    if (!S.history || !S.history.length) return;
    var prev = JSON.parse(S.history.pop());
    S.fields = prev.fields; S.variants = prev.variants; S.custom = prev.custom;
    S.field_defs.forEach(function (f) { var el = $("f_" + f.key); if (el) el.value = S.fields[f.key] || ""; });
    window.rebuild();
  };
})();
