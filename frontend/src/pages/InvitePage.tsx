import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getInviteInfo, acceptInvite } from "@/api/invites";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(false);

  const { data: info, isLoading, error } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => getInviteInfo(token!),
    enabled: !!token,
    retry: false,
  });

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
      <p className="text-lg font-semibold text-destructive">Invalid or expired invite</p>
      <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "This invite link is no longer valid."}</p>
      <a href="/dashboard" className="text-primary hover:underline text-sm">Go to Dashboard</a>
    </div>
  );

  if (!info) return null;

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await acceptInvite(token!);
      toast.success(`Joined "${info.tree_name}" as ${info.role}`);
      navigate("/dashboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to join");
    } finally { setAccepting(false); }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">You're invited!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            You've been invited to join the family tree:
          </p>
          <p className="text-lg font-bold">{info.tree_name}</p>
          <Badge variant="secondary" className="text-sm">{info.role}</Badge>

          {info.already_member ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">You're already a member of this tree.</p>
              <Button className="w-full" onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
            </div>
          ) : (
            <Button className="w-full" onClick={handleAccept} disabled={accepting}>
              {accepting ? "Joining…" : "Accept Invitation"}
            </Button>
          )}

          <p className="text-xs text-muted-foreground">
            Expires: {new Date(info.expires_at).toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
