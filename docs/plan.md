# Plan de open-routes

## Objetivo

Mapa web de transporte público para Tunja que responda en segundos: qué rutas pasan cerca de mí, cuál es su trayecto y cuándo pasa. La estructura debe aceptar otras ciudades solo agregando datos.

## Rondas

### R1 · Núcleo usable

- [x] API Spring Boot con abstracción `City` → `Route` → `Direction` y datos de Tunja.
- [x] 26 rutas reales con trazados KML del operador, horarios y tarifa 2026.
- [x] Endpoint de cercanía con distancia punto-polilínea y pruebas.
- [x] Web React+Vite+SCSS con mapa Leaflet, geolocalización, búsqueda y detalle de ruta.
- [x] Buscador de origen por barrio o lugar (42 sitios de Tunja), con rutas a 500 m y distancias.
- [x] Planificador origen → destino con rutas directas, tiempos estimados y guía de subida/bajada.
- [x] Proyecciones múltiples, circuitos explícitos (R10/R22), aviso de fragmentos y espera según el día.
- [x] Ronda Terra: cobertura de pasadas, espera desconocida, zona horaria, fuera de horario y avisos de fragmentos precisos.
- [x] Auditoría de calidad y correcciones P1/P2 (campos, GPS, foco, cercanía en cliente, teclado, pruebas).
- [x] Dockerfile multi-stage + compose en `127.0.0.1:5179`.
- [x] Pruebas de API, datos y geometría; build de producción.
- [x] Validación visual desktop y móvil (Playwright).
- [x] Revisión externa (Codex) y correcciones.
- [x] Despliegue en `open-routes.eridu.top` y verificación de sitios existentes.

### R1.5 · Paquete de ciudad y GTFS

- [x] Contrato de ciudad validado al arrancar (`CityValidator`): slug, zona horaria, tarifa, IDs únicos, colores, horarios y trazados.
- [x] Selector de ciudad con `?city=` y `localStorage`; la elección sobrevive al recargar.
- [x] Importador `tools/gtfs-import.py` (zip o carpeta) con horario, paradas y lugares deduplicados.
- [x] Fixture GTFS mínimo y autoprueba `tools/gtfs-check.py` (carpeta, zip y centro manual).
- [x] La muestra importada pasa el mismo validador que las ciudades reales.
- [x] Ficha tolera ciudades sin `streets` y muestra “Paradas” en vez de “Paradas de despacho”.
- [x] Verificación multi-ciudad en navegador con una segunda ciudad simulada.

### R1.6 · Rutas superpuestas, barrios y movilidad

- [x] Inspector de punto: tocar el mapa lista las rutas a menos de 150 m, con color, distancia y acceso a la ficha.
- [x] Los 154 barrios y veredas oficiales de Tunja (Datos Abiertos, CC BY-SA 4.0) entran al buscador local.
- [x] Búsqueda de direcciones y puntos de interés con Nominatim, acotada a la ciudad, con caché y 1 req/s.
- [x] Sección de movilidad con titulares de Google News RSS y cuentas oficiales; X no se incrusta para no cargar cookies.
- [x] Detección de errores externos: la app conserva la búsqueda local y muestra un aviso si OSM o las noticias no responden.
- [x] Verificación desktop/móvil con datos reales y pruebas de los servicios externos con servidores locales.

### R1.7 · Ciudades remotas y caché inteligente

- [x] Catálogo `remote/cities.json`: la ciudad se construye desde GTFS sin empaquetar su JSON.
- [x] Bogotá: 1.053 rutas en el índice, 30 principales en el mapa, 7.376 paradas y 320 KB comprimidos.
- [x] `trip-routes` devuelve solo las rutas cerca del origen y el destino; el planificador las usa al instante.
- [x] Caché de 72 h en backend (memoria + `.json.gz` en volumen) y en IndexedDB del navegador.
- [x] Descubrimiento del feed más reciente en ArcGIS y respaldo con URL fija.
- [x] Detección de ciudad por geolocalización y botón manual.
- [x] Compresión gzip de respuestas y simplificación de trazados.

### R1.8 · Favoritos, compartir y PWA

- [x] Favoritos Casa/Trabajo por ciudad y viajes recientes (máximo 5, 30 días) en `localStorage`.
- [x] Enlace de viaje con ciudad, origen y destino; Web Share en móvil y copia al portapapeles en escritorio.
- [x] PWA instalable con manifest, iconos y service worker que cachea app, última ciudad y assets.
- [x] Aviso de “Sin conexión” y fallback a la última copia guardada.
- [x] Fecha de actualización del GTFS visible en la ciudad remota.
- [x] Verificación de offline real, favoritos, recientes y enlace compartido en navegador.

### R1.9 · Inspector completo, paradas y viajes offline

- [x] `routes/near-bundle`: todas las rutas del índice a menos de 300 m de un punto.
- [x] Inspector con estado de carga, error y acceso a rutas que no están en las 30 principales.
- [x] Paradas ordenadas por secuencia del viaje representativo en ciudades GTFS.
- [x] Próxima salida aproximada por frecuencia y zona horaria en la ficha de ruta.
- [x] Viajes guardados con su bundle precargado en IndexedDB para consulta offline.
- [x] Botón “Instalar app” cuando el navegador ofrece el prompt PWA.
- [x] Verificación de Bogotá con 45 rutas en un punto y viaje guardado sin conexión.

### R1.10 · Alrededor completo y avisos

- [x] “Usar mi ubicación” carga todas las rutas cercanas del índice, no solo las 30 del mapa.
- [x] Avisos de movilidad por ciudad (cierres, desvíos, manifestaciones, obras) desde Google News, separados de las noticias.
- [x] Filtro por ciudad, palabras de incidente y últimas 48 horas.
- [x] Pestaña “Avisos” en la barra superior con contador, sin tarjeta en la ventana principal.
- [x] Diálogo de avisos con fuente, fecha y advertencia de que no es un aviso oficial.
- [x] Las rutas solo se ofrecen para un barrio si su trazado entra en él o la ruta lo nombra; pasar a 300–500 m ya no cuenta como servirlo.

### R2 · Datos y comunidad (después)

- Paradas oficiales y tiempos de paso cuando el operador los publique.
- Reportes ciudadanos de cambios (con moderación).
- Más ciudades con el mismo esquema.
- Planificador con transbordos y tiempos por franja/festivos.
- Unificar fragmentos de un mismo sentido (R8, R13, R18) con datos verificados, sin inventar conexiones.

## Criterios de aceptación

1. `mvn -f api/pom.xml test`, `npm run build`, `node tools/planner-check.mjs` y `python tools/gtfs-check.py` pasan.
2. La geolocalización devuelve rutas ordenadas por distancia y el mapa las resalta.
3. La ficha de ruta muestra horarios, trayectos, vías, paradas y fuente.
4. Móvil: el panel no tapa la ruta seleccionada y todo es navegable con teclado.
5. Tocar el mapa abre un panel con todas las rutas del índice a menos de 300 m y permite abrir su ficha.
6. El buscador encuentra los 154 barrios y veredas oficiales sin red; una dirección se consulta en OpenStreetMap al confirmar.
7. La sección de movilidad muestra titulares con fuente y enlaces a las cuentas oficiales, sin cookies de X.
8. Bogotá se construye desde GTFS, muestra 30 rutas principales y carga bajo demanda las rutas de un viaje; la caché dura 72 h.
9. Casa/Trabajo, viajes recientes y un enlace compartido restauran el viaje; la PWA abre la última ciudad sin conexión.
10. Las paradas GTFS aparecen ordenadas y la ficha muestra una próxima salida aproximada por frecuencia.
11. Los viajes guardados y su bundle de rutas siguen disponibles sin conexión.
12. “Usar mi ubicación” muestra todas las rutas cercanas del índice y los avisos de movilidad de las últimas 48 h se abren desde una pestaña superior.
13. `https://open-routes.eridu.top/api/health` responde `ok` y los demás sitios del túnel siguen en 200.
