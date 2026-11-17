package top.eridu.openroutes.external;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import top.eridu.openroutes.domain.City;
import top.eridu.openroutes.external.MobilityNewsService.NewsItem;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MobilityNewsServiceTest {

    private final AtomicInteger requests = new AtomicInteger();
    private final AtomicReference<String> lastQuery = new AtomicReference<>("");
    private final AtomicReference<String> body = new AtomicReference<>("");
    private HttpServer server;
    private City city;
    private MobilityNewsService service;

    @BeforeEach
    void setUp() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        try (var in = new ClassPathResource("cities/tunja.json").getInputStream()) {
            city = mapper.readValue(in, City.class);
        }
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/rss/search", exchange -> {
            requests.incrementAndGet();
            lastQuery.set(exchange.getRequestURI().getQuery());
            byte[] bytes = body.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/rss+xml");
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        });
        server.start();
        service = new MobilityNewsService(
                new ExternalHttp(), "http://127.0.0.1:" + server.getAddress().getPort(), 60_000);
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void ordenaPorFechaYDescartaTitularesRepetidos() {
        body.set("""
                <?xml version="1.0" encoding="UTF-8"?>
                <rss version="2.0"><channel>
                  <item><title>Cierre vial en Tunja</title><link>https://medio.test/a</link>
                    <source>Boyacá 7 Días</source>
                    <pubDate>Mon, 16 Nov 2026 12:00:00 GMT</pubDate></item>
                  <item><title>Pico y placa en Tunja</title><link>https://medio.test/b</link>
                    <source>Caracol Radio</source>
                    <pubDate>Tue, 17 Nov 2026 12:00:00 GMT</pubDate></item>
                  <item><title>Cierre vial en Tunja</title><link>https://medio.test/c</link>
                    <source>Otro medio</source>
                    <pubDate>Sun, 15 Nov 2026 12:00:00 GMT</pubDate></item>
                  <item><title>Sin fecha</title><link>https://medio.test/d</link>
                    <source>Boyacá 95.6</source></item>
                </channel></rss>
                """);

        List<NewsItem> items = service.latest(city);
        assertThat(items).extracting(NewsItem::title)
                .containsExactly("Pico y placa en Tunja", "Cierre vial en Tunja", "Sin fecha");
        assertThat(items.get(0).publishedAt()).isEqualTo("2026-11-17T12:00:00Z");
        assertThat(items.get(0).source()).isEqualTo("Caracol Radio");
        assertThat(items.get(2).publishedAt()).isNull();
        assertThat(lastQuery.get()).contains("movilidad").contains("Tunja");

        service.latest(city);
        assertThat(requests.get()).isEqualTo(1);
    }

    @Test
    void filtraSoloTitularesDeAvisos() {
        body.set("""
                <?xml version="1.0" encoding="UTF-8"?>
                <rss version="2.0"><channel>
                  <item><title>Cierre vial en Tunja por obra</title><link>https://medio.test/a</link>
                    <source>Boyacá 7 Días</source>
                    <pubDate>Mon, 16 Nov 2026 12:00:00 GMT</pubDate></item>
                  <item><title>Triunfo deportivo de Boyacá</title><link>https://medio.test/b</link>
                    <source>Deportes</source>
                    <pubDate>Tue, 17 Nov 2026 12:00:00 GMT</pubDate></item>
                </channel></rss>
                """);
        List<NewsItem> alerts = service.alerts(city);
        assertThat(alerts).extracting(NewsItem::title)
                .containsExactly("Cierre vial en Tunja por obra");
        assertThat(lastQuery.get()).contains("cierre").contains("Tunja");
    }

    @Test
    void devuelveErrorClaroSiElFeedNoResponde() {
        server.stop(0);
        assertThatThrownBy(() -> service.latest(city))
                .isInstanceOf(ExternalLookupException.class)
                .hasMessageContaining("noticias");
    }
}
