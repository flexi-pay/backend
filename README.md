# FlexiPay backend: names for the Starling wallet

This service gives every Starling user a name that's easy to share, like **`nuel*flexipay.app`**, instead of a 56-character `G…` address. It follows the Stellar standards, so **any** Stellar wallet (LOBSTR, Freighter, xBull, Starling…) can pay a FlexiPay name.

| Repo | What it is |
|---|---|
| [flexi-pay/frontend](https://github.com/flexi-pay/frontend) | The Starling wallet: a web app and Chrome extension |
| **flexi-pay/backend** | This repo: names and federation |
| [flexi-pay/contracts](https://github.com/flexi-pay/contracts) | Soroban contracts (Safe pay escrow) |

## Standards

| SEP | What we use it for |
|---|---|
| [SEP-1](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md) `stellar.toml` | Tells wallets where the federation server is |
| [SEP-2](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0002.md) federation | Turns `name*domain` into a `G…` address, and back |
| [SEP-53](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md) signed messages | Proves you own the account before you claim or release a name (no passwords) |

## API

| Method | Path | Notes |
|---|---|---|
| `GET` | `/.well-known/stellar.toml` | SEP-1 |
| `GET` | `/federation?type=name&q=nuel*flexipay.app` | SEP-2 forward lookup |
| `GET` | `/federation?type=id&q=G…` | SEP-2 reverse lookup |
| `GET` | `/api/names/:name` | Availability: `{ available, reason, address }` |
| `GET` | `/api/accounts/:address` | The name for an account |
| `GET` | `/api/message?intent=register&name=…&address=…` | The exact text to sign |
| `POST` | `/api/names` | `{ name, address, timestamp, signature, memo?, memoType? }` |
| `DELETE` | `/api/names/:name` | `{ timestamp, signature }` |
| `GET` | `/health` | Liveness and stats |

**Signing:** the client signs `flexipay:<register|delete>:<name>:<address>:<unix-seconds>` with SEP-53. That's `ed25519(sha256("Stellar Signed Message:\n" + message))`, base64-encoded. Signatures expire after 5 minutes.

Other rules:

- One name per account. Claiming a new name releases the old one.
- Names are 3–32 characters: `a-z 0-9 . _ -`.
- Brand and staff names are reserved.
- Custodial accounts can attach a memo that senders will include automatically.

## Run

```bash
cp .env.example .env    # set HOME_DOMAIN and PUBLIC_URL
npm install
npm run dev             # http://localhost:8080
npm test                # 16 tests, including the SEP-53 spec vector
```

With Docker:

```bash
docker build -t flexipay-backend .
docker run -p 8080:8080 -v flexipay-data:/data \
  -e HOME_DOMAIN=flexipay.app -e PUBLIC_URL=https://api.flexipay.app flexipay-backend
```

### Going live

1. Serve `https://<HOME_DOMAIN>/.well-known/stellar.toml`. Either proxy it to this service, or copy its output to your website.
2. Run the service at `PUBLIC_URL` with HTTPS.
3. In the frontend, set `VITE_NAMES_API=https://api.flexipay.app` and `VITE_NAMES_DOMAIN=flexipay.app`.

Storage is a JSON file with atomic writes, which is right for a single instance. Move it to Postgres before you scale out.

## License

MIT
