package top.eridu.openroutes.geo;

import java.util.List;

public final class Geo {

    private static final double EARTH_RADIUS_M = 6_371_000;
    private static final double METERS_PER_DEG_LAT = 110_574;

    private Geo() {
    }

    public static double distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
    }

    /**
     * Distancia mínima de un punto a una polilínea. Proyecta localmente a metros:
     * a escala de una ciudad el error es despreciable y evita trigonometría por segmento.
     */
    public static double distanceToPathMeters(double lat, double lng, List<double[]> path) {
        if (path == null || path.isEmpty()) {
            return Double.POSITIVE_INFINITY;
        }
        double mPerDegLng = Math.cos(Math.toRadians(lat)) * METERS_PER_DEG_LAT;
        double best = Double.POSITIVE_INFINITY;
        if (path.size() == 1) {
            return distanceMeters(lat, lng, path.getFirst()[0], path.getFirst()[1]);
        }
        for (int i = 0; i < path.size() - 1; i++) {
            double ax = (path.get(i)[1] - lng) * mPerDegLng;
            double ay = (path.get(i)[0] - lat) * METERS_PER_DEG_LAT;
            double bx = (path.get(i + 1)[1] - lng) * mPerDegLng;
            double by = (path.get(i + 1)[0] - lat) * METERS_PER_DEG_LAT;
            double dx = bx - ax;
            double dy = by - ay;
            double len2 = dx * dx + dy * dy;
            double t = len2 == 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
            double px = ax + t * dx;
            double py = ay + t * dy;
            best = Math.min(best, Math.hypot(px, py));
        }
        return best;
    }
}
