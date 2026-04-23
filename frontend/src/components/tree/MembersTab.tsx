import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listMembers, addMember, updateMember, removeMember } from "@/api/trees";
import { createInvite } from "@/api/invites";
import { queryKeys } from "@/lib/queryKeys";
import { ROLE_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { UserAvatar, userInitials } from "@/components/common/UserAvatar";

interface Props {
  treeId: string;
}

export function MembersTab({ treeId }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("viewer");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState("viewer");
  const [removeTarget, setRemoveTarget] = useState<{ userId: string; username: string } | null>(null);

  const { data: members, isLoading } = useQuery({
    queryKey: queryKeys.trees.members(treeId),
    queryFn: () => listMembers(treeId),
  });

  const addMut = useMutation({
    mutationFn: () => addMember(treeId, { username, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trees.members(treeId) });
      setDialogOpen(false);
      setUsername("");
      setRole("viewer");
      toast.success("Member added");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to add member");
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ userId, newRole }: { userId: string; newRole: string }) =>
      updateMember(treeId, userId, newRole),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trees.members(treeId) });
      toast.success("Role updated");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to update role");
    },
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeMember(treeId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trees.members(treeId) });
      toast.success("Member removed");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to remove member");
    },
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {members?.length ?? 0} member(s)
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Invite Member
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a Member</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addMut.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => { if (v !== null) setRole(v); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">{ROLE_LABELS.viewer}</SelectItem>
                    <SelectItem value="editor">{ROLE_LABELS.editor}</SelectItem>
                    <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {addMut.error && (
                <p className="text-sm text-destructive">
                  {addMut.error instanceof Error ? addMut.error.message : "Failed"}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={addMut.isPending}>
                {addMut.isPending ? "Inviting..." : "Invite"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members?.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      userId={member.user_id}
                      hasAvatar={member.has_avatar}
                      initials={userInitials(null, member.username)}
                      size={28}
                    />
                    <span>{member.username || member.user_id.slice(0, 8)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={member.role === "owner" ? "default" : "secondary"}>{member.role === "owner" ? "Owner" : member.role}</Badge>
                </TableCell>
                <TableCell>
                  {member.role === "owner" ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Select
                        value={member.role}
                        onValueChange={(newRole) => {
                          if (newRole !== null) updateMut.mutate({ userId: member.user_id, newRole });
                        }}
                      >
                        <SelectTrigger className="w-28 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={removeMut.isPending}
                        onClick={() => setRemoveTarget({
                          userId: member.user_id,
                          username: member.username || member.user_id.slice(0, 8),
                        })}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {members?.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                  No members yet. Invite family members to collaborate.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Invite link generator */}
      <div className="border-t pt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invite via link</p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={inviteRole} onValueChange={(v) => { if (v !== null) setInviteRole(v); }}>
            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={async () => {
            try {
              const invite = await createInvite(treeId, { role: inviteRole });
              const link = `${window.location.origin}/invite/${invite.token}`;
              setInviteLink(link);
              await navigator.clipboard.writeText(link);
              toast.success("Invite link copied to clipboard");
            } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
          }}>
            Generate link
          </Button>
        </div>
        {inviteLink && (
          <div className="flex items-center gap-2">
            <Input value={inviteLink} readOnly className="h-8 text-xs font-mono" onClick={e => (e.target as HTMLInputElement).select()} />
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success("Copied"); }}>Copy</Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => { if (removeTarget) removeMut.mutate(removeTarget.userId); }}
        title={`Remove ${removeTarget?.username}?`}
        message="They will lose access to this tree immediately. You can re-invite them later."
        confirmLabel="Remove member"
        destructive
        isPending={removeMut.isPending}
      />
    </div>
  );
}
