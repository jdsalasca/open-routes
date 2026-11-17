package top.eridu.openroutes.api;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import top.eridu.openroutes.data.CityRepository;
import top.eridu.openroutes.domain.City;
import top.eridu.openroutes.domain.Route;
import top.eridu.openroutes.remote.TripRouteService;

import java.util.List;

@RestController
@RequestMapping("/api/cities/{slug}")
public class TripRoutesController {

    private final CityRepository cities;
    private final TripRouteService trips;

    public TripRoutesController(CityRepository cities, TripRouteService trips) {
        this.cities = cities;
        this.trips = trips;
    }

    @GetMapping("/trip-routes")
    public List<Route> tripRoutes(
            @PathVariable String slug,
            @RequestParam double fromLat,
            @RequestParam double fromLng,
            @RequestParam double toLat,
            @RequestParam double toLng,
            @RequestParam(defaultValue = "150") int radius,
            HttpServletResponse response
    ) {
        response.setHeader("Cache-Control", "private, max-age=259200");
        City city = cities.find(slug).orElseThrow(() -> notFound(slug));
        if (!valid(fromLat, fromLng) || !valid(toLat, toLng)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Coordenadas fuera de rango");
        }
        int maxDistance = Math.clamp(radius, 50, 1000);
        return trips.candidates(city, fromLat, fromLng, toLat, toLng, maxDistance);
    }

    @GetMapping("/routes/near-bundle")
    public List<Route> pointRoutes(
            @PathVariable String slug,
            @RequestParam double lat,
            @RequestParam double lng,
            @RequestParam(defaultValue = "150") int radius,
            HttpServletResponse response
    ) {
        response.setHeader("Cache-Control", "private, max-age=259200");
        City city = cities.find(slug).orElseThrow(() -> notFound(slug));
        if (!valid(lat, lng)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Coordenadas fuera de rango");
        }
        int maxDistance = Math.clamp(radius, 50, 1000);
        return trips.pointCandidates(city, lat, lng, maxDistance);
    }

    private static boolean valid(double lat, double lng) {
        return Double.isFinite(lat) && Double.isFinite(lng)
                && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    }

    private static ResponseStatusException notFound(String slug) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Ciudad no encontrada: " + slug);
    }
}
