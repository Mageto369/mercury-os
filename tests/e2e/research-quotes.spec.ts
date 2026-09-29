import { expect, test } from "@playwright/test";
import { mergeResearchQuotes, type ResearchQuote } from "@/lib/market/research-quotes";
import { outstandingConceptRank } from "@/lib/providers/open-data/share-structure-facts";

function quote(securityId: string, evidenceClass: ResearchQuote["evidenceClass"]): ResearchQuote {
  return {
    securityId,
    symbol: securityId,
    price: 10,
    dollarVolume: 1_000_000,
    spreadBps: 20,
    rvol: 1,
    floatRotation: null,
    observedAt: new Date("2026-09-28T00:00:00Z"),
    evidenceClass,
  };
}

test("live quotes stay ahead of delayed reference quotes for the same security", () => {
  const merged = mergeResearchQuotes(
    [quote("live-only", "live"), quote("both", "live")],
    [quote("both", "delayed-reference"), quote("reference-only", "delayed-reference")],
  );
  const byId = new Map(merged.map((row) => [row.securityId, row.evidenceClass]));
  expect(byId.get("live-only")).toBe("live");
  expect(byId.get("both")).toBe("live");
  expect(byId.get("reference-only")).toBe("delayed-reference");
});

test("share-count concepts prefer outstanding shares over issued shares", () => {
  expect(outstandingConceptRank("CommonStockSharesOutstanding")).toBeLessThan(
    outstandingConceptRank("EntityCommonStockSharesOutstanding"),
  );
  expect(outstandingConceptRank("EntityCommonStockSharesOutstanding")).toBeLessThan(
    outstandingConceptRank("CommonStockSharesIssued"),
  );
  expect(outstandingConceptRank("ShareBasedCompensation")).toBeGreaterThan(
    outstandingConceptRank("CommonStockSharesIssued"),
  );
});
