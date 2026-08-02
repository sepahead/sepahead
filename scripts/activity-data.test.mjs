import assert from "node:assert/strict";
import test from "node:test";

import {
  WINDOW_DAYS,
  aggregate,
  loadModel as loadWeekdayModel,
  parseFragment,
  parseTipCount as parseWeekdayTipCount,
} from "./weekdays.mjs";
import {
  fetchYearTotal,
  loadModel as loadCumulativeModel,
  parseTipCount as parseCumulativeTipCount,
} from "./cumulative.mjs";

const response = (html, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => html,
});

test("contribution tool-tips accept grouped and singular counts", () => {
  for (const parse of [parseWeekdayTipCount, parseCumulativeTipCount]) {
    assert.equal(parse("1,234 contributions on August 2nd."), 1234);
    assert.equal(parse("1 contribution on August 2nd."), 1);
    assert.equal(parse("No contributions on August 2nd."), 0);
    assert.throws(() => parse("Activity unavailable"), /unrecognised contribution tool-tip/);
  }
});

test("weekday aggregation includes exactly the labelled 500-day window", () => {
  const start = Date.UTC(2024, 0, 1);
  const cells = Array.from({ length: WINDOW_DAYS + 1 }, (_, index) => {
    const date = new Date(start + index * 86_400_000);
    return {
      date: date.toISOString().slice(0, 10),
      count: index === 0 ? 100 : 1,
      weekday: (date.getUTCDay() + 6) % 7,
      precise: true,
    };
  });

  const model = aggregate(cells);
  assert.equal(model.cellsUsed, WINDOW_DAYS);
  assert.equal(model.grandTotal, WINDOW_DAYS);
});

test("weekday parsing fails when tool-tips cannot pair with dates", async () => {
  const malformed = `
    <td data-date="2026-08-01" data-level="1"></td>
    <td data-date="2026-08-02"></td>
    <tool-tip>1 contribution on August 1st.</tool-tip>`;

  await assert.rejects(parseFragment(malformed), /cannot be paired safely/);
});

test("year parsing rejects unrecognised successful responses", async () => {
  await assert.rejects(
    fetchYearTotal("example", 2026, async () => response("<html></html>")),
    /neither a yearly total nor daily tool-tips/
  );
  await assert.rejects(
    fetchYearTotal(
      "example",
      2026,
      async () => response("<h2>42 contributions in 2025</h2>")
    ),
    /response reported 2025/
  );
});

test("live-data failures propagate instead of producing placeholders", async () => {
  const offline = async () => {
    throw new Error("offline");
  };

  await assert.rejects(loadWeekdayModel("example", offline), /offline/);
  await assert.rejects(loadCumulativeModel("example", offline, 2014), /offline/);
});
