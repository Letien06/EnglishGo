import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

public class VercelBootstrap {
    private static final String HOP_BY_HOP_HEADERS =
            "connection,content-length,host,keep-alive,proxy-authenticate,proxy-authorization,te,trailer,transfer-encoding,upgrade";

    public static void main(String[] args) throws Exception {
        int publicPort = parsePort(System.getenv("PORT"), 8080);
        int appPort = parsePort(System.getenv("APP_PORT"), 18080);

        Process app = startSpringBoot(appPort);
        Runtime.getRuntime().addShutdownHook(new Thread(app::destroy));

        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(2))
                .build();

        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", publicPort), 0);
        server.createContext("/", exchange -> proxy(exchange, client, appPort, app));
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();

        System.out.println("Vercel bootstrap listening on PORT=" + publicPort
                + ", proxying Spring Boot on APP_PORT=" + appPort);

        int exitCode = app.waitFor();
        System.err.println("Spring Boot process exited with code " + exitCode);
        server.stop(0);
        System.exit(exitCode);
    }

    private static Process startSpringBoot(int appPort) throws IOException {
        ProcessBuilder builder = new ProcessBuilder("java", "-jar", "/app/app.jar");
        Map<String, String> env = builder.environment();
        env.put("PORT", String.valueOf(appPort));
        env.putIfAbsent("SPRING_PROFILES_ACTIVE", "prod");
        builder.inheritIO();
        return builder.start();
    }

    private static void proxy(HttpExchange exchange, HttpClient client, int appPort, Process app) throws IOException {
        if (!app.isAlive()) {
            byte[] body = "Application process is not running.".getBytes();
            exchange.sendResponseHeaders(502, body.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(body);
            }
            return;
        }

        try {
            URI incomingUri = exchange.getRequestURI();
            URI target = new URI("http", null, "127.0.0.1", appPort,
                    incomingUri.getPath(), incomingUri.getQuery(), null);

            HttpRequest.BodyPublisher bodyPublisher;
            try (InputStream requestBody = exchange.getRequestBody()) {
                bodyPublisher = HttpRequest.BodyPublishers.ofByteArray(requestBody.readAllBytes());
            }

            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder(target)
                    .timeout(Duration.ofSeconds(30))
                    .method(exchange.getRequestMethod(), bodyPublisher);

            copyRequestHeaders(exchange, requestBuilder);

            HttpResponse<byte[]> response = client.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofByteArray());
            copyResponseHeaders(response, exchange.getResponseHeaders());
            exchange.sendResponseHeaders(response.statusCode(), response.body().length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(response.body());
            }
        } catch (Exception ex) {
            byte[] body = ("Application is starting. Retry shortly.\n" + ex.getMessage()).getBytes();
            exchange.sendResponseHeaders(503, body.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(body);
            }
        }
    }

    private static void copyRequestHeaders(HttpExchange exchange, HttpRequest.Builder requestBuilder) {
        exchange.getRequestHeaders().forEach((name, values) -> {
            if (isForwardableHeader(name)) {
                for (String value : values) {
                    requestBuilder.header(name, value);
                }
            }
        });
        requestBuilder.header("X-Forwarded-Proto", "https");
        requestBuilder.header("X-Forwarded-Host", firstHeader(exchange.getRequestHeaders(), "Host"));
    }

    private static void copyResponseHeaders(HttpResponse<byte[]> response, Headers targetHeaders) {
        response.headers().map().forEach((name, values) -> {
            if (isForwardableHeader(name)) {
                targetHeaders.put(name, values);
            }
        });
    }

    private static boolean isForwardableHeader(String name) {
        return name != null && !List.of(HOP_BY_HOP_HEADERS.split(",")).contains(name.toLowerCase());
    }

    private static String firstHeader(Headers headers, String name) {
        List<String> values = headers.get(name);
        return values == null || values.isEmpty() ? "" : values.get(0);
    }

    private static int parsePort(String value, int fallback) {
        try {
            return value == null || value.isBlank() ? fallback : Integer.parseInt(value);
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }
}
