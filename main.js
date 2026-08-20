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
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function safe(fn, name) { try { fn(); } catch (e) { console.warn("[" + name + "]", e); } }

  /* ---------- Publicidad propia (PickEvent / PlanningManager) ----------
     Cada hueco usa SOLO la forma de imagen que le encaja: el banner
     horizontal alterna las dos creatividades anchas, el bloque de
     contenido enseña los dos cuadrados a la vez (intercambiando lado) y
     la esquina alterna las verticales. Cada hueco lleva su propio
     contador en sessionStorage y avanza de UNO en uno: con 2 campañas
     eso garantiza que alterne de verdad en cada ciclo. */
  var houseAds = data.houseAds || [];

  function readCount(key, startAt) {
    var n;
    try { n = parseInt(sessionStorage.getItem(key), 10); } catch (e) { n = NaN; }
    return isNaN(n) ? (startAt || 0) : n;
  }
  function saveCount(key, n) { try { sessionStorage.setItem(key, String(n)); } catch (e) {} }

  function adAt(i, shape) {
    if (!houseAds.length) return null;
    var ad = houseAds[((i % houseAds.length) + houseAds.length) % houseAds.length];
    return { url: ad.url, alt: ad.alt, src: ad[shape] || ad.square };
  }

  function makeRotator(key, shape, startAt) {
    var n = readCount(key, startAt);
    return function () {
      var item = adAt(n, shape);
      n += 1;
      saveCount(key, n);
      return item;
    };
  }

  function paintHouseAd(link, img, item, crossfade) {
    if (!link || !img || !item) return;
    link.href = item.url;
    if (img.getAttribute("src") === item.src) return;   // ya está esa imagen puesta
    var apply = function () {
      img.src = item.src;
      img.alt = item.alt;
      img.classList.remove("is-swapping");
    };
    if (crossfade) {
      img.classList.add("is-swapping");
      setTimeout(apply, 220);
    } else {
      apply();
    }
  }

  /* Pequeño motor de rotación: arranca, pausa si la pestaña se oculta y
     reanuda al volver. Lo usan el banner/cuadrados y también la esquina. */
  function runRotation(tick) {
    tick(false);                                       // primera pintura, sin difuminado
    var timer = null;
    var start = function () {
      if (timer || document.hidden) return;
      timer = setInterval(function () { tick(true); }, cfg.rotateMs || 9500);
    };
    var stop = function () { clearInterval(timer); timer = null; };
    start();
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });
    return { stop: stop };
  }

  function initHouseAdsRotate() {
    if (houseAds.length < 2) return;
    var jobs = [];

    // Banner horizontal: solo las creatividades anchas, alternando.
    var bLink = $(".ad-leaderboard .ad-house-link"), bImg = $(".ad-leaderboard .ad-house-img");
    if (bLink && bImg) {
      var nextBanner = makeRotator("qr3d.ad.banner", "wide", 0);
      jobs.push(function (fade) { paintHouseAd(bLink, bImg, nextBanner(), fade); });
    }

    // Bloque de cuadrados: las dos campañas visibles a la vez, cambiando de lado.
    var cards = $$(".ad-square-card");
    if (cards.length) {
      var sqKey = "qr3d.ad.squares";
      var sqN = readCount(sqKey, 0);
      jobs.push(function (fade) {
        cards.forEach(function (card, i) {
          paintHouseAd(card.querySelector(".ad-house-link"), card.querySelector(".ad-house-img"), adAt(sqN + i, "square"), fade);
        });
        sqN += 1;
        saveCount(sqKey, sqN);
      });
    }

    if (!jobs.length) return;
    runRotation(function (fade) { jobs.forEach(function (j) { j(fade); }); });
  }

  /* Aviso pequeño en la esquina: aparece pasado un rato, va rotando mientras
     está visible y se recuerda cerrado durante toda la sesión. */
  function initCornerAd() {
    var box = $("#ad-corner"), btn = $("#ad-corner-close");
    if (!box || !btn) return;
    if (sessionStorage.getItem("qr3d.corner") === "off") return;
    var next = makeRotator("qr3d.ad.corner", "tall", 1);
    var link = $("#ad-corner-link"), img = $("#ad-corner-img");
    var rotation = null;

    setTimeout(function () {
      if (sessionStorage.getItem("qr3d.corner") === "off") return;
      box.hidden = false;
      rotation = runRotation(function (fade) { paintHouseAd(link, img, next(), fade); });
    }, cfg.cornerDelayMs || 14000);

    btn.addEventListener("click", function () {
      box.hidden = true;
      if (rotation) rotation.stop();
      try { sessionStorage.setItem("qr3d.corner", "off"); } catch (e) {}
    });
  }

  /* Ventana emergente TRAS la descarga: nunca antes, para no bloquear el archivo. */
  function initDownloadAd() {
    var dlg = $("#ad-modal");
    if (!dlg || typeof dlg.showModal !== "function") return;
    var last = 0;
    var nextModalAd = makeRotator("qr3d.ad.modal", "square", 1);
    var close = function () { if (dlg.open) dlg.close(); };

    document.addEventListener("qr3d:descargado", function () {
      var now = Date.now();
      if (now - last < (cfg.modalCooldownMs || 45000)) return;
      last = now;
      paintHouseAd($("#ad-modal-link"), $("#ad-modal-img"), nextModalAd(), false);
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
