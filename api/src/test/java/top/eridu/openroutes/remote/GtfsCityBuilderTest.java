package top.eridu.openroutes.remote;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;
import top.eridu.openroutes.domain.Fare;
import top.eridu.openroutes.domain.Point;
import top.eridu.openroutes.domain.Source;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;

class GtfsCityBuilderTest {

    private final GtfsCityBuilder builder = new GtfsCityBuilder();

    @Test
    void construyeCiudadParcialYGuardaTodasLasRutasParaBuscar(@TempDir Path temp) throws Exception {
        Path zip = temp.resolve("feed.zip");
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

        RemoteCityDefinition definition = new RemoteCityDefinition(
                "prueba", "Ciudad Prueba", "Boyacá", "Colombia", "America/Bogota",
                new Point(5.535, -73.357), 13, "Ciudad de prueba",
                List.of(new Source("Fixture", "https://example.test/feed")),
                List.of(), new Fare(2600, 2700, "COP", "Prueba"),
                new FeedDefinition(null, "https://example.test/feed.zip", 1, 0.00004));
        GtfsCityBuilder.LoadedRemoteCity loaded = builder.build(zip, definition,
                "https://example.test/feed.zip");

        assertThat(loaded.city().partial()).isTrue();
        assertThat(loaded.city().totalRoutes()).isEqualTo(2);
        assertThat(loaded.city().dataUpdatedAt()).isPositive();
        assertThat(loaded.city().routes()).hasSize(1);
        assertThat(loaded.allRoutes()).hasSize(2);
        assertThat(loaded.city().places()).hasSize(5);
        assertThat(loaded.allRoutes()).extracting(route -> route.code())
                .containsExactlyInAnyOrder("10", "20");
        assertThat(loaded.city().routes().get(0).code()).isEqualTo("10");
        assertThat(loaded.city().routes().get(0).directions()).hasSize(2);
        assertThat(loaded.city().routes().get(0).weekday().start()).isEqualTo("05:30");
        assertThat(loaded.city().routes().get(0).weekday().end()).isEqualTo("06:23");
        assertThat(loaded.city().routes().get(0).weekday().frequencyMin()).isEqualTo(10);
        assertThat(loaded.city().routes().get(0).directions().get(0).stops()).isNotEmpty();
    }
}
