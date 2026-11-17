package top.eridu.openroutes.remote;

import org.springframework.stereotype.Service;
import top.eridu.openroutes.domain.City;
import top.eridu.openroutes.domain.Route;
import top.eridu.openroutes.geo.Geo;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Devuelve solo las rutas que pasan cerca del origen y del destino. */
@Service
public class TripRouteService {

    private static final int MAX_ROUTES = 60;

    private final RemoteCityService remote;

    public TripRouteService(RemoteCityService remote) {
        this.remote = remote;
    }

    public List<Route> candidates(
            City city, double fromLat, double fromLng, double toLat, double toLng, int radius
    ) {
        if (city.partial()) {
            return remote.tripRoutes(city.slug(), fromLat, fromLng, toLat, toLng, radius);
        }
        List<Candidate> candidates = new ArrayList<>();
        for (Route route : city.routes()) {
            double from = Double.POSITIVE_INFINITY;
            double to = Double.POSITIVE_INFINITY;
            for (var direction : route.directions()) {
                for (var path : direction.paths()) {
                    from = Math.min(from, Geo.distanceToPathMeters(fromLat, fromLng, path));
                    to = Math.min(to, Geo.distanceToPathMeters(toLat, toLng, path));
                }
            }
            if (from <= radius && to <= radius) {
                candidates.add(new Candidate(route, from + to));
            }
        }
        candidates.sort(Comparator.comparingDouble(Candidate::score));
        return candidates.stream().limit(MAX_ROUTES).map(Candidate::route).toList();
    }

    public List<Route> pointCandidates(City city, double lat, double lng, int radius) {
        if (city.partial()) {
            return remote.pointRoutes(city.slug(), lat, lng, radius);
        }
        List<Candidate> candidates = new ArrayList<>();
        for (Route route : city.routes()) {
            double distance = Double.POSITIVE_INFINITY;
            for (var direction : route.directions()) {
                for (var path : direction.paths()) {
                    distance = Math.min(distance, Geo.distanceToPathMeters(lat, lng, path));
                }
            }
            if (distance <= radius) {
                candidates.add(new Candidate(route, distance));
            }
        }
        candidates.sort(Comparator.comparingDouble(Candidate::score));
        return candidates.stream().limit(MAX_ROUTES).map(Candidate::route).toList();
    }

    private record Candidate(Route route, double score) {
    }
}
