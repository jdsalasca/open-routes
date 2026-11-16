package top.eridu.openroutes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import top.eridu.openroutes.data.CityValidator;
import top.eridu.openroutes.domain.City;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CityValidatorTest {

    private static ObjectMapper mapper;
    private static JsonNode root;
    private static City valid;

    @BeforeAll
    static void load() throws Exception {
        mapper = new ObjectMapper();
        try (var in = new ClassPathResource("cities/tunja.json").getInputStream()) {
            root = mapper.readTree(in);
        }
        valid = mapper.treeToValue(root, City.class);
    }

    @Test
    void aceptaElPaqueteDeTunja() {
        assertThatCode(() -> CityValidator.validate(valid)).doesNotThrowAnyException();
    }

    @Test
    void rechazaColorInvalido() throws Exception {
        ObjectNode bad = root.deepCopy();
        ((ObjectNode) bad.get("routes").get(0)).put("color", "azul");
        City city = mapper.treeToValue(bad, City.class);
        assertThatThrownBy(() -> CityValidator.validate(city))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("color inválido");
    }

    @Test
    void rechazaTrazadoVacio() throws Exception {
        ObjectNode bad = root.deepCopy();
        ObjectNode direction = (ObjectNode) bad.get("routes").get(0).get("directions").get(0);
        direction.set("paths", mapper.createArrayNode());
        City city = mapper.treeToValue(bad, City.class);
        assertThatThrownBy(() -> CityValidator.validate(city))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("sin trazado");
    }

    @Test
    void rechazaLugaresDuplicados() throws Exception {
        ObjectNode bad = root.deepCopy();
        ArrayNode places = (ArrayNode) bad.get("places");
        ((ObjectNode) places.get(1)).put("id", places.get(0).get("id").asText());
        City city = mapper.treeToValue(bad, City.class);
        assertThatThrownBy(() -> CityValidator.validate(city))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("place id duplicado");
    }

    @Test
    void aceptaUnaCiudadGeneradaPorElImportadorGtfs() throws Exception {
        try (var in = new ClassPathResource("imported-city.json").getInputStream()) {
            City imported = mapper.readValue(in, City.class);
            assertThatCode(() -> CityValidator.validate(imported)).doesNotThrowAnyException();
        }
    }

    @Test
    void rechazaCuentaSocialConUrlInvalida() throws Exception {
        ObjectNode bad = root.deepCopy();
        ((ObjectNode) bad.get("social").get(0)).put("url", "x");
        City city = mapper.treeToValue(bad, City.class);
        assertThatThrownBy(() -> CityValidator.validate(city))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cuenta social inválida");
    }

    @Test
    void rechazaZonaHorariaInvalida() throws Exception {
        ObjectNode bad = root.deepCopy();
        bad.put("timezone", "Marte/Olympus");
        City city = mapper.treeToValue(bad, City.class);
        assertThatThrownBy(() -> CityValidator.validate(city))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("timezone inválido");
    }
}
