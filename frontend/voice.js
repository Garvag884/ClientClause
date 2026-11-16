(function () {
  var rec = null, chunks = [], stream = null, timer = null;
  function el(id) { return document.getElementById(id); }
  function say(t) { var m = el("msg"); if (m) m.textContent = t; else if (t) alert(t); }
  function setMic(on) {
    var b = el("mic");
    b.classList.toggle("rec", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    el("micl").textContent = on ? "Stop" : "Speak";
  }
  async function toggle() {
    if (rec && rec.state === "recording") { rec.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      say("Voice input isn't supported in this browser. You can type instead.");
      return;
    }
    say("");
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { say("Microphone access was blocked. Allow it in your browser settings, then try again."); return; }
    chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async function () {
      clearTimeout(timer);
      stream.getTracks().forEach(function (t) { t.stop(); });
      setMic(false);
      await send(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
    };
    rec.start();
    setMic(true);
    timer = setTimeout(function () { if (rec.state === "recording") rec.stop(); }, 120000);
  }
  async function send(blob) {
    el("micl").textContent = "Transcribing...";
    el("mic").disabled = true;
    var fd = new FormData();
    fd.append("audio", blob, "speech");
    fd.append("mode", el("vlang").value);
    try {
      var r = await fetch((window.API_BASE || "") + "/api/transcribe", { method: "POST", body: fd });
      var d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Transcription failed.");
      var t = el("desc");
      t.value = (t.value.trim() ? t.value.trim() + " " : "") + d.text;
      t.focus();
    } catch (e) { say(e.message); }
    finally { el("mic").disabled = false; el("micl").textContent = "Speak"; }
  }
  var b = el("mic");
  if (b) b.addEventListener("click", toggle);
})();
