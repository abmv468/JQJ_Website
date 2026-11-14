"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { readAdminSettingsFacts, type AdminSettingsFacts } from "@/lib/admin/settings-facts";

export async function loadAdminSettingsFacts(
  accessToken: string
): Promise<{ ok: true; facts: AdminSettingsFacts } | { ok: false }> {
  const request = new Request("http://127.0.0.1/admin", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const authError = await requireAdmin(request);
  if (authError) return { ok: false };
  return { ok: true, facts: readAdminSettingsFacts() };
}
