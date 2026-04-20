import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listMembers, addMember, updateMember, removeMember } from "@/api/trees";
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

interface Props {
  treeId: string;
}

export function MembersTab({ treeId }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("viewer");

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
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ userId, newRole }: { userId: string; newRole: string }) =>
      updateMember(treeId, userId, newRole),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trees.members(treeId) });
    },
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeMember(treeId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trees.members(treeId) });
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Username</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="w-32">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members?.map((member) => (
            <TableRow key={member.id}>
              <TableCell>{member.username || member.user_id.slice(0, 8)}</TableCell>
              <TableCell>
                <Badge variant="secondary">{member.role}</Badge>
              </TableCell>
              <TableCell className="space-x-2">
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
                  onClick={() => removeMut.mutate(member.user_id)}
                >
                  Remove
                </Button>
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
  );
}
