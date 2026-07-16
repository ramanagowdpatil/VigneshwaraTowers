import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginToEmail } from "@/lib/auth";
import type { UserRole } from "@/lib/types";

const VALID_ROLES: UserRole[] = ["admin", "editor", "viewer"];
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/i;

/** Only a signed-in admin may manage users. Returns their id, or null. */
async function requireAdmin(): Promise<string | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return profile?.role === "admin" ? user.id : null;
}

export async function POST(req: Request) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }
  const { username, password, role } = (await req.json()) as {
    username?: string;
    password?: string;
    role?: UserRole;
  };
  if (!username || !USERNAME_RE.test(username.trim())) {
    return NextResponse.json(
      { error: "Username must be 3-32 characters: letters, numbers, . _ -" },
      { status: 400 }
    );
  }
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }
  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: loginToEmail(username),
      password,
      email_confirm: true,
      user_metadata: { full_name: username.trim().toLowerCase() },
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (role !== "viewer") {
      const { error: roleError } = await admin
        .from("profiles")
        .update({ role })
        .eq("id", data.user.id);
      if (roleError) {
        return NextResponse.json({ error: roleError.message }, { status: 400 });
      }
    }
    return NextResponse.json({ id: data.user.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }
  const { id, password } = (await req.json()) as {
    id?: string;
    password?: string;
  };
  if (!id || !password || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }
  const { id } = (await req.json()) as { id?: string };
  if (!id) {
    return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  }
  if (id === adminId) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 }
    );
  }
  try {
    const admin = createAdminClient();
    // Readings stay; they just stop pointing at the deleted account
    const { error: detachError } = await admin
      .from("meter_readings")
      .update({ recorded_by: null })
      .eq("recorded_by", id);
    if (detachError) {
      return NextResponse.json({ error: detachError.message }, { status: 400 });
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
