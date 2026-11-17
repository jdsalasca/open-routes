package top.eridu.openroutes.remote;

import top.eridu.openroutes.data.CityValidator;
import top.eridu.openroutes.domain.City;
import top.eridu.openroutes.domain.Direction;
import top.eridu.openroutes.domain.Fare;
import top.eridu.openroutes.domain.Place;
import top.eridu.openroutes.domain.Route;
import top.eridu.openroutes.domain.Schedule;
import top.eridu.openroutes.domain.SocialAccount;
import top.eridu.openroutes.domain.Source;
import top.eridu.openroutes.domain.Stop;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;import java.io.IOException;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipFile;

/**
 * Construye una ciudad a partir de GTFS: todas las rutas para el índice de
 * búsqueda y solo las principales para el mapa. No guarda stop_times completos.
 */
@Component
public class GtfsCityBuilder {

    private static final String[] PALETTE = {
            "#D64545", "#1D6FA5", "#2A9D8F", "#E07A1F", "#7B5EA7", "#6A994E",
            "#C2477E", "#3D7EA6", "#B8860B", "#8D5524", "#5B5F97", "#00808A",
            "#C0504D", "#4F7942", "#9C3D54", "#2E5EAA", "#A6631B", "#7A8B3F",
            "#B23A48", "#386641", "#8E6C88", "#1F7A8C", "#A44A3F", "#5C4D7D",
            "#4A7C59", "#B56576"
    };

    public record LoadedRemoteCity(City city, List<Route> allRoutes, long builtAt, String feedUrl) {
    }

    public LoadedRemoteCity build(Path zipPath, RemoteCityDefinition def, String feedUrl)
            throws IOException {
        try (ZipFile zip = new ZipFile(zipPath.toFile())) {
            Map<String, RouteRow> routes = readRoutes(zip);
            TripIndex trips = readTrips(zip, routes);
            Map<String, StopRow> stops = readStops(zip);
            Map<String, List<double[]>> shapes = readShapes(zip, trips.selectedShapeIds());
            Map<String, Set<String>> routeStopIds = new HashMap<>();
            Map<String, List<Integer>> routeFirsts = new HashMap<>();
            Map<String, Integer> routeMin = new HashMap<>();
            Map<String, Integer> routeMax = new HashMap<>();
            readStopTimes(zip, trips.tripToRoute(), routeStopIds, routeFirsts, routeMin, routeMax);

            List<RouteWithCount> built = new ArrayList<>();
            Set<String> usedIds = new HashSet<>();
            Set<String> usedCodes = new HashSet<>();
            for (RouteRow row : routes.values()) {
                Map<String, GroupStat> groupMap = trips.groups().get(row.id);
                if (groupMap == null || groupMap.isEmpty()) {
                    continue;
                }
                List<Direction> directions = new ArrayList<>();
                List<GroupStat> ordered = groupMap.values().stream()
                        .sorted(Comparator.comparingInt(GroupStat::count).reversed())
                        .limit(2)
                        .toList();
                for (int index = 0; index < ordered.size(); index++) {
                    GroupStat group = ordered.get(index);
                    List<double[]> shape = shapes.get(group.shapeId);
                    if (shape == null || shape.size() < 2) {
                        continue;
                    }
                    List<double[]> path = simplify(shape, def.feed().simplifyTolerance());
                    if (path.size() < 2) {
                        continue;
                    }
                    List<Stop> routeStops = routeStopIds.getOrDefault(row.id, Set.of()).stream()
                            .map(stops::get)
                            .filter(stop -> stop != null)
                            .map(stop -> new Stop(stop.name, stop.lat, stop.lng))
                            .toList();
                    String directionName = index == 0
                            ? (row.longName.isBlank() ? "Ida" : row.longName)
                            : (row.longName.isBlank() ? "Vuelta" : row.longName + " · vuelta");
                    directions.add(new Direction(
                            directionName, List.of(), List.of(path), routeStops));
                }
                if (directions.isEmpty()) {
                    continue;
                }
                String code = unique(row.code.isBlank() ? row.id : row.code, usedCodes);
                String id = unique(slug(row.id), usedIds);
                Schedule schedule = schedule(routeFirsts.get(row.id), routeMin.get(row.id),
                        routeMax.get(row.id));
                built.add(new RouteWithCount(new Route(
                        id,
                        code,
                        row.longName.isBlank() ? code : row.longName,
                        PALETTE[built.size() % PALETTE.length],
                        typeName(row.type),
                        "Datos GTFS de " + def.name() + ". Horario aproximado.",
                        schedule,
                        schedule,
                        def.name(),
                        def.sources().isEmpty() ? feedUrl : def.sources().get(0).url(),
                        false,
                        directions
                ), trips.tripCounts().getOrDefault(row.id, 0)));
            }

            if (built.isEmpty()) {
                throw new IOException("El feed no produjo rutas utilizables");
            }
            List<Place> places = places(stops);
            if (places.isEmpty()) {
                throw new IOException("El feed no produjo paradas utilizables");
            }
            List<Route> allRoutes = built.stream().map(RouteWithCount::route).toList();
            List<RouteWithCount> sorted = built.stream()
                    .sorted(Comparator.comparingInt(RouteWithCount::trips).reversed()
                            .thenComparing(item -> item.route().name()))
                    .toList();
            List<Route> mapRoutes = diverse(sorted, Math.clamp(def.feed().mapRoutes(), 1, 100));
            List<SocialAccount> social = def.social() == null ? List.of() : def.social();
            List<Source> sources = def.sources() == null ? List.of() : def.sources();
            Fare fare = def.fare() == null
                    ? new Fare(0, 0, "COP", "Tarifa no publicada en el feed.")
                    : def.fare();
            City city = new City(
                    def.slug(), def.name(), def.department(), def.country(), def.timezone(),
                    def.center(), def.zoom(), def.description(), sources, social, fare,
                    places, mapRoutes, true, allRoutes.size());
            CityValidator.validate(city);
            return new LoadedRemoteCity(city, allRoutes, System.currentTimeMillis(), feedUrl);
        }
    }

    private static Map<String, RouteRow> readRoutes(ZipFile zip) throws IOException {
        Map<String, RouteRow> routes = new LinkedHashMap<>();
        try (BufferedReader reader = GtfsCsv.reader(zip, "routes.txt")) {
            Map<String, Integer> index = GtfsCsv.header(reader);
            String[] row = new String[12];
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                GtfsCsv.parseInto(line, row);
                String id = GtfsCsv.value(row, index, "route_id");
                if (id.isBlank()) {
                    continue;
                }
                routes.putIfAbsent(id, new RouteRow(
                        id,
                        GtfsCsv.value(row, index, "route_short_name"),
                        GtfsCsv.value(row, index, "route_long_name"),
                        GtfsCsv.value(row, index, "route_type"),
                        GtfsCsv.value(row, index, "route_color"),
                        GtfsCsv.value(row, index, "route_desc")
                ));
            }
        }
        if (routes.isEmpty()) {
            throw new IOException("routes.txt no tiene rutas");
        }
        return routes;
    }

    private static TripIndex readTrips(ZipFile zip, Map<String, RouteRow> routes) throws IOException {
        Map<String, Map<String, GroupStat>> groups = new HashMap<>();
        Map<String, String> tripToRoute = new HashMap<>();
        Map<String, Integer> tripCounts = new HashMap<>();
        try (BufferedReader reader = GtfsCsv.reader(zip, "trips.txt")) {
            Map<String, Integer> index = GtfsCsv.header(reader);
            String[] row = new String[9];
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                GtfsCsv.parseInto(line, row);
                String routeId = GtfsCsv.value(row, index, "route_id");
                String tripId = GtfsCsv.value(row, index, "trip_id");
                String shapeId = GtfsCsv.value(row, index, "shape_id");
                String direction = GtfsCsv.value(row, index, "direction_id");
                if (!routes.containsKey(routeId) || tripId.isBlank()) {
                    continue;
                }
                tripToRoute.put(tripId, routeId);
                tripCounts.merge(routeId, 1, Integer::sum);
                String key = direction.isBlank() ? "shape:" + shapeId : "dir:" + direction;
                GroupStat stat = groups.computeIfAbsent(routeId, ignored -> new HashMap<>())
                        .computeIfAbsent(key, ignored -> new GroupStat());
                stat.count++;
                if (stat.tripId == null) {
                    stat.tripId = tripId;
                }
                if (stat.shapeId == null || stat.shapeId.isBlank()) {
                    stat.shapeId = shapeId;
                }
            }
        }
        if (tripToRoute.isEmpty()) {
            throw new IOException("trips.txt no tiene viajes");
        }
        Set<String> selectedShapes = new HashSet<>();
        for (Map<String, GroupStat> routeGroups : groups.values()) {
            routeGroups.values().stream()
                    .sorted(Comparator.comparingInt(stat -> -stat.count))
                    .limit(2)
                    .map(stat -> stat.shapeId)
                    .filter(shape -> shape != null && !shape.isBlank())
                    .forEach(selectedShapes::add);
        }
        return new TripIndex(groups, tripToRoute, tripCounts, selectedShapes);
    }

    private static Map<String, StopRow> readStops(ZipFile zip) throws IOException {
        Map<String, StopRow> stops = new HashMap<>();
        try (BufferedReader reader = GtfsCsv.reader(zip, "stops.txt")) {
            Map<String, Integer> index = GtfsCsv.header(reader);
            String[] row = new String[10];
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                GtfsCsv.parseInto(line, row);
                String id = GtfsCsv.value(row, index, "stop_id");
                String name = GtfsCsv.value(row, index, "stop_name");
                double lat = number(GtfsCsv.value(row, index, "stop_lat"));
                double lng = number(GtfsCsv.value(row, index, "stop_lon"));
                if (id.isBlank() || !Double.isFinite(lat) || !Double.isFinite(lng)) {
                    continue;
                }
                stops.put(id, new StopRow(id, name.isBlank() ? "Parada " + id : name, lat, lng));
            }
        }
        if (stops.isEmpty()) {
            throw new IOException("stops.txt no tiene paradas válidas");
        }
        return stops;
    }

    private static Map<String, List<double[]>> readShapes(ZipFile zip, Set<String> selected)
            throws IOException {
        Map<String, List<ShapePoint>> raw = new HashMap<>();
        try (BufferedReader reader = GtfsCsv.reader(zip, "shapes.txt")) {
            Map<String, Integer> index = GtfsCsv.header(reader);
            String[] row = new String[6];
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                GtfsCsv.parseInto(line, row);
                String id = GtfsCsv.value(row, index, "shape_id");
                if (!selected.contains(id)) {
                    continue;
                }
                double lat = number(GtfsCsv.value(row, index, "shape_pt_lat"));
                double lng = number(GtfsCsv.value(row, index, "shape_pt_lon"));
                int sequence = (int) number(GtfsCsv.value(row, index, "shape_pt_sequence"));
                if (Double.isFinite(lat) && Double.isFinite(lng)) {
                    raw.computeIfAbsent(id, ignored -> new ArrayList<>())
                            .add(new ShapePoint(sequence, lat, lng));
                }
            }
        }
        Map<String, List<double[]>> shapes = new HashMap<>();
        for (Map.Entry<String, List<ShapePoint>> entry : raw.entrySet()) {
            List<ShapePoint> points = entry.getValue();
            points.sort(Comparator.comparingInt(ShapePoint::sequence));
            List<double[]> path = new ArrayList<>(points.size());
            for (ShapePoint point : points) {
                path.add(new double[]{point.lat, point.lng});
            }
            shapes.put(entry.getKey(), path);
        }
        return shapes;
    }

    private static void readStopTimes(
            ZipFile zip,
            Map<String, String> tripToRoute,
            Map<String, Set<String>> routeStopIds,
            Map<String, List<Integer>> routeFirsts,
            Map<String, Integer> routeMin,
            Map<String, Integer> routeMax
    ) throws IOException {
        if (zip.getEntry("stop_times.txt") == null) {
            return;
        }
        Map<String, Integer> tripStart = new HashMap<>();
        Map<String, Integer> tripEnd = new HashMap<>();
        try (BufferedReader reader = GtfsCsv.reader(zip, "stop_times.txt")) {
            Map<String, Integer> index = GtfsCsv.header(reader);
            String[] row = new String[6];
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                GtfsCsv.parseInto(line, row);
                String tripId = GtfsCsv.value(row, index, "trip_id");
                String routeId = tripToRoute.get(tripId);
                if (routeId == null) {
                    continue;
                }
                String stopId = GtfsCsv.value(row, index, "stop_id");
                if (!stopId.isBlank()) {
                    routeStopIds.computeIfAbsent(routeId, ignored -> new HashSet<>()).add(stopId);
                }
                String departure = GtfsCsv.value(row, index, "departure_time");
                String arrival = GtfsCsv.value(row, index, "arrival_time");
                int time = parseTime(departure.isBlank() ? arrival : departure);
                if (time < 0) {
                    continue;
                }
                tripStart.merge(tripId, time, Math::min);
                tripEnd.merge(tripId, time, Math::max);
            }
        }
        for (Map.Entry<String, Integer> entry : tripStart.entrySet()) {
            String routeId = tripToRoute.get(entry.getKey());
            if (routeId == null) {
                continue;
            }
            int start = entry.getValue();
            int end = tripEnd.getOrDefault(entry.getKey(), start);
            routeFirsts.computeIfAbsent(routeId, ignored -> new ArrayList<>()).add(start);
            routeMin.merge(routeId, start, Math::min);
            routeMax.merge(routeId, end, Math::max);
        }
    }

    private static List<Place> places(Map<String, StopRow> stops) {
        Map<String, Place> places = new LinkedHashMap<>();
        Set<String> usedIds = new HashSet<>();
        for (StopRow stop : stops.values()) {
            String key = normalize(stop.name) + "|" + Math.round(stop.lat * 1000)
                    + "|" + Math.round(stop.lng * 1000);
            if (places.containsKey(key)) {
                continue;
            }
            String id = unique(slug(stop.name), usedIds);
            places.put(key, new Place(id, stop.name, "Parada", stop.lat, stop.lng,
                    List.of("parada " + normalize(stop.name))));
        }
        return List.copyOf(places.values());
    }

    private static Schedule schedule(List<Integer> firsts, Integer min, Integer max) {        if (firsts == null || firsts.isEmpty() || min == null || max == null) {
            return new Schedule("05:00", "23:00", null);
        }
        List<Integer> sorted = new ArrayList<>(firsts);
        sorted.sort(Integer::compareTo);
        long total = 0;
        int gaps = 0;
        for (int i = 1; i < sorted.size(); i++) {
            int gap = sorted.get(i) - sorted.get(i - 1);
            if (gap > 0) {
                total += gap;
                gaps++;
            }
        }
        Integer frequency = gaps == 0 ? null : (int) Math.clamp(total / gaps, 3, 90);
        return new Schedule(formatTime(min), formatTime(max), frequency);
    }

    private static List<Route> diverse(List<RouteWithCount> sorted, int count) {
        List<Route> selected = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        Set<Long> covered = new HashSet<>();
        for (RouteWithCount item : sorted) {
            if (selected.size() >= count) {
                break;
            }
            if (covered(item.route(), covered)) {
                continue;
            }
            selected.add(item.route());
            ids.add(item.route().id());
            addCells(item.route(), covered);
        }
        for (RouteWithCount item : sorted) {
            if (selected.size() >= count) {
                break;
            }
            if (ids.add(item.route().id())) {
                selected.add(item.route());
            }
        }
        return selected;
    }

    private static boolean covered(Route route, Set<Long> covered) {
        List<double[]> path = route.directions().get(0).paths().get(0);
        int samples = Math.min(10, path.size());
        int step = Math.max(1, path.size() / samples);
        int total = 0;
        int hits = 0;
        for (int i = 0; i < path.size(); i += step) {
            total++;
            long lat = (long) Math.floor(path.get(i)[0] * 1000);
            long lng = (long) Math.floor(path.get(i)[1] * 1000);
            boolean near = false;
            for (int dx = -1; dx <= 1 && !near; dx++) {
                for (int dy = -1; dy <= 1; dy++) {
                    if (covered.contains(cell(lat + dx, lng + dy))) {
                        near = true;
                        break;
                    }
                }
            }
            if (near) {
                hits++;
            }
        }
        return total > 0 && hits * 100 >= total * 65;
    }

    private static void addCells(Route route, Set<Long> covered) {
        for (var direction : route.directions()) {
            for (var path : direction.paths()) {
                for (double[] point : path) {
                    covered.add(cell(
                            (long) Math.floor(point[0] * 1000),
                            (long) Math.floor(point[1] * 1000)));
                }
            }
        }
    }

    private static long cell(long lat, long lng) {
        return (lat << 32) ^ (lng & 0xFFFFFFFFL);
    }

    private static List<double[]> simplify(List<double[]> points, double tolerance) {
        if (points.size() <= 2) {
            return points;
        }
        boolean[] keep = new boolean[points.size()];
        keep[0] = true;
        keep[points.size() - 1] = true;
        double squared = tolerance * tolerance;
        Deque<int[]> stack = new ArrayDeque<>();
        stack.push(new int[]{0, points.size() - 1});
        while (!stack.isEmpty()) {
            int[] range = stack.pop();
            int first = range[0];
            int last = range[1];
            double best = 0;
            int index = -1;
            for (int i = first + 1; i < last; i++) {
                double distance = distanceToSegmentSquared(points.get(i), points.get(first), points.get(last));
                if (distance > best) {
                    best = distance;
                    index = i;
                }
            }
            if (best > squared && index > 0) {
                keep[index] = true;
                stack.push(new int[]{first, index});
                stack.push(new int[]{index, last});
            }
        }
        List<double[]> result = new ArrayList<>();
        for (int i = 0; i < points.size(); i++) {
            if (keep[i]) {
                result.add(points.get(i));
            }
        }
        if (result.size() > 500) {
            int step = (int) Math.ceil(result.size() / 500.0);
            List<double[]> sampled = new ArrayList<>();
            for (int i = 0; i < result.size(); i += step) {
                sampled.add(result.get(i));
            }
            if (!sampled.get(sampled.size() - 1).equals(result.get(result.size() - 1))) {
                sampled.add(result.get(result.size() - 1));
            }
            return sampled;
        }
        return result;
    }

    private static double distanceToSegmentSquared(double[] point, double[] start, double[] end) {
        double x = start[0];
        double y = start[1];
        double dx = end[0] - x;
        double dy = end[1] - y;
        if (dx != 0 || dy != 0) {
            double t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
            if (t > 1) {
                x = end[0];
                y = end[1];
            } else if (t > 0) {
                x += dx * t;
                y += dy * t;
            }
        }
        double px = point[0] - x;
        double py = point[1] - y;
        return px * px + py * py;
    }

    private static int parseTime(String value) {
        if (value == null || value.isBlank()) {
            return -1;
        }
        String[] parts = value.split(":");
        if (parts.length < 2) {
            return -1;
        }
        try {
            return Integer.parseInt(parts[0]) * 60 + Integer.parseInt(parts[1]);
        } catch (NumberFormatException error) {
            return -1;
        }
    }

    private static String formatTime(int minutes) {
        int value = Math.floorMod(minutes, 24 * 60);
        return String.format(Locale.ROOT, "%02d:%02d", value / 60, value % 60);
    }

    private static double number(String value) {
        try {
            return Double.parseDouble(value);
        } catch (NumberFormatException error) {
            return Double.NaN;
        }
    }

    private static String typeName(String type) {
        return switch (type) {
            case "0" -> "Tranvía";
            case "1" -> "Metro";
            case "2" -> "Tren";
            case "4" -> "Ferry";
            case "6" -> "Teleférico";
            case "11" -> "Trolebús";
            default -> "Urbana";
        };
    }

    private static String unique(String value, Set<String> used) {
        String base = value == null || value.isBlank() ? "ruta" : value;
        String result = base;
        int suffix = 2;
        while (!used.add(result)) {
            result = base + "-" + suffix;
            suffix++;
        }
        return result;
    }

    private static String slug(String value) {
        return normalize(value).replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
    }

    private static String normalize(String value) {
        return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .trim();
    }

    private record RouteRow(String id, String code, String longName, String type,
                            String color, String description) {
    }

    private record StopRow(String id, String name, double lat, double lng) {
    }

    private record ShapePoint(int sequence, double lat, double lng) {
    }

    private static final class GroupStat {
        private int count;
        private String tripId;
        private String shapeId;

        int count() {
            return count;
        }
    }

    private record TripIndex(
            Map<String, Map<String, GroupStat>> groups,
            Map<String, String> tripToRoute,
            Map<String, Integer> tripCounts,
            Set<String> selectedShapeIds
    ) {
    }

    private record RouteWithCount(Route route, int trips) {
    }
}
