/* =============================================================
   QRito — capa de página: huecos publicitarios y detalles de interfaz.
   Los huecos van SIEMPRE vacíos (solo el marcador «ANUNCIO»);
   el propietario pega su código dentro de cada .ad-slot.
   ============================================================= */
(function () {
  "use strict";

  var data = (window.__BRAND__ || {});
  var cfg = data.ads || {};
  var $ = function (s) { return document.querySelector(s); };
  function safe(fn, name) { try { fn(); } catch (e) { console.warn("[" + name + "]", e); } }

  /* ---------- Publicidad propia (PickEvent / PlanningManager) ----------
     Reparto en turnos: cada vez que un hueco necesita una campaña, avanza
     un contador compartido (guardado en sessionStorage) y toma la siguiente
     de la lista. Con 2 campañas, dos huecos consecutivos SIEMPRE muestran
     una distinta cada uno; y a lo largo de la sesión los huecos van
     alternando cuál les toca — así se intercalan en sitio y en tiempo. */
  var houseAds = data.houseAds || [];

  function nextHouseAd() {
    if (!houseAds.length) return null;
    var n = 0;
    try { n = parseInt(sessionStorage.getItem("qr3d.adSeq") || "0", 10) || 0; } catch (e) {}
    var ad = houseAds[n % houseAds.length];
    try { sessionStorage.setItem("qr3d.adSeq", String(n + 1)); } catch (e) {}
    return ad;
  }

  function paintHouseAd(link, img, ad, shape, crossfade) {
    if (!link || !img || !ad) return;
    var src = ad[shape] || ad.square;
    if (img.getAttribute("src") === src) return;      // nada que cambiar
    link.href = ad.url;
    var apply = function () {
      img.src = src;
      img.alt = ad.alt;
      img.classList.remove("is-swapping");
    };
    if (crossfade) {
      img.classList.add("is-swapping");
      setTimeout(apply, 220);
    } else {
      apply();
    }
  }

  /* Banner bajo la herramienta + bloque de contenido: rotan solas con el tiempo. */
  function initHouseAdsRotate() {
    if (!houseAds.length) return;
    var slots = [
      { link: $(".ad-leaderboard .ad-house-link"), img: $(".ad-leaderboard .ad-house-img"), shape: "wide" },
      { link: $(".ad-incontent .ad-house-link"), img: $(".ad-incontent .ad-house-img"), shape: "square" }
    ].filter(function (s) { return s.link && s.img; });
    if (!slots.length) return;

    var tick = function (crossfade) {
      slots.forEach(function (s) { paintHouseAd(s.link, s.img, nextHouseAd(), s.shape, crossfade); });
    };
    tick(false);                                       // primera pintura, sin difuminado
    if (slots.length < 2 && houseAds.length < 2) return; // nada que rotar con una sola campaña

    var timer = null;
    var start = function () {
      if (timer || document.hidden) return;
      timer = setInterval(function () { tick(true); }, cfg.rotateMs || 9000);
    };
    var stop = function () { clearInterval(timer); timer = null; };
    start();
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });
  }

  /* Aviso pequeño en la esquina: aparece pasado un rato y se recuerda cerrado. */
  function initCornerAd() {
    var box = $("#ad-corner"), btn = $("#ad-corner-close");
    if (!box || !btn) return;
    if (sessionStorage.getItem("qr3d.corner") === "off") return;
    setTimeout(function () {
      paintHouseAd($("#ad-corner-link"), $("#ad-corner-img"), nextHouseAd(), "tall", false);
      box.hidden = false;
    }, cfg.cornerDelayMs || 14000);
    btn.addEventListener("click", function () {
      box.hidden = true;
      try { sessionStorage.setItem("qr3d.corner", "off"); } catch (e) {}
    });
  }

  /* Ventana emergente TRAS la descarga: nunca antes, para no bloquear el archivo. */
  function initDownloadAd() {
    var dlg = $("#ad-modal");
    if (!dlg || typeof dlg.showModal !== "function") return;
    var last = 0;
    var close = function () { if (dlg.open) dlg.close(); };

    document.addEventListener("qr3d:descargado", function () {
      var now = Date.now();
      if (now - last < (cfg.modalCooldownMs || 45000)) return;
      last = now;
      paintHouseAd($("#ad-modal-link"), $("#ad-modal-img"), nextHouseAd(), "square", false);
      setTimeout(function () {
        if (!dlg.open) { try { dlg.showModal(); } catch (e) {} }
      }, cfg.modalDelayMs || 350);
    });

    $("#ad-modal-x").addEventListener("click", close);
    $("#ad-modal-close").addEventListener("click", close);
    dlg.addEventListener("click", function (e) {
      // clic en el fondo oscuro = cerrar
      var r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
    });
  }

  /* Año y versión visibles en el pie, sin tocar el contenido indexable. */
  function initFooter() {
    var el = document.querySelector(".footer-note");
    if (el && data.name) el.setAttribute("data-brand", data.name);
  }

  function boot() {
    safe(initHouseAdsRotate, "initHouseAdsRotate");
    safe(initCornerAd, "initCornerAd");
    safe(initDownloadAd, "initDownloadAd");
    safe(initFooter, "initFooter");
    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
