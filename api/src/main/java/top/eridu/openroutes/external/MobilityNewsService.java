package top.eridu.openroutes.external;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;
import top.eridu.openroutes.domain.City;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Titulares de movilidad desde Google News RSS. No carga scripts ni cookies de
 * terceros: el backend entrega títulos y enlaces, y el medio conserva su crédito.
 */
@Service
public class MobilityNewsService {

    private static final long CACHE_TTL_MS = 30 * 60 * 1000L;
    private static final int MAX_ITEMS = 8;

    private final ExternalHttp http;
    private final String baseUrl;
    private final long cacheTtlMs;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    @Autowired
    public MobilityNewsService(
            ExternalHttp http,
            @Value("${openroutes.news.base-url:https://news.google.com}") String baseUrl) {
        this(http, baseUrl, CACHE_TTL_MS);
    }

    MobilityNewsService(ExternalHttp http, String baseUrl, long cacheTtlMs) {
        this.http = http;
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.cacheTtlMs = cacheTtlMs;
    }

    public List<NewsItem> latest(City city) {
        Cached cached = cache.get(city.slug());
        if (cached != null && cached.expiresAt() > System.currentTimeMillis()) {
            return cached.items();
        }
        boolean colombia = "Colombia".equalsIgnoreCase(city.country());
        String edition = colombia ? "hl=es-419&gl=CO&ceid=CO:es-419" : "hl=es&gl=ES&ceid=ES:es";
        String query = "movilidad " + city.name() + " " + city.department();
        String url = baseUrl + "/rss/search?q=" + URLEncoder.encode(query, StandardCharsets.UTF_8)
                + "&" + edition;

        try {
            String xml = http.get(url, Map.of("Accept", "application/rss+xml, application/xml"));
            List<NewsItem> items = parse(xml);
            cache.put(city.slug(), new Cached(items, System.currentTimeMillis() + cacheTtlMs));
            return items;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new ExternalLookupException("Consulta de noticias interrumpida", error);
        } catch (Exception error) {
            throw new ExternalLookupException("No se pudieron consultar las noticias", error);
        }
    }

    private List<NewsItem> parse(String xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        Document document = factory.newDocumentBuilder()
                .parse(new InputSource(new StringReader(xml)));

        List<NewsItem> items = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        NodeList nodes = document.getElementsByTagName("item");
        for (int index = 0; index < nodes.getLength(); index++) {
            if (!(nodes.item(index) instanceof Element item)) {
                continue;
            }
            String title = text(item, "title");
            String link = text(item, "link");
            if (title.isBlank() || link.isBlank()) {
                continue;
            }
            String source = text(item, "source");
            if (!source.isBlank() && title.endsWith(" - " + source)) {
                title = title.substring(0, title.length() - source.length() - 3).trim();
            }
            if (!seen.add(normalize(title))) {
                continue;
            }
            items.add(new NewsItem(title, link, source, isoDate(text(item, "pubDate"))));
        }
        items.sort(Comparator.comparing(NewsItem::publishedAt,
                Comparator.nullsLast(Comparator.reverseOrder())));
        return List.copyOf(items.subList(0, Math.min(MAX_ITEMS, items.size())));
    }

    private static String text(Element parent, String tag) {
        NodeList nodes = parent.getElementsByTagName(tag);
        if (nodes.getLength() == 0) {
            return "";
        }
        Node node = nodes.item(0);
        return node == null ? "" : node.getTextContent().trim();
    }

    private static String isoDate(String value) {
        if (value.isBlank()) {
            return null;
        }
        try {
            return ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME)
                    .toInstant().toString();
        } catch (RuntimeException error) {
            return null;
        }
    }

    private static String normalize(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ")
                .trim();
    }

    public record NewsItem(String title, String url, String source, String publishedAt) {
        public NewsItem {
            publishedAt = publishedAt == null ? null : Instant.parse(publishedAt).toString();
        }
    }

    private record Cached(List<NewsItem> items, long expiresAt) {
    }
}
