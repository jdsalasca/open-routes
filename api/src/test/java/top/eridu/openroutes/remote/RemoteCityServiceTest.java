package top.eridu.openroutes.remote;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;
import top.eridu.openroutes.domain.Fare;
import top.eridu.openroutes.domain.Point;
import top.eridu.openroutes.domain.Source;
import top.eridu.openroutes.external.ExternalHttp;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RemoteCityServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final GtfsCityBuilder builder = new GtfsCityBuilder();
    private final RemoteCityCatalog catalog = mock(RemoteCityCatalog.class);
    private final AtomicInteger requests = new AtomicInteger();
    private HttpServer server;
    private Path zip;
    private RemoteCityDefinition definition;

    @BeforeEach
    void setUp(@TempDir Path temp) throws Exception {
        zip = temp.resolve("feed.zip");
        try (ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(zip))) {
            for (String name : List.of("routes.txt", "trips.txt", "shapes.txt",
                    "stops.txt", "stop_times.txt")) {
                out.putNextEntry(new ZipEntry(name));
                try (InputStream in = new ClassPathResource("gtfs-mini/" + name).getInputStream()) {
                    in.transferTo(out);
                }
                out.closeEntry();
            }
        }
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/feed.zip", exchange -> {
            requests.incrementAndGet();
            byte[] body = Files.readAllBytes(zip);
            exchange.getResponseHeaders().add("Content-Type", "application/zip");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        });
        server.start();
        definition = new RemoteCityDefinition(
                "prueba", "Ciudad Prueba", "Boyacá", "Colombia", "America/Bogota",
                new Point(5.535, -73.357), 13, "Ciudad de prueba",
                List.of(new Source("Fixture", "https://example.test/feed")),
                List.of(), new Fare(2600, 2700, "COP", "Prueba"),
                new FeedDefinition(null,
                        "http://127.0.0.1:" + server.getAddress().getPort() + "/feed.zip",
                        1, 0.00004));
        when(catalog.find("prueba")).thenReturn(Optional.of(definition));
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void descargaUnaVezYReutilizaMemoriaYDisco(@TempDir Path cache) throws Exception {
        RemoteCityService service = new RemoteCityService(
                mapper, builder, catalog, new ExternalHttp(),
                cache, Duration.ofHours(72), 10);
        assertThat(service.load(definition).city().slug()).isEqualTo("prueba");
        assertThat(service.load(definition).city().routes()).hasSize(1);
        assertThat(requests.get()).isEqualTo(1);
        assertThat(Files.exists(cache.resolve("prueba.json.gz"))).isTrue();

        server.stop(0);
        RemoteCityService restarted = new RemoteCityService(
                mapper, builder, catalog, new ExternalHttp(),
                cache, Duration.ofHours(72), 10);
        assertThat(restarted.load(definition).city().places()).hasSize(5);
        assertThat(requests.get()).isEqualTo(1);
    }

    @Test
    void devuelveSoloRutasCercaDelOrigenYDestino(@TempDir Path cache) throws Exception {
        RemoteCityService service = new RemoteCityService(
                mapper, builder, catalog, new ExternalHttp(),
                cache, Duration.ofHours(72), 10);
        List<top.eridu.openroutes.domain.Route> routes =
                service.tripRoutes("prueba", 5.53, -73.36, 5.55, -73.36, 150);
        assertThat(routes).extracting(route -> route.code()).contains("10");
        assertThat(service.tripRoutes("prueba", 5.49, -73.43, 5.49, -73.43, 150)).isEmpty();
    }
}
