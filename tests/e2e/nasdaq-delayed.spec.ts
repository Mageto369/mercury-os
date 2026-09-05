import { expect, test } from "@playwright/test";
import { normalizeNasdaqDelayedSnapshot } from "@/lib/providers/market/nasdaq-delayed";

test("Nasdaq reference quotes preserve delayed evidence boundaries", () => {
  const snapshot = normalizeNasdaqDelayedSnapshot("aapl", {
    data: {
      symbol: "AAPL",
      marketStatus: "Closed",
      primaryData: {
        lastSalePrice: "$319.97",
        lastTradeTimestamp: "Sep 4, 2026",
        volume: "39,607,187",
        isRealTime: false,
      },
    },
  });
  expect(snapshot).toMatchObject({
    symbol: "AAPL",
    price: 319.97,
    volume: 39607187,
    source: "nasdaq-delayed",
    isRealTime: false,
    providerPayload: {
      marketStatus: "Closed",
      isRealTime: false,
      evidenceClass: "delayed-reference",
    },
  });
  expect(snapshot?.observedAt.toISOString()).toBe("2026-09-04T00:00:00.000Z");
});

test("Nasdaq reference normalization rejects unusable prices", () => {
  expect(
    normalizeNasdaqDelayedSnapshot("BAD", {
      data: {
        symbol: "BAD",
        primaryData: {
          lastSalePrice: "N/A",
          lastTradeTimestamp: "Sep 4, 2026",
          volume: "0",
          isRealTime: false,
        },
      },
    }),
  ).toBeNull();
});
