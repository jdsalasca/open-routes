package top.eridu.openroutes.remote;

import java.util.List;

/** Metadatos y feed de una ciudad que no vive como JSON en el classpath. */
public record RemoteCityDefinition(
        String slug,
        String name,
        String department,
        String country,
        String timezone,
        top.eridu.openroutes.domain.Point center,
        int zoom,
        String description,
        List<top.eridu.openroutes.domain.Source> sources,
        List<top.eridu.openroutes.domain.SocialAccount> social,
        top.eridu.openroutes.domain.Fare fare,
        FeedDefinition feed
) {
}
