"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CURRENCY_COOKIE_KEY,
  CURRENCY_STORAGE_KEY,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  convertUsdToCurrency,
  isSupportedCurrency,
  normalizeCurrency,
  type SupportedCurrency,
} from "@/lib/currency";
import { formatPrice } from "@/lib/utils";

interface CurrencyContextValue {
  currency: SupportedCurrency;
  supportedCurrencies: readonly SupportedCurrency[];
  setCurrency: (currency: SupportedCurrency) => void;
  convertFromUsd: (amountUsd: number) => number;
  formatFromUsd: (amountUsd: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

function readInitialCurrency(): SupportedCurrency {
  if (typeof document === "undefined") return DEFAULT_CURRENCY;

  const cookieEntry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CURRENCY_COOKIE_KEY}=`));
  const cookieValue = cookieEntry?.slice(CURRENCY_COOKIE_KEY.length + 1);
  if (isSupportedCurrency(cookieValue)) return cookieValue;

  try {
    const storageValue = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (isSupportedCurrency(storageValue)) return storageValue;
  } catch {
    // ignore storage errors
  }

  return DEFAULT_CURRENCY;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<SupportedCurrency>(DEFAULT_CURRENCY);

  useEffect(() => {
    setCurrencyState(readInitialCurrency());
  }, []);

  const setCurrency = (nextCurrency: SupportedCurrency) => {
    const normalized = normalizeCurrency(nextCurrency);
    setCurrencyState(normalized);
  };

  useEffect(() => {
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    } catch {
      // ignore storage errors
    }

    document.cookie = `${CURRENCY_COOKIE_KEY}=${currency}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [currency]);

  const value: CurrencyContextValue = useMemo(
    () => ({
      currency,
      supportedCurrencies: SUPPORTED_CURRENCIES,
      setCurrency,
      convertFromUsd: (amountUsd: number) => convertUsdToCurrency(amountUsd, currency),
      formatFromUsd: (amountUsd: number) =>
        formatPrice(convertUsdToCurrency(amountUsd, currency), { currency }),
    }),
    [currency]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within CurrencyProvider");
  return context;
}
