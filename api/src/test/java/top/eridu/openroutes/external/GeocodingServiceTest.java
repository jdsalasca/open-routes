package top.eridu.openroutes.external;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import top.eridu.openroutes.domain.City;
import top.eridu.openroutes.domain.Place;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GeocodingServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final AtomicInteger requests = new AtomicInteger();
    private final AtomicReference<String> lastQuery = new AtomicReference<>("");
    private final AtomicReference<String> responseBody = new AtomicReference<>("[]");
    private final AtomicInteger status = new AtomicInteger(200);
    private HttpServer server;
    private City city;
    private GeocodingService service;

    @BeforeEach
    void setUp() throws Exception {
        try (var in = new ClassPathResource("cities/tunja.json").getInputStream()) {
            city = mapper.readValue(in, City.class);
        }
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/search", exchange -> {
            requests.incrementAndGet();
            lastQuery.set(exchange.getRequestURI().getQuery());
            byte[] body = responseBody.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status.get(), body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        });
        server.start();
        service = new GeocodingService(
                mapper, new ExternalHttp(),
                "http://127.0.0.1:" + server.getAddress().getPort(), 0);
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void buscaDireccionesEnElRectanguloDeLaCiudadYCachea() {
        responseBody.set("""
                [
                  {"osm_type":"way","osm_id":1,"lat":"5.5321","lon":"-73.3616",
                   "name":"Calle 21","display_name":"Calle 21, Tunja, Boyacá, Colombia",
                   "type":"residential","address":{"road":"Calle 21"}},
                  {"osm_type":"node","osm_id":2,"lat":"5.5330","lon":"-73.3620",
                   "name":"","display_name":"10 Calle 21, Tunja, Boyacá, Colombia",
                   "type":"house","address":{"road":"Calle 21","house_number":"10"}}
                ]
                """);

        List<Place> first = service.search(city, "Calle 21", 5);
        assertThat(first).extracting(Place::name).containsExactly("Calle 21", "10 Calle 21");
        assertThat(first).extracting(Place::type).containsExactly("Vía", "Dirección");
        assertThat(first.get(0).id()).isEqualTo("osm-way-1");
        assertThat(lastQuery.get())
                .contains("format=jsonv2")
                .contains("bounded=1")
                .contains("limit=5")
                .contains("viewbox=")
                .contains("countrycodes=co")
                .contains("q=Calle+21");

        List<Place> second = service.search(city, "  calle   21  ", 5);
        assertThat(second).isEqualTo(first);
        assertThat(requests.get()).isEqualTo(1);
    }

    @Test
    void ignoraConsultasDemasiadoCortasYRespuestasRotas() {
        assertThat(service.search(city, "ab", 5)).isEmpty();
        assertThat(requests.get()).isZero();

        responseBody.set("no es json");
        assertThatThrownBy(() -> service.search(city, "Calle 21", 5))
                .isInstanceOf(ExternalLookupException.class);
    }

    @Test
    void convierteUnErrorHttpEnErrorDelBuscador() {
        status.set(500);
        assertThatThrownBy(() -> service.search(city, "Calle 21", 5))
                .isInstanceOf(ExternalLookupException.class)
                .hasMessageContaining("OpenStreetMap");
    }
}
