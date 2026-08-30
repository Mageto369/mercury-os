from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from importlib.metadata import PackageNotFoundError, version
from typing import Any

import backtrader as bt
import numpy as np
import pandas as pd
import quantstats as qs
import vectorbt as vbt
import yfinance as yf
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Mercury Research & Proof Sidecar", version="1.0.0")


def package_version(name: str) -> str | None:
    try:
        return version(name)
    except PackageNotFoundError:
        return None


def safe_number(value: Any) -> float | None:
    try:
        number = float(value)
        return number if np.isfinite(number) else None
    except Exception:
        return None


class SeriesInput(BaseModel):
    timestamps: list[str]
    prices: list[float]
    entries: list[bool] | None = None
    exits: list[bool] | None = None
    fees: float = Field(default=0.001, ge=0, le=0.1)
    slippage: float = Field(default=0.001, ge=0, le=0.1)
    init_cash: float = Field(default=100000, gt=0)


class ProofInput(BaseModel):
    timestamps: list[str]
    returns: list[float]
    scope: str = "shadow"


class BacktraderInput(BaseModel):
    timestamps: list[str]
    open: list[float]
    high: list[float]
    low: list[float]
    close: list[float]
    volume: list[float]
    fast: int = Field(default=10, ge=2, le=100)
    slow: int = Field(default=30, ge=3, le=250)
    commission: float = Field(default=0.001, ge=0, le=0.1)
    cash: float = Field(default=100000, gt=0)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "mercury-research-proof",
        "mode": "shadow",
        "capitalExecutionEnabled": False,
        "evidenceClass": "research",
        "repositories": {
            "vectorbt": package_version("vectorbt"),
            "quantstats": package_version("quantstats"),
            "yfinance": package_version("yfinance"),
            "backtrader": package_version("backtrader"),
        },
    }


@app.post("/vectorbt/experiment")
def vectorbt_experiment(payload: SeriesInput) -> dict[str, Any]:
    if len(payload.timestamps) != len(payload.prices) or len(payload.prices) < 3:
        raise HTTPException(status_code=400, detail="invalid_price_series")
    index = pd.to_datetime(payload.timestamps, utc=True)
    close = pd.Series(payload.prices, index=index, dtype=float)
    entries = pd.Series(payload.entries if payload.entries is not None else [False, True] + [False] * (len(close) - 2), index=index)
    exits = pd.Series(payload.exits if payload.exits is not None else [False] * (len(close) - 2) + [True, False], index=index)
    try:
        portfolio = vbt.Portfolio.from_signals(close, entries, exits, init_cash=payload.init_cash, fees=payload.fees, slippage=payload.slippage, freq="D")
        stats = portfolio.stats()
        result = {str(k): safe_number(v) if isinstance(v, (int, float, np.number)) else str(v) for k, v in stats.items()}
        return {
            "ok": True,
            "engine": "vectorbt",
            "metrics": result,
            "totalReturnPct": safe_number(portfolio.total_return() * 100),
            "maxDrawdownPct": safe_number(portfolio.max_drawdown() * 100),
            "tradeCount": int(portfolio.trades.count()),
            "mode": "shadow",
            "evidenceClass": "research",
            "capitalExecutionEnabled": False,
        }
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"vectorbt_experiment_failed:{exc}") from exc


@app.post("/quantstats/proof")
def quantstats_proof(payload: ProofInput) -> dict[str, Any]:
    if len(payload.timestamps) != len(payload.returns) or len(payload.returns) < 3:
        raise HTTPException(status_code=400, detail="invalid_return_series")
    series = pd.Series(payload.returns, index=pd.to_datetime(payload.timestamps, utc=True), dtype=float)
    try:
        metrics = {
            "sharpe": safe_number(qs.stats.sharpe(series)),
            "sortino": safe_number(qs.stats.sortino(series)),
            "calmar": safe_number(qs.stats.calmar(series)),
            "maxDrawdown": safe_number(qs.stats.max_drawdown(series)),
            "winRate": safe_number(qs.stats.win_rate(series)),
            "profitFactor": safe_number(qs.stats.profit_factor(series)),
            "expectedShortfall": safe_number(qs.stats.expected_shortfall(series)),
            "volatility": safe_number(qs.stats.volatility(series)),
            "cagr": safe_number(qs.stats.cagr(series)),
        }
        return {
            "ok": True,
            "engine": "quantstats",
            "scope": payload.scope,
            "metrics": metrics,
            "mode": "shadow",
            "evidenceClass": "research",
            "capitalExecutionEnabled": False,
        }
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"quantstats_failed:{exc}") from exc


class SmaCross(bt.Strategy):
    params = dict(fast=10, slow=30)

    def __init__(self):
        fast = bt.ind.SMA(period=self.p.fast)
        slow = bt.ind.SMA(period=self.p.slow)
        self.cross = bt.ind.CrossOver(fast, slow)

    def next(self):
        if not self.position and self.cross > 0:
            self.buy()
        elif self.position and self.cross < 0:
            self.close()


@app.post("/backtrader/challenger")
def backtrader_challenger(payload: BacktraderInput) -> dict[str, Any]:
    n = len(payload.timestamps)
    if n < payload.slow + 2 or any(len(x) != n for x in [payload.open, payload.high, payload.low, payload.close, payload.volume]):
        raise HTTPException(status_code=400, detail="invalid_ohlcv_series")
    frame = pd.DataFrame({
        "open": payload.open,
        "high": payload.high,
        "low": payload.low,
        "close": payload.close,
        "volume": payload.volume,
    }, index=pd.to_datetime(payload.timestamps, utc=True))
    cerebro = bt.Cerebro(stdstats=False)
    cerebro.broker.setcash(payload.cash)
    cerebro.broker.setcommission(commission=payload.commission)
    cerebro.adddata(bt.feeds.PandasData(dataname=frame))
    cerebro.addstrategy(SmaCross, fast=payload.fast, slow=payload.slow)
    start = cerebro.broker.getvalue()
    try:
        cerebro.run()
        end = cerebro.broker.getvalue()
        return {
            "ok": True,
            "engine": "backtrader",
            "startValue": start,
            "endValue": end,
            "returnPct": ((end / start) - 1) * 100,
            "parameters": {"fast": payload.fast, "slow": payload.slow, "commission": payload.commission},
            "mode": "shadow",
            "evidenceClass": "research",
            "capitalExecutionEnabled": False,
        }
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"backtrader_failed:{exc}") from exc


@app.get("/yfinance/history/{symbol}")
def yfinance_history(symbol: str, period: str = "1mo", interval: str = "1d") -> dict[str, Any]:
    symbol = symbol.upper().strip()
    try:
        data = yf.Ticker(symbol).history(period=period, interval=interval, auto_adjust=False, actions=False)
        rows = []
        for ts, row in data.tail(500).iterrows():
            rows.append({
                "time": ts.isoformat(),
                "open": safe_number(row.get("Open")),
                "high": safe_number(row.get("High")),
                "low": safe_number(row.get("Low")),
                "close": safe_number(row.get("Close")),
                "volume": safe_number(row.get("Volume")),
            })
        return {
            "ok": True,
            "symbol": symbol,
            "rows": rows,
            "source": "yfinance",
            "evidenceClass": "research",
            "termsWarning": "Research fallback only. Do not promote to authoritative or licensed evidence.",
            "mode": "shadow",
            "capitalExecutionEnabled": False,
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"yfinance_failed:{exc}") from exc
