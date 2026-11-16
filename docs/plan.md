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
5. Tocar el mapa abre un panel con las rutas a menos de 150 m y permite abrir su ficha.
6. El buscador encuentra los 154 barrios y veredas oficiales sin red; una dirección se consulta en OpenStreetMap al confirmar.
7. La sección de movilidad muestra titulares con fuente y enlaces a las cuentas oficiales, sin cookies de X.
8. `https://open-routes.eridu.top/api/health` responde `ok` y los demás sitios del túnel siguen en 200.
