/* =============================================================
   QRito — motor de la herramienta
   Genera el QR (2D), construye el objeto imprimible y lo exporta
   a 3MF (dos colores dentro del archivo) y a STL.
   Todo ocurre en el navegador: nada se sube a ningún servidor.
   ============================================================= */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function safe(fn, name) { try { return fn(); } catch (e) { console.warn("[" + name + "]", e); } }

  /* ---------------- constantes de impresión ---------------- */
  var RELIEF_H = 1.2;      // altura del relieve en mm
  var SINK = 0.15;         // cuánto se hunde el relieve en la base (suelda sin juntas)
  var GROW = 0.01;         // crecimiento lateral para que el laminador funda cajas contiguas
  var TILT = 65 * Math.PI / 180;  // inclinación del soporte de mesa
  var MIN_MODULE_MM = 1.5;

  var STYLES = {
    clasico:    { dots: "square",         corners: "square",         cornerDot: "square" },
    redondeado: { dots: "rounded",        corners: "extra-rounded",  cornerDot: "dot" },
    puntos:     { dots: "dots",           corners: "dot",            cornerDot: "dot" },
    elegante:   { dots: "classy-rounded", corners: "extra-rounded",  cornerDot: "square" }
  };

  var state = {
    mode: "link",
    url: "https://qrito.fun",
    ssid: "", pass: "", sec: "WPA", hidden: false,
    style: "clasico",
    colorCode: "#1b1b22",
    colorBase: "#f2f1ec",
    transparent: false,
    center: null,          // { kind:"emoji"|"logo", label, src, sil }
    format: "soporte",
    size: 70,
    text: "",
    modules: 0
  };

  /* ---------------- contenido del código ---------------- */
  function normalizeUrl(s) {
    var t = String(s || "").trim();
    if (!t) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.indexOf("//") === 0) return t;
    if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(t)) return "https://" + t;
    return t;
  }
  function wifiEscape(s) { return String(s || "").replace(/([\\;,:"])/g, "\\$1"); }

  function payload() {
    if (state.mode === "wifi") {
      if (!state.ssid) return "WIFI:T:WPA;S:MiRedWifi;P:contrasena;;";
      var t = state.sec === "nopass" ? "nopass" : state.sec;
      var out = "WIFI:T:" + t + ";S:" + wifiEscape(state.ssid) + ";";
      if (state.sec !== "nopass") out += "P:" + wifiEscape(state.pass) + ";";
      if (state.hidden) out += "H:true;";
      return out + ";";
    }
    return normalizeUrl(state.url) || "https://qrito.fun";
  }

  function fileSlug() {
    var p = payload();
    if (state.mode === "wifi") return "qr-wifi-" + (state.ssid || "red").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    var host = "";
    try { host = new URL(p).hostname.replace(/^www\./, ""); } catch (e) { host = ""; }
    var s = (host || p).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
    return "qr-" + (s || "codigo");
  }

  /* ---------------- color ---------------- */
  function hex2rgb(h) {
    var s = String(h || "#000000").replace("#", "");
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0];
  }
  function relLum(hex) {
    var c = hex2rgb(hex).map(function (v) {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrastRatio(a, b) {
    var la = relLum(a), lb = relLum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function hex8(h) {
    var r = hex2rgb(h);
    return "#" + r.map(function (v) { return ("0" + v.toString(16)).slice(-2); }).join("").toUpperCase() + "FF";
  }

  /* ---------------- QR 2D ---------------- */
  var qrInst = null;
  var holder = null;

  function qrOptions(px, type) {
    var st = STYLES[state.style] || STYLES.clasico;
    var hasCenter = !!(state.center && state.center.src);
    var o = {
      width: px, height: px, type: type || "canvas",
      data: payload(),
      margin: Math.round(px * 0.04),
      qrOptions: { errorCorrectionLevel: hasCenter ? "H" : "M" },
      imageOptions: { crossOrigin: "anonymous", margin: 1, imageSize: 0.3, hideBackgroundDots: true },
      dotsOptions: { type: st.dots, color: state.colorCode },
      cornersSquareOptions: { type: st.corners, color: state.colorCode },
      cornersDotOptions: { type: st.cornerDot, color: state.colorCode },
      backgroundOptions: { color: state.transparent ? "rgba(0,0,0,0)" : state.colorBase },
      image: hasCenter ? state.center.src : ""     // "" limpia una imagen anterior en update()
    };
    return o;
  }

  function readModules() {
    try {
      if (qrInst && qrInst._qr && typeof qrInst._qr.getModuleCount === "function") {
        var n = qrInst._qr.getModuleCount();
        if (n > 0) state.modules = n;
      }
    } catch (e) { /* sin datos todavía */ }
    return state.modules;
  }

  function renderQR() {
    if (typeof QRCodeStyling === "undefined" || !holder) return;
    var opts = qrOptions(600, "canvas");
    if (!qrInst) {
      qrInst = new QRCodeStyling(opts);
      holder.innerHTML = "";
      qrInst.append(holder);
    } else {
      qrInst.update(opts);
    }
    readModules();
  }

  /* ---------------- centro: emoji, logo y silueta ---------------- */
  function emojiToDataUrl(ch) {
    var S = 256, c = document.createElement("canvas");
    c.width = c.height = S;
    var g = c.getContext("2d");
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = Math.round(S * 0.76) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
    g.fillText(ch, S / 2, S / 2 + S * 0.03);
    return c.toDataURL("image/png");
  }

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error("imagen no válida")); };
      im.src = src;
    });
  }

  // El relieve se imprime en UN color: convertimos el logo en silueta.
  function toSilhouette(src) {
    return loadImage(src).then(function (im) {
      var S = 256, c = document.createElement("canvas");
      c.width = c.height = S;
      var g = c.getContext("2d");
      var w = im.naturalWidth || im.width || S, h = im.naturalHeight || im.height || S;
      var k = Math.min(S / w, S / h);
      g.drawImage(im, (S - w * k) / 2, (S - h * k) / 2, w * k, h * k);
      var d = g.getImageData(0, 0, S, S), p = d.data;
      var transparent = 0, i;
      for (i = 3; i < p.length; i += 4) if (p[i] < 16) transparent++;
      var useAlpha = transparent > (S * S) * 0.04;
      var out = g.createImageData(S, S), q = out.data;
      for (i = 0; i < p.length; i += 4) {
        var on;
        if (useAlpha) on = p[i + 3] > 96;
        else on = (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) < 145;
        q[i] = q[i + 1] = q[i + 2] = 0;
        q[i + 3] = on ? 255 : 0;
      }
      g.putImageData(out, 0, 0);
      return c.toDataURL("image/png");
    });
  }

  /* ---------------- máscara estilizada (la verdad del relieve) ---------------- */
  function blobToPixels(blob) {
    var url = URL.createObjectURL(blob);
    return loadImage(url).then(function (im) {
      var w = im.naturalWidth, h = im.naturalHeight;
      var c = document.createElement("canvas");
      c.width = w; c.height = h;
      var g = c.getContext("2d");
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
      g.drawImage(im, 0, 0);
      var d = g.getImageData(0, 0, w, h).data;
      URL.revokeObjectURL(url);
      var on = new Uint8Array(w * h);
      for (var i = 0, p = 0; i < on.length; i++, p += 4) {
        var lum = 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2];
        on[i] = lum < 128 ? 1 : 0;
      }
      return cropToInk({ on: on, cols: w, rows: h });
    }, function (e) { URL.revokeObjectURL(url); throw e; });
  }

  // Los tres patrones de esquina tocan los bordes del código, así que el
  // recuadro de píxeles oscuros ES el código exacto: recortando ahí, la
  // escala en mm sale bien aunque la librería deje algún píxel de sobra.
  function cropToInk(m) {
    var x0 = m.cols, y0 = m.rows, x1 = -1, y1 = -1, x, y;
    for (y = 0; y < m.rows; y++) {
      for (x = 0; x < m.cols; x++) {
        if (!m.on[y * m.cols + x]) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < x0 || y1 < y0) return m;
    var w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w === m.cols && h === m.rows) return m;
    var out = new Uint8Array(w * h);
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) out[y * w + x] = m.on[(y + y0) * m.cols + (x + x0)];
    }
    return { on: out, cols: w, rows: h };
  }

  function styledMask() {
    var n = readModules() || 33;
    var k = n <= 64 ? 8 : (n <= 104 ? 6 : 4);
    var px = n * k;
    var o = qrOptions(px, "canvas");
    o.margin = 0;
    o.dotsOptions.color = "#000000";
    o.cornersSquareOptions.color = "#000000";
    o.cornersDotOptions.color = "#000000";
    o.backgroundOptions = { color: "#ffffff" };
    o.image = (state.center && state.center.sil) || "";   // el relieve va en un color: silueta
    var inst = new QRCodeStyling(o);
    return inst.getRawData("png").then(blobToPixels);
  }

  /* ---------------- rectángulos máximos (menos cajas = archivo sano) ---------------- */
  function gridRects(on, cols, rows) {
    var used = new Uint8Array(cols * rows), out = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var i = r * cols + c;
        if (used[i] || !on[i]) continue;
        var w = 1;
        while (c + w < cols && !used[i + w] && on[i + w]) w++;
        var h = 1;
        grow: while (r + h < rows) {
          var base = (r + h) * cols + c;
          for (var k = 0; k < w; k++) if (used[base + k] || !on[base + k]) break grow;
          h++;
        }
        for (var rr = r; rr < r + h; rr++) {
          var b2 = rr * cols + c;
          for (var cc = 0; cc < w; cc++) used[b2 + cc] = 1;
        }
        out.push({ c: c, r: r, w: w, h: h });
      }
    }
    return out;
  }

  /* ---------------- malla ---------------- */
  function Mesh() { this.v = []; this.t = []; this.map = Object.create(null); }
  Mesh.prototype.vert = function (x, y, z) {
    var k = Math.round(x * 1000) + "_" + Math.round(y * 1000) + "_" + Math.round(z * 1000);
    var i = this.map[k];
    if (i === undefined) { i = this.v.length / 3; this.v.push(x, y, z); this.map[k] = i; }
    return i;
  };
  Mesh.prototype.tri = function (a, b, c) {
    if (a === b || b === c || a === c) return;
    this.t.push(a, b, c);
  };
  Mesh.prototype.quad = function (p0, p1, p2, p3) {
    var a = this.vert(p0[0], p0[1], p0[2]), b = this.vert(p1[0], p1[1], p1[2]);
    var c = this.vert(p2[0], p2[1], p2[2]), d = this.vert(p3[0], p3[1], p3[2]);
    this.tri(a, b, c); this.tri(a, c, d);
  };
  Mesh.prototype.box = function (x0, y0, z0, x1, y1, z1) {
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);   // arriba
    this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]);   // abajo
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);   // frente
    this.quad([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]);   // fondo
    this.quad([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]);   // izquierda
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);   // derecha
  };
  // Prisma a partir de un polígono en el plano YZ (sentido antihorario visto desde +X)
  Mesh.prototype.prism = function (poly, x0, x1) {
    var self = this, n = poly.length, i;
    var right = poly.map(function (p) { return self.vert(x1, p[0], p[1]); });
    var left = poly.map(function (p) { return self.vert(x0, p[0], p[1]); });
    for (i = 1; i < n - 1; i++) { this.tri(right[0], right[i], right[i + 1]); }
    for (i = 1; i < n - 1; i++) { this.tri(left[0], left[i + 1], left[i]); }
    for (i = 0; i < n; i++) {
      var j = (i + 1) % n;
      this.tri(right[i], left[i], left[j]);
      this.tri(right[i], left[j], right[j]);
    }
  };
  Mesh.prototype.transform = function (fn) {
    for (var i = 0; i < this.v.length; i += 3) {
      var p = fn(this.v[i], this.v[i + 1], this.v[i + 2]);
      this.v[i] = p[0]; this.v[i + 1] = p[1]; this.v[i + 2] = p[2];
    }
    this.map = Object.create(null);   // las claves ya no valen tras mover
  };
  Mesh.prototype.bounds = function () {
    var b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (var i = 0; i < this.v.length; i += 3) {
      for (var k = 0; k < 3; k++) {
        if (this.v[i + k] < b[k]) b[k] = this.v[i + k];
        if (this.v[i + k] > b[k + 3]) b[k + 3] = this.v[i + k];
      }
    }
    return b;
  };

  function extrudeRects(mesh, rects, cell, ox, topY, z0, z1, grow) {
    var g = grow || 0;
    for (var i = 0; i < rects.length; i++) {
      var R = rects[i];
      mesh.box(
        ox + R.c * cell - g, topY - (R.r + R.h) * cell - g, z0,
        ox + (R.c + R.w) * cell + g, topY - R.r * cell + g, z1
      );
    }
  }

  /* ---------------- máscaras 2D auxiliares ---------------- */
  function roundRectPath(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  function alphaMask(canvas) {
    var g = canvas.getContext("2d");
    var d = g.getImageData(0, 0, canvas.width, canvas.height).data;
    var on = new Uint8Array(canvas.width * canvas.height);
    for (var i = 0, p = 3; i < on.length; i++, p += 4) on[i] = d[p] > 120 ? 1 : 0;
    return { on: on, cols: canvas.width, rows: canvas.height };
  }

  function plateMask(L, cell) {
    var cols = Math.max(2, Math.round(L.W / cell)), rows = Math.max(2, Math.round(L.H / cell));
    var c = document.createElement("canvas");
    c.width = cols; c.height = rows;
    var g = c.getContext("2d");
    g.fillStyle = "#000";
    roundRectPath(g, 0, 0, cols, rows, L.radius / cell);
    g.fill();
    g.globalCompositeOperation = "destination-out";
    for (var i = 0; i < L.holes.length; i++) {
      var hl = L.holes[i];
      g.beginPath();
      g.arc(hl.x / cell, (L.H - hl.y) / cell, hl.r / cell, 0, Math.PI * 2);
      g.fill();
    }
    return alphaMask(c);
  }

  function slabMask(w, d, radius, cell) {
    var cols = Math.max(2, Math.round(w / cell)), rows = Math.max(2, Math.round(d / cell));
    var c = document.createElement("canvas");
    c.width = cols; c.height = rows;
    var g = c.getContext("2d");
    g.fillStyle = "#000";
    roundRectPath(g, 0, 0, cols, rows, radius / cell);
    g.fill();
    return alphaMask(c);
  }

  function textMask(str, wmm, hmm) {
    var ppm = 14;
    var W = Math.max(8, Math.round(wmm * ppm)), H = Math.max(8, Math.round(hmm * ppm));
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var g = c.getContext("2d");
    var fam = '"Inter","Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",-apple-system,"Segoe UI",system-ui,sans-serif';
    var size = Math.round(H * 0.72);
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "700 " + size + "px " + fam;
    while (size > 8 && g.measureText(str).width > W * 0.94) {
      size -= 1;
      g.font = "700 " + size + "px " + fam;
    }
    g.fillStyle = "#000";
    g.fillText(str, W / 2, H / 2);
    return alphaMask(c);
  }

  /* ---------------- distribución de la pieza ---------------- */
  function layout() {
    var S = state.size, fmt = state.format;
    var txt = state.text.trim();
    var pad = Math.max(3, S * 0.055);
    var textH = txt ? Math.max(5, S * 0.105) : 0;
    var gap = txt ? Math.max(1.5, S * 0.022) : 0;
    var topZone = 0;
    if (fmt === "llavero") topZone = Math.max(9, S * 0.15);
    if (fmt === "placa") topZone = Math.max(9, S * 0.12);
    var q = S - 2 * pad;
    var H = pad + textH + gap + q + topZone + pad;
    var L = {
      W: S, H: H, pad: pad,
      qr: { x: pad, y: pad + textH + gap, s: q },
      text: txt ? { x: pad, y: pad * 0.75, w: q, h: textH, str: txt } : null,
      radius: Math.min(S, H) * 0.05 + 2,
      holes: [],
      thickness: fmt === "llavero" ? 3.0 : (fmt === "placa" ? 3.2 : 3.4)
    };
    if (fmt === "llavero") {
      L.holes.push({ x: S / 2, y: H - topZone / 2, r: Math.max(2, S * 0.035) });
    } else if (fmt === "placa") {
      var r = Math.max(2, S * 0.026), inset = Math.max(7, S * 0.1);
      L.holes.push({ x: inset, y: H - topZone / 2, r: r }, { x: S - inset, y: H - topZone / 2, r: r });
    }
    return L;
  }

  /* ---------------- construcción del modelo ---------------- */
  function buildModel(mask) {
    var L = layout();
    var base = new Mesh(), relief = new Mesh();
    var T = L.thickness;

    // 1. placa (o cara frontal del soporte)
    var plateCell = Math.max(0.18, Math.min(L.W, L.H) / 420);
    var pm = plateMask(L, plateCell);
    extrudeRects(base, gridRects(pm.on, pm.cols, pm.rows), plateCell, 0, L.H, 0, T, 0);

    // 2. relieve del código, a partir de la máscara estilizada real
    var qcell = L.qr.s / mask.cols;
    extrudeRects(relief, gridRects(mask.on, mask.cols, mask.rows), qcell,
                 L.qr.x, L.qr.y + L.qr.s, T - SINK, T + RELIEF_H, GROW);

    // 3. relieve del texto
    if (L.text) {
      var tm = textMask(L.text.str, L.text.w, L.text.h);
      var tcell = L.text.w / tm.cols;
      extrudeRects(relief, gridRects(tm.on, tm.cols, tm.rows), tcell,
                   L.text.x, L.text.y + L.text.h, T - SINK, T + RELIEF_H, GROW);
    }

    // 4. el soporte de mesa: inclinamos la placa y le añadimos peana y nervios
    if (state.format === "soporte") {
      var cos = Math.cos(TILT), sin = Math.sin(TILT);
      var slabT = 4;
      var frontGap = 5;
      var yOff = frontGap + (T + RELIEF_H) * sin;
      var zOff = slabT - 1.2;
      var tilt = function (x, y, z) {
        return [x, yOff + y * cos - z * sin, zOff + y * sin + z * cos];
      };
      base.transform(tilt);
      relief.transform(tilt);

      var yB = L.H * 0.5;
      var depth = yOff + yB * cos + 9;
      var sm = slabMask(L.W, depth, Math.min(L.W, depth) * 0.06 + 2, 0.25);
      extrudeRects(base, gridRects(sm.on, sm.cols, sm.rows), 0.25, 0, depth, 0, slabT, 0);

      // nervios traseros: triángulo pegado a la cara trasera de la placa
      var yA = Math.max(0.6, (slabT - zOff) / sin);
      var pA = [yOff + yA * cos, zOff + yA * sin];
      var pB = [yOff + yB * cos, zOff + yB * sin];
      var poly = [[pA[0], slabT - 0.8], [pB[0], slabT - 0.8], [pB[0], pB[1]], [pA[0], pA[1]]];
      var rw = Math.max(4, L.W * 0.06);
      [L.W * 0.24, L.W * 0.76].forEach(function (cx) {
        base.prism(poly, cx - rw / 2, cx + rw / 2);
      });
      L.depth = depth;
    } else {
      L.depth = T + RELIEF_H;
    }

    // 5. todo al octante positivo (los laminadores colocan desde el origen)
    var b1 = base.bounds(), b2 = relief.bounds();
    var mx = Math.min(b1[0], b2[0]), my = Math.min(b1[1], b2[1]), mz = Math.min(b1[2], b2[2]);
    var shift = function (x, y, z) { return [x - mx, y - my, z - mz]; };
    base.transform(shift); relief.transform(shift);

    var bb1 = base.bounds(), bb2 = relief.bounds();
    var dims = {
      x: Math.max(bb1[3], bb2[3]),
      y: Math.max(bb1[4], bb2[4]),
      z: Math.max(bb1[5], bb2[5])
    };
    return { base: base, relief: relief, layout: L, dims: dims, mmPerModule: L.qr.s / (state.modules || 1) };
  }

  /* ---------------- exportar 3MF (zip de XML, colores incluidos) ---------------- */
  function num(v) {
    var s = v.toFixed(3);
    return s.replace(/\.?0+$/, "") || "0";
  }
  function meshXML(m) {
    var out = ["<mesh><vertices>"];
    for (var i = 0; i < m.v.length; i += 3) {
      out.push('<vertex x="' + num(m.v[i]) + '" y="' + num(m.v[i + 1]) + '" z="' + num(m.v[i + 2]) + '"/>');
    }
    out.push("</vertices><triangles>");
    for (var j = 0; j < m.t.length; j += 3) {
      out.push('<triangle v1="' + m.t[j] + '" v2="' + m.t[j + 1] + '" v3="' + m.t[j + 2] + '"/>');
    }
    out.push("</triangles></mesh>");
    return out.join("");
  }

  function build3MF(model) {
    if (typeof JSZip === "undefined") throw new Error("falta el empaquetador");
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<model unit="millimeter" xml:lang="es-ES" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n' +
      '<metadata name="Application">QRito</metadata>\n' +
      '<metadata name="Title">' + (state.text.trim() ? escXML(state.text.trim()) : "Codigo QR 3D") + '</metadata>\n' +
      '<resources>\n' +
      '<basematerials id="1">' +
      '<base name="Base" displaycolor="' + hex8(state.colorBase) + '"/>' +
      '<base name="Codigo" displaycolor="' + hex8(state.colorCode) + '"/>' +
      '</basematerials>\n' +
      '<object id="2" type="model" pid="1" pindex="0" name="Base">' + meshXML(model.base) + '</object>\n' +
      '<object id="3" type="model" pid="1" pindex="1" name="Codigo QR">' + meshXML(model.relief) + '</object>\n' +
      '</resources>\n' +
      '<build><item objectid="2"/><item objectid="3"/></build>\n' +
      '</model>\n';

    var zip = new JSZip();
    zip.file("[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
      '</Types>');
    zip.folder("_rels").file(".rels",
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/>' +
      '</Relationships>');
    zip.folder("3D").file("3dmodel.model", xml);
    return zip.generateAsync({ type: "blob", mimeType: "model/3mf", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  function escXML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c];
    });
  }

  /* ---------------- exportar STL binario ---------------- */
  function buildSTL(m) {
    var nt = m.t.length / 3;
    var buf = new ArrayBuffer(84 + nt * 50);
    var dv = new DataView(buf);
    dv.setUint32(80, nt, true);
    var o = 84;
    for (var i = 0; i < m.t.length; i += 3) {
      var a = m.t[i] * 3, b = m.t[i + 1] * 3, c = m.t[i + 2] * 3;
      var ax = m.v[a], ay = m.v[a + 1], az = m.v[a + 2];
      var bx = m.v[b], by = m.v[b + 1], bz = m.v[b + 2];
      var cx = m.v[c], cy = m.v[c + 1], cz = m.v[c + 2];
      var ux = bx - ax, uy = by - ay, uz = bz - az;
      var vx = cx - ax, vy = cy - ay, vz = cz - az;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      dv.setFloat32(o, nx / len, true); dv.setFloat32(o + 4, ny / len, true); dv.setFloat32(o + 8, nz / len, true);
      dv.setFloat32(o + 12, ax, true); dv.setFloat32(o + 16, ay, true); dv.setFloat32(o + 20, az, true);
      dv.setFloat32(o + 24, bx, true); dv.setFloat32(o + 28, by, true); dv.setFloat32(o + 32, bz, true);
      dv.setFloat32(o + 36, cx, true); dv.setFloat32(o + 40, cy, true); dv.setFloat32(o + 44, cz, true);
      dv.setUint16(o + 48, 0, true);
      o += 50;
    }
    return new Blob([buf], { type: "model/stl" });
  }

  /* ---------------- vista 3D (motor pesado, carga perezosa) ---------------- */
  var V = {
    ready: false, loading: false, failed: false,
    THREE: null, renderer: null, scene: null, camera: null, controls: null,
    group: null, baseMesh: null, reliefMesh: null,
    visible: false, raf: null, lastFit: ""
  };

  function hasWebGL() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }

  function viewerMsg(text) {
    var el = $("#viewer-msg");
    if (!el) return;
    if (text) { el.hidden = false; el.textContent = text; }
    else el.hidden = true;
  }

  function startLoop() {
    if (V.raf || !V.ready) return;
    var tick = function () {
      if (!V.visible || document.hidden) { V.raf = null; return; }
      V.raf = requestAnimationFrame(tick);
      if (V.controls) V.controls.update();
      V.renderer.render(V.scene, V.camera);
    };
    V.raf = requestAnimationFrame(tick);
  }
  function stopLoop() {
    if (V.raf) { cancelAnimationFrame(V.raf); V.raf = null; }
  }

  function initViewer() {
    if (V.ready || V.loading || V.failed) return Promise.resolve();
    var box = $("#viewer");
    if (!box) return Promise.resolve();
    if (!hasWebGL()) {
      V.failed = true;
      viewerMsg("Tu navegador no puede mostrar la vista 3D, pero las descargas (PNG, SVG, 3MF y STL) funcionan igual.");
      return Promise.resolve();
    }
    V.loading = true;
    viewerMsg("Cargando la vista 3D…");
    return Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js")
    ]).then(function (mods) {
      var THREE = mods[0], OrbitControls = mods[1].OrbitControls;
      V.THREE = THREE;
      var w = box.clientWidth || 320, h = box.clientHeight || 240;
      V.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      V.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      V.renderer.setSize(w, h, false);
      box.appendChild(V.renderer.domElement);

      V.scene = new THREE.Scene();
      V.camera = new THREE.PerspectiveCamera(35, w / h, 1, 2000);
      V.camera.position.set(0, -120, 90);

      V.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0b5, 2.1));
      var key = new THREE.DirectionalLight(0xffffff, 1.9);
      key.position.set(-60, -110, 130);
      V.scene.add(key);
      var fill = new THREE.DirectionalLight(0xffffff, 0.7);
      fill.position.set(80, 60, 40);
      V.scene.add(fill);

      V.group = new THREE.Group();
      V.scene.add(V.group);

      V.controls = new OrbitControls(V.camera, V.renderer.domElement);
      V.controls.enableDamping = true;
      V.controls.dampingFactor = 0.09;
      V.controls.enablePan = false;
      V.controls.minDistance = 40;
      V.controls.maxDistance = 700;

      V.ready = true; V.loading = false;
      viewerMsg("");
      window.addEventListener("resize", resizeViewer);
      if (lastModel) applyModel(lastModel);
      startLoop();
    }).catch(function (e) {
      console.warn("[viewer]", e);
      V.loading = false; V.failed = true;
      viewerMsg("No se pudo cargar la vista 3D. Las descargas siguen funcionando con normalidad.");
    });
  }

  function resizeViewer() {
    if (!V.ready) return;
    var box = $("#viewer");
    var w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    V.renderer.setSize(w, h, false);
    V.camera.aspect = w / h;
    V.camera.updateProjectionMatrix();
    startLoop();
  }

  function meshToGeometry(THREE, m) {
    var pos = new Float32Array(m.t.length * 3);
    for (var i = 0; i < m.t.length; i++) {
      var v = m.t[i] * 3;
      pos[i * 3] = m.v[v]; pos[i * 3 + 1] = m.v[v + 1]; pos[i * 3 + 2] = m.v[v + 2];
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();      // sin índices => sombreado plano, aristas limpias
    return g;
  }

  function applyModel(model) {
    if (!V.ready) return;
    var THREE = V.THREE;
    while (V.group.children.length) {
      var c = V.group.children.pop();
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    var matBase = new THREE.MeshStandardMaterial({ color: new THREE.Color(state.colorBase), roughness: 0.72, metalness: 0.02 });
    var matCode = new THREE.MeshStandardMaterial({ color: new THREE.Color(state.colorCode), roughness: 0.62, metalness: 0.02 });
    V.group.add(new THREE.Mesh(meshToGeometry(THREE, model.base), matBase));
    V.group.add(new THREE.Mesh(meshToGeometry(THREE, model.relief), matCode));

    var d = model.dims;
    V.group.position.set(-d.x / 2, -d.y / 2, -d.z / 2);

    // las piezas planas se ven de frente; el soporte, apoyado
    var flat = state.format !== "soporte";
    V.group.rotation.x = flat ? Math.PI / 2 : 0;

    var fitKey = state.format + "|" + Math.round(state.size) + "|" + (state.text.trim() ? 1 : 0);
    if (fitKey !== V.lastFit) {
      V.lastFit = fitKey;
      var radius = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z) / 2;
      var dist = radius / Math.sin((V.camera.fov * Math.PI / 180) / 2) * 1.15;
      if (flat) V.camera.position.set(0, -dist * 0.35, dist * 0.94);
      else V.camera.position.set(0, -dist * 0.86, dist * 0.5);
      V.camera.updateProjectionMatrix();
      V.controls.target.set(0, 0, 0);
      V.controls.update();
    }
    startLoop();
  }

  /* ---------------- avisos de impresión ---------------- */
  function updateSpecs(model) {
    var n = state.modules || 0;
    var mm = model ? model.mmPerModule : 0;
    var warn = [];
    var fmt1 = function (v) { return v.toFixed(2).replace(".", ","); };

    $("#sp-modules").textContent = n ? (n + " × " + n) : "—";
    var mmEl = $("#sp-mm");
    mmEl.textContent = mm ? (fmt1(mm) + " mm") : "—";
    mmEl.classList.toggle("is-bad", !!mm && mm < MIN_MODULE_MM);
    $("#sp-dims").textContent = model
      ? (Math.round(model.dims.x) + " × " + Math.round(model.dims.y) + " × " + Math.round(model.dims.z) + " mm")
      : "—";

    var cr = contrastRatio(state.colorCode, state.colorBase);
    if (cr < 3) {
      warn.push(["is-error", "⚠️", "Los dos colores se parecen demasiado (contraste " + cr.toFixed(1) + ":1): el código no se podrá escanear. Elige una base clara y un código oscuro."]);
    } else if (cr < 4.5) {
      warn.push(["", "⚠️", "El contraste entre los dos colores es justo (" + cr.toFixed(1) + ":1). Funcionará mejor con más diferencia."]);
    }
    if (relLum(state.colorCode) > relLum(state.colorBase)) {
      warn.push(["", "🔄", "Has elegido el código más claro que la base (QR invertido). La mayoría de los móviles lo leen, pero algunos antiguos no."]);
    }
    if (mm && mm < MIN_MODULE_MM) {
      warn.push(["is-error", "📏", "Cada módulo mide " + fmt1(mm) + " mm y por debajo de 1,5 mm la boquilla redondea los bordes. Agranda la pieza o usa un enlace más corto."]);
    } else if (mm && mm < 1.8) {
      warn.push(["", "📏", "Los módulos quedan pequeños (" + fmt1(mm) + " mm). Imprime una unidad de prueba antes de hacer una tirada."]);
    }
    if (state.center) {
      warn.push(["", "🎯", "Con logo o emoji en el centro subimos la corrección de errores al máximo, pero escanea una prueba antes de imprimir muchas unidades."]);
    }
    if (!warn.length && mm) {
      warn.push(["is-ok", "✅", "Todo correcto: contraste " + cr.toFixed(1) + ":1 y módulos de " + fmt1(mm) + " mm. Listo para imprimir."]);
    }

    $("#warnings").innerHTML = warn.map(function (w) {
      return '<p class="warn-item ' + w[0] + '"><span aria-hidden="true">' + w[1] + '</span><span>' + w[2] + "</span></p>";
    }).join("");
  }

  /* ---------------- orquestación ---------------- */
  var lastModel = null, gen = 0, rebuildTimer = null, pending = null;

  function rebuild() {
    var my = ++gen;
    pending = styledMask().then(function (mask) {
      if (my !== gen) return lastModel;
      var model = buildModel(mask);
      if (my !== gen) return lastModel;
      lastModel = model;
      safe(function () { updateSpecs(model); }, "updateSpecs");
      safe(function () { applyModel(model); }, "applyModel");
      return model;
    }).catch(function (e) {
      console.warn("[rebuild]", e);
      return lastModel;
    });
    return pending;
  }

  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(function () { safe(rebuild, "rebuild"); }, 190);
  }

  function refresh() {
    safe(renderQR, "renderQR");
    safe(updateSwatches, "swatches");
    scheduleRebuild();
  }

  function updateSwatches() {
    var a = $("#sw-base"), b = $("#sw-code");
    if (a) a.style.background = state.colorBase;
    if (b) b.style.background = state.colorCode;
    var out1 = $("#out-color-code"), out2 = $("#out-color-base");
    if (out1) out1.textContent = state.colorCode.toUpperCase();
    if (out2) out2.textContent = state.colorBase.toUpperCase();
  }

  function modelReady() {
    if (pending) return pending.then(function (m) { return m || rebuild(); });
    return rebuild();
  }

  /* ---------------- descargas ---------------- */
  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    document.dispatchEvent(new CustomEvent("qr3d:descargado", { detail: { name: name } }));
  }

  function downloadImage(ext) {
    var opts = qrOptions(1200, ext === "svg" ? "svg" : "canvas");
    var inst = new QRCodeStyling(opts);
    return inst.getRawData(ext).then(function (blob) {
      saveBlob(blob, fileSlug() + "." + ext);
    });
  }

  function download3MF() {
    return modelReady().then(function (model) {
      if (!model) throw new Error("modelo no disponible");
      return build3MF(model);
    }).then(function (blob) {
      saveBlob(blob, fileSlug() + "-" + state.format + ".3mf");
    });
  }

  function downloadSTL() {
    return modelReady().then(function (model) {
      if (!model) throw new Error("modelo no disponible");
      var zip = new JSZip();
      zip.file("1-base.stl", buildSTL(model.base));
      zip.file("2-codigo-qr.stl", buildSTL(model.relief));
      zip.file("LEEME.txt",
        "QRito — piezas en STL\r\n\r\n" +
        "El formato STL no guarda colores, por eso van dos archivos.\r\n\r\n" +
        "1. Importa los DOS archivos en el programa de tu impresora.\r\n" +
        "2. Colócalos ambos en la posición 0,0 (sin mover nada): ya encajan.\r\n" +
        "3. Asigna un filamento a cada pieza:\r\n" +
        "   - 1-base.stl      -> color " + state.colorBase + "\r\n" +
        "   - 2-codigo-qr.stl -> color " + state.colorCode + "\r\n\r\n" +
        "Si tu impresora es de un solo color, programa una pausa al llegar\r\n" +
        "a la altura del relieve y cambia la bobina.\r\n\r\n" +
        "Consejo: si puedes, usa el archivo .3mf en lugar de estos STL;\r\n" +
        "lleva los colores dentro y no hay que colocar nada a mano.\r\n");
      return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    }).then(function (blob) {
      saveBlob(blob, fileSlug() + "-" + state.format + "-stl.zip");
    });
  }

  function withBusy(btn, fn) {
    var old = btn.getAttribute("data-old") || btn.innerHTML;
    btn.setAttribute("data-old", old);
    btn.disabled = true;
    return Promise.resolve().then(fn).catch(function (e) {
      console.warn("[descarga]", e);
      alert("No se ha podido generar el archivo. Prueba a cambiar algún ajuste y vuelve a intentarlo.");
    }).then(function () {
      btn.disabled = false;
    });
  }

  /* ---------------- conexión con la interfaz ---------------- */
  function bind() {
    holder = $("#qr-holder");

    $$(".seg-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        state.mode = b.getAttribute("data-mode");
        $$(".seg-btn").forEach(function (o) {
          var on = o === b;
          o.classList.toggle("is-active", on);
          o.setAttribute("aria-selected", on ? "true" : "false");
        });
        $$(".mode-panel").forEach(function (p) {
          p.hidden = p.getAttribute("data-panel") !== state.mode;
        });
        refresh();
      });
    });

    $("#in-url").addEventListener("input", function () { state.url = this.value; refresh(); });
    $$(".chip").forEach(function (c) {
      c.addEventListener("click", function () {
        var v = c.getAttribute("data-fill");
        var inp = $("#in-url");
        inp.value = v; state.url = v;
        inp.focus(); inp.select();
        refresh();
      });
    });
    $("#in-ssid").addEventListener("input", function () { state.ssid = this.value; refresh(); });
    $("#in-pass").addEventListener("input", function () { state.pass = this.value; refresh(); });
    $("#in-sec").addEventListener("change", function () { state.sec = this.value; refresh(); });
    $("#in-hidden").addEventListener("change", function () { state.hidden = this.checked; refresh(); });

    $$('input[name="estilo"]').forEach(function (r) {
      r.addEventListener("change", function () { if (r.checked) { state.style = r.value; refresh(); } });
    });
    $("#in-color-code").addEventListener("input", function () { state.colorCode = this.value; refresh(); });
    $("#in-color-base").addEventListener("input", function () { state.colorBase = this.value; refresh(); });
    $("#in-transparent").addEventListener("change", function () { state.transparent = this.checked; refresh(); });

    $$(".emoji").forEach(function (b) {
      b.addEventListener("click", function () {
        var ch = b.getAttribute("data-emoji");
        if (state.center && state.center.kind === "emoji" && state.center.label === ch) { clearCenter(); return; }
        var src = emojiToDataUrl(ch);
        toSilhouette(src).then(function (sil) {
          state.center = { kind: "emoji", label: ch, src: src, sil: sil };
          markCenter();
          refresh();
        });
      });
    });
    $("#in-logo").addEventListener("change", function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var src = String(fr.result);
        toSilhouette(src).then(function (sil) {
          state.center = { kind: "logo", label: f.name, src: src, sil: sil };
          markCenter();
          refresh();
        }).catch(function () {
          alert("No hemos podido leer esa imagen. Prueba con un PNG o un JPG.");
        });
      };
      fr.readAsDataURL(f);
      this.value = "";
    });
    $("#btn-clear-center").addEventListener("click", clearCenter);

    $$('input[name="formato"]').forEach(function (r) {
      r.addEventListener("change", function () {
        if (!r.checked) return;
        state.format = r.value;
        var names = { soporte: "soporte de mesa", llavero: "llavero", placa: "placa de pared" };
        $("#fmt-name").textContent = names[state.format];
        var defaults = { soporte: 70, llavero: 45, placa: 90 };
        state.size = defaults[state.format];
        $("#in-size").value = state.size;
        $("#out-size").textContent = state.size + " mm";
        scheduleRebuild();
      });
    });
    $("#in-size").addEventListener("input", function () {
      state.size = parseInt(this.value, 10) || 70;
      $("#out-size").textContent = state.size + " mm";
      scheduleRebuild();
    });
    $("#in-text").addEventListener("input", function () { state.text = this.value; scheduleRebuild(); });

    $("#dl-png").addEventListener("click", function () { withBusy(this, function () { return downloadImage("png"); }); });
    $("#dl-svg").addEventListener("click", function () { withBusy(this, function () { return downloadImage("svg"); }); });
    $("#dl-3mf").addEventListener("click", function () { withBusy(this, download3MF); });
    $("#dl-stl").addEventListener("click", function () { withBusy(this, downloadSTL); });
  }

  function markCenter() {
    $$(".emoji").forEach(function (e) {
      e.classList.toggle("is-active", !!state.center && state.center.kind === "emoji" && state.center.label === e.getAttribute("data-emoji"));
    });
    $("#btn-clear-center").hidden = !state.center;
    $("#center-state").textContent = state.center
      ? (state.center.kind === "logo" ? "Logo añadido" : "")
      : "";
  }
  function clearCenter() {
    state.center = null;
    markCenter();
    refresh();
  }

  /* ---------------- arranque perezoso de la vista 3D ---------------- */
  function armViewer() {
    var box = $("#viewer");
    if (!box) return;
    var tryInit = function () {
      // pestaña en segundo plano: sin tamaño no se puede inicializar (se reintenta)
      if (!window.innerHeight || !box.clientWidth) return false;
      V.visible = true;
      initViewer().then(startLoop);
      return true;
    };
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          V.visible = en.isIntersecting;
          if (en.isIntersecting) {
            if (tryInit()) io.disconnect();
          } else stopLoop();
        });
      }, { rootMargin: "200px", threshold: 0.01 });
      io.observe(box);
    }
    var retries = 0;
    var timer = setInterval(function () {
      if (retries++ > 40 || V.ready || V.failed) { clearInterval(timer); return; }
      if (!window.innerHeight) return;
      var r = box.getBoundingClientRect();
      if (r.top < window.innerHeight + 300 && r.bottom > -300) tryInit();
    }, 700);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { stopLoop(); return; }
      if (!V.ready && !V.failed) tryInit();
      else if (V.visible) startLoop();
    });
  }

  /* ---------------- init ---------------- */
  function boot() {
    if (typeof QRCodeStyling === "undefined") {
      var h = $("#qr-holder");
      if (h) h.innerHTML = '<p class="nojs">No se ha podido cargar el generador. Recarga la página, por favor.</p>';
      viewerMsg("No se ha podido cargar el generador de códigos QR.");
      return;
    }
    safe(bind, "bind");
    safe(updateSwatches, "swatches");
    safe(renderQR, "renderQR");
    safe(armViewer, "armViewer");
    setTimeout(function () { safe(rebuild, "rebuild"); }, 60);
  }

  // Puerta de pruebas: permite verificar el artefacto real desde la consola.
  window.__QRITO__ = {
    state: function () { return JSON.parse(JSON.stringify({ mode: state.mode, style: state.style, format: state.format, size: state.size, modules: state.modules, text: state.text, colorBase: state.colorBase, colorCode: state.colorCode })); },
    model: function () { return lastModel; },
    rebuild: rebuild,
    ready: modelReady,
    make3MF: function () { return modelReady().then(build3MF); },
    makeSTL: function () { return modelReady().then(function (m) { return buildSTL(m.relief); }); },
    set: function (patch) { Object.keys(patch).forEach(function (k) { state[k] = patch[k]; }); refresh(); return modelReady(); },
    viewer: function () {
      var colors = [], canvas = null;
      if (V.ready && V.group) {
        colors = V.group.children.map(function (m) { return "#" + m.material.color.getHexString(); });
        canvas = { w: V.renderer.domElement.width, h: V.renderer.domElement.height };
      }
      return { ready: V.ready, failed: V.failed, visible: V.visible, meshes: colors.length, colors: colors, canvas: canvas };
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
