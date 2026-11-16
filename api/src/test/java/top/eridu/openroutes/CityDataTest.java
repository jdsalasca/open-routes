package top.eridu.openroutes;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import top.eridu.openroutes.domain.City;
import top.eridu.openroutes.domain.Route;

import java.io.InputStream;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class CityDataTest {

    private static City city;

    @BeforeAll
    static void load() throws Exception {
        try (InputStream in = new ClassPathResource("cities/tunja.json").getInputStream()) {
            city = new ObjectMapper().readValue(in, City.class);
        }
    }

    @Test
    void tunjaTieneRutasConTrazadosValidos() {
        assertThat(city.slug()).isEqualTo("tunja");
        assertThat(city.timezone()).isEqualTo("America/Bogota");
        assertThat(city.routes()).hasSize(26);
        assertThat(city.routes()).allSatisfy(route -> {
            assertThat(route.id()).isNotBlank();
            assertThat(route.code()).startsWith("R");
            assertThat(route.color()).matches("#[0-9A-Fa-f]{6}");
            assertThat(route.directions()).isNotEmpty();
            assertThat(route.directions()).allSatisfy(direction -> {
                assertThat(direction.paths()).isNotEmpty();
                assertThat(direction.streets()).isNotEmpty();
                assertThat(direction.stops()).isNotEmpty();
            });
        });
    }

    @Test
    void idsSonUnicosYCoordenadasEstanEnTunja() {
        Set<String> ids = new HashSet<>();
        for (Route route : city.routes()) {
            assertThat(ids.add(route.id())).isTrue();
            for (var direction : route.directions()) {
                for (var path : direction.paths()) {
                    assertThat(path).hasSizeGreaterThan(1);
                    for (double[] point : path) {
                        assertThat(point[0]).isBetween(5.3, 5.7);
                        assertThat(point[1]).isBetween(-73.5, -73.2);
                    }
                }
            }
        }
    }

    @Test
    void tarifaYHorariosSonCoherentes() {
        assertThat(city.fare().day()).isEqualTo(2600);
        assertThat(city.fare().night()).isEqualTo(2700);
        assertThat(city.routes()).allSatisfy(route -> {
            assertThat(route.weekday().start()).matches("\\d{2}:\\d{2}");
            assertThat(route.weekday().end()).matches("\\d{2}:\\d{2}");
            assertThat(route.sunday().start()).matches("\\d{2}:\\d{2}");
            assertThat(route.weekday().frequencyMin()).isPositive();
        });
    }

    @Test
    void rutasCircularesEstanMarcadas() {
        assertThat(city.routes())
                .filteredOn(route -> route.circular())
                .extracting(Route::code)
                .containsExactlyInAnyOrder("R10", "R22");
    }

    @Test
    void lugaresSonBuscablesYEscandinavoExiste() {
        assertThat(city.places()).hasSizeGreaterThan(20);
        assertThat(city.places()).extracting(place -> place.id()).doesNotHaveDuplicates();
        assertThat(city.places()).anySatisfy(place -> {
            assertThat(place.name()).isEqualTo("Escandinavo");
            assertThat(place.lat()).isBetween(5.3, 5.65);
            assertThat(place.lng()).isBetween(-73.55, -73.25);
        });
        assertThat(city.places()).allSatisfy(place -> {
            assertThat(place.name()).isNotBlank();
            assertThat(place.type()).isNotBlank();
            assertThat(place.aliases()).isNotEmpty();
        });
    }
}
