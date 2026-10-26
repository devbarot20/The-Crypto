# Kite Desk

A local React + Vite dashboard with a FastAPI backend for Kite Connect login, profile details, and a Nifty 100 SMA crossover scanner. The API secret and request token are sent only to FastAPI; the access token is kept in a private backend file and is never returned to the browser.

## Requirements

- Python 3.10 or newer
- Node.js 20 or newer and npm
- A Kite Connect app with its API key and API secret

## Project Structure

```text
frontend/
  ├── index.html            Vite entry HTML with custom icon
  ├── package.json          Frontend dependencies & scripts
  ├── vite.config.js        Vite development server configuration
  ├── public/               Static assets & favicon
  └── src/
      ├── main.jsx          React login and trading dashboard
      └── styles.css        Dark theme and responsive UI styles

backend/
  ├── app/
  │   ├── __init__.py
  │   └── main.py           FastAPI endpoints and Kite SDK integration
  ├── requirements.txt      Python dependencies
  └── .local/               Local session & cache (git-ignored)
```

## Kite Connect Setup

In the Kite developer console, set the app's redirect URL to:

```text
http://127.0.0.1:5173/
```

Run the app on that same host. On the login page, enter your API key and secret, choose **Open Kite login**, complete the Zerodha sign-in, and copy the `request_token` from the redirect URL into the form. The request token is short-lived and single-use. The app removes it from the address bar after capturing it.

## Run Locally

### 1. Start the Backend (FastAPI)

From the project root:

```bash
# Setup virtual environment if not already created
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Start backend server on port 8000
uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

### 2. Start the Frontend (React + Vite)

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Alternatively, from the project root:
```bash
npm run dev:frontend
```

Open <http://127.0.0.1:5173> in your browser.

## Local Session Behavior

After a successful token exchange, FastAPI stores the API key and access token in `backend/.local/kite_session.json` with owner-only file permissions where supported. This file is ignored by Git. On frontend reloads and code changes, the dashboard asks the backend to validate and reuse the saved session. Kite access tokens are valid for the trading day; when Kite rejects an expired token, the local session file is cleared and the login screen returns. To force a fresh login, stop the backend and remove `backend/.local/kite_session.json`.

The dashboard's **User** tab calls `GET /api/profile` and displays the user name, user ID, products, and exchanges. **Sign out** removes the saved local session. No endpoint returns the access token. Keep your API secret private and do not commit credentials or the local session file.

## Signals Scanner

Open the **Signals** tab and choose the short SMA, long SMA, lookback window, and maximum number of results. The scanner downloads the current Nifty 100 constituent CSV from NSE Indices and caches it locally for 12 hours. It maps symbols to Kite NSE equity instruments, fetches daily candles, detects the latest bullish or bearish crossover for each stock within the requested trading-day window, and ranks results by crossover date. The scan calls Kite sequentially within its historical-data request limit, so scanning the full universe can take around 40 seconds. **Max stocks** limits the number of ranked signals shown after the full universe is scanned.

The scanner omits today's candle while the market is open so signals use completed daily candles. If a few symbols cannot be fetched, they are skipped and reported above the results. The historical API must be enabled for the Kite Connect app.
# The-Crypto
