import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import { requirePortalRole } from "../../../lib/portalAuth";

const BUCKET = "bg-preview-images";

export const dynamic = "force-dynamic";

async function ensureBucket() {
  const supabase = getServiceSupabaseOrThrow();
  const { data } = await supabase.storage.listBuckets();
  if (!data?.find((b: { name: string }) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: true });
  }
  return supabase;
}

export async function GET(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login is required." }, { status: 401 });

  try {
    const supabase = await ensureBucket();
    const [listResult, configResult] = await Promise.all([
      supabase.storage.from(BUCKET).list("", { sortBy: { column: "created_at", order: "asc" } }),
      supabase.from("coupon_config").select("value").eq("key", ACTIVE_BG_KEY).maybeSingle(),
    ]);
    if (listResult.error) throw listResult.error;

    const images = (listResult.data ?? [])
      .filter((f: { name: string }) => f.name !== ".emptyFolderPlaceholder")
      .map((f: { name: string }) => ({
        name: f.name,
        url: supabase.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl,
      }));

    const activeBgUrl = (configResult.data?.value as string | null) ?? null;
    return NextResponse.json({ images, activeBgUrl });
  } catch (err) {
    console.error("bg-images GET error", err);
    return NextResponse.json({ error: "Failed to list images." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login is required." }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

    const supabase = await ensureBucket();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const name = `${Date.now()}-${safeName}`;

    const bytes = await file.arrayBuffer();
    const { error } = await supabase.storage.from(BUCKET).upload(name, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;

    const url = supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
    return NextResponse.json({ name, url });
  } catch (err) {
    console.error("bg-images POST error", err);
    return NextResponse.json({ error: "Failed to upload image." }, { status: 500 });
  }
}

const ACTIVE_BG_KEY = "game_bg_url";

export async function PATCH(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login is required." }, { status: 401 });

  try {
    const { url } = (await req.json()) as { url: string | null };
    const supabase = getServiceSupabaseOrThrow();
    const { error } = await supabase
      .from("coupon_config")
      .upsert({ key: ACTIVE_BG_KEY, value: url ?? null }, { onConflict: "key" });
    if (error) throw error;
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    console.error("bg-images PATCH error", err);
    return NextResponse.json({ error: "Failed to set active background." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login is required." }, { status: 401 });

  try {
    const { name } = (await req.json()) as { name: string };
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

    const supabase = getServiceSupabaseOrThrow();
    const { error } = await supabase.storage.from(BUCKET).remove([name]);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("bg-images DELETE error", err);
    return NextResponse.json({ error: "Failed to delete image." }, { status: 500 });
  }
}
