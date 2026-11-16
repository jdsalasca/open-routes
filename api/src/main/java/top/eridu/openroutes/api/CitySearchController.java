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
import top.eridu.openroutes.domain.Place;
import top.eridu.openroutes.external.ExternalLookupException;
import top.eridu.openroutes.external.GeocodingService;

import java.util.List;

@RestController
@RequestMapping("/api/cities/{slug}")
public class CitySearchController {

    private final CityRepository cities;
    private final GeocodingService geocoding;

    public CitySearchController(CityRepository cities, GeocodingService geocoding) {
        this.cities = cities;
        this.geocoding = geocoding;
    }

    @GetMapping("/search")
    public List<Place> search(
            @PathVariable String slug,
            @RequestParam String q,
            @RequestParam(defaultValue = "6") int limit,
            HttpServletResponse response
    ) {
        response.setHeader("Cache-Control", "no-store");
        City city = cities.find(slug).orElseThrow(() -> notFound(slug));
        String query = q == null ? "" : q.trim().replaceAll("\\s+", " ");
        if (query.length() < 3 || query.length() > 120) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "La búsqueda debe tener entre 3 y 120 caracteres");
        }
        try {
            return geocoding.search(city, query, Math.clamp(limit, 1, 10));
        } catch (ExternalLookupException error) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "El buscador de direcciones no está disponible");
        }
    }

    private static ResponseStatusException notFound(String slug) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Ciudad no encontrada: " + slug);
    }
}
