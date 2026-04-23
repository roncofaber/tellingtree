import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  listRegistrationInvites, createRegistrationInvite, revokeRegistrationInvite,
  listAllUsers, approveUser, rejectUser, generateResetToken, deleteUser,
} from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { User } from "@/types/api";

const adminKeys = {
  invites: ["admin", "invites"] as const,
  users:   ["admin", "users"] as const,
};

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const queryClient = useQueryClient();
  const { user: me } = useAuth();

  const { data: users, isLoading } = useQuery({
    queryKey: adminKeys.users,
    queryFn:  listAllUsers,
  });

  const [rejectTarget,  setRejectTarget]  = useState<{ id: string; username: string } | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<{ id: string; username: string } | null>(null);
  const [resetUrl,      setResetUrl]      = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminKeys.users });

  const approveMut = useMutation({
    mutationFn: approveUser,
    onSuccess: () => { invalidate(); toast.success("User approved"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rejectMut = useMutation({
    mutationFn: rejectUser,
    onSuccess: () => { invalidate(); toast.success("User suspended"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => { invalidate(); toast.success("User deleted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const resetMut = useMutation({
    mutationFn: generateResetToken,
    onSuccess: (data) => setResetUrl(data.url),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const pending  = (users ?? []).filter(u => !u.is_approved);
  const approved = (users ?? []).filter(u => u.is_approved);

  if (isLoading) return <LoadingSpinner />;

  const UserRow = ({ u, showApprove }: { u: User; showApprove: boolean }) => (
    <TableRow key={u.id}>
      <TableCell className="font-medium">
        {u.username}
        {u.id === me?.id && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
      <TableCell>
        {u.is_superadmin
          ? <Badge>Superadmin</Badge>
          : u.is_approved
          ? <Badge variant="secondary">Active</Badge>
          : <Badge variant="outline" className="text-amber-600 border-amber-300">Pending</Badge>}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1.5">
          {showApprove && (
            <Button size="sm" disabled={approveMut.isPending}
              onClick={() => approveMut.mutate(u.id)}>
              Approve
            </Button>
          )}
          {!u.is_superadmin && u.id !== me?.id && (
            <>
              {u.is_approved && (
                <Button size="sm" variant="outline" disabled={rejectMut.isPending}
                  onClick={() => setRejectTarget({ id: u.id, username: u.username })}>
                  Suspend
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={resetMut.isPending}
                onClick={() => resetMut.mutate(u.id)}>
                Reset link
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive"
                disabled={deleteMut.isPending}
                onClick={() => setDeleteTarget({ id: u.id, username: u.username })}>
                Delete
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Pending approval
              <Badge variant="secondary" className="ml-2">{pending.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-56">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map(u => <UserRow key={u.id} u={u} showApprove />)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">All users</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-56">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approved.map(u => <UserRow key={u.id} u={u} showApprove={false} />)}
              {approved.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No active users yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reset link dialog */}
      {resetUrl && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setResetUrl(null)}>
          <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <CardHeader><CardTitle className="text-base">Password reset link</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Send this link to the user via WhatsApp, Signal, or email. It expires in 24 hours and can only be used once.
              </p>
              <Input value={resetUrl} readOnly className="font-mono text-xs"
                onClick={e => (e.target as HTMLInputElement).select()} />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => {
                  navigator.clipboard.writeText(resetUrl);
                  toast.success("Copied to clipboard");
                }}>Copy link</Button>
                <Button variant="outline" onClick={() => setResetUrl(null)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={() => { if (rejectTarget) rejectMut.mutate(rejectTarget.id); }}
        title={`Suspend ${rejectTarget?.username}?`}
        message="They won't be able to log in. Their data is kept. You can re-approve them later."
        confirmLabel="Suspend"
        destructive
        isPending={rejectMut.isPending}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteMut.mutate(deleteTarget.id); }}
        title={`Delete ${deleteTarget?.username}?`}
        message="This permanently deletes their account. They must have no owned trees. This cannot be undone."
        confirmLabel="Delete user"
        destructive
        isPending={deleteMut.isPending}
      />
    </div>
  );
}

// ── Invites tab ───────────────────────────────────────────────────────────────

function InvitesTab() {
  const queryClient = useQueryClient();

  const { data: invites, isLoading } = useQuery({
    queryKey: adminKeys.invites,
    queryFn:  listRegistrationInvites,
  });

  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [inviteEmail,  setInviteEmail]  = useState("");
  const [inviteNote,   setInviteNote]   = useState("");
  const [inviteDays,   setInviteDays]   = useState(7);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminKeys.invites });

  const createMut = useMutation({
    mutationFn: () => createRegistrationInvite({
      email: inviteEmail || null, note: inviteNote || null, expires_in_days: inviteDays,
    }),
    onSuccess: (invite) => {
      invalidate();
      setInviteEmail(""); setInviteNote(""); setInviteDays(7);
      const link = `${window.location.origin}/register/${invite.token}`;
      navigator.clipboard.writeText(link);
      toast.success("Invite created and link copied to clipboard");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const revokeMut = useMutation({
    mutationFn: revokeRegistrationInvite,
    onSuccess: () => { invalidate(); toast.success("Invite revoked"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const outstanding = (invites ?? []).filter(i => !i.used_at && new Date(i.expires_at) > new Date());
  const past        = (invites ?? []).filter(i =>  i.used_at || new Date(i.expires_at) <= new Date());

  const inviteLink = (token: string) => `${window.location.origin}/register/${token}`;
  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied"); };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Create invite</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); createMut.mutate(); }} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs">Email <span className="text-muted-foreground">(optional — locks the invite)</span></Label>
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="cousin@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Expires in (days)</Label>
                <Input type="number" min={1} max={365} value={inviteDays}
                  onChange={(e) => setInviteDays(Number(e.target.value) || 7)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Note <span className="text-muted-foreground">(only visible to admins)</span></Label>
              <Input value={inviteNote} onChange={(e) => setInviteNote(e.target.value)} placeholder="e.g. Aunt Mary" />
            </div>
            <Button type="submit" size="sm" disabled={createMut.isPending}>
              {createMut.isPending ? "Creating…" : "Generate & copy link"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Outstanding
            {outstanding.length > 0 && <Badge variant="secondary" className="ml-2">{outstanding.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {outstanding.length === 0
            ? <p className="text-sm text-muted-foreground italic">No outstanding invites.</p>
            : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>For</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-44">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstanding.map(i => (
                    <TableRow key={i.id}>
                      <TableCell className="text-sm">{i.email || <span className="text-muted-foreground italic">anyone</span>}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{i.note || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(i.expires_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => copy(inviteLink(i.token))}>Copy</Button>
                          <Button size="sm" variant="ghost" className="text-destructive"
                            onClick={() => setRevokeTarget(i.id)}>Revoke</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      {past.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Past invites</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>For</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {past.map(i => (
                  <TableRow key={i.id}>
                    <TableCell className="text-sm">{i.email || <span className="text-muted-foreground italic">anyone</span>}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{i.note || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {i.used_at
                        ? <span className="text-emerald-600">Used</span>
                        : <span className="text-muted-foreground">Expired</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(i.used_at || i.expires_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => { if (revokeTarget) revokeMut.mutate(revokeTarget); }}
        title="Revoke this invite?"
        message="The link will stop working immediately."
        confirmLabel="Revoke"
        destructive
        isPending={revokeMut.isPending}
      />
    </div>
  );
}

// ── AdminPage ─────────────────────────────────────────────────────────────────

export function AdminPage() {
  const { user } = useAuth();

  if (user && !user.is_superadmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="h-full overflow-auto">
      <div className="space-y-4 max-w-4xl mx-auto w-full">
        <div>
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="text-sm text-muted-foreground">Manage users and registration invites.</p>
        </div>

        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="invites">Invites</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="mt-4">
            <UsersTab />
          </TabsContent>
          <TabsContent value="invites" className="mt-4">
            <InvitesTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
