"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Mail,
  Send,
  Pencil,
  Check,
  X,
  Loader2,
} from "lucide-react";

interface EmailData {
  id: string;
  lead_id: string;
  lead_name: string;
  subject: string;
  body: string;
  status: string;
  sent_at: string | null;
  created_at: string;
}

interface EmailPreviewProps {
  emailId: string;
}

export function EmailPreview({ emailId }: EmailPreviewProps) {
  const [email, setEmail] = useState<EmailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);

  // Send confirmation
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchEmail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/emails/${emailId}`);
      if (!res.ok) throw new Error("Failed to load email");
      const data: EmailData = await res.json();
      setEmail(data);
      setEditSubject(data.subject);
      setEditBody(data.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [emailId]);

  useEffect(() => {
    fetchEmail();
  }, [fetchEmail]);

  const handleSave = async () => {
    if (!email) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/emails/${emailId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: editSubject, body: editBody }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated: EmailData = await res.json();
      setEmail(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (!email) return;
    setSending(true);
    try {
      const res = await fetch(`/api/emails/${emailId}/send`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to send email");
      const updated: EmailData = await res.json();
      setEmail(updated);
      setShowSendConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  const cancelEdit = () => {
    if (email) {
      setEditSubject(email.subject);
      setEditBody(email.body);
    }
    setEditing(false);
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case "sent":
        return "default" as const;
      case "draft":
        return "secondary" as const;
      case "failed":
        return "destructive" as const;
      default:
        return "outline" as const;
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !email) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center text-destructive">
        {error ?? "Email not found"}
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4" />
              Email Preview
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant(email.status)} className="capitalize">
                {email.status}
              </Badge>
              {email.status === "draft" && !editing && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              {email.status === "draft" && (
                <Button
                  size="sm"
                  onClick={() => setShowSendConfirm(true)}
                >
                  <Send className="h-3.5 w-3.5" />
                  Send
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Meta info */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>To: {email.lead_name}</span>
            {email.sent_at && (
              <span>Sent: {new Date(email.sent_at).toLocaleString()}</span>
            )}
          </div>

          {/* Subject */}
          {editing ? (
            <div className="space-y-1">
              <label className="text-sm font-medium">Subject</label>
              <Input
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
              />
            </div>
          ) : (
            <div className="border-b pb-3">
              <h3 className="text-lg font-semibold">{email.subject}</h3>
            </div>
          )}

          {/* Body */}
          {editing ? (
            <div className="space-y-1">
              <label className="text-sm font-medium">Body</label>
              <Textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={12}
                className="font-mono text-sm"
              />
            </div>
          ) : (
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: email.body }}
            />
          )}

          {/* Edit actions */}
          {editing && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Save Changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send confirmation dialog */}
      <Dialog open={showSendConfirm} onOpenChange={setShowSendConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Send</DialogTitle>
            <DialogDescription>
              Are you sure you want to send this email to {email.lead_name}?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSendConfirm(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
