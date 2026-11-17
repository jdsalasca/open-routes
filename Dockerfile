# syntax=docker/dockerfile:1

FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-21 AS api
WORKDIR /api
COPY api/pom.xml ./
RUN mvn -q -DskipTests dependency:go-offline
COPY api/src ./src
COPY --from=web /web/dist ./src/main/resources/static
RUN mvn -q package

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=api /api/target/open-routes-*.jar app.jar
RUN mkdir -p /app/cache && chown -R app:app /app/cache
ENV TZ=America/Bogota
ENV OPENROUTES_CACHE_DIR=/app/cache
ENV OPENROUTES_REMOTE_WARMUP=true
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
