(function () {
  function run() {
    var scope = document.querySelector("header, nav, .nav, .topbar") || document.body;
    var els = scope.querySelectorAll("a, div, span");
    var brand = null;
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || "").replace(/\s+/g, "");
      if (t === "ClientClause") { brand = els[i]; break; }
    }
    if (!brand || brand.getAttribute("data-logo")) return;
    brand.setAttribute("data-logo", "1");

    var img = document.createElement("img");
    img.src = "logo.png?v=2";
    img.alt = "";
    img.className = "cc-logo";
    img.style.cssText = "height:40px;width:auto;display:block;border-radius:8px";

    var old = brand.querySelector("svg") || brand.querySelector("img");
    if (old) {
      var box = old.parentElement;
      var swap = (box !== brand && !(box.textContent || "").trim()) ? box : old;
      swap.replaceWith(img);
    } else {
      brand.insertBefore(img, brand.firstChild);
    }
    if (getComputedStyle(brand).display.indexOf("flex") < 0) {
      brand.style.display = "inline-flex";
      brand.style.alignItems = "center";
      brand.style.gap = "10px";
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
  setTimeout(run, 600);
})();
