import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { validateRegistrationInvite, type InviteValidation } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { PasswordFields, passwordStrength, MIN_PASSWORD_SCORE } from "@/components/common/PasswordFields";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [inviteState, setInviteState] = useState<"checking" | "valid" | "invalid" | "no-token">(
    token ? "checking" : "no-token"
  );
  const [inviteInfo, setInviteInfo] = useState<InviteValidation | null>(null);

  useEffect(() => {
    if (!token) return;
    validateRegistrationInvite(token)
      .then((info) => {
        setInviteInfo(info);
        if (info.valid) {
          setInviteState("valid");
          if (info.email) setEmail(info.email);
        } else {
          setInviteState("invalid");
        }
      })
      .catch(() => {
        setInviteState("invalid");
      });
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(email, username, password, fullName || undefined, token);
      setSubmitted(true);
      // For invite registrations the user is in pending_approval and login above quietly fails.
      // For bootstrap (no token), login succeeded → navigate.
      if (!token) {
        navigate("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  // ── Pending approval screen (after successful invite-based registration) ────
  if (submitted && token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Account created</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Your account is awaiting approval from an administrator. You'll be
              able to sign in once it's been approved.
            </p>
            <Link to="/login" className="text-sm text-primary underline">Back to sign in</Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── No token + at least one user exists: registration is invite-only ───────
  if (inviteState === "no-token") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Create Account</CardTitle>
            <p className="text-sm text-muted-foreground">
              First-time setup or bootstrap. If TellingTree already has users on this server, you'll need an invite link from an admin.
            </p>
          </CardHeader>
          <CardContent>
            <RegisterForm
              email={email} setEmail={setEmail}
              username={username} setUsername={setUsername}
              fullName={fullName} setFullName={setFullName}
              password={password} setPassword={setPassword}
              confirm={confirm} setConfirm={setConfirm}
              error={error} loading={loading}
              onSubmit={handleSubmit}
              emailLocked={false}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (inviteState === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <LoadingSpinner />
      </div>
    );
  }

  if (inviteState === "invalid") {
    let message = "This invite link is invalid.";
    if (inviteInfo?.expired) message = "This invite link has expired. Ask the admin for a new one.";
    else if (inviteInfo?.used) message = "This invite link has already been used.";
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Invite unavailable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{message}</p>
            <Link to="/login" className="text-sm text-primary underline">Back to sign in</Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Valid token: show the form, email locked if specified ──────────────────
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <p className="text-sm text-muted-foreground">
            You've been invited to TellingTree.
            {inviteInfo?.email && <> Registering for <span className="font-medium">{inviteInfo.email}</span>.</>}
          </p>
        </CardHeader>
        <CardContent>
          <RegisterForm
            email={email} setEmail={setEmail}
            username={username} setUsername={setUsername}
            fullName={fullName} setFullName={setFullName}
            password={password} setPassword={setPassword}
            confirm={confirm} setConfirm={setConfirm}
            error={error} loading={loading}
            onSubmit={handleSubmit}
            emailLocked={!!inviteInfo?.email}
          />
        </CardContent>
      </Card>
    </div>
  );
}

interface FormProps {
  email: string; setEmail: (v: string) => void;
  username: string; setUsername: (v: string) => void;
  fullName: string; setFullName: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  confirm: string; setConfirm: (v: string) => void;
  error: string; loading: boolean;
  onSubmit: (e: FormEvent) => void;
  emailLocked: boolean;
}

function RegisterForm(p: FormProps) {
  const strength = passwordStrength(p.password);
  const ready = strength.score >= MIN_PASSWORD_SCORE && p.password === p.confirm;

  return (
    <form onSubmit={p.onSubmit} className="space-y-4">
      {p.error && <p className="text-sm text-destructive">{p.error}</p>}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={p.email}
          onChange={(e) => p.setEmail(e.target.value)} required disabled={p.emailLocked} />
        {p.emailLocked && <p className="text-xs text-muted-foreground">Locked by your invite.</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input id="username" value={p.username}
          onChange={(e) => p.setUsername(e.target.value)} required minLength={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fullName">Full Name</Label>
        <Input id="fullName" value={p.fullName} onChange={(e) => p.setFullName(e.target.value)} />
      </div>
      <PasswordFields
        password={p.password} confirm={p.confirm}
        onPasswordChange={p.setPassword} onConfirmChange={p.setConfirm}
        disabled={p.loading}
      />
      <Button type="submit" className="w-full" disabled={p.loading || !ready}>
        {p.loading ? "Creating account..." : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="underline text-primary">Sign in</Link>
      </p>
    </form>
  );
}
