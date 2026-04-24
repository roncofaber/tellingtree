import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  listRegistrationInvites, createRegistrationInvite, revokeRegistrationInvite,
  listAllUsers, approveUser, rejectUser, generateResetToken, deleteUser,
  promoteUser, demoteUser, getAdminStats,
} from "@/api/admin";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { TableRowsSkeleton } from "@/components/common/Skeleton";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Users, Trees, Mail, ShieldCheck, Clock } from "lucide-react";
import type { AdminStats } from "@/api/admin";

const adminKeys = {
  invites: ["admin", "invites"] as const,
  users:   ["admin", "users"]   as const,
  stats:   ["admin", "stats"]   as const,
};

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: adminKeys.stats,
    queryFn:  getAdminStats,
  });

  if (isLoading) return <LoadingSpinner />;

  const cards = [
    { label: "Total users",    value: stats?.users_total,      icon: Users,      sub: `${stats?.users_pending ?? 0} pending` },
    { label: "Active users",   value: stats?.users_active,     icon: ShieldCheck, sub: `${stats?.users_superadmin ?? 0} superadmin` },
    { label: "Trees",          value: stats?.trees_total,      icon: Trees,      sub: `${stats?.trees_public ?? 0} public` },
    { label: "Invites used",   value: stats?.invites_used,     icon: Mail,       sub: `${stats?.invites_outstanding ?? 0} outstanding` },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ label, value, icon: Icon, sub }) => (
          <Card key={label}>
            <CardContent className="p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
              </div>
              <p className="text-3xl font-bold tabular-nums">{value ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {(stats?.users_pending ?? 0) > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {stats!.users_pending} user{stats!.users_pending !== 1 ? "s" : ""} waiting for approval
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">Go to the Users tab to approve or reject them.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const queryClient = useQueryClient();
  const { user: me } = useAuth();

  const { data: users, isLoading } = useQuery({
    queryKey: adminKeys.users,
    queryFn:  listAllUsers,
  });

  const [search,         setSearch]         = useState("");
  const [statusFilter,   setStatusFilter]   = useState<"all" | "pending" | "active" | "superadmin">("all");
  const [page,           setPage]           = useState(0);
  const PAGE_SIZE = 25;
  const [rejectTarget,   setRejectTarget]   = useState<{ id: string; username: string } | null>(null);
  const [deleteTarget,   setDeleteTarget]   = useState<{ id: string; username: string } | null>(null);
  const [promoteTarget,  setPromoteTarget]  = useState<{ id: string; username: string } | null>(null);
  const [demoteTarget,   setDemoteTarget]   = useState<{ id: string; username: string } | null>(null);
  const [resetUrl,       setResetUrl]       = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: adminKeys.users });
    queryClient.invalidateQueries({ queryKey: adminKeys.stats });
  };

  const approveMut = useMutation({ mutationFn: approveUser,  onSuccess: () => { invalidate(); toast.success("User approved");   }, onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });
  const rejectMut  = useMutation({ mutationFn: rejectUser,   onSuccess: () => { invalidate(); toast.success("User suspended");  }, onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });
  const deleteMut  = useMutation({ mutationFn: deleteUser,   onSuccess: () => { invalidate(); toast.success("User deleted");    }, onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });
  const promoteMut = useMutation({ mutationFn: promoteUser,  onSuccess: () => { invalidate(); toast.success("User promoted to superadmin"); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });
  const demoteMut  = useMutation({ mutationFn: demoteUser,   onSuccess: () => { invalidate(); toast.success("Superadmin removed");          }, onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });
  const resetMut   = useMutation({ mutationFn: generateResetToken, onSuccess: (data) => setResetUrl(data.url), onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") });

  const filtered = (users ?? []).filter(u => {
    const q = search.trim().toLowerCase();
    if (q && !u.username.toLowerCase().includes(q) && !(u.email ?? "").toLowerCase().includes(q)) return false;
    if (statusFilter === "pending")    return !u.is_approved;
    if (statusFilter === "active")     return u.is_approved && !u.is_superadmin;
    if (statusFilter === "superadmin") return u.is_superadmin;
    return true;
  });

  const pendingCount = (users ?? []).filter(u => !u.is_approved).length;
  const totalPages   = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated    = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (isLoading) return <TableRowsSkeleton rows={8} />;

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between shrink-0">
        <div className="flex flex-wrap gap-2 items-center flex-1 min-w-0">
          <Input
            placeholder="Search by username or email…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="h-8 w-full sm:w-56"
          />
          <div className="flex gap-1">
            {(["all", "pending", "active", "superadmin"] as const).map(f => (
              <button key={f} onClick={() => { setStatusFilter(f); setPage(0); }}
                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${statusFilter === f ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted"}`}>
                {f === "all" ? `All (${users?.length ?? 0})` : f === "pending" ? `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}` : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg flex flex-col min-h-0 flex-1">
        <Table className="table-fixed">
          <colgroup>
            <col className="w-[22%]" />
            <col className="hidden sm:table-column w-[28%]" />
            <col className="w-[14%]" />
            <col className="hidden sm:table-column w-[12%]" />
            <col className="w-[24%]" />
          </colgroup>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Joined</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
        <div className="overflow-auto flex-1 min-h-0">
          <Table className="table-fixed">
            <colgroup>
              <col className="w-[22%]" />
              <col className="hidden sm:table-column w-[28%]" />
              <col className="w-[14%]" />
              <col className="hidden sm:table-column w-[12%]" />
              <col className="w-[24%]" />
            </colgroup>
            <TableBody>
              {paginated.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.username}
                    {u.id === me?.id && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                    {u.full_name && <span className="block text-xs text-muted-foreground">{u.full_name}</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{u.email}</TableCell>
                  <TableCell>
                    {u.is_superadmin
                      ? <Badge><ShieldCheck className="h-3 w-3 mr-1" />Admin</Badge>
                      : u.is_approved
                      ? <Badge variant="secondary">Active</Badge>
                      : <Badge variant="outline" className="text-amber-600 border-amber-300">Pending</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                    {new Date(u.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {!u.is_approved && (
                        <Button size="sm" disabled={approveMut.isPending} onClick={() => approveMut.mutate(u.id)}>Approve</Button>
                      )}
                      {!u.is_superadmin && u.id !== me?.id && (
                        <>
                          {u.is_approved && (
                            <Button size="sm" variant="outline" disabled={rejectMut.isPending}
                              onClick={() => setRejectTarget({ id: u.id, username: u.username })}>
                              Suspend
                            </Button>
                          )}
                          <Button size="sm" variant="outline" disabled={promoteMut.isPending}
                            onClick={() => setPromoteTarget({ id: u.id, username: u.username })}>
                            Make admin
                          </Button>
                          <Button size="sm" variant="outline" disabled={resetMut.isPending}
                            onClick={() => resetMut.mutate(u.id)}>
                            Reset link
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" disabled={deleteMut.isPending}
                            onClick={() => setDeleteTarget({ id: u.id, username: u.username })}>
                            Delete
                          </Button>
                        </>
                      )}
                      {u.is_superadmin && u.id !== me?.id && (
                        <Button size="sm" variant="outline" disabled={demoteMut.isPending}
                          onClick={() => setDemoteTarget({ id: u.id, username: u.username })}>
                          Remove admin
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {search || statusFilter !== "all" ? "No users match the current filters." : "No users yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between shrink-0 px-1">
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} · {filtered.length} users
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page === 0} onClick={() => setPage(0)}>«</Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Prev</Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next ›</Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</Button>
          </div>
        </div>
      )}

      {/* Password reset link overlay */}
      {resetUrl && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setResetUrl(null)}>
          <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <CardHeader><CardTitle className="text-base">Password reset link</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Send this link via WhatsApp, Signal, or email. It expires in 24 hours and can only be used once.</p>
              <Input value={resetUrl} readOnly className="font-mono text-xs" onClick={e => (e.target as HTMLInputElement).select()} />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => { navigator.clipboard.writeText(resetUrl); toast.success("Copied to clipboard"); }}>Copy link</Button>
                <Button variant="outline" onClick={() => setResetUrl(null)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog open={!!rejectTarget} onClose={() => setRejectTarget(null)}
        onConfirm={() => { if (rejectTarget) rejectMut.mutate(rejectTarget.id); }}
        title={`Suspend ${rejectTarget?.username}?`}
        message="They won't be able to log in. Their data is kept. You can re-approve them later."
        confirmLabel="Suspend" destructive isPending={rejectMut.isPending} />

      <ConfirmDialog open={!!promoteTarget} onClose={() => setPromoteTarget(null)}
        onConfirm={() => { if (promoteTarget) promoteMut.mutate(promoteTarget.id); }}
        title={`Make ${promoteTarget?.username} a superadmin?`}
        message="They will have full access to the admin panel and all system settings."
        confirmLabel="Promote" isPending={promoteMut.isPending} />

      <ConfirmDialog open={!!demoteTarget} onClose={() => setDemoteTarget(null)}
        onConfirm={() => { if (demoteTarget) demoteMut.mutate(demoteTarget.id); }}
        title={`Remove admin from ${demoteTarget?.username}?`}
        message="They will lose access to the admin panel but keep their account and trees."
        confirmLabel="Remove admin" destructive isPending={demoteMut.isPending} />

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteMut.mutate(deleteTarget.id); }}
        title={`Delete ${deleteTarget?.username}?`}
        message="This permanently deletes their account. They must have no owned trees. This cannot be undone."
        confirmLabel="Delete user" destructive isPending={deleteMut.isPending} />
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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: adminKeys.invites });
    queryClient.invalidateQueries({ queryKey: adminKeys.stats });
  };

  const createMut = useMutation({
    mutationFn: () => createRegistrationInvite({ email: inviteEmail || null, note: inviteNote || null, expires_in_days: inviteDays }),
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
  const inviteLink  = (token: string) => `${window.location.origin}/register/${token}`;
  const copy        = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied"); };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Create invite</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); createMut.mutate(); }} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs">Email <span className="text-muted-foreground">(optional — locks the invite to this address)</span></Label>
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="cousin@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Expires in (days)</Label>
                <Input type="number" min={1} max={365} value={inviteDays} onChange={(e) => setInviteDays(Number(e.target.value) || 7)} />
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
              <div className="border rounded-lg">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>For</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="w-36">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outstanding.map(i => (
                      <TableRow key={i.id}>
                        <TableCell className="text-sm">{i.email || <span className="text-muted-foreground italic">anyone</span>}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{i.note || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(i.expires_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => copy(inviteLink(i.token))}>Copy</Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRevokeTarget(i.id)}>Revoke</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
        </CardContent>
      </Card>

      {past.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Past invites</CardTitle></CardHeader>
          <CardContent>
            <div className="border rounded-lg">
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
                        {i.used_at ? <span className="text-emerald-600">Used</span> : <span className="text-muted-foreground">Expired</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(i.used_at || i.expires_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog open={!!revokeTarget} onClose={() => setRevokeTarget(null)}
        onConfirm={() => { if (revokeTarget) revokeMut.mutate(revokeTarget); }}
        title="Revoke this invite?" message="The link will stop working immediately."
        confirmLabel="Revoke" destructive isPending={revokeMut.isPending} />
    </div>
  );
}

// ── AdminPage ─────────────────────────────────────────────────────────────────

export function AdminPage() {
  const { user } = useAuth();

  if (user && !user.is_superadmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex flex-col h-full min-h-0 max-w-5xl mx-auto w-full gap-3">
      <div className="shrink-0 space-y-1">
        <PageHeader items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Admin" }]} />
        <h1 className="text-xl font-bold">Admin</h1>
      </div>

      <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
        <TabsList className="overflow-x-auto flex-nowrap w-full justify-start shrink-0">
          <TabsTrigger value="overview"  className="shrink-0">Overview</TabsTrigger>
          <TabsTrigger value="users"     className="shrink-0">Users</TabsTrigger>
          <TabsTrigger value="invites"   className="shrink-0">Invites</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 overflow-auto min-h-0">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="users" className="mt-4 overflow-hidden min-h-0 flex flex-col">
          <UsersTab />
        </TabsContent>
        <TabsContent value="invites" className="mt-4 overflow-auto min-h-0">
          <InvitesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
