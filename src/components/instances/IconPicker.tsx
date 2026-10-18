import { useState } from "react";
import { ImagePlus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { InstanceIcon } from "@/components/instances/InstanceIcon";
import { pickFile } from "@/lib/dialogs";
import { cn } from "@/lib/utils";

/**
 * A small, curated set of icons that read well at card size. Emoji render
 * consistently everywhere, so these are safe defaults; anything more expressive
 * comes from a custom image file.
 */
const PRESETS = [
  "🌲",
  "⛏️",
  "⚔️",
  "🛡️",
  "🏹",
  "🧪",
  "🔮",
  "🔥",
  "❄️",
  "⚡",
  "🌊",
  "🌪️",
  "🌙",
  "☀️",
  "🌈",
  "🍀",
  "🍄",
  "🐝",
  "🐉",
  "🦄",
  "🎃",
  "💀",
  "🤖",
  "👾",
  "🚀",
  "🏰",
  "🧱",
  "💰",
  "📚",
  "🎵",
  "🌱",
  "🧊",
];

interface IconPickerProps {
  /** Current icon: an emoji, a couple of letters, or an absolute image path. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Used for the live preview and the monogram fallback. */
  name: string;
  /** Stable id used to derive the preview's gradient. */
  id: string;
  className?: string;
}

/**
 * Choose an instance icon: pick one of the built-in emoji, or point at an image
 * file. A chosen file is only referenced here — the backend copies it into the
 * instance folder when the instance is created or saved, so the icon keeps
 * working even if the original is later moved or deleted.
 */
export function IconPicker({ value, onChange, name, id, className }: IconPickerProps) {
  const [open, setOpen] = useState(false);

  async function chooseImage() {
    const file = await pickFile({
      title: "Choose an icon image",
      extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg", "ico"],
    });
    if (!file) return;
    onChange(file);
    setOpen(false);
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <InstanceIcon icon={value} name={name} id={id} className="h-14 w-14 text-3xl" />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <ImagePlus className="h-4 w-4" />
            Change icon
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Emoji</p>
              <p className="text-xs text-muted-foreground">
                Quick and lightweight. Great at small sizes.
              </p>
            </div>

            <div className="grid grid-cols-8 gap-1">
              {PRESETS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onChange(emoji);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-accent",
                    value === emoji && "bg-accent ring-1 ring-ring",
                  )}
                  aria-label={`Use ${emoji} as the icon`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">Custom image</p>
                <p className="truncate text-xs text-muted-foreground">
                  {value && isImagePath(value) ? value.split(/[\\/]/).pop() : "PNG, JPG, WebP…"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={chooseImage}>
                Browse…
              </Button>
            </div>

            {value && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-2 text-muted-foreground"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Back to automatic
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** True when the icon value points at a file rather than being an emoji/label. */
function isImagePath(value: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|\/|file:)/.test(value);
}
