package top.eridu.openroutes.domain;

import java.util.List;

/**
 * paths admite varios trazados por sentido: el mapa oficial del operador
 * incluye ramales que no siempre forman una sola línea continua.
 */
public record Direction(
        String name,
        List<String> streets,
        List<List<double[]>> paths,
        List<Stop> stops
) {
}
