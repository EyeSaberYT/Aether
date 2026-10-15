import { cn } from "@/lib/utils";

/**
 * Renders an instance's icon. The value can be an emoji, a couple of letters or
 * an image URL; anything else falls back to a deterministic gradient monogram.
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
  const base = cn(
    "flex shrink-0 select-none items-center justify-center overflow-hidden rounded-xl font-semibold",
    className,
  );

  if (icon && /^https?:\/\//i.test(icon)) {
    return (
      <div className={cn(base, "bg-muted")}>
        <img src={icon} alt={name} className="h-full w-full object-cover" loading="lazy" />
      </div>
    );
  }

  const label = icon?.trim() || monogram(name);
  const isEmoji = icon ? !/[a-z0-9]/i.test(icon) || icon.length <= 2 : false;

  return (
    <div className={base} style={{ background: gradientFor(id) }}>
      <span className={cn(isEmoji ? "text-2xl" : "text-sm uppercase tracking-wide")}>
        {label}
      </span>
    </div>
  );
}

function monogram(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/);
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
