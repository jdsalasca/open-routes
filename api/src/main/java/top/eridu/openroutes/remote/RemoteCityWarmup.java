package top.eridu.openroutes.remote;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** Prepara los feeds remotos en segundo plano para que el primer usuario no espere. */
@Component
public class RemoteCityWarmup {

    private static final Logger log = LoggerFactory.getLogger(RemoteCityWarmup.class);

    private final RemoteCityCatalog catalog;
    private final RemoteCityService service;
    private final boolean enabled;

    public RemoteCityWarmup(
            RemoteCityCatalog catalog,
            RemoteCityService service,
            @Value("${openroutes.remote.warmup:false}") boolean enabled
    ) {
        this.catalog = catalog;
        this.service = service;
        this.enabled = enabled;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void warmup() {
        if (!enabled) {
            return;
        }
        Thread.ofVirtual().name("remote-city-warmup").start(() -> {
            for (RemoteCityDefinition definition : catalog.all()) {
                try {
                    service.load(definition);
                } catch (RuntimeException error) {
                    log.warn("No se pudo preparar {}: {}", definition.slug(), error.getMessage());
                }
            }
        });
    }
}
