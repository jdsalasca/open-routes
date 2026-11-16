package top.eridu.openroutes.domain;

import java.util.List;

/**
 * Un lugar buscable (barrio, terminal, universidad...) para fijar un origen
 * sin depender de la geolocalización del navegador.
 */
public record Place(
        String id,
        String name,
        String type,
        double lat,
        double lng,
        List<String> aliases
) {
}
