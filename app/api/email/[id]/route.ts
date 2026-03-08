import { NextResponse } from "next/server";
import { deleteEmailById, getEmailById } from "@/lib/db/queries/emails";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const emailId = Number.parseInt(id, 10);

    if (!Number.isFinite(emailId)) {
      return NextResponse.json({ error: "Invalid email ID" }, { status: 400 });
    }

    const email = getEmailById(emailId);
    if (!email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    deleteEmailById(emailId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[DELETE /api/email/[id]]", error);
    return NextResponse.json(
      { error: "Failed to delete email", detail: message },
      { status: 500 }
    );
  }
}
