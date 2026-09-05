# Improvement backlog

Findings from a sweep of the application, verified against a running instance
under synthetic load (10,000 items) driven through a real browser.

Everything here is **still outstanding**. The items already fixed are listed
under [Already done](#already-done) at the bottom, so this file can be read as a
to-do list without cross-referencing git history.

Each item notes where it lives and what the fix is. Severity is:

- **S1** — breaks the app, loses data, or blocks a documented workflow
- **S2** — visible defect or a real cost to daily use
- **S3** — polish, hardening, or a nice-to-have

---

## 1. Correctness

### 1.1 One malformed line discards the whole batch — S1
`src/lib/track-handler.ts:28` (`parseEnvelopes`)

Three NDJSON lines where the middle one is malformed returns `400` with
`itemsReceived: 0`. Both valid items are lost. The real Application Insights
ingestion API accepts what it can and reports failures per index, which is what
the `errors[]` array in the response shape is for.

**Fix:** parse line by line, collect successes, and return `206` with one
`{ index, statusCode, message }` entry per failed line. Reserve `400` for a body
that yields no valid items at all.

**Repro:**
```bash
printf '{"name":"Microsoft.ApplicationInsights.Event","time":"2026-01-01T00:00:00Z","data":{"baseType":"EventData","baseData":{"ver":2,"name":"Good1"}}}\n{oops}\n{"name":"Microsoft.ApplicationInsights.Event","time":"2026-01-01T00:00:00Z","data":{"baseType":"EventData","baseData":{"ver":2,"name":"Good2"}}}\n' \
  | curl -s -X POST localhost:3000/v2/track --data-binary @-
```

### 1.2 A pretty-printed single envelope is rejected — S2
`src/lib/track-handler.ts:36`

The format heuristic is `trimmed.startsWith('{') && !trimmed.includes('\n')`, so
any single JSON object spanning multiple lines falls into the NDJSON branch and
fails with `400`.

**Fix:** try `JSON.parse` on the whole body first; fall back to line-splitting
only when that throws.

### 1.3 `PUT /api/settings` returns 500 on a bad body — S2
`src/app/api/settings/route.ts:11`

`await request.json()` is unguarded, so a malformed or empty body throws an
uncaught `SyntaxError` and Next.js returns a 500 with a stack trace in the log.

**Fix:** wrap in `try/catch` and return `400` with a message.

### 1.4 The client list grows without bound — S1
`src/app/page.tsx` (SSE flush handler)

`MAX_ITEMS` caps the *server's* ring buffer; the dashboard ignores it. Pushing
12,000 items to a server configured for 10,000 leaves the client holding 12,000
and still climbing — memory grows for the life of the tab, and the list shows
items the server has already evicted.

**Fix:** trim `items` to the capacity reported by `/api/events` (`capacity` is
already in the response) on each flush. Do the same for `pendingItems`, which
accumulates without limit while paused.

> Now that the list is virtualised this is a memory problem rather than a
> rendering one, but it is the single largest remaining resource issue.

### 1.5 Reconnect silently drops history — S3
`src/app/page.tsx` (`refreshState` on `es.onopen`)

On reconnect the snapshot replaces `items` wholesale. Items the client holds but
the server has since evicted from its ring buffer disappear from the view.

**Fix:** merge the snapshot into the existing list by `id` instead of replacing.

### 1.6 Gap between the snapshot and the stream subscription — S3
`src/app/page.tsx` (`refreshState()` is called before `new EventSource(...)`)

An item ingested after the snapshot is taken but before the SSE listener
attaches is missed until the next reconnect. Narrow, and not reproduced in
practice — the window is sub-millisecond in the same process — but the ordering
is wrong on principle.

**Fix:** open the stream first, buffer what arrives, then fetch the snapshot and
merge by `id`.

### 1.7 Clear and settings writes have no failure path — S3
`src/app/page.tsx` (`handleClear`, `onDropMetricsToggle`)

- `handleClear` clears locally *and* the server broadcasts a `clear` event, so
  the work happens twice. If the `DELETE` fails, the UI empties while the server
  keeps everything.
- The `dropMetrics` toggle flips local state before the `PUT` resolves and never
  rolls back on failure.

**Fix:** let the broadcast `clear` event drive the local reset, and roll the
toggle back when the request fails.

### 1.8 Settings do not sync between tabs — S3

Two open dashboards disagree about `dropMetrics` until one is reloaded.

**Fix:** broadcast setting changes over the existing SSE stream.

### 1.9 Object URL revoked synchronously after download — S3
`src/app/page.tsx` (`downloadNdjson`)

`URL.revokeObjectURL(url)` runs immediately after `a.click()`. Chromium tolerates
this; other browsers have historically cancelled the download.

**Fix:** revoke on a timeout (or in `requestIdleCallback`).

---

## 2. Performance

The interaction cost of the list itself is resolved. What remains is per-batch
work that scales with buffer depth.

### 2.1 Full O(n) rescans on every batch — S2
`src/app/page.tsx` (`availableCategories`, `typeCounts`)

Both memos rescan every retained item whenever a batch lands, purely to populate
the category autocomplete and the type-filter counts.

**Fix:** maintain both incrementally — either in the store (and ship them with
the batch) or in a reducer on the client.

### 2.2 The filtered list is re-sorted from scratch each batch — S2
`src/app/page.tsx` (`filteredItems`)

`.slice().sort()` over the whole buffer on every update. Items arrive in near
timestamp order with monotonic ids, so almost all of that work is redundant.

**Fix:** keep the list newest-first and merge-insert incoming items.

### 2.3 `/api/events` responses are uncompressed — S2
`src/app/api/events/route.ts`

A full-buffer response is 8.1 MB with no `Content-Encoding`, even when the client
sends `Accept-Encoding: gzip`. The dashboard no longer requests the full buffer,
but any client that does pays for it.

**Fix:** confirm whether the standalone server compresses API routes and enable
it, or gzip the payload in the route.

### 2.4 Store reads allocate more than they need — S3
`src/lib/telemetry-store.ts` (`getAll`, `getByType`)

`getAll()` copies the entire ring buffer on every call, and `getByType` calls it
and then filters, allocating twice.

**Fix:** give `getByType` its own single-pass walk, and add a `getRecent(n)` that
copies only the tail.

---

## 3. Layout and visual

### 3.1 The detail split is fixed at 50/50 — S2
`src/app/page.tsx` (`w-1/2`)

The list is squeezed to half the window while the detail pane usually has large
empty space below the content.

**Fix:** a draggable splitter with the position persisted; 60/40 favouring the
list as the default.

### 3.2 Native checkboxes ignore their colour classes — S2
`src/components/ColumnPicker.tsx:111`, `src/components/FilterBar.tsx:391`

`className="rounded text-indigo-600"` does nothing to a native checkbox — it
renders in the browser's default blue, which clashes with the dark theme and
with the custom checkmarks used in the Types dropdown.

**Fix:** `accent-indigo-600` / `accent-orange-600`, or reuse the Types dropdown's
custom control everywhere.

### 3.3 Critical severity is the least legible — S2
`src/components/TelemetryItemRow.tsx` (`SEVERITY_COLORS[4]`)

`text-red-700` on a `gray-950` background fails WCAG contrast. Critical should be
the most readable severity, not the least.

**Fix:** move to `text-red-300`/`text-red-400` and check the whole severity ramp
against the dark background.

### 3.4 `Clear All` has no confirmation — S2
`src/components/FilterBar.tsx:405`

One misclick discards the entire buffer with no undo.

**Fix:** require a confirm step, or clear immediately with a few seconds of undo.

### 3.5 Response codes are not colour-coded — S3

Failure is conveyed only by the `✓`/`✗` column. A `500` reads identically to a
`200` in the summary and the response-code column.

**Fix:** colour 4xx amber and 5xx red in both places.

### 3.6 Detail pane polish — S3
`src/components/TelemetryDetail.tsx`

- No copy button on the Raw JSON view.
- A failed request or dependency is not emphasised in the pane header.
- Long property lists cannot be collapsed.
- The header repeats the row summary verbatim rather than showing a type badge.

---

## 4. Responsive layout

### 4.1 Narrow viewports overflow and clip — S2

At 390px wide, `document.scrollWidth` is 418 against a 390px window, and `<body>`
is `overflow-hidden`, so the overflow is unreachable. The filter bar wraps onto
three rows and eats a third of the screen, and the search input is cut off.

**Fix:** below a breakpoint, collapse the filter bar behind a menu, shorten
timestamps (the Time column claims 160px for millisecond precision), and make the
detail pane a full-screen overlay rather than a half-width sibling.

### 4.2 `h-screen` clips under mobile browser chrome — S3
`src/app/page.tsx`

**Fix:** `h-dvh`.

---

## 5. Accessibility

### 5.1 Rows cannot be reached by keyboard — S2
`src/components/TelemetryItemRow.tsx`

Rows are `<div onClick>` with no `role`, no `tabIndex` and no key handler.
Keyboard and screen-reader users cannot select an item at all.

**Fix:** `role="row"` + `tabIndex={0}` + Enter/Space activation +
`aria-selected`, with a `focus-visible` ring. Note the interaction with
virtualisation: focus needs restoring when a focused row is recycled out of the
window.

### 5.2 Dropdown triggers do not announce state — S2
`src/components/FilterBar.tsx`, `src/components/ColumnPicker.tsx`

The Types, Settings and Columns buttons have no `aria-expanded`, `aria-haspopup`
or `aria-controls`.

### 5.3 Close buttons are unlabelled — S2
`src/components/TelemetryDetail.tsx:371` and the three `×` buttons in `FilterBar`

The detail close button has neither `aria-label` nor `title`; a screen reader
announces only "×".

### 5.4 Connection status is conveyed by colour alone — S2
`src/app/page.tsx`

A 2×2px dot with a `title` attribute. Colour-blind users get nothing, and `title`
is unreliable for assistive tech.

**Fix:** add a visually-hidden `role="status"` region alongside the dot.

### 5.5 Hover-only actions are invisible to keyboard users — S3
`src/components/TelemetryDetail.tsx` (`KeyValue`)

The `search` and `filter op` buttons are `opacity-0 group-hover:opacity-100`.

**Fix:** add `focus-within:opacity-100`.

### 5.6 The list has no table semantics — S3

Nothing associates a value with its column heading.

**Fix:** `role="grid"` / `role="row"` / `role="gridcell"` with
`aria-colindex`, or a real `<table>` with the same grid tracks.

### 5.7 Motion is not user-configurable — S3

The scroll-to-top animation and any future transitions ignore
`prefers-reduced-motion`.

---

## 6. Keyboard

### 6.1 Space is bound to pause, so it cannot page-scroll — S3
`src/app/page.tsx` (keydown handler)

`e.preventDefault()` on Space means the list cannot be paged with the spacebar,
which is the default expectation in a scrolling log view.

**Fix:** move pause to `p` and update the shortcut hint in the Settings popover.

### 6.2 No shortcut discovery beyond the settings menu — S3

Shortcuts are listed only in a footnote inside the Settings popover.

**Fix:** a `?` overlay listing all shortcuts.

---

## 7. Server, API and hardening

### 7.1 Dashboard endpoints are open cross-origin — S2
`src/app/api/events/route.ts`

`Access-Control-Allow-Origin: *` with `GET, DELETE` applies to the dashboard
API, not just ingest. Any site visited while the mock is running can read the
captured telemetry — which routinely contains real request URLs, headers and
custom properties — or wipe it.

**Fix:** keep `*` on `/v2/track` and `/v2.1/track`, where SDKs need it. Restrict
`/api/*` to same-origin.

### 7.2 No authentication on any endpoint — S3

Including `DELETE /api/events`. Acceptable for a local dev tool; it should be
stated in the README so nobody exposes the port to a shared network.

### 7.3 Missing `OPTIONS` handlers — S3
`src/app/api/settings/route.ts`, `src/app/api/events/stream/route.ts`

Both lack the `OPTIONS` handler the other routes provide.

### 7.4 Concurrent dashboards are silently capped — S3
`src/lib/telemetry-store.ts:49`

`setMaxListeners(200)` with two listeners per stream allows ~100 tabs before Node
warns. Listener cleanup on disconnect was tested (250 rapid connect/disconnect
cycles produced no leak), so this is a soft cap rather than a bug.

**Fix:** derive the limit from the connection count, and add `request.signal`
cleanup alongside the stream's `cancel()` as belt-and-braces.

### 7.5 Ingest errors are logged as full stack traces — S3
`src/lib/track-handler.ts:84`

A misbehaving client fills the console with stack traces.

**Fix:** log a one-line summary and rate-limit repeats.

---

## 8. Build, packaging and DX

### 8.1 The Dockerfile probably fails — S1 *(not verified)*
`Dockerfile:22`

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
```

There is no `public/` directory: it has never been committed, and `next build`
does not create one (confirmed — `.next/standalone/public` is absent after a
build). A `COPY` from a non-existent path is a hard BuildKit error, so
`docker build`, the documented quick start, should fail.

Not verified directly — no Docker daemon was available in the environment where
this sweep ran — but the evidence points one way.

**Fix:** drop the line, or add `public/.gitkeep`.

### 8.2 `npm start` warns and does not honour the config — S2
`package.json`, `next.config.ts`

`output: 'standalone'` makes `next start` print:

```
⚠ "next start" does not work with "output: standalone" configuration.
  Use "node .next/standalone/server.js" instead.
```

The README recommends `npm start`.

**Fix:** point the `start` script at the standalone server, or set
`output: 'standalone'` only for the Docker build.

### 8.3 No tests — S1

`resolveType`, `buildSummary`, `formatDuration`, `isEnvelope`, `parseEnvelopes`,
`extractColumnValue` and the ring buffer are all pure and trivially testable.
Several of the defects found in this sweep would have been caught by a dozen unit
tests.

**Fix:** add `vitest` and cover the pure helpers, then the store's wrap-around
behaviour and the ingest route's error shapes.

### 8.4 No CI — S1

Nothing runs `lint` or `build` on a push. The `demo/` typecheck breakage sat in
`main` undetected.

**Fix:** a GitHub Actions workflow running `npm ci && npm run lint && npm run build`.

### 8.5 160 dead dark-mode variants — S3

`<html>` hardcodes `class="dark"`, so every `dark:` variant always applies and
every light-mode class is dead. That is 160 variant usages across six files,
doubling class strings and inflating the stylesheet to 43 KB.

**Fix:** either drop the light classes for a deliberately dark-only tool, or wire
up a real theme toggle and keep both.

### 8.6 Fonts are fetched from Google at build time — S3
`src/app/layout.tsx`

`next/font/google` downloads Geist during `next build`, so builds need outbound
network access to `fonts.googleapis.com`.

**Fix:** self-host the font files.

---

## 9. Features worth building

### 9.1 Operation waterfall — S2

The app already correlates by `ai.operation.id` and can filter to one operation.
Rendering a request with its dependencies and traces as a timeline is the single
feature that would make this meaningfully better than reading raw JSON, and most
of the data plumbing already exists.

### 9.2 URL-addressable state — S2

Filters and the selected item live only in component state, so a view cannot be
shared, bookmarked or restored across a reload.

**Fix:** mirror filters and the selected id into the query string.

### 9.3 Filter persistence — S3

Column selection persists to `localStorage`; hidden types, category filters,
search and pause do not. Persist all of it or none of it.

### 9.4 A "new items" affordance — S3

Scrolled away from the top, hundreds of items can arrive with no indication.
The row under the cursor correctly stays put, so nothing signals the change.

**Fix:** a "N new ↑" pill that scrolls to top when clicked.

### 9.5 Smaller wins — S3

- Highlight the matched substring in search results.
- A delta column: time since the previous item in the operation.
- Relative timestamps ("2s ago") alongside absolute ones.
- Copy-as-curl for requests and dependencies.
- Item or exception count in the tab title, so a backgrounded dashboard is
  useful at a glance.
- Column sorting and resizing.

---

## Already done

Fixed in `perf: virtualise the telemetry list and fix the crashes it exposed`:

| | Was |
|:--|:--|
| Build broken on a clean checkout | `tsconfig` typechecked `demo/`, whose deps are never installed |
| Malformed telemetry killed the dashboard | `[123, "hello"]` stored as items with no summary; the next keystroke in the search box blanked the page |
| A corrupt `localStorage` value bricked every load | Non-array column selection crashed on read, and reloading could not clear it |
| No error boundary | Any render failure produced an unrecoverable blank page |
| List rendered every item | 10,000 rows = 70,073 DOM nodes; now virtualised to ~45 rows / 392 nodes |
| Table columns were ragged | Trailing columns were content-sized and conditionally rendered, so no two rows agreed on where a column started |
| Durations shown as raw TimeSpans | `00:00:02.5000000` → `2.50 s` |
| One React commit per ingest request | Batches now coalesce on a 120ms flush |
| Search filtered synchronously per keystroke | Deferred, with a per-item cached haystack and one compiled matcher per category filter |
| Detail pane animated the list's width | 364ms freeze on first row click, now 13ms |
| First paint parsed the whole buffer | 8.1MB of JSON; now the most recent 2000 items |
| `itemsAccepted` over-reported | Counted received rather than kept, including dropped Metrics |

Measured at ~9k items, before → after:

| | Before | After |
|:--|--:|--:|
| Live-burst frame p95 | 95 ms | 17 ms |
| Live-burst long tasks | 1,785 ms across 13 | none |
| Row click → detail painted | 364 ms | 13 ms |
| Scroll frame p95 | 30 ms | 17 ms |
| DOM nodes | 70,073 | 392 |
| JS heap | 62 MB | 13 MB |
