import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import * as authApi from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { UserAvatar, userInitials } from "@/components/common/UserAvatar";

export function SettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [deletePassword, setDeletePassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarVersion, setAvatarVersion] = useState(0);

  const profileMut = useMutation({
    mutationFn: () => authApi.updateMe({ full_name: fullName, email }),
    onSuccess: async () => {
      await refreshUser();
      toast.success("Profile updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update profile"),
  });

  const passwordMut = useMutation({
    mutationFn: () => authApi.changePassword({ current_password: currentPassword, new_password: newPassword }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Password changed. Logging you out…");
      setTimeout(() => logout(), 2000);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to change password"),
  });

  const avatarUploadMut = useMutation({
    mutationFn: (file: File) => authApi.uploadAvatar(file),
    onSuccess: async () => {
      await refreshUser();
      setAvatarVersion(v => v + 1);
      toast.success("Profile picture updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed"),
  });

  const avatarRemoveMut = useMutation({
    mutationFn: () => authApi.deleteAvatar(),
    onSuccess: async () => {
      await refreshUser();
      setAvatarVersion(v => v + 1);
      toast.success("Profile picture removed");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to remove"),
  });

  const deleteMut = useMutation({
    mutationFn: () => authApi.deleteAccount({ password: deletePassword }),
    onSuccess: () => {
      logout();
      navigate("/login");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete account"),
  });

  const handleUpdateProfile = (e: FormEvent) => { e.preventDefault(); profileMut.mutate(); };
  const handleChangePassword = (e: FormEvent) => { e.preventDefault(); passwordMut.mutate(); };
  const handleDeleteAccount = (e: FormEvent) => { e.preventDefault(); setConfirmDelete(true); };

  return (
    <div className="h-full overflow-auto">
    <div className="space-y-6 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {user && (
            <div className="flex items-center gap-4">
              <UserAvatar
                userId={user.id}
                hasAvatar={user.has_avatar}
                initials={userInitials(user.full_name, user.username)}
                size={64}
                cacheBust={avatarVersion}
              />
              <div className="space-y-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) avatarUploadMut.mutate(f);
                    e.target.value = "";
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={avatarUploadMut.isPending}
                    onClick={() => fileRef.current?.click()}
                  >
                    {avatarUploadMut.isPending ? "Uploading…" : (user.has_avatar ? "Change picture" : "Upload picture")}
                  </Button>
                  {user.has_avatar && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={avatarRemoveMut.isPending}
                      onClick={() => avatarRemoveMut.mutate()}
                    >
                      {avatarRemoveMut.isPending ? "Removing…" : "Remove"}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">JPEG, PNG, WebP, or GIF. Max 5 MB.</p>
              </div>
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={user?.username || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={profileMut.isPending} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={profileMut.isPending} />
            </div>
            <Button type="submit" disabled={profileMut.isPending}>
              {profileMut.isPending ? "Saving…" : "Save"}
            </Button>
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
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required disabled={passwordMut.isPending} />
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} disabled={passwordMut.isPending} />
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>
            <Button type="submit" disabled={passwordMut.isPending}>
              {passwordMut.isPending ? "Changing…" : "Change Password"}
            </Button>
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
              <Input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} required disabled={deleteMut.isPending} />
            </div>
            <Button type="submit" variant="destructive" disabled={deleteMut.isPending || !deletePassword}>
              {deleteMut.isPending ? "Deleting…" : "Delete My Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>

    <ConfirmDialog
      open={confirmDelete}
      onClose={() => setConfirmDelete(false)}
      onConfirm={() => deleteMut.mutate()}
      title="Delete your account?"
      message="This will permanently delete your account and all associated data. You will be logged out immediately. This cannot be undone."
      confirmLabel="Yes, delete my account"
      destructive
      isPending={deleteMut.isPending}
    />
    </div>
  );
}
