"use client";

import { useEffect, useState } from "react";

const STOCK_CHECK_TIMEOUT_MS = 8000;

type StockItem = {
  id: string;
  slug: string;
  name: string;
  price: number;
  quantity: number;
  sku?: string;
  size?: string;
  material?: string;
};

export function useCartStockCheck(items: StockItem[], hydrated: boolean) {
  const [stockErrors, setStockErrors] = useState<string[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockCheckFailed, setStockCheckFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    if (!items.length) {
      setStockLoading(false);
      setStockErrors([]);
      setStockCheckFailed(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), STOCK_CHECK_TIMEOUT_MS);
    let ignore = false;

    setStockLoading(true);
    setStockCheckFailed(false);

    fetch("/api/products/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((item) => ({
          id: item.id,
          slug: item.slug,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          size: item.size,
          material: item.material,
          sku: item.sku,
        })),
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as { errors?: unknown } | null;
        if (!response.ok) throw new Error("stock check failed");
        if (ignore) return;
        const errors = Array.isArray(data?.errors) ? data.errors : [];
        setStockErrors(errors.filter((error): error is string => typeof error === "string"));
      })
      .catch(() => {
        if (ignore) return;
        setStockErrors([]);
        setStockCheckFailed(true);
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (!ignore) setStockLoading(false);
      });

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [hydrated, items, attempt]);

  function retryStockCheck() {
    setAttempt((current) => current + 1);
  }

  return { stockLoading, stockErrors, stockCheckFailed, retryStockCheck };
}
