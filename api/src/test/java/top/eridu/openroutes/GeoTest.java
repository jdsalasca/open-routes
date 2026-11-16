package top.eridu.openroutes;

import org.junit.jupiter.api.Test;
import top.eridu.openroutes.geo.Geo;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class GeoTest {

    @Test
    void distanciaEntrePlazaDeBolivarYTerminal() {
        // Plaza de Bolívar (5.5325,-73.3617) al terminal de la Av. Oriental.
        double distance = Geo.distanceMeters(5.5325, -73.3617, 5.5287, -73.3597);
        assertThat(distance).isBetween(400.0, 550.0);
    }

    @Test
    void puntoSobreLaLineaDaCero() {
        List<double[]> path = List.of(new double[]{5.0, -73.0}, new double[]{5.0, -72.999});
        assertThat(Geo.distanceToPathMeters(5.0, -73.0, path)).isLessThan(1);
        assertThat(Geo.distanceToPathMeters(5.0, -72.9995, path)).isLessThan(1);
    }

    @Test
    void puntoSeparadoDeLaLinea() {
        List<double[]> path = List.of(new double[]{5.0, -73.0}, new double[]{5.0, -72.999});
        double distance = Geo.distanceToPathMeters(5.0009, -73.0, path);
        assertThat(distance).isBetween(90.0, 110.0);
    }

    @Test
    void extremosYSegmentosDegeneradosNoRompen() {
        List<double[]> path = List.of(new double[]{5.0, -73.0}, new double[]{5.0, -72.999});
        assertThat(Geo.distanceToPathMeters(5.0, -72.999, path)).isLessThan(1);
        assertThat(Geo.distanceToPathMeters(5.0, -72.998, path)).isBetween(100.0, 120.0);

        List<double[]> duplicate = List.of(new double[]{5.0, -73.0}, new double[]{5.0, -73.0});
        assertThat(Geo.distanceToPathMeters(5.001, -73.0, duplicate)).isBetween(100.0, 120.0);
    }
}
