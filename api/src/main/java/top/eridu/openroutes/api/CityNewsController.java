package top.eridu.openroutes.api;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import top.eridu.openroutes.data.CityRepository;
import top.eridu.openroutes.domain.City;
import top.eridu.openroutes.external.ExternalLookupException;
import top.eridu.openroutes.external.MobilityNewsService;
import top.eridu.openroutes.external.MobilityNewsService.NewsItem;

import java.util.List;

@RestController
@RequestMapping("/api/cities/{slug}")
public class CityNewsController {

    private final CityRepository cities;
    private final MobilityNewsService news;

    public CityNewsController(CityRepository cities, MobilityNewsService news) {
        this.cities = cities;
        this.news = news;
    }

    @GetMapping("/news")
    public List<NewsItem> news(@PathVariable String slug, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        City city = cities.find(slug).orElseThrow(() -> notFound(slug));
        try {
            return news.latest(city);
        } catch (ExternalLookupException error) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Las noticias no están disponibles ahora");
        }
    }

    @GetMapping("/alerts")
    public List<NewsItem> alerts(@PathVariable String slug, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        City city = cities.find(slug).orElseThrow(() -> notFound(slug));
        try {
            return news.alerts(city);
        } catch (ExternalLookupException error) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Los avisos no están disponibles ahora");
        }
    }

    private static ResponseStatusException notFound(String slug) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Ciudad no encontrada: " + slug);
    }
}
