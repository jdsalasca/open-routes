package top.eridu.openroutes.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.server.ResponseStatusException;
import top.eridu.openroutes.data.CityRepository;
import top.eridu.openroutes.domain.City;
import top.eridu.openroutes.domain.Place;
import top.eridu.openroutes.external.ExternalLookupException;
import top.eridu.openroutes.external.GeocodingService;
import top.eridu.openroutes.external.MobilityNewsService;
import top.eridu.openroutes.external.MobilityNewsService.NewsItem;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CityServicesControllerTest {

    private static City city;
    private final CityRepository cities = mock(CityRepository.class);
    private final GeocodingService geocoding = mock(GeocodingService.class);
    private final MobilityNewsService news = mock(MobilityNewsService.class);

    @BeforeAll
    static void load() throws Exception {
        try (var in = new ClassPathResource("cities/tunja.json").getInputStream()) {
            city = new ObjectMapper().readValue(in, City.class);
        }
    }

    @Test
    void validaLaBusquedaYLimitaElResultado() {
        when(cities.find("tunja")).thenReturn(Optional.of(city));
        Place place = new Place("osm-way-1", "Calle 21", "Vía", 5.53, -73.36, List.of());
        when(geocoding.search(any(), eq("calle 21"), eq(10))).thenReturn(List.of(place));

        CitySearchController controller = new CitySearchController(cities, geocoding);
        List<Place> result = controller.search(
                "tunja", "  calle   21 ", 99, new MockHttpServletResponse());
        assertThat(result).containsExactly(place);

        assertThatThrownBy(() -> controller.search(
                "tunja", "ab", 6, new MockHttpServletResponse()))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        assertThatThrownBy(() -> controller.search(
                "otra", "calle 21", 6, new MockHttpServletResponse()))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void traduceFallosExternosA502() {
        when(cities.find("tunja")).thenReturn(Optional.of(city));
        when(geocoding.search(any(), any(), anyInt()))
                .thenThrow(new ExternalLookupException("sin red"));

        CitySearchController search = new CitySearchController(cities, geocoding);
        assertThatThrownBy(() -> search.search(
                "tunja", "calle 21", 6, new MockHttpServletResponse()))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.BAD_GATEWAY);

        when(news.latest(city)).thenThrow(new ExternalLookupException("sin red"));
        CityNewsController newsController = new CityNewsController(cities, news);
        assertThatThrownBy(() -> newsController.news("tunja", new MockHttpServletResponse()))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.BAD_GATEWAY);
    }

    @Test
    void devuelveNoticiasYNoEncuentraCiudades() {
        when(cities.find("tunja")).thenReturn(Optional.of(city));
        NewsItem item = new NewsItem("Cierre vial", "https://medio.test/a", "Medio", null);
        when(news.latest(city)).thenReturn(List.of(item));

        CityNewsController controller = new CityNewsController(cities, news);
        assertThat(controller.news("tunja", new MockHttpServletResponse())).containsExactly(item);

        assertThatThrownBy(() -> controller.news("otra", new MockHttpServletResponse()))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }
}
