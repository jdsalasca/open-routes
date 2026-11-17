package top.eridu.openroutes.remote;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import top.eridu.openroutes.domain.City;
import top.eridu.openroutes.domain.Route;
import top.eridu.openroutes.external.ExternalHttp;
import top.eridu.openroutes.geo.Geo;
import top.eridu.openroutes.remote.GtfsCityBuilder.LoadedRemoteCity;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * Descarga GTFS bajo demanda, construye la ciudad y la guarda 72 h en memoria
 * y en disco (.json.gz). Si el feed falla, sirve la copia anterior.
 */
@Service
public class RemoteCityService {

    private static final Logger log = LoggerFactory.getLogger(RemoteCityService.class);
    private static final String USER_AGENT =
            "open-routes/0.1 (+https://open-routes.eridu.top)";
    private static final int MAX_TRIP_ROUTES = 60;

    private final ObjectMapper mapper;
    private final GtfsCityBuilder builder;
    private final RemoteCityCatalog catalog;
    private final ExternalHttp externalHttp;
    private final Path cacheDir;
    private final long ttlMillis;
    private final int maxDownloadMb;
    private final HttpClient downloader = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private final Map<String, Cached> memory = new ConcurrentHashMap<>();
    private final Map<String, ReentrantLock> locks = new ConcurrentHashMap<>();
    private final Map<String, CachedRoutes> tripCache = new ConcurrentHashMap<>();

    @Autowired
    public RemoteCityService(
            ObjectMapper mapper,
            GtfsCityBuilder builder,
            RemoteCityCatalog catalog,
            ExternalHttp externalHttp,
            @Value("${openroutes.remote.cache-dir:cache}") String cacheDir,
            @Value("${openroutes.remote.ttl-hours:72}") long ttlHours,
            @Value("${openroutes.remote.max-download-mb:300}") int maxDownloadMb
    ) throws IOException {
        this(mapper, builder, catalog, externalHttp,
                Path.of(cacheDir), Duration.ofHours(ttlHours), maxDownloadMb);
    }

    RemoteCityService(
            ObjectMapper mapper,
            GtfsCityBuilder builder,
            RemoteCityCatalog catalog,
            ExternalHttp externalHttp,
            Path cacheDir,
            Duration ttl,
            int maxDownloadMb
    ) throws IOException {
        this.mapper = mapper;
        this.builder = builder;
        this.catalog = catalog;
        this.externalHttp = externalHttp;
        this.cacheDir = cacheDir;
        this.ttlMillis = ttl.toMillis();
        this.maxDownloadMb = maxDownloadMb;
        Files.createDirectories(cacheDir);
    }

    public City city(RemoteCityDefinition definition) {
        return load(definition).city();
    }

    public List<Route> allRoutes(String slug) {
        RemoteCityDefinition definition = catalog.find(slug)
                .orElseThrow(() -> new RemoteCityException("Ciudad remota no configurada: " + slug));
        return load(definition).allRoutes();
    }

    public List<Route> tripRoutes(
            String slug, double fromLat, double fromLng, double toLat, double toLng, int radius
    ) {
        List<Route> all = allRoutes(slug);
        String key = slug + "|" + cell(fromLat) + "," + cell(fromLng) + "|"
                + cell(toLat) + "," + cell(toLng) + "|" + radius;
        long now = System.currentTimeMillis();
        CachedRoutes cached = tripCache.get(key);
        if (cached != null && cached.expiresAt() > now) {
            return cached.routes();
        }
        List<Route> result = filter(all, fromLat, fromLng, toLat, toLng, radius);
        if (tripCache.size() > 800) {
            tripCache.entrySet().removeIf(entry -> entry.getValue().expiresAt() <= now);
        }
        if (tripCache.size() > 800) {
            tripCache.clear();
        }
        tripCache.put(key, new CachedRoutes(result, now + ttlMillis));
        return result;
    }

    public LoadedRemoteCity load(RemoteCityDefinition definition) {
        String slug = definition.slug();
        Cached cached = memory.get(slug);
        if (cached != null && cached.expiresAt() > System.currentTimeMillis()) {
            return cached.data();
        }
        ReentrantLock lock = locks.computeIfAbsent(slug, ignored -> new ReentrantLock());
        lock.lock();
        try {
            cached = memory.get(slug);
            if (cached != null && cached.expiresAt() > System.currentTimeMillis()) {
                return cached.data();
            }
            Path file = cacheDir.resolve(slug + ".json.gz");
            LoadedRemoteCity disk = null;
            boolean freshDisk = false;
            try {
                freshDisk = Files.exists(file)
                        && System.currentTimeMillis() - Files.getLastModifiedTime(file).toMillis() < ttlMillis;
            } catch (IOException ignored) {
                // Si no se puede leer la fecha, se intenta reconstruir.
            }
            if (freshDisk) {
                disk = readDisk(file);
                if (disk != null) {
                    remember(disk);
                    return disk;
                }
            }
            try {
                memory.remove(slug);
                LoadedRemoteCity built = build(definition);
                writeDisk(file, built);
                remember(built);
                log.info("Ciudad remota {} construida: {} rutas, {} lugares",
                        slug, built.allRoutes().size(), built.city().places().size());
                return built;
            } catch (Exception error) {
                if (Files.exists(file)) {
                    disk = readDisk(file);
                }
                if (disk != null) {
                    log.warn("No se pudo actualizar {}; se usa la copia anterior: {}",
                            slug, error.getMessage());
                    memory.put(slug, new Cached(disk,
                            System.currentTimeMillis() + Duration.ofMinutes(5).toMillis()));
                    return disk;
                }
                throw new RemoteCityException(
                        "No se pudo preparar " + definition.name() + ": " + error.getMessage(), error);
            }
        } finally {
            lock.unlock();
        }
    }

    private LoadedRemoteCity build(RemoteCityDefinition definition) throws Exception {
        String feedUrl = resolveFeedUrl(definition.feed());
        Path zip = Files.createTempFile("open-routes-", ".zip");
        try {
            download(feedUrl, zip);
            return builder.build(zip, definition, feedUrl);
        } finally {
            Files.deleteIfExists(zip);
        }
    }

    private String resolveFeedUrl(FeedDefinition feed) throws IOException, InterruptedException {
        if (feed.discoveryUrl() != null && !feed.discoveryUrl().isBlank()) {
            try {
                String body = externalHttp.get(feed.discoveryUrl(), Map.of("Accept", "application/json"));
                JsonNode results = mapper.readTree(body).path("results");
                for (JsonNode result : results) {
                    String url = result.path("url").asText("");
                    if (url.startsWith("https://") && url.endsWith(".zip")) {
                        return url;
                    }
                }
            } catch (Exception error) {
                log.warn("No se pudo descubrir el feed: {}", error.getMessage());
            }
        }
        if (feed.fallbackUrl() != null && !feed.fallbackUrl().isBlank()) {
            return feed.fallbackUrl();
        }
        throw new IOException("El feed no tiene URL");
    }

    private void download(String url, Path target) throws IOException, InterruptedException {
        URI uri = URI.create(url);
        boolean secure = "https".equalsIgnoreCase(uri.getScheme());
        boolean local = "127.0.0.1".equals(uri.getHost()) || "localhost".equals(uri.getHost());
        if (!secure && !local) {
            throw new IOException("El feed debe usar HTTPS");
        }
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofMinutes(5))
                .header("User-Agent", USER_AGENT)
                .GET()
                .build();
        HttpResponse<Path> response = downloader.send(
                request, HttpResponse.BodyHandlers.ofFile(target));
        if (response.statusCode() != 200) {
            throw new IOException("El feed respondió HTTP " + response.statusCode());
        }
        long size = Files.size(target);
        if (size > (long) maxDownloadMb * 1024 * 1024) {
            throw new IOException("El feed supera " + maxDownloadMb + " MB");
        }
    }

    private void remember(LoadedRemoteCity data) {
        long builtAt = data.builtAt() > 0 ? data.builtAt() : System.currentTimeMillis();
        memory.put(data.city().slug(), new Cached(data, builtAt + ttlMillis));
    }

    private LoadedRemoteCity readDisk(Path file) {
        if (!Files.exists(file)) {
            return null;
        }
        try (InputStream in = new GZIPInputStream(
                new BufferedInputStream(Files.newInputStream(file)))) {
            return mapper.readValue(in, LoadedRemoteCity.class);
        } catch (IOException error) {
            log.warn("Caché de {} ilegible: {}", file.getFileName(), error.getMessage());
            return null;
        }
    }

    private void writeDisk(Path file, LoadedRemoteCity data) throws IOException {
        Path temporary = Files.createTempFile(cacheDir, file.getFileName().toString(), ".tmp");
        try (OutputStream out = new GZIPOutputStream(
                new BufferedOutputStream(Files.newOutputStream(temporary)))) {
            mapper.writeValue(out, data);
        }
        try {
            Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException error) {
            Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static List<Route> filter(
            List<Route> routes, double fromLat, double fromLng, double toLat, double toLng, int radius
    ) {
        List<Candidate> candidates = new ArrayList<>();
        for (Route route : routes) {
            double from = Double.POSITIVE_INFINITY;
            double to = Double.POSITIVE_INFINITY;
            for (var direction : route.directions()) {
                for (var path : direction.paths()) {
                    from = Math.min(from, Geo.distanceToPathMeters(fromLat, fromLng, path));
                    to = Math.min(to, Geo.distanceToPathMeters(toLat, toLng, path));
                }
            }
            if (from <= radius && to <= radius) {
                candidates.add(new Candidate(route, from + to));
            }
        }
        candidates.sort(Comparator.comparingDouble(Candidate::score));
        return candidates.stream()
                .limit(MAX_TRIP_ROUTES)
                .map(Candidate::route)
                .toList();
    }

    private static long cell(double value) {
        return Math.round(value * 10_000);
    }

    private record Cached(LoadedRemoteCity data, long expiresAt) {
    }

    private record CachedRoutes(List<Route> routes, long expiresAt) {
    }

    private record Candidate(Route route, double score) {
    }
}
