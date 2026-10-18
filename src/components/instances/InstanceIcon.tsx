import { cn } from "@/lib/utils";
import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Renders an instance's icon. The value can be an emoji, a couple of letters,
 * an image URL or a local path; anything else falls back to a deterministic
 * gradient monogram.
 */
export function InstanceIcon({
  icon,
  name,
  id,
  className,
}: {
  icon: string | null;
  name: string;
  id: string;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const base = cn(
    "flex shrink-0 select-none items-center justify-center overflow-hidden rounded-xl font-semibold",
    className,
  );

  const isHttp = icon && /^https?:\/\//i.test(icon);
  const isData = icon && /^data:/i.test(icon);
  const isBlob = icon && /^blob:/i.test(icon);
  const isRemoteImage = isHttp || isData || isBlob;
  const isPath =
    !errored &&
    icon &&
    !isRemoteImage &&
    (/^(?:[a-zA-Z]:[\\/]|\/)/.test(icon) || icon.startsWith("file:"));
  const localPath = isPath ? (icon?.startsWith("file:") ? icon.slice(5) : icon) : null;

  if (localPath) {
    return (
      <div className={cn(base, "bg-muted")}>
        <img
          src={convertFileSrc(localPath)}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setErrored(true)}
        />
      </div>
    );
  }

  if (isRemoteImage && !errored) {
    return (
      <div className={cn(base, "bg-muted")}>
        <img
          src={icon ?? undefined}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setErrored(true)}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  const label = (errored ? null : icon)?.trim() || monogram(name);
  const isEmoji = label ? !/[a-z0-9]/i.test(label) || label.length <= 2 : false;

  return (
    <div className={base} style={{ background: gradientFor(id) }}>
      <span className={cn(isEmoji ? "text-2xl" : "text-sm uppercase tracking-wide")}>{label}</span>
    </div>
  );
}

function monogram(name: string): string {
  const parts = name
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim()
    .split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[1][0];
}

/** Stable, pleasant gradient derived from the instance id. */
function gradientFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue} 55% 32%), hsl(${(hue + 40) % 360} 55% 22%))`;
}
