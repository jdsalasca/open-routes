package top.eridu.openroutes.data;

import top.eridu.openroutes.domain.City;
import top.eridu.openroutes.domain.Direction;
import top.eridu.openroutes.domain.Place;
import top.eridu.openroutes.domain.Route;
import top.eridu.openroutes.domain.Schedule;

import java.time.DateTimeException;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Contrato de un paquete de ciudad. Falla al arrancar en vez de publicar una
 * ciudad con datos que romperían el mapa o el planificador.
 */
public final class CityValidator {

    private static final String COLOR = "#[0-9A-Fa-f]{6}";
    private static final String TIME = "^\\d{2}:\\d{2}$";

    private CityValidator() {
    }

    public static void validate(City city) {
        require(city != null, "Ciudad nula");
        require(city.slug() != null && city.slug().matches("[a-z0-9-]+"),
                "slug inválido: " + city.slug());
        require(notBlank(city.name()), "name vacío en " + city.slug());
        require(notBlank(city.country()), "country vacío en " + city.slug());
        require(notBlank(city.department()), "department vacío en " + city.slug());
        require(notBlank(city.timezone()), "timezone vacío en " + city.slug());
        try {
            ZoneId.of(city.timezone());
        } catch (DateTimeException | NullPointerException error) {
            throw new IllegalStateException("timezone inválido en " + city.slug() + ": " + city.timezone());
        }
        require(point(city.center() == null ? null : city.center().lat(),
                city.center() == null ? null : city.center().lng()),
                "center inválido en " + city.slug());
        require(city.zoom() >= 5 && city.zoom() <= 19,
                "zoom fuera de rango en " + city.slug());
        require(city.fare() != null && city.fare().day() >= 0 && city.fare().night() >= 0,
                "tarifa inválida en " + city.slug());
        require(city.sources() != null && !city.sources().isEmpty(),
                "sources vacío en " + city.slug());
        require(city.places() != null && !city.places().isEmpty(),
                "places vacío en " + city.slug());
        require(city.routes() != null && !city.routes().isEmpty(),
                "routes vacío en " + city.slug());

        validatePlaces(city.places(), city.slug());
        validateRoutes(city.routes(), city.slug());
    }

    private static void validatePlaces(List<Place> places, String slug) {
        Set<String> ids = new HashSet<>();
        for (Place place : places) {
            require(place != null, "place nulo en " + slug);
            require(notBlank(place.id()) && ids.add(place.id()),
                    "place id duplicado o vacío en " + slug + ": " + place.id());
            require(notBlank(place.name()), "place sin nombre en " + slug);
            require(notBlank(place.type()), "place sin tipo en " + slug + ": " + place.name());
            require(point(place.lat(), place.lng()),
                    "place con coordenadas inválidas en " + slug + ": " + place.name());
            require(place.aliases() != null, "aliases nulo en " + slug + ": " + place.name());
        }
    }

    private static void validateRoutes(List<Route> routes, String slug) {
        Set<String> ids = new HashSet<>();
        Set<String> codes = new HashSet<>();
        for (Route route : routes) {
            require(route != null, "route nula en " + slug);
            require(notBlank(route.id()) && ids.add(route.id()),
                    "route id duplicado o vacío en " + slug + ": " + route.id());
            require(notBlank(route.code()) && codes.add(route.code()),
                    "route code duplicado o vacío en " + slug + ": " + route.code());
            require(notBlank(route.name()), "route sin nombre en " + slug + ": " + route.code());
            require(route.color() != null && route.color().matches(COLOR),
                    "color inválido en " + slug + ": " + route.code() + " = " + route.color());
            require(notBlank(route.type()), "route sin tipo en " + slug + ": " + route.code());
            validateSchedule(route.weekday(), slug, route.code() + " weekday");
            validateSchedule(route.sunday(), slug, route.code() + " sunday");
            require(route.directions() != null && !route.directions().isEmpty(),
                    "route sin sentidos en " + slug + ": " + route.code());
            for (Direction direction : route.directions()) {
                validateDirection(direction, slug, route.code());
            }
        }
    }

    private static void validateDirection(Direction direction, String slug, String code) {
        require(direction != null && notBlank(direction.name()),
                "sentido sin nombre en " + slug + ": " + code);
        require(direction.paths() != null && !direction.paths().isEmpty(),
                "sentido sin trazado en " + slug + ": " + code);
        require(direction.streets() != null, "streets nulo en " + slug + ": " + code);
        require(direction.stops() != null, "stops nulo en " + slug + ": " + code);
        for (var path : direction.paths()) {
            require(path != null && path.size() >= 2,
                    "trazado vacío en " + slug + ": " + code);
            for (double[] point : path) {
                require(point != null && point.length >= 2 && point(point[0], point[1]),
                        "punto inválido en " + slug + ": " + code);
            }
        }
        for (var stop : direction.stops()) {
            require(stop != null && notBlank(stop.name()) && point(stop.lat(), stop.lng()),
                    "parada inválida en " + slug + ": " + code);
        }
    }

    private static void validateSchedule(Schedule schedule, String slug, String label) {
        require(schedule != null, "horario nulo en " + slug + ": " + label);
        require(schedule.start() != null && schedule.start().matches(TIME)
                        && schedule.end() != null && schedule.end().matches(TIME),
                "horario inválido en " + slug + ": " + label);
        try {
            LocalTime.parse(schedule.start());
            LocalTime.parse(schedule.end());
        } catch (DateTimeException error) {
            throw new IllegalStateException("hora inválida en " + slug + ": " + label);
        }
        require(schedule.frequencyMin() == null || schedule.frequencyMin() > 0,
                "frecuencia inválida en " + slug + ": " + label);
    }

    private static boolean point(Double lat, Double lng) {
        return lat != null && lng != null && Double.isFinite(lat) && Double.isFinite(lng)
                && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new IllegalStateException(message);
        }
    }
}
