using System.Diagnostics;
using Azure.Monitor.OpenTelemetry.Exporter;
using OpenTelemetry.Logs;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddApplicationInsightsTelemetry();
builder.Logging.AddOpenTelemetry(options =>
{
    options.IncludeScopes = true;
    options.AddAzureMonitorLogExporter(o =>
    {
        o.ConnectionString = builder.Configuration["ApplicationInsights:ConnectionString"];
    });
});
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});
builder.Services.AddHttpClient("Backend", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["BackendUrl"] ?? "http://localhost:5200");
});

var app = builder.Build();

app.UseCors();

// --- Proxy helper ---

async Task<IResult> ProxyGet(string path, IHttpClientFactory httpClientFactory, ILogger<Program> logger)
{
    var sw = Stopwatch.StartNew();
    using (logger.BeginScope(new Dictionary<string, object> { ["ProxyPath"] = path }))
    {
        logger.LogInformation("Gateway: proxying GET {Path} to Backend", path);
        var client = httpClientFactory.CreateClient("Backend");
        var response = await client.GetAsync(path);
        var body = await response.Content.ReadAsStringAsync();
        sw.Stop();

        logger.LogInformation("Gateway: Backend returned {StatusCode} in {ElapsedMs}ms",
            (int)response.StatusCode, sw.ElapsedMilliseconds);

        return Results.Content(body, "application/json", statusCode: (int)response.StatusCode);
    }
}

async Task<IResult> ProxyPost(string path, HttpRequest request, IHttpClientFactory httpClientFactory, ILogger<Program> logger)
{
    var sw = Stopwatch.StartNew();
    using (logger.BeginScope(new Dictionary<string, object> { ["ProxyPath"] = path }))
    {
        logger.LogInformation("Gateway: proxying POST {Path} to Backend", path);
        var client = httpClientFactory.CreateClient("Backend");

        using var content = new StreamContent(request.Body);
        content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
        var response = await client.PostAsync(path, content);
        var body = await response.Content.ReadAsStringAsync();
        sw.Stop();

        logger.LogInformation("Gateway: Backend returned {StatusCode} in {ElapsedMs}ms",
            (int)response.StatusCode, sw.ElapsedMilliseconds);

        return Results.Content(body, "application/json", statusCode: (int)response.StatusCode);
    }
}

// --- User endpoints ---

app.MapGet("/api/users", async (IHttpClientFactory httpClientFactory, ILogger<Program> logger) =>
    await ProxyGet("/api/users", httpClientFactory, logger));

app.MapGet("/api/users/{id:int}", async (int id, IHttpClientFactory httpClientFactory, ILogger<Program> logger) =>
    await ProxyGet($"/api/users/{id}", httpClientFactory, logger));

// --- Product endpoints ---

app.MapGet("/api/products", async (IHttpClientFactory httpClientFactory, ILogger<Program> logger) =>
    await ProxyGet("/api/products", httpClientFactory, logger));

app.MapGet("/api/products/{id:int}", async (int id, IHttpClientFactory httpClientFactory, ILogger<Program> logger) =>
    await ProxyGet($"/api/products/{id}", httpClientFactory, logger));

// --- Order endpoints ---

app.MapPost("/api/orders", async (HttpRequest request, IHttpClientFactory httpClientFactory, ILogger<Program> logger) =>
    await ProxyPost("/api/orders", request, httpClientFactory, logger));

app.MapGet("/api/orders", async (IHttpClientFactory httpClientFactory, ILogger<Program> logger) =>
    await ProxyGet("/api/orders", httpClientFactory, logger));

// --- Slow / error endpoints ---

app.MapGet("/api/slow", async (IHttpClientFactory httpClientFactory, ILogger<Program> logger) =>
    await ProxyGet("/api/slow", httpClientFactory, logger));

app.MapGet("/api/chain-error", async (IHttpClientFactory httpClientFactory, ILogger<Program> logger) =>
    await ProxyGet("/api/chain-error", httpClientFactory, logger));

app.MapGet("/api/error", IResult (ILogger<Program> logger) =>
{
    logger.LogError("Gateway: about to throw a deliberate error");
    throw new ApplicationException("This is a deliberate Gateway exception for testing.");
});

// --- Health check ---

app.MapGet("/health", async (IHttpClientFactory httpClientFactory, ILogger<Program> logger) =>
{
    using (logger.BeginScope(new Dictionary<string, object> { ["Operation"] = "HealthCheck" }))
    {
        logger.LogDebug("Gateway health check — pinging Backend");
        try
        {
            var client = httpClientFactory.CreateClient("Backend");
            var response = await client.GetAsync("/health");
            var backendHealthy = response.IsSuccessStatusCode;
            if (!backendHealthy)
                logger.LogWarning("Backend health check returned {StatusCode}", (int)response.StatusCode);

            return Results.Ok(new
            {
                status = backendHealthy ? "healthy" : "degraded",
                service = "Api.Gateway",
                backend = backendHealthy ? "healthy" : "unhealthy",
                timestamp = DateTime.UtcNow,
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Backend unreachable during health check");
            return Results.Ok(new
            {
                status = "degraded",
                service = "Api.Gateway",
                backend = "unreachable",
                timestamp = DateTime.UtcNow,
            });
        }
    }
});

app.Run();
