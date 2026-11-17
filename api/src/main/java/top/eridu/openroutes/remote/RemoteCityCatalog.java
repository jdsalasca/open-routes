package top.eridu.openroutes.remote;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.time.ZoneId;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Catálogo de ciudades que se construyen desde un feed abierto. */
@Component
public class RemoteCityCatalog {

    private final Map<String, RemoteCityDefinition> cities;

    public RemoteCityCatalog(ObjectMapper mapper) throws IOException {
        Map<String, RemoteCityDefinition> loaded = new LinkedHashMap<>();
        ClassPathResource resource = new ClassPathResource("remote/cities.json");
        if (resource.exists()) {
            try (InputStream in = resource.getInputStream()) {
                var root = mapper.readTree(in);
                List<RemoteCityDefinition> list = mapper.convertValue(
                        root.path("cities"), new TypeReference<>() {
                        });
                for (RemoteCityDefinition city : list) {
                    validate(city);
                    if (loaded.put(city.slug(), city) != null) {
                        throw new IllegalStateException("Ciudad remota duplicada: " + city.slug());
                    }
                }
            }
        }
        this.cities = Collections.unmodifiableMap(loaded);
    }

    public Optional<RemoteCityDefinition> find(String slug) {
        return Optional.ofNullable(cities.get(slug));
    }

    public List<RemoteCityDefinition> all() {
        return List.copyOf(cities.values());
    }

    private static void validate(RemoteCityDefinition city) {
        require(city != null, "Definición remota nula");
        require(city.slug() != null && city.slug().matches("[a-z0-9-]+"),
                "slug remoto inválido: " + city.slug());
        require(notBlank(city.name()) && notBlank(city.department()) && notBlank(city.country()),
                "metadatos incompletos en " + city.slug());
        require(notBlank(city.timezone()), "timezone vacío en " + city.slug());
        try {
            ZoneId.of(city.timezone());
        } catch (RuntimeException error) {
            throw new IllegalStateException("timezone inválido en " + city.slug());
        }
        require(city.center() != null, "center vacío en " + city.slug());
        require(city.zoom() >= 5 && city.zoom() <= 19, "zoom inválido en " + city.slug());
        require(city.sources() != null && !city.sources().isEmpty(),
                "sources vacío en " + city.slug());
        require(city.fare() != null, "fare vacío en " + city.slug());
        require(city.feed() != null, "feed vacío en " + city.slug());
        require(notBlank(city.feed().discoveryUrl()) || notBlank(city.feed().fallbackUrl()),
                "feed sin URL en " + city.slug());
        require(city.feed().mapRoutes() >= 1 && city.feed().mapRoutes() <= 100,
                "mapRoutes inválido en " + city.slug());
        require(city.feed().simplifyTolerance() > 0, "tolerancia inválida en " + city.slug());
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
