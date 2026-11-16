package top.eridu.openroutes.domain;

import java.util.List;

public record Route(
        String id,
        String code,
        String name,
        String color,
        String type,
        String description,
        Schedule weekday,
        Schedule sunday,
        String operator,
        String sourceUrl,
        boolean circular,
        List<Direction> directions
) {
}
