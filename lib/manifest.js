/* Datos de marca. Único global del proyecto. */
(function () {
  "use strict";
  window.__BRAND__ = {
    name: "QRito",
    tagline: "Generador de códigos QR para imprimir en 3D",
    url: "https://qrito.fun/",
    version: "20260820",
    // Ajustes de los huecos publicitarios (los huecos van vacíos: el propietario
    // pega su código de AdSense dentro de cada .ad-slot).
    ads: {
      cornerDelayMs: 14000,      // aviso de esquina: aparece pasado un rato, no al cargar
      modalDelayMs: 350,         // ventana tras la descarga: SIEMPRE después de que empiece
      modalCooldownMs: 45000,    // no repetir la ventana en cada clic seguido
      rotateMs: 9500             // banner y bloque de contenido: cada cuánto cambian de imagen (máx. 10 s)
    },
    // Publicidad propia (temporal, mientras no hay AdSense activo).
    // Cada campaña trae 3 recortes ya pensados para encajar sin deformarse
    // en cada hueco: wide (banner), square (bloque/pop-up), tall (esquina).
    houseAds: [
      {
        id: "pickevent",
        name: "PickEvent",
        url: "https://www.pickevent.site",
        alt: "PickEvent — la memoria viva compartida: escanea el QR del evento y tus fotos aparecen al instante en la pantalla",
        wide: "assets/img/ads/pickevent-wide.webp",
        square: "assets/img/ads/pickevent-square.webp",
        tall: "assets/img/ads/pickevent-tall.webp"
      },
      {
        id: "planning",
        name: "PlanningManager",
        url: "https://www.planningmanager.app",
        alt: "PlanningManager — check-in con QR, gestión de invitados y mesas para tus eventos",
        wide: "assets/img/ads/planning-wide.webp",
        square: "assets/img/ads/planning-square.webp",
        tall: "assets/img/ads/planning-tall.webp"
      }
    ]
  };
})();
