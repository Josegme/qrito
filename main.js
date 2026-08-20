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
     Las 3 imágenes de cada campaña (wide/square/tall) van todas al mismo
     saco: cada hueco (banner, bloque, esquina, pop-up) tiene su PROPIO
     contador independiente guardado en sessionStorage, con un punto de
     partida distinto para que no coincidan, y cada vez que le toca pintar
     avanza su contador en +1 y toma la siguiente imagen del saco — así se
     ve cualquiera de las 6 en cualquier hueco, sin que dos avances se
     cancelen entre sí (el fallo de antes: un contador COMPARTIDO consumido
     de 2 en 2 con solo 2 campañas volvía siempre al mismo sitio). */
  var houseAds = data.houseAds || [];
  var adPool = [];
  houseAds.forEach(function (ad) {
    ["wide", "square", "tall"].forEach(function (shape) {
      if (ad[shape]) adPool.push({ url: ad.url, alt: ad.alt, src: ad[shape] });
    });
  });

  function makeAdCounter(key, startAt) {
    var n;
    try { n = parseInt(sessionStorage.getItem(key), 10); } catch (e) { n = NaN; }
    if (isNaN(n)) n = startAt;
    return function next() {
      if (!adPool.length) return null;
      var item = adPool[((n % adPool.length) + adPool.length) % adPool.length];
      n += 1;
      try { sessionStorage.setItem(key, String(n)); } catch (e) {}
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

  /* Banner bajo la herramienta + bloque de contenido: rotan solas con el tiempo,
     máximo cada `rotateMs` (10 s por defecto), y nunca muestran a la vez la
     misma imagen gracias a arrancar en puntos distintos del mismo saco. */
  function initHouseAdsRotate() {
    if (adPool.length < 2) return;
    var slots = [
      { link: $(".ad-leaderboard .ad-house-link"), img: $(".ad-leaderboard .ad-house-img"), next: makeAdCounter("qr3d.ad.leaderboard", 0) },
      { link: $(".ad-incontent .ad-house-link"), img: $(".ad-incontent .ad-house-img"), next: makeAdCounter("qr3d.ad.incontent", Math.ceil(adPool.length / 2)) }
    ].filter(function (s) { return s.link && s.img; });
    if (!slots.length) return;

    var tick = function (crossfade) {
      slots.forEach(function (s) { paintHouseAd(s.link, s.img, s.next(), crossfade); });
    };
    tick(false);                                       // primera pintura, sin difuminado

    var timer = null;
    var start = function () {
      if (timer || document.hidden) return;
      timer = setInterval(function () { tick(true); }, cfg.rotateMs || 10000);
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
    var next = makeAdCounter("qr3d.ad.corner", 1);
    setTimeout(function () {
      paintHouseAd($("#ad-corner-link"), $("#ad-corner-img"), next(), false);
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
    var nextModalAd = makeAdCounter("qr3d.ad.modal", 4);
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
