# Java — build do .jar com Maven + runtime só JRE, não-root. Porta via ENV.
# --- build ---
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml ./
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B clean package -DskipTests

# --- runtime ---
FROM eclipse-temurin:21-jre AS runtime
ENV PORT=8080
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
RUN useradd --no-create-home app && chown -R app:app /app
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/actuator/health" >/dev/null || exit 1
ENTRYPOINT ["sh", "-c", "java -jar app.jar --server.port=${PORT}"]
