# receipt-reader

Reads a receipt photo or PDF with Claude (`claude-opus-5-5`, structured output) for the KAMO Services app.
`POST /extract` takes the file as the raw body with the app's CouchDB Basic login;
only user `kamotec` gets past the login check, which runs before any Claude call. `GET /health` reports
`{"ok": true, "key": <API key loaded>}`. CORS allows only `https://dozer1986.github.io`.

The API key is read at startup from `/root/.config/kamo-services/anthropic-api-key` (`KEY_FILE`).

    npm ci && npm test              # mocked Claude
    LIVE=1 npm test                 # one real call on the Menards fixture (costs money)
    docker compose up -d --build    # 127.0.0.1:8446, host network
    tailscale serve --bg --https=8446 http://127.0.0.1:8446   # tailnet HTTPS on :8446, where the app calls it

Server-side refusal fallbacks are on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).
