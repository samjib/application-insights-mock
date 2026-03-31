using Microsoft.ApplicationInsights;
using System.Diagnostics;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddApplicationInsightsTelemetry();

var app = builder.Build();

// --- Mock data ---

var users = new[]
{
    new { Id = 1, Name = "Alice Johnson", Email = "alice@example.com", Role = "Admin" },
    new { Id = 2, Name = "Bob Smith", Email = "bob@example.com", Role = "User" },
    new { Id = 3, Name = "Charlie Brown", Email = "charlie@example.com", Role = "User" },
    new { Id = 4, Name = "Diana Prince", Email = "diana@example.com", Role = "Manager" },
};

var products = new[]
{
    new { Id = 101, Name = "Widget A", Price = 9.99m, Stock = 150 },
    new { Id = 102, Name = "Widget B", Price = 24.50m, Stock = 42 },
    new { Id = 103, Name = "Gadget Pro", Price = 149.00m, Stock = 8 },
    new { Id = 104, Name = "Thingamajig", Price = 3.25m, Stock = 0 },
};

var orders = new List<object>();
var orderIdSeq = 1000;

// --- User endpoints ---

app.MapGet("/api/users", (ILogger<Program> logger, TelemetryClient tc) =>
{
    using (logger.BeginScope(new Dictionary<string, object> { ["Operation"] = "ListUsers" }))
    {
        logger.LogInformation("Fetching all users");
        tc.TrackEvent("UsersListed", new Dictionary<string, string> { ["count"] = users.Length.ToString() });
        tc.TrackMetric("Users.ListCount", users.Length);
        logger.LogDebug("Returning {Count} users", users.Length);
        return Results.Ok(users);
    }
});

app.MapGet("/api/users/{id:int}", (int id, ILogger<Program> logger, TelemetryClient tc) =>
{
    using (logger.BeginScope(new Dictionary<string, object> { ["Operation"] = "GetUser", ["UserId"] = id }))
    {
        logger.LogInformation("Fetching user {UserId}", id);

        if (id == 0)
        {
            logger.LogError("Attempted to fetch user with invalid ID 0");
            throw new InvalidOperationException("User ID 0 is not valid — this is a demo exception.");
        }

        var user = users.FirstOrDefault(u => u.Id == id);
        if (user is null)
        {
            logger.LogWarning("User {UserId} not found — returning 404", id);
            tc.TrackEvent("UserNotFound", new Dictionary<string, string> { ["userId"] = id.ToString() });
            return Results.NotFound(new { error = $"User {id} not found" });
        }

        logger.LogDebug("Found user {UserName} with role {Role}", user.Name, user.Role);
        return Results.Ok(user);
    }
});

// --- Product endpoints ---

app.MapGet("/api/products", (ILogger<Program> logger, TelemetryClient tc) =>
{
    using (logger.BeginScope(new Dictionary<string, object> { ["Operation"] = "ListProducts" }))
    {
        logger.LogInformation("Fetching product catalogue");
        var lowStock = products.Where(p => p.Stock < 10).ToArray();
        if (lowStock.Length > 0)
        {
            logger.LogWarning("{LowStockCount} products have low stock: {ProductNames}",
                lowStock.Length, string.Join(", ", lowStock.Select(p => p.Name)));
        }
        tc.TrackMetric("Products.CatalogueSize", products.Length);
        return Results.Ok(products);
    }
});

app.MapGet("/api/products/{id:int}", (int id, ILogger<Program> logger) =>
{
    var product = products.FirstOrDefault(p => p.Id == id);
    if (product is null)
    {
        logger.LogWarning("Product {ProductId} not found", id);
        return Results.NotFound(new { error = $"Product {id} not found" });
    }
    logger.LogInformation("Returning product {ProductName} (${Price})", product.Name, product.Price);
    return Results.Ok(product);
});

// --- Order endpoints ---

app.MapPost("/api/orders", async (HttpRequest request, ILogger<Program> logger, TelemetryClient tc) =>
{
    var sw = Stopwatch.StartNew();
    using (logger.BeginScope(new Dictionary<string, object> { ["Operation"] = "CreateOrder" }))
    {
        var body = await request.ReadFromJsonAsync<OrderRequest>();
        if (body is null || body.ProductId == 0 || body.Quantity <= 0)
        {
            logger.LogWarning("Invalid order request: {Body}", body);
            return Results.BadRequest(new { error = "ProductId and Quantity (>0) are required" });
        }

        var product = products.FirstOrDefault(p => p.Id == body.ProductId);
        if (product is null)
        {
            logger.LogWarning("Order references unknown product {ProductId}", body.ProductId);
            return Results.BadRequest(new { error = $"Product {body.ProductId} not found" });
        }

        if (product.Stock < body.Quantity)
        {
            logger.LogWarning("Insufficient stock for product {ProductId}: requested {Qty}, available {Stock}",
                product.Id, body.Quantity, product.Stock);
            tc.TrackEvent("OrderRejected.InsufficientStock", new Dictionary<string, string>
            {
                ["productId"] = product.Id.ToString(),
                ["requested"] = body.Quantity.ToString(),
                ["available"] = product.Stock.ToString(),
            });
            return Results.Conflict(new { error = "Insufficient stock", available = product.Stock });
        }

        // Simulate processing latency
        var processingMs = Random.Shared.Next(50, 300);
        await Task.Delay(processingMs);

        var orderId = Interlocked.Increment(ref orderIdSeq);
        var order = new
        {
            Id = orderId,
            body.ProductId,
            ProductName = product.Name,
            body.Quantity,
            Total = product.Price * body.Quantity,
            CreatedAt = DateTime.UtcNow,
        };
        orders.Add(order);

        sw.Stop();
        logger.LogInformation("Order {OrderId} created: {Quantity}x {ProductName} = ${Total:F2} (processed in {ElapsedMs}ms)",
            orderId, body.Quantity, product.Name, order.Total, sw.ElapsedMilliseconds);

        tc.TrackEvent("OrderCreated", new Dictionary<string, string>
        {
            ["orderId"] = orderId.ToString(),
            ["productId"] = product.Id.ToString(),
            ["quantity"] = body.Quantity.ToString(),
        }, new Dictionary<string, double>
        {
            ["orderTotal"] = (double)order.Total,
            ["processingMs"] = sw.ElapsedMilliseconds,
        });
        tc.TrackMetric("Orders.ProcessingTime", sw.ElapsedMilliseconds);

        return Results.Created($"/api/orders/{orderId}", order);
    }
});

app.MapGet("/api/orders", (ILogger<Program> logger) =>
{
    logger.LogInformation("Listing {OrderCount} orders", orders.Count);
    return Results.Ok(orders);
});

// --- Slow / error endpoints ---

app.MapGet("/api/slow", async (ILogger<Program> logger, TelemetryClient tc) =>
{
    var delay = Random.Shared.Next(800, 2500);
    using (logger.BeginScope(new Dictionary<string, object> { ["Operation"] = "SlowOperation", ["DelayMs"] = delay }))
    {
        logger.LogInformation("Starting slow operation ({Delay}ms)", delay);
        tc.TrackEvent("SlowOperationStarted", new Dictionary<string, string> { ["delayMs"] = delay.ToString() });
        await Task.Delay(delay);
        logger.LogInformation("Slow operation completed");
        return Results.Ok(new { message = "Slow operation complete", delayMs = delay });
    }
});

app.MapGet("/api/chain-error", (ILogger<Program> logger) =>
{
    using (logger.BeginScope(new Dictionary<string, object> { ["Operation"] = "ChainError" }))
    {
        logger.LogWarning("Simulating a chained exception scenario");
        try
        {
            try
            {
                throw new InvalidOperationException("Database connection timed out after 30s");
            }
            catch (Exception dbEx)
            {
                throw new ApplicationException("Failed to load user profile from data store", dbEx);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled error in chain-error endpoint");
            throw;
        }
    }
});

// --- Health check ---

app.MapGet("/health", (ILogger<Program> logger) =>
{
    logger.LogDebug("Health check OK");
    return Results.Ok(new { status = "healthy", service = "Api.Backend", timestamp = DateTime.UtcNow });
});

app.Run();

record OrderRequest(int ProductId, int Quantity);
