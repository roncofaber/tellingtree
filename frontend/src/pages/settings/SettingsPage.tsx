import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import * as authApi from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function SettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [profileMsg, setProfileMsg] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteMsg, setDeleteMsg] = useState("");

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await authApi.updateMe({ full_name: fullName, email });
      await refreshUser();
      setProfileMsg("Profile updated.");
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordMsg("Password changed. You will need to log in again.");
      setCurrentPassword("");
      setNewPassword("");
      setTimeout(() => logout(), 2000);
    } catch (err) {
      setPasswordMsg(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleDeleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirm("Are you sure? This cannot be undone.")) return;
    try {
      await authApi.deleteAccount({ password: deletePassword });
      logout();
      navigate("/login");
    } catch (err) {
      setDeleteMsg(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="h-full overflow-auto">
    <div className="space-y-6 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={user?.username || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {profileMsg && <p className="text-sm text-muted-foreground">{profileMsg}</p>}
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
            </div>
            {passwordMsg && <p className="text-sm text-muted-foreground">{passwordMsg}</p>}
            <Button type="submit">Change Password</Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Delete Account</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            This will permanently delete your account. You must transfer ownership of any trees you own before deleting.
          </p>
          <form onSubmit={handleDeleteAccount} className="space-y-4">
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <Input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} required />
            </div>
            {deleteMsg && <p className="text-sm text-destructive">{deleteMsg}</p>}
            <Button type="submit" variant="destructive">Delete My Account</Button>
          </form>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
