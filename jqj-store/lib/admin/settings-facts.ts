import { BRAND_LOCKUP, LEGAL_ENTITY } from "@/lib/auth/brand";
import { COD_FEE } from "@/lib/checkout-fees";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { SHIPPING_FLAT_USD } from "@/lib/shipping";

export const AIRWALLEX_SETTINGS_NOTE =
  "Airwallex mode is read from server settings. This screen does not change payment mode or keys.";

export const HIDDEN_ON_SERVER = "hidden on the server";

export type AirwallexModeLabel = "Live" | "Sandbox";

export type AdminSettingsEnv = {
  AIRWALLEX_ENV?: string;
  AIRWALLEX_PRODUCTION_ENABLED?: string;
  ADMIN_EMAIL?: string;
};

export type AdminSettingsFacts = {
  airwallexMode: AirwallexModeLabel;
  adminEmail: string;
  houseName: string;
  legalEntity: string;
  currencies: readonly string[];
  codFeeUsd: number;
  flatShippingUsd: number;
};

function serverEnv(env?: AdminSettingsEnv): AdminSettingsEnv {
  if (env) return env;
  return {
    AIRWALLEX_ENV: process.env.AIRWALLEX_ENV,
    AIRWALLEX_PRODUCTION_ENABLED: process.env.AIRWALLEX_PRODUCTION_ENABLED,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  };
}

/**
 * Live only when the server is set to production and production calls are enabled.
 * Any other combination stays Sandbox, matching the runtime gate in getAirwallexEnvironment.
 */
export function readAirwallexModeLabel(env?: AdminSettingsEnv): AirwallexModeLabel {
  const resolved = serverEnv(env);
  const name = (resolved.AIRWALLEX_ENV ?? "sandbox").trim().toLowerCase();
  if (name === "production" && resolved.AIRWALLEX_PRODUCTION_ENABLED === "true") return "Live";
  return "Sandbox";
}

export function readAdminEmailLabel(env?: AdminSettingsEnv): string {
  const email = serverEnv(env).ADMIN_EMAIL?.trim() ?? "";
  if (!email) return HIDDEN_ON_SERVER;
  return email;
}

export function readAdminSettingsFacts(env?: AdminSettingsEnv): AdminSettingsFacts {
  const resolved = serverEnv(env);
  return {
    airwallexMode: readAirwallexModeLabel(resolved),
    adminEmail: readAdminEmailLabel(resolved),
    houseName: BRAND_LOCKUP,
    legalEntity: LEGAL_ENTITY,
    currencies: SUPPORTED_CURRENCIES,
    codFeeUsd: COD_FEE,
    flatShippingUsd: SHIPPING_FLAT_USD,
  };
}
