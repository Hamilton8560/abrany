import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import {
  createOrg,
  orgForUser,
  updateOrgBranding,
  listMembers,
  listInvites,
  listAssignments,
  assignmentsForUser,
  type Org,
} from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything the org page needs in one shot (admin extras only for admins). */
const orgView = (org: Org, isAdmin: boolean) => ({
  id: org.id,
  name: org.name,
  logo: org.logo,
  tagline: org.tagline,
  createdAt: org.created_at,
  ...(isAdmin ? { apiKey: org.api_key } : {}),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const m = orgForUser(user.id);
  const myAssignments = assignmentsForUser(user.id);
  if (!m) return NextResponse.json({ org: null, role: null, myAssignments });
  const isAdmin = m.role === "admin";
  return NextResponse.json({
    org: orgView(m.org, isAdmin),
    role: m.role,
    myAssignments,
    ...(isAdmin
      ? {
          admin: {
            members: listMembers(m.org.id),
            invites: listInvites(m.org.id),
            assignments: listAssignments(m.org.id),
          },
        }
      : {}),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (orgForUser(user.id))
    return NextResponse.json({ error: "You already belong to an organization" }, { status: 409 });
  const body = await request.json().catch(() => ({}));
  const name = (body.name ?? "").toString().trim();
  if (!name) return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  const org = createOrg(user.id, name);
  return NextResponse.json({ org: orgView(org, true), role: "admin" }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const m = orgForUser(user.id);
  if (!m || m.role !== "admin")
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const fields: { name?: string; logo?: string; tagline?: string } = {};
  if (typeof body.name === "string" && body.name.trim()) fields.name = body.name.trim();
  if (typeof body.tagline === "string") fields.tagline = body.tagline.trim();
  if (typeof body.logo === "string") {
    // data-URL logo, kept small so certs/pages stay light
    if (body.logo && !body.logo.startsWith("data:image/"))
      return NextResponse.json({ error: "Logo must be an image" }, { status: 400 });
    if (body.logo.length > 400_000)
      return NextResponse.json({ error: "Logo too large — keep it under ~300 KB" }, { status: 400 });
    fields.logo = body.logo;
  }
  const org = updateOrgBranding(m.org.id, fields);
  return NextResponse.json({ org: org ? orgView(org, true) : null });
}
