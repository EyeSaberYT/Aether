import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ImagePlus, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { skin } from "@/lib/api";
import { pickFile } from "@/lib/dialogs";
import { headCrop } from "@/lib/skin";
import type { SkinCurrentResponse } from "@/lib/tauri";
import { useAccounts } from "@/store/useAccounts";

/** Which arm model the skin is drawn for. */
type Variant = "classic" | "slim";

interface SkinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Look at the signed-in account's skin and, for a Microsoft account, replace
 * it.
 *
 * The 3D view is loaded on demand — `skinview3d` drags three.js along, so it
 * is imported dynamically and only once, when this dialog is first opened.
 * A file picked from disk previews instantly (its head, cropped the same way
 * the account avatar does it) and is sent to Mojang on upload; nothing leaves
 * the machine before then.
 */
export function SkinDialog({ open, onOpenChange }: SkinDialogProps) {
  const [data, setData] = useState<SkinCurrentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedPath, setPickedPath] = useState<string | null>(null);
  const [variant, setVariant] = useState<Variant>("classic");
  const [uploading, setUploading] = useState(false);
  const refreshAccounts = useAccounts((state) => state.refresh);

  // A fresh read every time the dialog opens: the skin may have been changed
  // in-game (or on minecraft.net) since the last one.
  useEffect(() => {
    if (!open) {
      setPickedPath(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    skin
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setVariant(result.skin.variant ?? "classic");
      })
      .catch((cause) => !cancelled && setError(String(cause)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const account = data?.account ?? null;
  const offline = account?.kind === "offline";
  const signedIn = account !== null;

  // While a file is picked it is what the viewer shows — as a head crop,
  // because a texture straight off disk cannot be uploaded to WebGL without
  // the asset protocol granting cross-origin access.
  const previewUrl = pickedPath ? convertFileSrc(pickedPath) : (data?.skin.skinUrl ?? null);

  const chooseFile = async () => {
    try {
      const path = await pickFile({ title: "Choose a skin", extensions: ["png"] });
      if (path) setPickedPath(path);
    } catch (cause) {
      toast.error(String(cause));
    }
  };

  const upload = async () => {
    if (!pickedPath) return;
    setUploading(true);
    try {
      const result = await skin.upload(pickedPath, variant);
      setData(result);
      setPickedPath(null);
      // The sidebar avatar reads from the account store, so it has to be
      // reloaded for the new texture to show up there too.
      await refreshAccounts();
      toast.success("Skin updated");
    } catch (cause) {
      toast.error(String(cause));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Skin</DialogTitle>
          <DialogDescription>
            {signedIn
              ? `How ${account.username} looks in game, and what to wear next.`
              : "Sign in to see and change your skin."}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading && <Skeleton className="h-72 w-full" />}

        {!loading && (
          <div className="grid gap-6 sm:grid-cols-[260px_1fr]">
            {/* ---- the model ------------------------------------------------ */}
            <div className="relative flex h-[360px] w-[260px] items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
              {previewUrl ? (
                pickedPath ? (
                  <LocalHeadCrop url={previewUrl} />
                ) : (
                  <SkinStage url={previewUrl} model={variant} />
                )
              ) : (
                <p className="px-6 text-center text-sm text-muted-foreground">
                  {signedIn ? "No skin on this account yet." : "Nothing to show."}
                </p>
              )}
            </div>

            {/* ---- controls ------------------------------------------------- */}
            <div className="flex flex-col gap-4">
              {!signedIn && (
                <p className="text-sm text-muted-foreground">
                  Sign in with a Microsoft account to see your skin and change it.
                </p>
              )}

              {signedIn && offline && (
                <p className="text-sm text-muted-foreground">
                  Offline profiles can't change their skin — Mojang only accepts uploads from
                  accounts that own the game.
                </p>
              )}

              <div>
                <p className="text-sm font-medium">Arm model</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Slim arms are 3 pixels wide, classic arms 4.
                </p>
                <div className="mt-2 flex gap-2">
                  {(["classic", "slim"] as const).map((option) => (
                    <Button
                      key={option}
                      size="sm"
                      variant={variant === option ? "default" : "outline"}
                      onClick={() => setVariant(option)}
                      disabled={!signedIn || offline}
                    >
                      {option === "classic" ? "Classic" : "Slim"}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-sm font-medium">Upload a new skin</p>
                <p className="text-xs text-muted-foreground">
                  A PNG sheet, 64×64 (or the legacy 64×32). Nothing is uploaded until you press
                  Upload.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void chooseFile()}
                    disabled={!signedIn || offline || uploading}
                  >
                    <ImagePlus /> {pickedPath ? "Choose another" : "Choose file"}
                  </Button>
                  {pickedPath && (
                    <Button size="sm" variant="ghost" onClick={() => setPickedPath(null)}>
                      <X /> Cancel
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="brand"
                    onClick={() => void upload()}
                    disabled={!pickedPath || uploading}
                  >
                    <Upload /> {uploading ? "Uploading…" : "Upload"}
                  </Button>
                </div>
                {pickedPath && (
                  <p className="truncate text-xs text-muted-foreground">{pickedPath}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The live skin, rotating, as a 3D model.
 *
 * `skinview3d` is loaded lazily (see the note on the dialog), the viewer is
 * rebuilt whenever the texture or the arm model changes, and everything is
 * disposed on unmount so closing the dialog stops the render loop instead of
 * leaving it spinning behind the scenes.
 */
function SkinStage({ url, model }: { url: string; model: Variant }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let viewer: import("skinview3d").SkinViewer | null = null;
    setFailed(false);

    void (async () => {
      try {
        const { SkinViewer, IdleAnimation } = await import("skinview3d");
        // The dialog may have been closed while the bundle was loading; a
        // viewer created now would never be disposed.
        if (cancelled) return;

        viewer = new SkinViewer({
          canvas,
          width: 258,
          height: 358,
          zoom: 0.9,
          model: model === "slim" ? "slim" : "default",
        });
        viewer.autoRotate = true;
        viewer.animation = new IdleAnimation();
        await viewer.loadSkin(url);
        if (cancelled) viewer.dispose();
      } catch (cause) {
        console.error("skin viewer failed", cause);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      viewer?.dispose();
      viewer = null;
    };
  }, [url, model]);

  if (failed) {
    return (
      <div className="px-6 text-center">
        <div
          role="img"
          aria-label="Skin preview"
          className="mx-auto h-32 w-32 rounded-md border bg-muted"
          style={headCrop(url, null)}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          3D preview is unavailable right now — the skin itself is fine.
        </p>
      </div>
    );
  }

  return <canvas ref={canvasRef} className="h-[358px] w-[258px]" />;
}

/** Head of a skin chosen from disk, cropped the way the account avatar does it. */
function LocalHeadCrop({ url }: { url: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 text-center">
      <div
        role="img"
        aria-label="Selected skin preview"
        className="h-32 w-32 rounded-md border bg-muted"
        style={headCrop(url, null)}
      />
      <p className="text-xs text-muted-foreground">
        Preview of the file you picked. Press Upload to wear it.
      </p>
    </div>
  );
}
