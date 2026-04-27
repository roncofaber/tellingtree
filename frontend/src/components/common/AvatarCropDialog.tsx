import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut } from "lucide-react";

interface Props {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

const VIEWPORT = 280;
const OUTPUT = 400;

export function AvatarCropDialog({ file, onConfirm, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const baseScale = useRef(1);
  const drag = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  const [src, setSrc] = useState("");
  const [natDim, setNatDim] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    setReady(false);
    setOffsetX(0);
    setOffsetY(0);
    setScale(1);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    baseScale.current = Math.max(VIEWPORT / img.naturalWidth, VIEWPORT / img.naturalHeight);
    setNatDim({ w: img.naturalWidth, h: img.naturalHeight });
    setReady(true);
  }, []);

  const clamp = useCallback((ox: number, oy: number, s: number) => {
    const img = imgRef.current;
    if (!img) return { ox, oy };
    const maxX = Math.max(0, (img.naturalWidth * baseScale.current * s - VIEWPORT) / 2);
    const maxY = Math.max(0, (img.naturalHeight * baseScale.current * s - VIEWPORT) / 2);
    return {
      ox: Math.max(-maxX, Math.min(maxX, ox)),
      oy: Math.max(-maxY, Math.min(maxY, oy)),
    };
  }, []);

  // ── Image drag ───────────────────────────────────────────────────────────────

  const onImgPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mx: e.clientX, my: e.clientY, ox: offsetX, oy: offsetY };
    setDragging(true);
  };

  const onImgPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const { ox, oy } = clamp(
      drag.current.ox + (e.clientX - drag.current.mx),
      drag.current.oy + (e.clientY - drag.current.my),
      scale,
    );
    setOffsetX(ox);
    setOffsetY(oy);
  };

  const onImgPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const next = Math.max(1, Math.min(4, scale * (1 - e.deltaY * 0.001)));
    const { ox, oy } = clamp(offsetX, offsetY, next);
    setScale(next);
    setOffsetX(ox);
    setOffsetY(oy);
  };

  // ── Slider drag ──────────────────────────────────────────────────────────────

  const applySliderX = useCallback((clientX: number) => {
    const el = sliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const next = 1 + pct * 3;
    setScale(next);
    setOffsetX(ox => clamp(ox, 0, next).ox);
    setOffsetY(oy => clamp(0, oy, next).oy);
  }, [clamp]);

  const onSliderPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    applySliderX(e.clientX);
  };

  const onSliderPointerMove = (e: React.PointerEvent) => {
    if (!(e.buttons & 1)) return;
    applySliderX(e.clientX);
  };

  // ── Bump buttons ─────────────────────────────────────────────────────────────

  const bump = (delta: number) => {
    const next = Math.max(1, Math.min(4, scale + delta));
    const { ox, oy } = clamp(offsetX, offsetY, next);
    setScale(next);
    setOffsetX(ox);
    setOffsetY(oy);
  };

  // ── Canvas export ─────────────────────────────────────────────────────────────

  const confirm = () => {
    const img = imgRef.current;
    if (!img) return;
    const s = baseScale.current * scale;
    const srcX = img.naturalWidth / 2 - (VIEWPORT / 2 + offsetX) / s;
    const srcY = img.naturalHeight / 2 - (VIEWPORT / 2 + offsetY) / s;
    const srcSize = VIEWPORT / s;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    canvas.getContext("2d")!.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob(blob => { if (blob) onConfirm(blob); }, "image/jpeg", 0.92);
  };

  // Derived image display dimensions
  const imgW = ready ? natDim.w * baseScale.current * scale : 0;
  const imgH = ready ? natDim.h * baseScale.current * scale : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background rounded-xl shadow-2xl p-6 flex flex-col items-center gap-4 w-[380px]">
        <div className="self-start">
          <h2 className="text-base font-semibold">Crop profile picture</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Drag to reposition · Scroll or slider to zoom</p>
        </div>

        {/* Circular crop viewport — absolutely positioned img avoids flex clipping */}
        <div
          style={{
            width: VIEWPORT,
            height: VIEWPORT,
            borderRadius: "50%",
            overflow: "hidden",
            background: "#e5e7eb",
            position: "relative",
            cursor: dragging ? "grabbing" : "grab",
            userSelect: "none",
            flexShrink: 0,
          }}
          onPointerDown={onImgPointerDown}
          onPointerMove={onImgPointerMove}
          onPointerUp={onImgPointerUp}
          onPointerCancel={onImgPointerUp}
          onWheel={onWheel}
        >
          {src && (
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={onLoad}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: imgW || "auto",
                height: imgH || "auto",
                maxWidth: "none",  // Tailwind preflight sets max-width:100% which clamps to container width
                // translate(-50%,-50%) centers on the viewport; offset shifts from there
                transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
              }}
            />
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-3 w-full justify-center">
          <Button
            type="button" size="icon" variant="outline"
            className="h-7 w-7" onClick={() => bump(-0.25)} disabled={scale <= 1}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>

          {/* Draggable slider */}
          <div
            ref={sliderRef}
            className="w-32 h-4 flex items-center cursor-pointer"
            onPointerDown={onSliderPointerDown}
            onPointerMove={onSliderPointerMove}
          >
            <div className="w-full h-1.5 bg-muted rounded-full relative">
              <div
                className="absolute left-0 top-0 h-full bg-primary rounded-full"
                style={{ width: `${((scale - 1) / 3) * 100}%` }}
              />
              {/* Thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background shadow-sm"
                style={{ left: `calc(${((scale - 1) / 3) * 100}% - 6px)` }}
              />
            </div>
          </div>

          <Button
            type="button" size="icon" variant="outline"
            className="h-7 w-7" onClick={() => bump(0.25)} disabled={scale >= 4}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 w-full justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" onClick={confirm} disabled={!ready}>Use photo</Button>
        </div>
      </div>
    </div>
  );
}
