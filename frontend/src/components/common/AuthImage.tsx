import { useEffect, useState } from "react";
import { fetchMediaBlob } from "@/api/media";

interface Props {
  treeId: string;
  mediaId: string;
  alt?: string;
  className?: string;
}

export function AuthImage({ treeId, mediaId, alt, className }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    fetchMediaBlob(treeId, mediaId)
      .then(u => { url = u; setSrc(u); })
      .catch(() => setSrc(null));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [treeId, mediaId]);

  if (!src) return <div className={className} />;
  return <img src={src} alt={alt} className={className} />;
}
