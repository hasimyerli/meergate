# mock-exchange

Paribu-benzeri bir kripto borsasını **taklit eden** minik HTTP API. meerGate demoları için
çalışan gerçek bir API'ye ihtiyaç olduğunda kullanılır.

- **Sıfır dış bağımlılık** — sadece Go stdlib (JWT dahil elle yazıldı).
- **DB yok** — durum tamamen bellekte; sunucuyu yeniden başlatınca sıfırlanır.
- **Auth: JWT (HS256)** — önce login olup token al, diğer isteklerde `Authorization: Bearer <token>`.
- **Port 4010** — meerGate ile çakışmaz (web :3000, api :3001, postgres :5432).

## Çalıştırma

```bash
cd project/mock-exchange
make up            # http://localhost:4010  (Ctrl+C ile durur)
# port değiştirmek istersen:  make up PORT=4020
```

Demo kullanıcı: `demo` / `demo123` (env ile değiştirilebilir: `DEMO_USER`, `DEMO_PASS`, `JWT_SECRET`).

## Endpoint'ler

| Method | Path | Auth | Açıklama |
|---|---|---|---|
| POST | `/api/auth/login` | — | Login ol, JWT üret |
| GET  | `/api/wallet/balances` | ✔ | Cüzdan bakiyeleri |
| POST | `/api/wallet/deposit` | ✔ | Para geldi (yatır) |
| POST | `/api/wallet/withdraw` | ✔ | Para gitti (çek) |
| POST | `/api/orders/buy` | ✔ | Kripto aldım |
| POST | `/api/orders/sell` | ✔ | Kripto sattım |
| GET  | `/health` | — | Liveness |
| GET  | `/openapi.json` | — | OpenAPI 3.0 spec (meerGate keşfi için) |
| GET  | `/docs` | — | Swagger UI |

## API dokümantasyonu (Swagger)

- **Swagger UI:** http://localhost:4010/docs  (arayüz assets'i unpkg CDN'den yüklenir — Go bağımlılığı **yok**, tarayıcıda internet ister)
- **OpenAPI spec:** http://localhost:4010/openapi.json  (binary'e `go:embed` ile gömülü, tamamen yerel)

meerGate → Service Catalog'a REST hedefi eklerken bu `openapi.json` URL'sini verirsen tüm endpoint'ler otomatik keşfedilir.

Desteklenen varlıklar: `TRY` (quote), `BTC`, `ETH`, `USDT`, `SOL`. Fiyatlar sabit (mock).
Başlangıç bakiyesi: `TRY 100000`.

## Örnek akış (curl)

```bash
# 1) Login → token al
TOKEN=$(curl -s -X POST localhost:4010/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo123"}' | sed 's/.*"access_token":"\([^"]*\)".*/\1/')

# 2) Bakiye gör
curl -s localhost:4010/api/wallet/balances -H "Authorization: Bearer $TOKEN"

# 3) Para yatır (para geldi)
curl -s -X POST localhost:4010/api/wallet/deposit -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"asset":"TRY","amount":50000}'

# 4) Kripto al
curl -s -X POST localhost:4010/api/orders/buy -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"asset":"BTC","amount":0.01}'

# 5) Kripto sat
curl -s -X POST localhost:4010/api/orders/sell -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"asset":"BTC","amount":0.005}'

# 6) Para çek (para gitti)
curl -s -X POST localhost:4010/api/wallet/withdraw -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"asset":"TRY","amount":1000}'
```

## meerGate ile kullanım

Service Catalog'a REST hedefi olarak `http://localhost:4010` ekleyip test manifest'lerinde
`apiCall` step'leriyle uçtan uca senaryo kurabilirsin: login → token'ı `extract` et →
sonraki step'lerde `{{extract.token}}` olarak header'a geçir → deposit/buy/sell → bakiye assert.
