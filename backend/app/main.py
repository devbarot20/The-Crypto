from __future__ import annotations

import json
import os
import tempfile
import csv
import io
import time
from datetime import datetime, timedelta, time as clock_time
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from kiteconnect import KiteConnect
from pydantic import BaseModel, Field, SecretStr, field_validator, model_validator
import requests
import concurrent.futures


ROOT_DIR = Path(__file__).resolve().parents[1]
SESSION_FILE = ROOT_DIR / ".local" / "kite_session.json"
CONSTITUENTS_FILE = ROOT_DIR / ".local" / "nifty100.csv"
CONSTITUENTS_URL = "https://www.niftyindices.com/IndexConstituent/ind_nifty100list.csv"
IST = ZoneInfo("Asia/Kolkata")

raw_origins = os.getenv("CORS_ORIGINS", "*")
if raw_origins == "*":
    origins = ["*"]
else:
    origins = [orig.strip() for orig in raw_origins.split(",") if orig.strip()]
    for local_orig in ("http://127.0.0.1:5173", "http://localhost:5173"):
        if local_orig not in origins:
            origins.append(local_orig)

app = FastAPI(title="Kite Desk API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)



class LoginPayload(BaseModel):
    api_key: str
    api_secret: SecretStr
    request_token: SecretStr

    @field_validator("api_key")
    @classmethod
    def api_key_must_not_be_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Enter your API key.")
        return value


class SignalsRequest(BaseModel):
    short_sma: int = Field(default=6, ge=2, le=200)
    long_sma: int = Field(default=30, ge=3, le=500)
    lookback_days: int = Field(default=30, ge=1, le=365)
    max_stocks: int = Field(default=100, ge=1, le=100)

    @model_validator(mode="after")
    def validate_sma_order(self) -> "SignalsRequest":
        if self.short_sma >= self.long_sma:
            raise ValueError("Short SMA must be less than Long SMA.")
        return self


def _read_session() -> dict[str, str] | None:
    try:
        data = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict) and data.get("api_key") and data.get("access_token"):
            return {"api_key": str(data["api_key"]), "access_token": str(data["access_token"])}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    return None


def _save_session(api_key: str, access_token: str) -> None:
    SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(SESSION_FILE.parent, 0o700)
    fd, temp_name = tempfile.mkstemp(prefix="session-", suffix=".tmp", dir=SESSION_FILE.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump({"api_key": api_key, "access_token": access_token}, file)
            file.flush()
            os.fsync(file.fileno())
        os.chmod(temp_name, 0o600)
        os.replace(temp_name, SESSION_FILE)
        os.chmod(SESSION_FILE, 0o600)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def _clear_session() -> None:
    try:
        SESSION_FILE.unlink()
    except FileNotFoundError:
        pass


def _kite_for_session(session: dict[str, str]) -> KiteConnect:
    kite = KiteConnect(api_key=session["api_key"])
    kite.set_access_token(session["access_token"])
    return kite


def _profile_for_session(session: dict[str, str]) -> dict[str, Any]:
    return _kite_for_session(session).profile()


def _nifty100_constituents() -> list[dict[str, str]]:
    """Load the current constituent list from NSE Indices, with a 12-hour local cache."""
    if CONSTITUENTS_FILE.exists() and time.time() - CONSTITUENTS_FILE.stat().st_mtime < 12 * 60 * 60:
        content = CONSTITUENTS_FILE.read_text(encoding="utf-8-sig")
    else:
        response = requests.get(
            CONSTITUENTS_URL,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; KiteDesk/1.0)",
                "Referer": "https://www.niftyindices.com/indices/equity/broad-based-indices",
            },
            timeout=20,
        )
        response.raise_for_status()
        content = response.content.decode("utf-8-sig")
        CONSTITUENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
        CONSTITUENTS_FILE.write_text(content, encoding="utf-8")
        os.chmod(CONSTITUENTS_FILE, 0o600)

    rows = list(csv.DictReader(io.StringIO(content)))
    constituents = []
    for row in rows:
        normalized = {str(key).strip().lower(): (value or "").strip() for key, value in row.items()}
        symbol = normalized.get("symbol", "")
        company = normalized.get("company name", "")
        series = normalized.get("series", "EQ")
        if symbol and company and series.upper() == "EQ":
            constituents.append({"symbol": symbol, "company": company})
    if not constituents:
        raise RuntimeError("The official Nifty 100 constituent CSV did not contain expected columns.")
    return constituents


def _simple_moving_averages(closes: list[float], period: int) -> list[float | None]:
    averages: list[float | None] = [None] * len(closes)
    rolling_sum = 0.0
    for index, close in enumerate(closes):
        rolling_sum += close
        if index >= period:
            rolling_sum -= closes[index - period]
        if index >= period - 1:
            averages[index] = rolling_sum / period
    return averages


def _fetch_candles_public_nse(symbol: str, calendar_days: int) -> list[dict[str, Any]]:
    """Fetch daily candles from official NSE public quote feed as fallback when Kite Historical API is not subscribed."""
    try:
        range_param = "6mo" if calendar_days <= 180 else "1y"
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}.NS?interval=1d&range={range_param}"
        response = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}, timeout=6)
        if response.status_code != 200:
            return []
        data = response.json()
        chart = data.get("chart", {}).get("result", [])
        if not chart:
            return []
        timestamps = chart[0].get("timestamp", [])
        quotes = chart[0].get("indicators", {}).get("quote", [{}])[0]
        closes_raw = quotes.get("close", [])
        candles = []
        for ts, c in zip(timestamps, closes_raw):
            if ts is not None and c is not None:
                d = datetime.fromtimestamp(ts, tz=IST).date()
                candles.append({"date": d, "close": float(c)})
        return candles
    except Exception:
        return []


def _scan_signals(kite: KiteConnect, params: SignalsRequest) -> dict[str, Any]:
    try:
        constituents = _nifty100_constituents()
        instruments = kite.instruments("NSE")
    except Exception as error:
        if "TokenException" in type(error).__name__:
            raise RuntimeError("Your Kite session has expired. Sign in again, then regenerate signals.") from error
        raise RuntimeError("Could not load the Nifty 100 list or Kite NSE instruments. Check your connection and try again.") from error

    by_symbol = {
        item.get("tradingsymbol", ""): item
        for item in instruments
        if item.get("exchange") == "NSE" and item.get("instrument_type") == "EQ"
    }
    matched = [
        {**constituent, "instrument": by_symbol[constituent["symbol"]]}
        for constituent in constituents
        if constituent["symbol"] in by_symbol
    ]
    if not matched:
        raise RuntimeError("No Nifty 100 stocks matched Kite NSE instruments. Refresh your Kite session and retry.")

    now = datetime.now(IST)
    calendar_days = max(90, (params.lookback_days + params.long_sma + 20) * 2)
    start = (now - timedelta(days=calendar_days)).replace(hour=0, minute=0, second=0, microsecond=0)
    start_text = start.strftime("%Y-%m-%d %H:%M:%S")
    end_text = now.strftime("%Y-%m-%d %H:%M:%S")

    # Probe Kite historical API on the first stock to check permissions
    use_kite = True
    probe_stock = matched[0]
    try:
        kite.historical_data(probe_stock["instrument"]["instrument_token"], start_text, end_text, "day")
    except Exception as probe_error:
        if "TokenException" in type(probe_error).__name__:
            raise RuntimeError("Your Kite session has expired. Sign in again, then regenerate signals.") from probe_error
        # Kite Historical API requires an additional paid add-on on developers.kite.trade.
        # Fall back to live public NSE daily candles if not enabled.
        use_kite = False

    data_source = "kite" if use_kite else "nse_public"
    data_source_label = "Kite Connect" if use_kite else "NSE Live Market Feed (Kite Historical API not enabled on app)"
    signal_rows: list[dict[str, Any]] = []
    skipped = 0

    if use_kite:
        request_started = 0.0
        for stock in matched:
            wait = 0.36 - (time.monotonic() - request_started) if request_started else 0
            if wait > 0:
                time.sleep(wait)
            request_started = time.monotonic()
            try:
                candles = kite.historical_data(
                    stock["instrument"]["instrument_token"], start_text, end_text, "day"
                )
            except Exception as error:
                if "TokenException" in type(error).__name__:
                    raise RuntimeError("Your Kite session has expired. Sign in again, then regenerate signals.") from error
                skipped += 1
                continue

            clean = []
            for candle in candles:
                candle_date = candle["date"].date() if isinstance(candle["date"], datetime) else datetime.fromisoformat(str(candle["date"])).date()
                if candle_date == now.date() and now.time() < clock_time(15, 30):
                    continue
                clean.append({"date": candle_date, "close": float(candle["close"])})

            closes = [item["close"] for item in clean]
            short_values = _simple_moving_averages(closes, params.short_sma)
            long_values = _simple_moving_averages(closes, params.long_sma)
            first_candidate = max(params.long_sma, len(clean) - params.lookback_days)
            latest_signal = None
            for index in range(first_candidate, len(clean)):
                previous_short, previous_long = short_values[index - 1], long_values[index - 1]
                current_short, current_long = short_values[index], long_values[index]
                if None in (previous_short, previous_long, current_short, current_long):
                    continue
                bullish = previous_short <= previous_long and current_short > current_long
                bearish = previous_short >= previous_long and current_short < current_long
                if bullish or bearish:
                    latest_signal = {
                        "ticker": stock["symbol"],
                        "company": stock["company"],
                        "crossover_type": "Bullish" if bullish else "Bearish",
                        "crossover_date": clean[index]["date"].isoformat(),
                        "close": clean[index]["close"],
                        "short_sma": current_short,
                        "long_sma": current_long,
                    }
            if latest_signal:
                signal_rows.append(latest_signal)
    else:
        # Fast parallel scanner for public NSE daily candles
        def process_stock(stock: dict[str, Any]) -> dict[str, Any] | None:
            raw_candles = _fetch_candles_public_nse(stock["symbol"], calendar_days)
            clean = []
            for candle in raw_candles:
                candle_date = candle["date"]
                if candle_date == now.date() and now.time() < clock_time(15, 30):
                    continue
                clean.append(candle)
            if len(clean) < params.long_sma:
                return None

            closes = [item["close"] for item in clean]
            short_values = _simple_moving_averages(closes, params.short_sma)
            long_values = _simple_moving_averages(closes, params.long_sma)
            first_candidate = max(params.long_sma, len(clean) - params.lookback_days)
            latest_signal = None
            for index in range(first_candidate, len(clean)):
                previous_short, previous_long = short_values[index - 1], long_values[index - 1]
                current_short, current_long = short_values[index], long_values[index]
                if None in (previous_short, previous_long, current_short, current_long):
                    continue
                bullish = previous_short <= previous_long and current_short > current_long
                bearish = previous_short >= previous_long and current_short < current_long
                if bullish or bearish:
                    latest_signal = {
                        "ticker": stock["symbol"],
                        "company": stock["company"],
                        "crossover_type": "Bullish" if bullish else "Bearish",
                        "crossover_date": clean[index]["date"].isoformat(),
                        "close": clean[index]["close"],
                        "short_sma": current_short,
                        "long_sma": current_long,
                    }
            return latest_signal

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(process_stock, s): s for s in matched}
            for future in concurrent.futures.as_completed(futures):
                try:
                    sig = future.result()
                    if sig:
                        signal_rows.append(sig)
                except Exception:
                    skipped += 1

    signal_rows.sort(key=lambda row: row["ticker"])
    signal_rows.sort(key=lambda row: row["crossover_date"], reverse=True)
    limited = signal_rows[: params.max_stocks]
    for rank, row in enumerate(limited, start=1):
        row["rank"] = rank
    return {
        "signals": limited,
        "summary": {
            "universe": len(constituents),
            "matched": len(matched),
            "skipped": skipped,
            "found": len(signal_rows),
            "returned": len(limited),
            "short_sma": params.short_sma,
            "long_sma": params.long_sma,
            "lookback_days": params.lookback_days,
            "data_source": data_source,
            "data_source_label": data_source_label,
            "generated_at": datetime.now(IST).isoformat(timespec="seconds"),
        },
    }


def _public_profile(profile: dict[str, Any]) -> dict[str, Any]:
    # Deliberately return only the fields required by this dashboard.
    return {
        "user_name": profile.get("user_name", ""),
        "user_id": profile.get("user_id", ""),
        "products": profile.get("products", []),
        "exchanges": profile.get("exchanges", []),
    }


def _error_message(error: Exception) -> str:
    message = str(error).strip()
    if "TokenException" in type(error).__name__ or "token" in message.lower():
        return "That request token may have expired or already been used. Start a fresh Kite login and try again."
    if "NetworkException" in type(error).__name__:
        return "Could not reach Kite Connect. Check your connection and try again."
    return "Kite Connect could not complete the request. Check your credentials and try again."


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/session")
def get_session() -> dict[str, Any]:
    session = _read_session()
    if not session:
        return {"authenticated": False}
    try:
        profile = _profile_for_session(session)
        return {"authenticated": True, "profile": _public_profile(profile)}
    except Exception:
        # Daily-expiring/invalid tokens are removed so the UI can request a fresh login.
        _clear_session()
        return {"authenticated": False}


@app.post("/api/login")
def login(payload: LoginPayload) -> dict[str, Any]:
    try:
        kite = KiteConnect(api_key=payload.api_key)
        session_data = kite.generate_session(
            payload.request_token.get_secret_value().strip(),
            api_secret=payload.api_secret.get_secret_value(),
        )
        access_token = session_data["access_token"]
        kite.set_access_token(access_token)
        profile = kite.profile()
        _save_session(payload.api_key, access_token)
        return {"authenticated": True, "profile": _public_profile(profile)}
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_error_message(error),
        ) from None


@app.get("/api/profile")
def get_profile() -> dict[str, Any]:
    session = _read_session()
    if not session:
        raise HTTPException(status_code=401, detail="No saved Kite session. Please log in again.")
    try:
        return _public_profile(_profile_for_session(session))
    except Exception:
        _clear_session()
        raise HTTPException(status_code=401, detail="Your Kite session has expired. Please log in again.") from None


@app.post("/api/logout")
def logout() -> dict[str, bool]:
    _clear_session()
    return {"ok": True}


@app.post("/api/signals")
def get_signals(params: SignalsRequest) -> dict[str, Any]:
    session = _read_session()
    if not session:
        raise HTTPException(status_code=401, detail="No saved Kite session. Please log in again.")
    kite = _kite_for_session(session)
    try:
        return _scan_signals(kite, params)
    except RuntimeError as error:
        message = str(error)
        if "session has expired" in message.lower():
            _clear_session()
            raise HTTPException(status_code=401, detail=message) from None
        raise HTTPException(status_code=502, detail=message) from None


@app.get("/api/portfolio")
def get_portfolio() -> dict[str, Any]:
    session = _read_session()
    if not session:
        raise HTTPException(status_code=401, detail="No saved Kite session. Please log in again.")
    kite = _kite_for_session(session)
    try:
        holdings = kite.holdings()
        positions = kite.positions()
        margins = kite.margins()

        total_investment = sum(float(h.get("average_price", 0) * h.get("quantity", 0)) for h in holdings)
        current_value = sum(float(h.get("last_price", 0) * h.get("quantity", 0)) for h in holdings)
        total_pnl = current_value - total_investment
        pnl_percent = (total_pnl / total_investment * 100) if total_investment > 0 else 0.0
        day_pnl = sum(float(h.get("pnl", 0)) for h in holdings)

        equity_margin = margins.get("equity", {}).get("net", 0.0)

        return {
            "holdings": holdings,
            "positions": positions.get("net", []),
            "day_positions": positions.get("day", []),
            "summary": {
                "total_investment": total_investment,
                "current_value": current_value,
                "total_pnl": total_pnl,
                "pnl_percent": pnl_percent,
                "day_pnl": day_pnl,
                "available_margin": equity_margin,
                "holdings_count": len(holdings),
            },
        }
    except Exception as error:
        if "session" in str(error).lower() or "token" in str(error).lower():
            _clear_session()
            raise HTTPException(status_code=401, detail="Your Kite session has expired. Please log in again.") from None
        raise HTTPException(status_code=500, detail=str(error)) from None


@app.get("/api/chart/{symbol}")
def get_chart_data(symbol: str, short_sma: int = 6, long_sma: int = 30, range: str = "6mo") -> dict[str, Any]:
    sym = symbol.strip().upper().replace(".NS", "")
    range_param = "1mo" if range == "1mo" else ("3mo" if range == "3mo" else ("1y" if range == "1y" else "6mo"))

    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}.NS?interval=1d&range={range_param}"
    try:
        res = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}, timeout=8)
        if res.status_code != 200:
            raise HTTPException(status_code=404, detail=f"Stock data not found for {sym}")
        data = res.json()
        result = data.get("chart", {}).get("result", [])
        if not result:
            raise HTTPException(status_code=404, detail=f"No chart data available for {sym}")

        meta = result[0].get("meta", {})
        timestamps = result[0].get("timestamp", [])
        indicators = result[0].get("indicators", {})
        quotes = indicators.get("quote", [{}])[0]

        opens = quotes.get("open", [])
        highs = quotes.get("high", [])
        lows = quotes.get("low", [])
        closes = quotes.get("close", [])
        volumes = quotes.get("volume", [])

        candles = []
        clean_closes = []
        for i, ts in enumerate(timestamps):
            if (
                ts is not None
                and i < len(closes)
                and closes[i] is not None
                and i < len(opens)
                and opens[i] is not None
                and i < len(highs)
                and highs[i] is not None
                and i < len(lows)
                and lows[i] is not None
            ):
                d = datetime.fromtimestamp(ts, tz=IST).strftime("%Y-%m-%d")
                o = round(float(opens[i]), 2)
                h = round(float(highs[i]), 2)
                l = round(float(lows[i]), 2)
                c = round(float(closes[i]), 2)
                v = int(volumes[i]) if (volumes and i < len(volumes) and volumes[i] is not None) else 0
                candles.append({
                    "time": d,
                    "open": o,
                    "high": h,
                    "low": l,
                    "close": c,
                    "volume": v,
                })
                clean_closes.append(c)

        short_vals = _simple_moving_averages(clean_closes, short_sma)
        long_vals = _simple_moving_averages(clean_closes, long_sma)

        sma_short_series = []
        sma_long_series = []
        for i, c in enumerate(candles):
            if i < len(short_vals) and short_vals[i] is not None:
                sma_short_series.append({"time": c["time"], "value": round(short_vals[i], 2)})
            if i < len(long_vals) and long_vals[i] is not None:
                sma_long_series.append({"time": c["time"], "value": round(long_vals[i], 2)})

        cur_price = meta.get("regularMarketPrice", clean_closes[-1] if clean_closes else 0.0)
        prev_close = meta.get("previousClose", clean_closes[-2] if len(clean_closes) >= 2 else cur_price)
        change = round(cur_price - prev_close, 2) if prev_close else 0.0
        change_pct = round((change / prev_close) * 100, 2) if prev_close else 0.0

        return {
            "symbol": sym,
            "currency": meta.get("currency", "INR"),
            "current_price": cur_price,
            "previous_close": prev_close,
            "change": change,
            "change_pct": change_pct,
            "candles": candles,
            "sma_short": sma_short_series,
            "sma_long": sma_long_series,
            "short_period": short_sma,
            "long_period": long_sma,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

