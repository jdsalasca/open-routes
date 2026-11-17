package top.eridu.openroutes;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ApiTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void listaCiudades() throws Exception {
        mvc.perform(get("/api/cities"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].slug").value("tunja"))
                .andExpect(jsonPath("$[0].routeCount").value(26))
                .andExpect(jsonPath("$[1].slug").value("bogota"))
                .andExpect(jsonPath("$[1].routeCount").value(0));
    }

    @Test
    void devuelveLaCiudadCompleta() throws Exception {
        mvc.perform(get("/api/cities/tunja"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Tunja"))
                .andExpect(jsonPath("$.routes.length()").value(26))
                .andExpect(jsonPath("$.places.length()").value(org.hamcrest.Matchers.greaterThan(20)))
                .andExpect(jsonPath("$.routes[0].directions[0].paths[0].length()").isNumber());
    }

    @Test
    void encuentraRutasCercaDeLaPlaza() throws Exception {
        mvc.perform(get("/api/cities/tunja/routes/near")
                        .param("lat", "5.5325")
                        .param("lng", "-73.3617")
                        .param("radius", "500"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.greaterThan(0)))
                .andExpect(jsonPath("$[0].distanceMeters").value(org.hamcrest.Matchers.lessThanOrEqualTo(500)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .header().string("Cache-Control", "no-store"));
    }

    @Test
    void listasYDetalleLlevanCabecerasDeSeguridad() throws Exception {
        mvc.perform(get("/api/cities/tunja"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .header().exists("Content-Security-Policy"));
    }

    @Test
    void cercaAmplioDevuelveTodasLasRutas() throws Exception {
        mvc.perform(get("/api/cities/tunja/routes/near")
                        .param("lat", "5.5325")
                        .param("lng", "-73.3617")
                        .param("radius", "5000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(26));
    }

    @Test
    void rutasDeViajeDevuelvenSoloLasCercanas() throws Exception {
        mvc.perform(get("/api/cities/tunja/trip-routes")
                        .param("fromLat", "5.575069")
                        .param("fromLng", "-73.331541")
                        .param("toLat", "5.530131")
                        .param("toLng", "-73.359513")
                        .param("radius", "300"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.greaterThan(0)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .header().string("Cache-Control", "private, max-age=259200"));
    }

    @Test
    void rutasDeUnPuntoDevuelvenLasCercanas() throws Exception {
        mvc.perform(get("/api/cities/tunja/routes/near-bundle")
                        .param("lat", "5.530131")
                        .param("lng", "-73.359513")
                        .param("radius", "300"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.greaterThan(0)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .header().string("Cache-Control", "private, max-age=259200"));
    }

    @Test
    void rechazaCoordenadasInvalidas() throws Exception {
        mvc.perform(get("/api/cities/tunja/routes/near")
                        .param("lat", "500")
                        .param("lng", "-73.3617"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void ciudadDesconocidaDevuelve404() throws Exception {
        mvc.perform(get("/api/cities/atacama"))
                .andExpect(status().isNotFound());
    }
}
