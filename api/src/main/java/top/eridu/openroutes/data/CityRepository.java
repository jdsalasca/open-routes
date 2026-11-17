package top.eridu.openroutes.data;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;
import top.eridu.openroutes.domain.City;
import top.eridu.openroutes.remote.RemoteCityCatalog;
import top.eridu.openroutes.remote.RemoteCityDefinition;
import top.eridu.openroutes.remote.RemoteCityService;

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
    private final RemoteCityCatalog remoteCatalog;
    private final RemoteCityService remoteService;

    public CityRepository(
            ObjectMapper mapper,
            RemoteCityCatalog remoteCatalog,
            RemoteCityService remoteService
    ) throws IOException {
        this.remoteCatalog = remoteCatalog;
        this.remoteService = remoteService;
        var resolver = new PathMatchingResourcePatternResolver();
        Resource[] files = resolver.getResources("classpath:cities/*.json");
        Map<String, City> loaded = new LinkedHashMap<>();
        for (Resource file : files) {
            try (InputStream in = file.getInputStream()) {
                City city = mapper.readValue(in, City.class);
                CityValidator.validate(city);
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
        City local = cities.get(slug);
        if (local != null) {
            return Optional.of(local);
        }
        return remoteCatalog.find(slug).map(remoteService::city);
    }

    public List<RemoteCityDefinition> remoteCities() {
        return remoteCatalog.all();
    }
}
