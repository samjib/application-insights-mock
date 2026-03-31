# Application Insights Mock

A local mock Application Insights server with live monitoring

## Quick Start

### Docker

```bash
docker build -t mock-application-insights .
docker run -p 3000:3000 mock-application-insights
```

Open http://localhost:3000 to see the dashboard.

### Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000 to see the dashboard.

### Demo

<video autoplay loop muted playsinline controls width="100%">
  <source src=".readme/Demo.mp4" type="video/mp4">
</video>

Launch the mock server with demo application using Docker Compose:

```bash
docker compose -f demo/docker-compose.yml up --build
```

Service | URL
:- | :-
Dashboard | http://localhost:3000
Test Web UI | http://localhost:3001
Gateway API | http://localhost:5100
Backend API | http://localhost:5200

Stop with `docker compose -f demo/docker-compose.yml down`.

## Connecting Your .NET App

Update your Application Insights connection string to point at your local server:

```
InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=http://localhost:3000
```

In `appsettings.Development.json`:

```json
{
  "ApplicationInsights": {
    "ConnectionString": "InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=http://localhost:3000"
  }
}
```
