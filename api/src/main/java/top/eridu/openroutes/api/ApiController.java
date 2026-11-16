package top.eridu.openroutes.api;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import top.eridu.openroutes.data.CityRepository;
import top.eridu.openroutes.domain.City;
import top.eridu.openroutes.domain.Fare;
import top.eridu.openroutes.domain.Point;
import top.eridu.openroutes.domain.Route;
import top.eridu.openroutes.domain.Source;
import top.eridu.openroutes.geo.Geo;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class ApiController {

    private final CityRepository cities;

    public ApiController(CityRepository cities) {
        this.cities = cities;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "open-routes");
    }

    @GetMapping("/cities")
    public List<CitySummary> cities() {
        return cities.all().stream().map(CitySummary::of).toList();
    }

    @GetMapping("/cities/{slug}")
    public City city(@PathVariable String slug) {
        return cities.find(slug).orElseThrow(() -> notFound(slug));
    }

    @GetMapping("/cities/{slug}/routes/near")
    public List<NearbyRoute> nearby(
            @PathVariable String slug,
            @RequestParam double lat,
            @RequestParam double lng,
            @RequestParam(defaultValue = "800") int radius
    ) {
        City city = cities.find(slug).orElseThrow(() -> notFound(slug));
        if (!Double.isFinite(lat) || !Double.isFinite(lng)
                || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Coordenadas fuera de rango");
        }
        int maxDistance = Math.clamp(radius, 50, 5000);
        return city.routes().stream()
                .map(route -> nearest(route, lat, lng))
                .filter(hit -> hit.distanceMeters() <= maxDistance)
                .sorted(Comparator.comparingInt(NearbyRoute::distanceMeters))
                .limit(25)
                .toList();
    }

    private static NearbyRoute nearest(Route route, double lat, double lng) {
        double best = Double.POSITIVE_INFINITY;
        String directionName = "";
        for (var direction : route.directions()) {
            for (var path : direction.paths()) {
                double distance = Geo.distanceToPathMeters(lat, lng, path);
                if (distance < best) {
                    best = distance;
                    directionName = direction.name();
                }
            }
        }
        return new NearbyRoute(route.id(), route.code(), route.name(), route.color(), route.type(),
                directionName, (int) Math.round(best));
    }

    private static ResponseStatusException notFound(String slug) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Ciudad no encontrada: " + slug);
    }

    public record CitySummary(
            String slug,
            String name,
            String department,
            String country,
            Point center,
            int zoom,
            String description,
            List<Source> sources,
            Fare fare,
            int routeCount
    ) {
        static CitySummary of(City city) {
            return new CitySummary(city.slug(), city.name(), city.department(), city.country(),
                    city.center(), city.zoom(), city.description(), city.sources(), city.fare(),
                    city.routes().size());
        }
    }

    public record NearbyRoute(
            String id,
            String code,
            String name,
            String color,
            String type,
            String direction,
            int distanceMeters
    ) {
    }
}
