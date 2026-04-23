import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordFields, passwordStrength, MIN_PASSWORD_SCORE } from "@/components/common/PasswordFields";

export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const mut = useMutation({
    mutationFn: () => apiClient.post<void>("/auth/reset-password", { token, new_password: password }),
    onSuccess: () => {
      toast.success("Password changed — please sign in.");
      navigate("/login");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Invalid or expired link"),
  });

  const ready = passwordStrength(password).score >= MIN_PASSWORD_SCORE && password === confirm;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Choose a new password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
            <PasswordFields
              password={password} confirm={confirm}
              onPasswordChange={setPassword} onConfirmChange={setConfirm}
              disabled={mut.isPending}
            />
            <Button type="submit" className="w-full" disabled={mut.isPending || !ready}>
              {mut.isPending ? "Saving…" : "Set new password"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" className="underline text-primary">Back to sign in</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
