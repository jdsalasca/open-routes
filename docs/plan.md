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
- [x] Dockerfile multi-stage + compose en `127.0.0.1:5179`.
- [x] Pruebas de API, datos y geometría; build de producción.
- [x] Validación visual desktop y móvil (Playwright).
- [x] Revisión externa (Codex) y correcciones.
- [x] Despliegue en `open-routes.eridu.top` y verificación de sitios existentes.

### R2 · Datos y comunidad (después)

- Paradas oficiales y tiempos de paso cuando el operador los publique.
- Reportes ciudadanos de cambios (con moderación).
- Más ciudades con el mismo esquema.

## Criterios de aceptación

1. `mvn -f api/pom.xml test` y `npm run build` pasan.
2. La geolocalización devuelve rutas ordenadas por distancia y el mapa las resalta.
3. La ficha de ruta muestra horarios, trayectos, vías, paradas y fuente.
4. Móvil: el panel no tapa la ruta seleccionada y todo es navegable con teclado.
5. `https://open-routes.eridu.top/api/health` responde `ok` y los demás sitios del túnel siguen en 200.
