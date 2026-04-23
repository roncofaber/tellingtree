import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  listRegistrationInvites, createRegistrationInvite, revokeRegistrationInvite,
  listAllUsers, approveUser, rejectUser,
} from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

const adminKeys = {
  invites: ["admin", "invites"] as const,
  users:   ["admin", "users"] as const,
};

export function AdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  if (user && !user.is_superadmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: adminKeys.users,
    queryFn:  listAllUsers,
  });
  const { data: invites, isLoading: invitesLoading } = useQuery({
    queryKey: adminKeys.invites,
    queryFn:  listRegistrationInvites,
  });

  const pendingUsers = (users ?? []).filter(u => !u.is_approved);
  const approvedUsers = (users ?? []).filter(u => u.is_approved);
  const outstandingInvites = (invites ?? []).filter(i => !i.used_at && new Date(i.expires_at) > new Date());
  const usedOrExpired = (invites ?? []).filter(i => i.used_at || new Date(i.expires_at) <= new Date());

  const approveMut = useMutation({
    mutationFn: approveUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users });
      toast.success("User approved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [rejectTarget, setRejectTarget] = useState<{ id: string; username: string } | null>(null);
  const rejectMut = useMutation({
    mutationFn: rejectUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users });
      toast.success("User rejected");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const revokeMut = useMutation({
    mutationFn: revokeRegistrationInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.invites });
      toast.success("Invite revoked");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Create-invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [inviteDays, setInviteDays] = useState(7);

  const createMut = useMutation({
    mutationFn: () => createRegistrationInvite({
      email: inviteEmail || null,
      note: inviteNote || null,
      expires_in_days: inviteDays,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.invites });
      setInviteEmail(""); setInviteNote(""); setInviteDays(7);
      toast.success("Invite created");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create invite"),
  });

  const handleCreate = (e: FormEvent) => { e.preventDefault(); createMut.mutate(); };

  const inviteLink = (token: string) => `${window.location.origin}/register/${token}`;
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  if (usersLoading || invitesLoading) return <LoadingSpinner />;

  return (
    <div className="h-full overflow-auto">
      <div className="space-y-6 max-w-4xl mx-auto w-full">
        <div>
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="text-sm text-muted-foreground">Manage registration invites and approve new users.</p>
        </div>

        {/* Pending users */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Pending approval
              {pendingUsers.length > 0 && (
                <Badge variant="secondary" className="ml-2">{pendingUsers.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No users awaiting approval.</p>
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead className="w-48">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingUsers.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.username}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm"
                            disabled={approveMut.isPending}
                            onClick={() => approveMut.mutate(u.id)}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline"
                            disabled={rejectMut.isPending}
                            onClick={() => setRejectTarget({ id: u.id, username: u.username })}>
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create invite */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create invite</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs">Email <span className="text-muted-foreground">(optional — locks the invite)</span></Label>
                  <Input type="email" value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="cousin@example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Expires in (days)</Label>
                  <Input type="number" min={1} max={365} value={inviteDays}
                    onChange={(e) => setInviteDays(Number(e.target.value) || 7)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Note <span className="text-muted-foreground">(only visible to admins)</span></Label>
                <Input value={inviteNote}
                  onChange={(e) => setInviteNote(e.target.value)}
                  placeholder="e.g. Aunt Mary" />
              </div>
              <Button type="submit" size="sm" disabled={createMut.isPending}>
                {createMut.isPending ? "Creating…" : "Generate invite link"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Outstanding invites */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Outstanding invites
              {outstandingInvites.length > 0 && (
                <Badge variant="secondary" className="ml-2">{outstandingInvites.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {outstandingInvites.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No outstanding invites.</p>
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>For</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-48">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstandingInvites.map(i => (
                    <TableRow key={i.id}>
                      <TableCell className="text-sm">
                        {i.email || <span className="text-muted-foreground italic">anyone</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{i.note || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(i.expires_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline"
                            onClick={() => copy(inviteLink(i.token))}>
                            Copy link
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive"
                            disabled={revokeMut.isPending}
                            onClick={() => setRevokeTarget(i.id)}>
                            Revoke
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Used / expired */}
        {usedOrExpired.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Past invites</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>For</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usedOrExpired.map(i => (
                    <TableRow key={i.id}>
                      <TableCell className="text-sm">
                        {i.email || <span className="text-muted-foreground italic">anyone</span>}
                      </TableCell>
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

        {/* Approved users (for context) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Approved users</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvedUsers.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      {u.is_superadmin ? (
                        <Badge>Superadmin</Badge>
                      ) : (
                        <Badge variant="secondary">User</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={() => { if (rejectTarget) rejectMut.mutate(rejectTarget.id); }}
        title={`Reject ${rejectTarget?.username}?`}
        message="They won't be able to log in. Any active sessions will be revoked. You can approve them again later."
        confirmLabel="Reject"
        destructive
        isPending={rejectMut.isPending}
      />

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
