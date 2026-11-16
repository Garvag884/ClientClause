(function () {
  var local = location.hostname === "127.0.0.1" || location.hostname === "localhost";
  window.API_BASE = local ? "" : "https://YOUR-API-NAME.onrender.com";
})();
