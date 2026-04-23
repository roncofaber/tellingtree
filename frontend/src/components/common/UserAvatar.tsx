import { useEffect, useState } from "react";
import { fetchAvatarBlob } from "@/api/auth";

interface Props {
  userId: string;
  hasAvatar: boolean;
  initials: string;
  size?: number;
  className?: string;
  /** When true, the cache is bypassed (useful right after upload). */
  cacheBust?: number;
}

export function UserAvatar({
  userId, hasAvatar, initials,
  size = 32, className = "", cacheBust,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasAvatar) { setSrc(null); setFailed(false); return; }
    let url: string | null = null;
    setFailed(false);
    fetchAvatarBlob(userId)
      .then(u => { url = u; setSrc(u); })
      .catch(() => { setSrc(null); setFailed(true); });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [userId, hasAvatar, cacheBust]);

  const dimensions = { width: size, height: size };
  const fontSize = Math.max(10, Math.round(size * 0.4));

  if (hasAvatar && src && !failed) {
    return (
      <img
        src={src}
        alt=""
        className={`rounded-full object-cover bg-muted ${className}`}
        style={dimensions}
      />
    );
  }

  return (
    <div
      className={`rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold shrink-0 select-none ${className}`}
      style={{ ...dimensions, fontSize }}
    >
      {initials}
    </div>
  );
}

export function userInitials(fullName?: string | null, username?: string | null): string {
  return (
    fullName?.split(" ").map(w => w[0]).join("").slice(0, 2) ||
    username?.slice(0, 2) ||
    "?"
  ).toUpperCase();
}
