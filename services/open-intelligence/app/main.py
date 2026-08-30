from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta
from importlib.metadata import PackageNotFoundError, version
from typing import Any
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

import holidays
import httpx
from fastapi import FastAPI, HTTPException, Query
from holidays.constants import HALF_DAY, PUBLIC

app = FastAPI(title="Mercury Open Intelligence Sidecar", version="1.0.0")

SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers_exchange.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{document}"
FRED_OBSERVATIONS_URL = "https://api.stlouisfed.org/fred/series/observations"
US_EQUITY_EXCHANGES = {"NYSE", "NASDAQ", "XNYS", "XNAS", "NASD"}
NEW_YORK = ZoneInfo("America/New_York")
UTC = ZoneInfo("UTC")
DEFAULT_EDGAR_IDENTITY = (
    "MercuryOS/0.4 personal-research "
    "https://github.com/Mageto369/mercury-os"
)

_ticker_records: dict[str, dict[str, Any]] | None = None
_cik_records: dict[str, dict[str, Any]] | None = None


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


def configure_edgar() -> str:
    return os.getenv("EDGAR_IDENTITY") or os.getenv("SEC_USER_AGENT") or DEFAULT_EDGAR_IDENTITY


def provider_get_json(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    response = httpx.get(url, params=params, headers=headers, timeout=20, follow_redirects=True)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("provider_response_not_an_object")
    return payload


def provider_get_text(url: str, *, headers: dict[str, str] | None = None) -> str:
    response = httpx.get(url, headers=headers, timeout=20, follow_redirects=True)
    response.raise_for_status()
    return response.text


def sec_headers() -> dict[str, str]:
    return {
        "User-Agent": configure_edgar(),
        "Accept-Encoding": "gzip, deflate",
        "Host": "www.sec.gov",
    }


def parse_ticker_catalog(payload: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    fields = payload.get("fields")
    rows = payload.get("data")
    if not isinstance(fields, list) or not isinstance(rows, list):
        raise ValueError("invalid_sec_ticker_catalog")

    by_ticker: dict[str, dict[str, Any]] = {}
    by_cik: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, list) or len(row) != len(fields):
            continue
        record = dict(zip(fields, row))
        ticker = str(record.get("ticker") or "").upper().strip()
        cik = str(record.get("cik") or "").zfill(10)
        if ticker:
            by_ticker[ticker] = record
        if cik.strip("0"):
            by_cik[cik] = record
    return by_ticker, by_cik


def ticker_catalog() -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    global _ticker_records, _cik_records
    if _ticker_records is None or _cik_records is None:
        payload = provider_get_json(SEC_TICKERS_URL, headers=sec_headers())
        _ticker_records, _cik_records = parse_ticker_catalog(payload)
    return _ticker_records, _cik_records


def build_security_universe(
    records: list[dict[str, Any]],
    exchanges: set[str],
    offset: int,
    limit: int,
) -> tuple[int, list[dict[str, Any]]]:
    selected: list[dict[str, Any]] = []
    for record in records:
        ticker = str(record.get("ticker") or "").upper().strip()
        exchange = str(record.get("exchange") or "").upper().strip()
        cik = str(record.get("cik") or "").zfill(10)
        if not ticker or exchange not in exchanges or not cik.strip("0"):
            continue
        selected.append({
            "symbol": ticker,
            "name": record.get("name"),
            "market": "NASDAQ" if exchange == "NASDAQ" else exchange,
            "cik": cik,
        })
    selected.sort(key=lambda row: str(row["symbol"]))
    return len(selected), selected[offset:offset + limit]


def resolve_identifier(identifier: str) -> tuple[str, dict[str, Any] | None]:
    key = identifier.upper().strip()
    by_ticker, by_cik = ticker_catalog()
    if key.isdigit():
        cik = key.zfill(10)
        return cik, by_cik.get(cik)
    record = by_ticker.get(key)
    if record is None:
        raise HTTPException(status_code=404, detail="company_not_found")
    return str(record.get("cik") or "").zfill(10), record


def company_submissions(identifier: str) -> tuple[str, dict[str, Any]]:
    cik, _ = resolve_identifier(identifier)
    payload = provider_get_json(
        SEC_SUBMISSIONS_URL.format(cik=cik),
        headers=sec_headers() | {"Host": "data.sec.gov"},
    )
    return cik, payload


def recent_filings(payload: dict[str, Any], form: str, limit: int) -> list[dict[str, Any]]:
    recent = payload.get("filings", {}).get("recent", {})
    if not isinstance(recent, dict):
        raise ValueError("invalid_sec_submissions")
    forms = recent.get("form") or []
    rows: list[dict[str, Any]] = []
    for index, filing_form in enumerate(forms):
        if str(filing_form).upper() != form.upper():
            continue
        rows.append({
            "accessionNumber": (recent.get("accessionNumber") or [None] * len(forms))[index],
            "form": filing_form,
            "filingDate": (recent.get("filingDate") or [None] * len(forms))[index],
            "reportDate": (recent.get("reportDate") or [None] * len(forms))[index],
            "primaryDocument": (recent.get("primaryDocument") or [None] * len(forms))[index],
        })
        if len(rows) >= limit:
            break
    return rows


def xml_text(node: ElementTree.Element, name: str) -> str | None:
    for descendant in node.iter():
        if descendant.tag.rsplit("}", 1)[-1] != name:
            continue
        if descendant.text and descendant.text.strip():
            return descendant.text.strip()
        for child in descendant.iter():
            if child is not descendant and child.text and child.text.strip():
                return child.text.strip()
    return None


def parse_form4_xml(xml: str) -> dict[str, Any]:
    root = ElementTree.fromstring(xml)
    owner = next((node for node in root.iter() if node.tag.rsplit("}", 1)[-1] == "reportingOwner"), None)
    issuer = next((node for node in root.iter() if node.tag.rsplit("}", 1)[-1] == "issuer"), None)

    def transactions(tag: str) -> list[dict[str, Any]]:
        output: list[dict[str, Any]] = []
        for node in root.iter():
            if node.tag.rsplit("}", 1)[-1] != tag:
                continue
            output.append({
                "securityTitle": xml_text(node, "securityTitle"),
                "transactionDate": xml_text(node, "transactionDate"),
                "transactionCode": xml_text(node, "transactionCode"),
                "shares": xml_text(node, "transactionShares"),
                "pricePerShare": xml_text(node, "transactionPricePerShare"),
                "acquiredDisposedCode": xml_text(node, "transactionAcquiredDisposedCode"),
                "sharesOwnedFollowing": xml_text(node, "sharesOwnedFollowingTransaction"),
                "ownershipNature": xml_text(node, "directOrIndirectOwnership"),
            })
        return output

    return {
        "issuer": {
            "cik": xml_text(issuer, "issuerCik") if issuer is not None else None,
            "name": xml_text(issuer, "issuerName") if issuer is not None else None,
            "symbol": xml_text(issuer, "issuerTradingSymbol") if issuer is not None else None,
        },
        "reportingOwner": {
            "cik": xml_text(owner, "rptOwnerCik") if owner is not None else None,
            "name": xml_text(owner, "rptOwnerName") if owner is not None else None,
        },
        "nonDerivativeTransactions": transactions("nonDerivativeTransaction"),
        "derivativeTransactions": transactions("derivativeTransaction"),
    }


def parse_fred_observations(payload: dict[str, Any]) -> list[dict[str, Any]]:
    observations = payload.get("observations")
    if not isinstance(observations, list):
        raise ValueError("invalid_fred_response")
    rows: list[dict[str, Any]] = []
    for observation in observations:
        if not isinstance(observation, dict):
            continue
        raw_value = observation.get("value")
        rows.append({
            "observationDate": observation.get("date"),
            "vintageDate": observation.get("realtime_start"),
            "value": None if raw_value in (None, ".") else float(raw_value),
        })
    return rows


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "mercury-open-intelligence",
        "mode": "shadow",
        "capitalExecutionEnabled": False,
        "repositories": {
            "httpx": package_version("httpx"),
            "holidays": package_version("holidays"),
        },
        "configured": {
            "edgar": True,
            "fred": bool(os.getenv("FRED_API_KEY")),
        },
    }


@app.get("/identity/{symbol}")
def resolve_identity(symbol: str) -> dict[str, Any]:
    symbol = symbol.upper().strip()
    try:
        cik, record = resolve_identifier(symbol)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"sec_identity_failed:{exc}") from exc
    return {
        "symbol": symbol,
        "cik": cik,
        "issuerName": record.get("name") if record else None,
        "exchange": record.get("exchange") if record else None,
        "source": "sec-company-tickers",
        "evidenceClass": "reference",
        "mode": "shadow",
        "capitalExecutionEnabled": False,
    }


@app.get("/reference/universe")
def reference_universe(
    exchanges: str = Query("Nasdaq,NYSE,OTC"),
    offset: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=5000),
) -> dict[str, Any]:
    requested = {value.upper().strip() for value in exchanges.split(",") if value.strip()}
    try:
        by_ticker, _ = ticker_catalog()
        total, securities = build_security_universe(list(by_ticker.values()), requested, offset, limit)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"sec_universe_failed:{exc}") from exc
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "securities": securities,
        "source": "sec-company-tickers",
        "evidenceClass": "reference",
        "mode": "shadow",
        "capitalExecutionEnabled": False,
    }


@app.get("/reference/equity/{symbol}")
def equity_reference(symbol: str) -> dict[str, Any]:
    symbol = symbol.upper().strip()
    try:
        cik, record = resolve_identifier(symbol)
    except HTTPException as exc:
        if exc.status_code == 404:
            return {"symbol": symbol, "found": False, "source": "sec-company-tickers", "evidenceClass": "reference"}
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"equity_reference_failed:{exc}") from exc
    return {
        "symbol": symbol,
        "found": True,
        "records": [{
            "symbol": symbol,
            "cik": cik,
            "name": record.get("name") if record else None,
            "exchange": record.get("exchange") if record else None,
        }],
        "source": "sec-company-tickers",
        "evidenceClass": "reference",
        "mode": "shadow",
        "capitalExecutionEnabled": False,
    }


@app.get("/calendar/{exchange}")
def market_calendar(exchange: str, start: date = Query(...), end: date = Query(...)) -> dict[str, Any]:
    if start > end:
        raise HTTPException(status_code=400, detail="invalid_date_range")
    exchange_key = exchange.upper().strip()
    if exchange_key not in US_EQUITY_EXCHANGES:
        raise HTTPException(status_code=404, detail="calendar_not_supported")
    try:
        years = range(start.year, end.year + 1)
        closed_days = holidays.financial_holidays("XNYS", years=years, categories=(PUBLIC,))
        half_days = holidays.financial_holidays("XNYS", years=years, categories=(HALF_DAY,))
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"calendar_not_found:{exc}") from exc

    sessions: list[dict[str, Any]] = []
    session_date = start
    while session_date <= end:
        if session_date.weekday() >= 5 or session_date in closed_days:
            session_date += timedelta(days=1)
            continue
        early_close = session_date in half_days
        open_at = datetime.combine(session_date, time(9, 30), tzinfo=NEW_YORK).astimezone(UTC)
        close_at = datetime.combine(session_date, time(13 if early_close else 16, 0), tzinfo=NEW_YORK).astimezone(UTC)
        sessions.append({
            "sessionDate": session_date.isoformat(),
            "openAt": open_at.isoformat(),
            "closeAt": close_at.isoformat(),
            "earlyClose": early_close,
        })
        session_date += timedelta(days=1)
    return {
        "exchange": exchange,
        "sessions": sessions,
        "source": "python-holidays:xnys",
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
    params: dict[str, Any] = {
        "series_id": series_id,
        "api_key": key,
        "file_type": "json",
    }
    if start:
        params["observation_start"] = start
    if end:
        params["observation_end"] = end
    if vintage_date:
        params["realtime_start"] = vintage_date
        params["realtime_end"] = vintage_date
    try:
        payload = provider_get_json(FRED_OBSERVATIONS_URL, params=params)
        rows = parse_fred_observations(payload)
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
    try:
        cik, data = company_submissions(identifier)
        return {
            "identifier": identifier,
            "cik": cik,
            "name": data.get("name"),
            "tickers": list(data.get("tickers") or []),
            "exchanges": list(data.get("exchanges") or []),
            "formerNames": list(data.get("formerNames") or []),
            "source": "sec-edgar:submissions",
            "evidenceClass": "authoritative",
            "mode": "shadow",
            "capitalExecutionEnabled": False,
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"edgar_company_failed:{exc}") from exc


@app.get("/edgar/filings/{identifier}")
def edgar_filings(identifier: str, form: str = "8-K", limit: int = 20) -> dict[str, Any]:
    limit = max(1, min(100, limit))
    try:
        cik, company = company_submissions(identifier)
        rows = recent_filings(company, form, limit)
        for row in rows:
            row["company"] = company.get("name")
            row["cik"] = cik
        return {
            "identifier": identifier,
            "form": form,
            "filings": rows,
            "source": "sec-edgar:submissions",
            "evidenceClass": "authoritative",
            "mode": "shadow",
            "capitalExecutionEnabled": False,
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"edgar_filings_failed:{exc}") from exc


@app.get("/edgar/form4/{identifier}")
def edgar_form4(identifier: str, limit: int = 20) -> dict[str, Any]:
    limit = max(1, min(50, limit))
    try:
        cik, company = company_submissions(identifier)
        filings = recent_filings(company, "4", limit)

        def load_filing(filing: dict[str, Any]) -> dict[str, Any]:
            accession = str(filing.get("accessionNumber") or "")
            document = str(filing.get("primaryDocument") or "")
            try:
                if not accession or not document:
                    raise ValueError("filing_document_missing")
                url = SEC_ARCHIVES_URL.format(
                    cik=int(cik),
                    accession=accession.replace("-", ""),
                    document=document,
                )
                payload = parse_form4_xml(provider_get_text(url, headers=sec_headers()))
            except Exception as exc:
                payload = {"parseError": str(exc)}
            return {
                "accessionNumber": filing.get("accessionNumber"),
                "filingDate": filing.get("filingDate"),
                "payload": payload,
            }

        with ThreadPoolExecutor(max_workers=min(5, len(filings) or 1)) as pool:
            rows = list(pool.map(load_filing, filings))
        return {
            "identifier": identifier,
            "transactions": rows,
            "source": "sec-edgar:submissions+xml",
            "evidenceClass": "authoritative",
            "mode": "shadow",
            "capitalExecutionEnabled": False,
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"edgar_form4_failed:{exc}") from exc
