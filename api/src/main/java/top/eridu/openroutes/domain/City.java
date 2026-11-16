package top.eridu.openroutes.domain;

import java.util.List;

/**
 * Una ciudad es solo datos: para publicar otra basta con dejar un JSON en
 * resources/cities con este mismo esquema.
 */
public record City(
        String slug,
        String name,
        String department,
        String country,
        String timezone,
        Point center,
        int zoom,
        String description,
        List<Source> sources,
        List<SocialAccount> social,
        Fare fare,
        List<Place> places,
        List<Route> routes
) {
}
