# Secured local API

Base URL: `http://127.0.0.1:8765/api/v1`

All endpoints accept `POST`, require `Content-Type: application/json` and require the installer-generated `X-Stream-Chat-Key` header. Browser-origin requests are rejected. Twitch bearer and refresh tokens are never returned.

## Endpoints

- `POST /auth/twitch/device` — begin Twitch Device Code authorization
- `POST /auth/twitch/poll` — poll a pending authorization
- `POST /auth/twitch/open` — open a validated Twitch activation URL
- `POST /auth/twitch/forget` — delete the encrypted Twitch login
- `POST /chat/twitch/connect` — refresh internally, validate the authenticated account and connect EventSub
- `POST /chat/events` — return the bounded chat event snapshot

## Common responses

- `200` — request completed
- `400` — invalid input or rejected upstream request
- `401` — missing or invalid installation key
- `403` — non-loopback host or browser-origin request
- `404` — unknown endpoint
- `405` — unsupported method
- `413` — body exceeds 16 KiB
- `415` — content type is not JSON
- `429` — local request rate exceeded
