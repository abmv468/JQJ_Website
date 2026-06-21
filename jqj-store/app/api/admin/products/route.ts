import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

interface VariantPayload {
  id?: string;
  size?: string | null;
  material?: string | null;
  sku: string;
  stock_count: number;
}

function deriveStockFromVariants(variants?: VariantPayload[]) {
  if (!variants?.length) return null;
  const stock_count = variants.reduce((sum, variant) => sum + Math.max(0, Number(variant.stock_count || 0)), 0);
  return {
    stock_count,
    in_stock: stock_count > 0,
  };
}

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("products")
      .select("*, categories(name, slug), product_variants(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ products: data }, { headers: noStore });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load products" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const variants = Array.isArray(body.variants) ? (body.variants as VariantPayload[]) : [];
    const supabase = createAdminClient();
    const stockFromVariants = deriveStockFromVariants(variants);
    const payload = {
      ...body,
      ...(stockFromVariants ?? {}),
    };
    delete payload.variants;

    const { data, error } = await supabase.from("products").insert(payload).select().single();
    if (error) throw error;

    if (variants.length) {
      const preparedVariants = variants.map((variant) => ({
        product_id: data.id,
        size: variant.size || null,
        material: variant.material || null,
        sku: variant.sku,
        stock_count: Math.max(0, Number(variant.stock_count || 0)),
      }));
      const { error: variantError } = await supabase.from("product_variants").insert(preparedVariants);
      if (variantError) {
        await supabase.from("products").delete().eq("id", data.id);
        throw variantError;
      }
    }

    const { data: fullProduct, error: loadError } = await supabase
      .from("products")
      .select("*, categories(name, slug), product_variants(*)")
      .eq("id", data.id)
      .single();
    if (loadError) throw loadError;

    return NextResponse.json({ product: fullProduct }, { headers: noStore });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create product" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const { id, variants, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const supabase = createAdminClient();

    const parsedVariants = Array.isArray(variants) ? (variants as VariantPayload[]) : undefined;
    const stockFromVariants = deriveStockFromVariants(parsedVariants);
    const inventoryUpdates = {
      sku: updates.sku ?? null,
      stock_count: Math.max(0, Number(updates.stock_count ?? 0)),
      low_stock_threshold: Math.max(0, Number(updates.low_stock_threshold ?? 5)),
      in_stock: Boolean(updates.in_stock),
    };

    const { data: snapshot, error: snapshotError } = await supabase
      .from("products")
      .select("sku, stock_count, low_stock_threshold, in_stock, product_variants(size, material, sku, stock_count)")
      .eq("id", id)
      .single();
    if (snapshotError) throw snapshotError;

    try {
      const { error } = await supabase
        .from("products")
        .update({
          ...inventoryUpdates,
          ...(stockFromVariants ?? {}),
        })
        .eq("id", id);
      if (error) throw error;

      if (parsedVariants) {
        const { error: deleteError } = await supabase
          .from("product_variants")
          .delete()
          .eq("product_id", id);
        if (deleteError) throw deleteError;

        if (parsedVariants.length) {
          const preparedVariants = parsedVariants.map((variant) => ({
            product_id: id,
            size: variant.size || null,
            material: variant.material || null,
            sku: variant.sku,
            stock_count: Math.max(0, Number(variant.stock_count || 0)),
          }));
          const { error: insertError } = await supabase
            .from("product_variants")
            .insert(preparedVariants);
          if (insertError) throw insertError;
        }
      }
    } catch (mutationError) {
      await supabase
        .from("products")
        .update({
          sku: snapshot.sku,
          stock_count: snapshot.stock_count,
          low_stock_threshold: snapshot.low_stock_threshold,
          in_stock: snapshot.in_stock,
        })
        .eq("id", id);

      if (parsedVariants) {
        await supabase.from("product_variants").delete().eq("product_id", id);
        if (snapshot.product_variants?.length) {
          await supabase.from("product_variants").insert(
            snapshot.product_variants.map((variant) => ({
              product_id: id,
              size: variant.size,
              material: variant.material,
              sku: variant.sku,
              stock_count: variant.stock_count,
            }))
          );
        }
      }

      throw mutationError;
    }

    const { data, error: loadError } = await supabase
      .from("products")
      .select("*, categories(name, slug), product_variants(*)")
      .eq("id", id)
      .single();
    if (loadError) throw loadError;
    return NextResponse.json({ product: data }, { headers: noStore });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update product" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const supabase = createAdminClient();
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true }, { headers: noStore });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete product" },
      { status: 500 }
    );
  }
}
