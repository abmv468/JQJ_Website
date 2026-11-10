import React from "react";
import { afterEach, vi } from "vitest";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock("@/lib/supabase/admin", async () => {
  const { getActiveDb } = await import("./helpers/memory-db");
  return {
    createAdminClient: () => getActiveDb(),
  };
});

vi.mock("next/headers", () => ({
  cookies: () => ({
    getAll: () => [],
    set: () => undefined,
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});
