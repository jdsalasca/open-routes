package top.eridu.openroutes.external;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * Cliente HTTP compartido para servicios externos. Un solo lugar define el
 * User-Agent y los tiempos de espera que exigen OpenStreetMap y Google News.
 */
@Component
public class ExternalHttp {

    private static final String USER_AGENT =
            "open-routes/0.1 (+https://open-routes.eridu.top)";

    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    public String get(String url, Map<String, String> headers)
            throws IOException, InterruptedException {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(9))
                .header("User-Agent", USER_AGENT)
                .header("Accept-Language", "es-CO,es;q=0.9")
                .GET();
        headers.forEach(request::header);
        HttpResponse<String> response = client.send(
                request.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() != 200) {
            throw new IOException("HTTP " + response.statusCode());
        }
        return response.body();
    }
}
