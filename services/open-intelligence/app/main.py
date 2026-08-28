from __future__ import annotations

import os
from datetime import date
from importlib.metadata import PackageNotFoundError, version
from typing import Any

import financedatabase as fd
import pandas_market_calendars as mcal
from edgar import Company, set_identity
from fastapi import FastAPI, HTTPException, Query
from fredapi import Fred
from sec_cik_mapper import StockMapper

app = FastAPI(title="Mercury Open Intelligence Sidecar", version="1.0.0")

_mapper: StockMapper | None = None
_equities: Any | None = None


def package_version(name: str) -> str | None:
    try:
        return version(name)
    except PackageNotFoundError:
        return None


def normalize_record(record: Any) -> dict[str, Any]:
    if hasattr(record, "to_dict"):
        data = record.to_dict()
    elif isinstance(record, dict):
        data = dict(record)
    else:
        data = {"value": str(record)}
    clean: dict[str, Any] = {}
    for key, value in data.items():
        if value is None:
            clean[str(key)] = None
        elif hasattr(value, "isoformat"):
            clean[str(key)] = value.isoformat()
        elif hasattr(value, "item"):
            try:
                clean[str(key)] = value.item()
            except Exception:
                clean[str(key)] = str(value)
        else:
            clean[str(key)] = value
    return clean


def mapper() -> StockMapper:
    global _mapper
    if _mapper is None:
        _mapper = StockMapper()
    return _mapper


def equities():
    global _equities
    if _equities is None:
        _equities = fd.Equities()
    return _equities


def configure_edgar() -> None:
    identity = os.getenv("EDGAR_IDENTITY") or os.getenv("SEC_USER_AGENT")
    if not identity:
        raise HTTPException(status_code=503, detail="edgar_identity_not_configured")
    set_identity(identity)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "mercury-open-intelligence",
        "mode": "shadow",
        "capitalExecutionEnabled": False,
        "repositories": {
            "edgartools": package_version("edgartools"),
            "sec-cik-mapper": package_version("sec-cik-mapper"),
            "financedatabase": package_version("financedatabase"),
            "pandas-market-calendars": package_version("pandas-market-calendars"),
            "fredapi": package_version("fredapi"),
        },
        "configured": {
            "edgar": bool(os.getenv("EDGAR_IDENTITY") or os.getenv("SEC_USER_AGENT")),
            "fred": bool(os.getenv("FRED_API_KEY")),
        },
    }


@app.get("/identity/{symbol}")
def resolve_identity(symbol: str) -> dict[str, Any]:
    symbol = symbol.upper().strip()
    m = mapper()
    cik = m.ticker_to_cik.get(symbol)
    return {
        "symbol": symbol,
        "cik": cik,
        "issuerName": m.ticker_to_company_name.get(symbol),
        "exchange": m.ticker_to_exchange.get(symbol),
        "source": "sec-cik-mapper",
        "evidenceClass": "reference",
        "mode": "shadow",
        "capitalExecutionEnabled": False,
    }


@app.get("/reference/equity/{symbol}")
def equity_reference(symbol: str) -> dict[str, Any]:
    symbol = symbol.upper().strip()
    frame = equities().data
    matches = frame.loc[frame.index.astype(str).str.upper() == symbol]
    if matches.empty:
        return {"symbol": symbol, "found": False, "source": "financedatabase", "evidenceClass": "reference"}
    rows = [normalize_record(row) | {"symbol": str(index)} for index, row in matches.head(10).iterrows()]
    return {
        "symbol": symbol,
        "found": True,
        "records": rows,
        "source": "financedatabase",
        "evidenceClass": "reference",
        "mode": "shadow",
        "capitalExecutionEnabled": False,
    }


@app.get("/calendar/{exchange}")
def market_calendar(exchange: str, start: date = Query(...), end: date = Query(...)) -> dict[str, Any]:
    if start > end:
        raise HTTPException(status_code=400, detail="invalid_date_range")
    try:
        calendar = mcal.get_calendar(exchange)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"calendar_not_found:{exc}") from exc
    schedule = calendar.schedule(start_date=start, end_date=end, tz="UTC")
    early = set(calendar.early_closes(schedule).index.strftime("%Y-%m-%d"))
    sessions = []
    for session_date, row in schedule.iterrows():
        key = session_date.strftime("%Y-%m-%d")
        sessions.append({
            "sessionDate": key,
            "openAt": row["market_open"].isoformat(),
            "closeAt": row["market_close"].isoformat(),
            "earlyClose": key in early,
        })
    return {
        "exchange": exchange,
        "sessions": sessions,
        "source": "pandas-market-calendars",
        "evidenceClass": "reference",
        "mode": "shadow",
        "capitalExecutionEnabled": False,
    }


@app.get("/fred/{series_id}")
def fred_series(
    series_id: str,
    start: str | None = None,
    end: str | None = None,
    vintage_date: str | None = None,
) -> dict[str, Any]:
    key = os.getenv("FRED_API_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="fred_api_key_not_configured")
    fred = Fred(api_key=key)
    try:
        if vintage_date:
            series = fred.get_series_as_of_date(series_id, vintage_date)
            rows = [
                {"observationDate": str(row["date"]), "vintageDate": str(row["realtime_start"]), "value": row["value"]}
                for _, row in series.iterrows()
            ]
        else:
            series = fred.get_series(series_id, observation_start=start, observation_end=end)
            rows = [
                {"observationDate": index.date().isoformat(), "vintageDate": date.today().isoformat(), "value": None if value != value else float(value)}
                for index, value in series.items()
            ]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"fred_failed:{exc}") from exc
    return {
        "seriesId": series_id,
        "observations": rows,
        "source": "fred-alfred",
        "evidenceClass": "authoritative",
        "mode": "shadow",
        "capitalExecutionEnabled": False,
    }


@app.get("/edgar/company/{identifier}")
def edgar_company(identifier: str) -> dict[str, Any]:
    configure_edgar()
    try:
        company = Company(identifier)
        data = company.data
        return {
            "identifier": identifier,
            "cik": str(company.cik).zfill(10),
            "name": company.name,
            "tickers": list(getattr(data, "tickers", []) or []),
            "exchanges": list(getattr(data, "exchanges", []) or []),
            "formerNames": normalize_record({"former_names": getattr(data, "former_names", None)}).get("former_names"),
            "source": "sec-edgar:edgartools",
            "evidenceClass": "authoritative",
            "mode": "shadow",
            "capitalExecutionEnabled": False,
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"edgar_company_failed:{exc}") from exc


@app.get("/edgar/filings/{identifier}")
def edgar_filings(identifier: str, form: str = "8-K", limit: int = 20) -> dict[str, Any]:
    configure_edgar()
    limit = max(1, min(100, limit))
    try:
        company = Company(identifier)
        filings = company.get_filings(form=form).head(limit)
        rows = []
        for filing in filings:
            rows.append({
                "accessionNumber": getattr(filing, "accession_no", None),
                "form": getattr(filing, "form", form),
                "filingDate": str(getattr(filing, "filing_date", "")),
                "company": getattr(filing, "company", None),
                "cik": str(getattr(filing, "cik", company.cik)).zfill(10),
            })
        return {
            "identifier": identifier,
            "form": form,
            "filings": rows,
            "source": "sec-edgar:edgartools",
            "evidenceClass": "authoritative",
            "mode": "shadow",
            "capitalExecutionEnabled": False,
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"edgar_filings_failed:{exc}") from exc


@app.get("/edgar/form4/{identifier}")
def edgar_form4(identifier: str, limit: int = 20) -> dict[str, Any]:
    configure_edgar()
    limit = max(1, min(50, limit))
    try:
        company = Company(identifier)
        filings = company.get_filings(form="4").head(limit)
        rows: list[dict[str, Any]] = []
        for filing in filings:
            try:
                obj = filing.obj()
                payload = obj.to_dict() if hasattr(obj, "to_dict") else {"text": str(obj)}
            except Exception as exc:
                payload = {"parseError": str(exc)}
            rows.append({
                "accessionNumber": getattr(filing, "accession_no", None),
                "filingDate": str(getattr(filing, "filing_date", "")),
                "payload": normalize_record(payload),
            })
        return {
            "identifier": identifier,
            "transactions": rows,
            "source": "sec-edgar:edgartools",
            "evidenceClass": "authoritative",
            "mode": "shadow",
            "capitalExecutionEnabled": False,
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"edgar_form4_failed:{exc}") from exc
