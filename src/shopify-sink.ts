import type { Product } from "./types.js";

export type Batch =
  | { kind: "create"; products: Product[] }
  | { kind: "update"; products: Product[] }
  | { kind: "archive"; skus: string[] };

export interface ShopifySink {
  applyBatch(batch: Batch): Promise<void>;
}

/** In-memory stand-in for the Shopify Admin API. Not a real store. */
export class MockShopifySink implements ShopifySink {
  readonly catalogue = new Map<string, Product & { archived: boolean }>();
  readonly calls: Batch[] = [];
  private failAt: number | undefined;

  /** Make the Nth (1-based) applyBatch call from now throw, to exercise resume. */
  failOnCall(n: number | undefined): void {
    this.failAt = n === undefined ? undefined : this.calls.length + n;
  }

  async applyBatch(batch: Batch): Promise<void> {
    if (this.failAt !== undefined && this.calls.length + 1 === this.failAt) {
      this.failAt = undefined;
      throw new Error("mock shopify: simulated outage");
    }
    this.calls.push(batch);
    if (batch.kind === "archive") {
      for (const sku of batch.skus) {
        const p = this.catalogue.get(sku);
        if (p) p.archived = true;
      }
    } else {
      for (const p of batch.products) this.catalogue.set(p.sku, { ...p, archived: false });
    }
  }

  /** Live (non-archived) products, usable as the next run's "previous" catalogue. */
  snapshot(): Product[] {
    return [...this.catalogue.values()]
      .filter((p) => !p.archived)
      .map((p) => ({ sku: p.sku, title: p.title, priceCents: p.priceCents, stock: p.stock, vendor: p.vendor }));
  }
}
