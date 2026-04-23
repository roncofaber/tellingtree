import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3;    // 0=too short, 1=weak, 2=fair, 3=strong
  label: string;
  color: string;
  width: string;
}

/** Minimum score required to submit a password form. */
export const MIN_PASSWORD_SCORE = 2; // Fair

export function passwordStrength(pw: string): PasswordStrength {
  if (pw.length < 8) return { score: 0, label: "Too short",  color: "bg-red-400",    width: "w-1/4" };
  const has = (re: RegExp) => re.test(pw);
  const variety = [/[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(has).length;
  if (variety === 0) return { score: 1, label: "Weak",       color: "bg-orange-400", width: "w-1/4" };
  if (variety === 1) return { score: 2, label: "Fair",       color: "bg-yellow-400", width: "w-2/4" };
  if (variety === 2) return { score: 3, label: "Good",       color: "bg-lime-500",   width: "w-3/4" };
                     return { score: 3, label: "Strong",     color: "bg-green-500",  width: "w-full" };
}

function hint(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters";
  const missing: string[] = [];
  if (!/[A-Z]/.test(pw)) missing.push("uppercase letter");
  if (!/[0-9]/.test(pw)) missing.push("number");
  if (!/[^A-Za-z0-9]/.test(pw)) missing.push("symbol");
  if (missing.length >= 2) return `Add a ${missing[0]} or ${missing[1]}`;
  if (missing.length === 1) return `Add a ${missing[0]} to make it stronger`;
  return null;
}

interface Props {
  password: string;
  confirm: string;
  onPasswordChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  disabled?: boolean;
  /** Label for the first field — defaults to "Password" */
  passwordLabel?: string;
}

export function PasswordFields({
  password, confirm,
  onPasswordChange, onConfirmChange,
  disabled, passwordLabel = "Password",
}: Props) {
  const strength = passwordStrength(password);
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <>
      <div className="space-y-1.5">
        <Label>{passwordLabel}</Label>
        <Input
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
          minLength={8}
          disabled={disabled}
        />
        {password.length > 0 && (
          <div className="space-y-1">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-300 ${strength.color} ${strength.width}`} />
            </div>
            <p className="text-xs text-muted-foreground">
              <span className={strength.score >= MIN_PASSWORD_SCORE ? "text-foreground font-medium" : ""}>
                {strength.label}
              </span>
              {hint(password) && <span> · {hint(password)}</span>}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Confirm password</Label>
        <Input
          type="password"
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
          required
          disabled={disabled}
        />
        {mismatch && (
          <p className="text-xs text-destructive">Passwords don't match.</p>
        )}
      </div>
    </>
  );
}
