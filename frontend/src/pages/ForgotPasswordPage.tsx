import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const mut = useMutation({
    mutationFn: (email: string) => apiClient.post<void>("/auth/forgot-password", { email }),
    onSuccess: () => setSent(true),
    onError:   () => setSent(true), // Don't reveal if email exists
  });

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader><CardTitle className="text-2xl">Check your email</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If an account with that email exists, a password reset link has been sent. Check your inbox — it expires in 1 hour.
            </p>
            <Link to="/login" className="text-sm text-primary underline">Back to sign in</Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Reset password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your email and we'll send you a reset link.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); mut.mutate(email); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required disabled={mut.isPending} autoFocus />
            </div>
            <Button type="submit" className="w-full" disabled={mut.isPending}>
              {mut.isPending ? "Sending…" : "Send reset link"}
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
