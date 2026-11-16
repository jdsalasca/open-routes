package top.eridu.openroutes.data;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;
import top.eridu.openroutes.domain.City;

import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Component
public class CityRepository {

    private final Map<String, City> cities;

    public CityRepository(ObjectMapper mapper) throws IOException {
        var resolver = new PathMatchingResourcePatternResolver();
        Resource[] files = resolver.getResources("classpath:cities/*.json");
        Map<String, City> loaded = new LinkedHashMap<>();
        for (Resource file : files) {
            try (InputStream in = file.getInputStream()) {
                City city = mapper.readValue(in, City.class);
                validate(city);
                if (loaded.put(city.slug(), city) != null) {
                    throw new IllegalStateException("Ciudad duplicada: " + city.slug());
                }
            }
        }
        if (loaded.isEmpty()) {
            throw new IllegalStateException("No hay ciudades en resources/cities");
        }
        this.cities = Collections.unmodifiableMap(loaded);
    }

    public List<City> all() {
        return List.copyOf(cities.values());
    }

    public Optional<City> find(String slug) {
        return Optional.ofNullable(cities.get(slug));
    }

    /**
     * Falla al arrancar si una ciudad trae geometrías vacías: es preferible a
     * servir distancias inventadas o negativas.
     */
    private static void validate(City city) {
        if (city.routes() == null || city.routes().isEmpty()) {
            throw new IllegalStateException("La ciudad " + city.slug() + " no tiene rutas");
        }
        for (var route : city.routes()) {
            if (route.directions() == null || route.directions().isEmpty()) {
                throw new IllegalStateException(route.code() + " no tiene sentidos");
            }
            for (var direction : route.directions()) {
                if (direction.paths() == null || direction.paths().isEmpty()) {
                    throw new IllegalStateException(route.code() + " tiene un sentido sin trazado");
                }
                for (var path : direction.paths()) {
                    if (path == null || path.size() < 2) {
                        throw new IllegalStateException(route.code() + " tiene un trazado vacío");
                    }
                    for (double[] point : path) {
                        if (point == null || point.length < 2
                                || !Double.isFinite(point[0]) || !Double.isFinite(point[1])
                                || point[0] < -90 || point[0] > 90
                                || point[1] < -180 || point[1] > 180) {
                            throw new IllegalStateException(route.code() + " tiene un punto inválido");
                        }
                    }
                }
            }
        }
    }
}
