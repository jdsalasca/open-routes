package top.eridu.openroutes.external;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import top.eridu.openroutes.domain.City;
import top.eridu.openroutes.domain.Place;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Busca barrios, direcciones y puntos de interés en Nominatim (OpenStreetMap),
 * acotado al rectángulo de la ciudad. Cachea y respeta el límite de 1 req/s.
 */
@Service
public class GeocodingService {

    private static final long CACHE_TTL_MS = 24 * 60 * 60 * 1000L;
    private static final int CACHE_MAX = 400;

    private final ObjectMapper mapper;
    private final ExternalHttp http;
    private final String baseUrl;
    private final long minIntervalMillis;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();
    private long lastCallAt;

    @Autowired
    public GeocodingService(
            ObjectMapper mapper,
            ExternalHttp http,
            @Value("${openroutes.nominatim.base-url:https://nominatim.openstreetmap.org}")
            String baseUrl) {
        this(mapper, http, baseUrl, 1100);
    }

    GeocodingService(ObjectMapper mapper, ExternalHttp http, String baseUrl, long minIntervalMillis) {
        this.mapper = mapper;
        this.http = http;
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.minIntervalMillis = minIntervalMillis;
    }

    public List<Place> search(City city, String rawQuery, int limit) {
        String query = rawQuery == null ? "" : rawQuery.trim().replaceAll("\\s+", " ");
        if (query.length() < 3) {
            return List.of();
        }
        int max = Math.clamp(limit, 1, 10);
        String key = city.slug() + "|" + normalize(query) + "|" + max;
        Cached cached = cache.get(key);
        if (cached != null && cached.expiresAt() > System.currentTimeMillis()) {
            return cached.places();
        }

        Bounds bounds = boundsOf(city);
        String url = baseUrl + "/search?format=jsonv2&addressdetails=1&dedupe=1&bounded=1"
                + "&limit=" + max
                + "&viewbox=" + format(bounds.minLng()) + "," + format(bounds.maxLat()) + ","
                + format(bounds.maxLng()) + "," + format(bounds.minLat())
                + "&q=" + URLEncoder.encode(query, StandardCharsets.UTF_8)
                + "&accept-language=es";
        if ("Colombia".equalsIgnoreCase(city.country())) {
            url += "&countrycodes=co";
        }

        try {
            throttle();
            String body = http.get(url, Map.of("Accept", "application/json"));
            List<Place> places = parse(body);
            remember(key, places);
            return places;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new ExternalLookupException("Búsqueda interrumpida", error);
        } catch (IOException | RuntimeException error) {
            throw new ExternalLookupException("No se pudo consultar OpenStreetMap", error);
        }
    }

    private List<Place> parse(String body) throws IOException {
        JsonNode root = mapper.readTree(body);
        if (!root.isArray()) {
            throw new IOException("Respuesta de Nominatim inesperada");
        }
        List<Place> places = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode item : root) {
            double lat = item.path("lat").asDouble(Double.NaN);
            double lng = item.path("lon").asDouble(Double.NaN);
            if (!Double.isFinite(lat) || !Double.isFinite(lng)) {
                continue;
            }
            String display = item.path("display_name").asText("");
            JsonNode address = item.path("address");
            String name = displayName(item, address, display);
            if (name.isBlank()) {
                continue;
            }
            String id = "osm-" + item.path("osm_type").asText("x") + "-"
                    + item.path("osm_id").asText(Integer.toHexString(display.hashCode()));
            if (!seen.add(normalize(name) + "|" + Math.round(lat * 100000) + "|" + Math.round(lng * 100000))) {
                continue;
            }
            String hood = address.path("neighbourhood").asText(
                    address.path("suburb").asText("")).trim();
            String type = displayType(item.path("type").asText(""),
                    address.path("house_number").asText(""));
            if (!hood.isBlank()) {
                type = type + " · " + hood;
            }
            places.add(new Place(id, name, type, lat, lng, List.of()));
        }
        return List.copyOf(places);
    }

    private static String displayName(JsonNode item, JsonNode address, String display) {
        String name = item.path("name").asText("").trim();
        if (!name.isBlank()) {
            return name;
        }
        String road = address.path("road").asText("").trim();
        String number = address.path("house_number").asText("").trim();
        if (!road.isBlank()) {
            return number.isBlank() ? road : number + " " + road;
        }
        if (!display.isBlank()) {
            return display.split(",")[0].trim();
        }
        return address.path("neighbourhood").asText("").trim();
    }

    private static String displayType(String rawType, String houseNumber) {
        return switch (rawType) {
            case "house", "building", "apartments", "address" -> "Dirección";
            case "road", "residential", "pedestrian", "footway", "street", "living_street",
                    "primary", "secondary", "tertiary", "unclassified", "service" ->
                    houseNumber.isBlank() ? "Vía" : "Dirección";
            case "neighbourhood", "suburb", "quarter", "city_district", "borough" -> "Barrio";
            case "university", "college" -> "Universidad";
            case "school", "kindergarten" -> "Colegio";
            case "hospital", "clinic", "doctors", "pharmacy" -> "Salud";
            case "bus_station", "bus_stop", "halt", "station" -> "Transporte";
            case "park", "garden", "playground", "square", "nature_reserve" -> "Parque";
            case "mall", "marketplace", "supermarket", "shop", "convenience" -> "Comercio";
            case "place_of_worship" -> "Iglesia";
            case "locality", "hamlet", "village", "town", "city" -> "Sector";
            default -> "Lugar";
        };
    }

    private static Bounds boundsOf(City city) {
        double minLat = 90;
        double maxLat = -90;
        double minLng = 180;
        double maxLng = -180;
        for (Place place : city.places()) {
            minLat = Math.min(minLat, place.lat());
            maxLat = Math.max(maxLat, place.lat());
            minLng = Math.min(minLng, place.lng());
            maxLng = Math.max(maxLng, place.lng());
        }
        if (minLat > maxLat) {
            double lat = city.center().lat();
            double lng = city.center().lng();
            return new Bounds(lat - 0.03, lat + 0.03, lng - 0.03, lng + 0.03);
        }
        double padLat = Math.clamp((maxLat - minLat) * 0.05, 0.004, 0.03);
        double padLng = Math.clamp((maxLng - minLng) * 0.05, 0.004, 0.03);
        return new Bounds(minLat - padLat, maxLat + padLat, minLng - padLng, maxLng + padLng);
    }

    private synchronized void throttle() throws InterruptedException {
        long wait = minIntervalMillis - (System.currentTimeMillis() - lastCallAt);
        if (wait > 0) {
            Thread.sleep(wait);
        }
        lastCallAt = System.currentTimeMillis();
    }

    private void remember(String key, List<Place> places) {
        long now = System.currentTimeMillis();
        if (cache.size() >= CACHE_MAX) {
            cache.entrySet().removeIf(entry -> entry.getValue().expiresAt() <= now);
        }
        if (cache.size() >= CACHE_MAX) {
            cache.clear();
        }
        cache.put(key, new Cached(places, now + CACHE_TTL_MS));
    }

    private static String normalize(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ")
                .trim();
    }

    private static String format(double value) {
        return String.format(Locale.ROOT, "%.6f", value);
    }

    private record Cached(List<Place> places, long expiresAt) {
    }

    record Bounds(double minLat, double maxLat, double minLng, double maxLng) {
    }
}
