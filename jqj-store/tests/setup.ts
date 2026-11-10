import { afterEach, vi } from "vitest";

vi.mock("@/lib/supabase/admin", async () => {
  const { getActiveDb } = await import("./helpers/memory-db");
  return {
    createAdminClient: () => getActiveDb(),
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
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
