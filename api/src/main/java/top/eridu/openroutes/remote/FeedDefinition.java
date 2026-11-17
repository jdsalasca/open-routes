package top.eridu.openroutes.remote;

/**
 * Fuente GTFS. discoveryUrl es una búsqueda ArcGIS que devuelve el ZIP más
 * reciente; fallbackUrl evita depender de la búsqueda si cambia.
 */
public record FeedDefinition(
        String discoveryUrl,
        String fallbackUrl,
        int mapRoutes,
        double simplifyTolerance
) {
}
