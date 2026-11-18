(function () {
  var extra = [
    ["Loan", "I'm Anil Verma, lending my friend Ritu Sharma 1,50,000 rupees for her laptop and course fees. Interest-free, repaid over 10 months starting 5 March 2027. Courts in Jaipur."],
    ["Supply", "Greenfield Packaging will supply corrugated boxes to Nova Foods Pvt Ltd for 12 months starting 1 February 2027. Expected value 8,00,000 rupees, delivery within 10 days of each order, payment in 30 days, 6 month warranty. Courts in Pune."],
    ["Mutual NDA", "Tidal Analytics and Brightwave Labs will both share product roadmaps and customer data while exploring a joint venture. Keep it confidential for 3 years. Courts in Gurugram."]
  ];

  function findChips() {
    return Array.prototype.filter.call(
      document.querySelectorAll("button, a, span, div"),
      function (e) { return e.children.length === 0 && /^\s*Try:/.test(e.textContent); }
    );
  }

  function fill(text) {
    var box = document.getElementById("desc") || document.querySelector("textarea");
    if (!box) return;
    box.value = text;
    box.dispatchEvent(new Event("input", { bubbles: true }));
    box.focus();
  }

  function add() {
    var chips = findChips();
    if (!chips.length) return false;
    var last = chips[chips.length - 1];
    if (last.parentNode.getAttribute("data-extra-chips")) return true;
    last.parentNode.setAttribute("data-extra-chips", "1");
    extra.forEach(function (pair) {
      var c = last.cloneNode(true);
      ["data-s", "onclick", "id"].forEach(function (a) { c.removeAttribute(a); });
      if (c.tagName === "A") c.setAttribute("href", "#");
      c.textContent = "Try: " + pair[0];
      c.addEventListener("click", function (ev) { ev.preventDefault(); fill(pair[1]); });
      last.parentNode.appendChild(c);
    });
    return true;
  }

  var tries = 0;
  var timer = setInterval(function () {
    if (add() || ++tries > 20) clearInterval(timer);
  }, 250);
})();
