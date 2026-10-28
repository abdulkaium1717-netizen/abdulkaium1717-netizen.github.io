import { describe, expect, it } from "vitest";
import { computeSaleDueStatus } from "@/lib/shop";

const sale = (id: number, due: number, created_at: string, name = "Rahim") => ({
  id,
  due,
  created_at,
  customer_name: name,
  customer_phone: "017",
});
const pay = (amount: number, name = "Rahim") => ({
  amount,
  customer_name: name,
  customer_phone: "017",
});

describe("computeSaleDueStatus", () => {
  it("marks an invoice cleared once the customer pays back its full leftover", () => {
    const m = computeSaleDueStatus([sale(1, 100, "2026-01-01")], [pay(100)]);
    expect(m.get(1)).toEqual({ remaining: 0, recovered: 100, cleared: true });
  });

  it("applies payments to the oldest invoice first", () => {
    const m = computeSaleDueStatus(
      [sale(2, 50, "2026-01-05"), sale(1, 100, "2026-01-01")],
      [pay(120)],
    );
    expect(m.get(1)?.cleared).toBe(true);
    expect(m.get(2)?.remaining).toBe(30);
  });

  it("does not use one customer's payment for another customer", () => {
    const m = computeSaleDueStatus([sale(1, 100, "2026-01-01", "Karim")], [pay(100)]);
    expect(m.get(1)?.remaining).toBe(100);
  });
});
