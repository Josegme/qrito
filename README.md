# QRito

Generador de códigos QR personalizables, con descarga en imagen (PNG/SVG) y en
**objeto 3D listo para imprimir**: un archivo `.3mf` con los dos colores ya
incrustados (base y código), más un `.stl` de respaldo para impresoras
antiguas. Formatos disponibles: soporte de mesa, llavero y placa de pared.

🔗 **En vivo:** [qrito.fun](https://qrito.fun)

## Qué hace

- Genera el código a partir de un enlace, texto o datos de wifi.
- Estilo personalizable (forma de los puntos y esquinas), colores, logo o
  emoji en el centro.
- Descarga como **PNG**, **SVG**, **3MF** (dos colores, para Bambu Studio,
  PrusaSlicer, Orca, Cura…) o **STL** (dos piezas + instrucciones, en zip).
- Vista previa 3D interactiva (arrastra para girar) con los mismos dos
  colores elegidos.
- Avisos en vivo de calidad de impresión: contraste entre colores y tamaño
  mínimo de módulo para que el código se pueda escanear de verdad.
- Todo se genera **en el navegador del visitante** — no hay backend, no se
  sube ni se guarda nada en ningún servidor.

## Cómo está hecho

Sitio 100 % estático: HTML + CSS + JavaScript clásico (sin build, sin
frameworks, sin npm en el resultado final). El motor 3D (three.js) se carga
de forma perezosa mediante un *import map* + `import()` dinámico, solo
cuando el visor entra en pantalla.

```
qr3d/
├── index.html            página principal (la herramienta)
├── privacidad.html        aviso-legal.html
├── styles.css             hoja de estilos única
├── main.js                capa de página: anuncios, detalles de interfaz
├── qr3d.js                el motor: QR, geometría 3D, exportar 3MF/STL
├── lib/
│   ├── manifest.js         datos de marca + configuración de anuncios
│   └── vendor/              librerías vendorizadas (qr-code-styling, JSZip, three.js)
├── assets/
│   ├── img/                imágenes del sitio (incluye assets/img/ads/, ya optimizadas)
│   └── ads/source/          creatividades originales de la publicidad propia
├── .htaccess               caché y cabeceras para hosting Apache/LiteSpeed
├── robots.txt / sitemap.xml
```

### Publicidad

Cuatro huecos de anuncio (banner, bloque de contenido, aviso de esquina,
ventana emergente tras la descarga). Mientras no hay una red publicitaria
real conectada (AdSense), muestran publicidad propia —
[PickEvent](https://www.pickevent.site) y
[PlanningManager](https://www.planningmanager.app) — que rotan solas y se
reparten para no repetir siempre la misma app en el mismo sitio. La
configuración vive en `lib/manifest.js` (`window.__BRAND__.houseAds`), y la
lógica de reparto/rotación en `main.js`. El popup de descarga solo se abre
*después* de que el archivo ya se ha empezado a descargar.

## Desarrollo local

No hace falta instalar nada más que Python (para el servidor de pruebas):

```bash
python -m http.server 8137
```

Y abrir `http://localhost:8137`. **No sirve abrir `index.html` con doble
clic** (`file://`): el motor 3D usa `import()` dinámico, que necesita
`http://`.

## Publicar

Es una carpeta estática: sube el contenido (menos `assets/ads/source/`, que
son los originales sin optimizar) a la raíz de tu hosting. Si cambias algo,
sube también el número de versión `?v=` en los `<script>`/`<link>` de los
HTML para forzar la caché del navegador.
