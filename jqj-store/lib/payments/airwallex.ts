import { createHmac, timingSafeEqual } from "crypto";

export const AIRWALLEX_PROVIDER = "airwallex" as const;

const AIRWALLEX_SANDBOX_API_BASE = "https://api.sandbox.airwallex.com";
const AIRWALLEX_PRODUCTION_API_BASE = "https://api.airwallex.com";
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export type AirwallexEnvironment = "sandbox" | "production";
export type AirwallexSdkEnvironment = "demo" | "prod";

export type InternalPaymentStatus =
  | "requires_payment_method"
  | "requires_customer_action"
  | "pending"
  | "pending_review"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "abandoned"
  | "unknown";

export type InternalRefundStatus = "received" | "accepted" | "settled" | "failed" | "pending";

export interface AirwallexPaymentIntent {
  id: string;
  request_id?: string;
  status: string;
  amount: number;
  currency: string;
  merchant_order_id?: string;
  client_secret?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface AirwallexRefund {
  id: string;
  status?: string;
  amount?: number;
  currency?: string;
  reason?: string;
  payment_intent_id?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

interface AirwallexTokenResponse {
  token: string;
  expires_at: string;
}

interface TokenCache {
  token: string;
  expiresAtMs: number;
}

interface RequestOptions {
  maxRetries?: number;
  timeoutMs?: number;
  forceRefreshToken?: boolean;
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: unknown;
}

let cachedToken: TokenCache | null = null;
let pendingTokenPromise: Promise<string> | null = null;

const PAYMENT_STATUS_MAP: Record<string, InternalPaymentStatus> = {
  REQUIRES_PAYMENT_METHOD: "requires_payment_method",
  REQUIRES_CUSTOMER_ACTION: "requires_customer_action",
  PENDING: "pending",
  PENDING_REVIEW: "pending_review",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

const REFUND_STATUS_MAP: Record<string, InternalRefundStatus> = {
  RECEIVED: "received",
  ACCEPTED: "accepted",
  SETTLED: "settled",
  FAILED: "failed",
  PENDING: "pending",
};

class AirwallexApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = "AirwallexApiError";
    this.status = status;
    this.code = payload?.code;
    this.details = payload?.details;
    this.retryable = RETRYABLE_STATUS_CODES.has(status);
  }
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function getAirwallexEnvironment(): AirwallexEnvironment {
  const env = (process.env.AIRWALLEX_ENV ?? "sandbox").trim().toLowerCase();
  if (env === "sandbox" || env === "production") {
    return env;
  }
  throw new Error(`Unsupported AIRWALLEX_ENV "${env}". Expected "sandbox" or "production".`);
}

function assertProductionAllowed(env: AirwallexEnvironment) {
  if (env !== "production") return;
  if (process.env.AIRWALLEX_PRODUCTION_ENABLED !== "true") {
    throw new Error(
      "Airwallex production mode is disabled. Set AIRWALLEX_PRODUCTION_ENABLED=true only after explicit approval."
    );
  }
}

export function getAirwallexSdkEnvironment(): AirwallexSdkEnvironment {
  return getAirwallexEnvironment() === "production" ? "prod" : "demo";
}

function getAirwallexApiBaseUrl() {
  const env = getAirwallexEnvironment();
  assertProductionAllowed(env);
  return env === "production" ? AIRWALLEX_PRODUCTION_API_BASE : AIRWALLEX_SANDBOX_API_BASE;
}

function getBackoffMs(attempt: number) {
  const base = 200 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 150);
  return Math.min(base + jitter, 2_500);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetry(url: string, init: RequestInit, options?: RequestOptions) {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxRetries) {
        await sleep(getBackoffMs(attempt));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      await sleep(getBackoffMs(attempt));
    }
  }

  if (lastError instanceof Error) {
    throw new Error(`Airwallex request failed after retries: ${lastError.message}`);
  }
  throw new Error("Airwallex request failed after retries");
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function parseExpiryTimestamp(expiresAt: string): number {
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) {
    return Date.now() + 30 * 60_000;
  }
  return parsed;
}

async function fetchAccessToken(): Promise<string> {
  const env = getAirwallexEnvironment();
  assertProductionAllowed(env);

  const clientId = getRequiredEnv("AIRWALLEX_CLIENT_ID");
  const apiKey = getRequiredEnv("AIRWALLEX_API_KEY");

  const response = await fetchWithRetry(
    `${getAirwallexApiBaseUrl()}/api/v1/authentication/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": clientId,
        "x-api-key": apiKey,
      },
    },
    { maxRetries: DEFAULT_MAX_RETRIES }
  );

  const payload = (await parseJsonSafely(response)) as AirwallexTokenResponse | ApiErrorPayload | null;
  if (!response.ok || !payload || typeof (payload as AirwallexTokenResponse).token !== "string") {
    const errorPayload = (payload ?? {}) as ApiErrorPayload;
    throw new AirwallexApiError(
      errorPayload.message || "Failed to authenticate with Airwallex",
      response.status,
      errorPayload
    );
  }

  const tokenPayload = payload as AirwallexTokenResponse;
  cachedToken = {
    token: tokenPayload.token,
    expiresAtMs: parseExpiryTimestamp(tokenPayload.expires_at),
  };
  return tokenPayload.token;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAtMs - TOKEN_REFRESH_BUFFER_MS > Date.now()) {
    return cachedToken.token;
  }

  if (!pendingTokenPromise) {
    pendingTokenPromise = fetchAccessToken().finally(() => {
      pendingTokenPromise = null;
    });
  }
  return pendingTokenPromise;
}

async function airwallexRequest<T>(
  path: string,
  init: RequestInit,
  options?: RequestOptions
): Promise<T> {
  const accessToken = await getAccessToken(options?.forceRefreshToken ?? false);
  const headers = new Headers(init.headers);
  headers.set("Authorization", accessToken);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetchWithRetry(
    `${getAirwallexApiBaseUrl()}${path}`,
    {
      ...init,
      headers,
    },
    options
  );

  if (response.status === 401 && !options?.forceRefreshToken) {
    cachedToken = null;
    return airwallexRequest<T>(path, init, {
      ...options,
      forceRefreshToken: true,
    });
  }

  const payload = (await parseJsonSafely(response)) as T | ApiErrorPayload | null;
  if (!response.ok) {
    const errorPayload = (payload ?? {}) as ApiErrorPayload;
    throw new AirwallexApiError(
      errorPayload.message || `Airwallex API request failed (${response.status})`,
      response.status,
      errorPayload
    );
  }

  return (payload ?? {}) as T;
}

export interface CreateAirwallexPaymentIntentInput {
  requestId: string;
  amount: number;
  currency: string;
  merchantOrderId: string;
  returnUrl: string;
  customer?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
  metadata?: Record<string, string>;
}

export async function createAirwallexPaymentIntent(input: CreateAirwallexPaymentIntentInput) {
  const customer: Record<string, string> = {};
  if (input.customer?.email) customer.email = input.customer.email;
  if (input.customer?.firstName) customer.first_name = input.customer.firstName;
  if (input.customer?.lastName) customer.last_name = input.customer.lastName;
  if (input.customer?.phone) customer.phone_number = input.customer.phone;

  const payload: Record<string, unknown> = {
    request_id: input.requestId,
    amount: Number(input.amount.toFixed(2)),
    currency: input.currency.toUpperCase(),
    merchant_order_id: input.merchantOrderId,
    return_url: input.returnUrl,
  };

  if (Object.keys(customer).length > 0) {
    payload.customer = customer;
  }
  if (input.metadata && Object.keys(input.metadata).length > 0) {
    payload.metadata = input.metadata;
  }

  return airwallexRequest<AirwallexPaymentIntent>(
    "/api/v1/pa/payment_intents/create",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      maxRetries: DEFAULT_MAX_RETRIES,
    }
  );
}

export async function retrieveAirwallexPaymentIntent(paymentIntentId: string) {
  return airwallexRequest<AirwallexPaymentIntent>(
    `/api/v1/pa/payment_intents/${encodeURIComponent(paymentIntentId)}`,
    {
      method: "GET",
    },
    {
      maxRetries: DEFAULT_MAX_RETRIES,
    }
  );
}

export interface CreateAirwallexRefundInput {
  paymentIntentId: string;
  requestId: string;
  amount: number;
  currency: string;
  reason?: string;
  metadata?: Record<string, string>;
}

export async function createAirwallexRefund(input: CreateAirwallexRefundInput) {
  const payload: Record<string, unknown> = {
    payment_intent_id: input.paymentIntentId,
    request_id: input.requestId,
    amount: Number(input.amount.toFixed(2)),
    currency: input.currency.toUpperCase(),
  };
  if (input.reason?.trim()) {
    payload.reason = input.reason.trim();
  }
  if (input.metadata && Object.keys(input.metadata).length > 0) {
    payload.metadata = input.metadata;
  }

  return airwallexRequest<AirwallexRefund>(
    "/api/v1/pa/refunds/create",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      maxRetries: DEFAULT_MAX_RETRIES,
    }
  );
}

export async function retrieveAirwallexRefund(refundId: string) {
  return airwallexRequest<AirwallexRefund>(
    `/api/v1/pa/refunds/${encodeURIComponent(refundId)}`,
    {
      method: "GET",
    },
    {
      maxRetries: DEFAULT_MAX_RETRIES,
    }
  );
}

export function normalizeAirwallexPaymentStatus(status: string | null | undefined): InternalPaymentStatus {
  if (!status) return "unknown";
  const normalized = status.trim().toUpperCase();
  return PAYMENT_STATUS_MAP[normalized] ?? "unknown";
}

export function normalizeAirwallexRefundStatus(status: string | null | undefined): InternalRefundStatus {
  if (!status) return "pending";
  const normalized = status.trim().toUpperCase();
  return REFUND_STATUS_MAP[normalized] ?? "pending";
}

function safeTimestampToSeconds(rawTimestamp: string): number | null {
  const parsed = Number(rawTimestamp);
  if (!Number.isFinite(parsed)) return null;
  if (parsed > 9_999_999_999) {
    return Math.floor(parsed / 1000);
  }
  return Math.floor(parsed);
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function resolveAirwallexWebhookMaxSkewSeconds(raw?: string): number {
  if (raw === undefined || raw === "") return 300;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return 300;
  return Math.min(600, Math.max(1, parsed));
}

export interface VerifyWebhookSignatureInput {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  maxSkewSeconds?: number;
}

export interface VerifyWebhookSignatureResult {
  ok: boolean;
  error?: string;
}

export function verifyAirwallexWebhookSignature(
  input: VerifyWebhookSignatureInput
): VerifyWebhookSignatureResult {
  if (!input.signature || !input.timestamp) {
    return { ok: false, error: "Missing x-signature or x-timestamp header" };
  }

  const timestampSeconds = safeTimestampToSeconds(input.timestamp);
  if (timestampSeconds === null) {
    return { ok: false, error: "Invalid x-timestamp value" };
  }

  const maxSkewSeconds = input.maxSkewSeconds ?? 300;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > maxSkewSeconds) {
    return { ok: false, error: "Webhook timestamp is outside the allowed window" };
  }

  const expectedSignature = createHmac("sha256", input.secret)
    .update(`${input.timestamp}${input.rawBody}`)
    .digest("hex")
    .toLowerCase();

  const receivedSignature = input.signature.trim().toLowerCase();
  if (!secureEqual(expectedSignature, receivedSignature)) {
    return { ok: false, error: "Webhook signature mismatch" };
  }

  return { ok: true };
}

export function isPendingPaymentStatus(status: InternalPaymentStatus) {
  return (
    status === "requires_payment_method" ||
    status === "requires_customer_action" ||
    status === "pending" ||
    status === "pending_review" ||
    status === "unknown"
  );
}

export function isTerminalFailedPaymentStatus(status: InternalPaymentStatus) {
  return status === "failed" || status === "cancelled" || status === "abandoned";
}

export function isSuccessfulPaymentStatus(status: InternalPaymentStatus) {
  return status === "succeeded";
}

