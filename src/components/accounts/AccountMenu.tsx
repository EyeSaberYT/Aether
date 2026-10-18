import { useEffect, useState } from "react";
import { ChevronDown, LogOut, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";

import { SignInDialog } from "@/components/accounts/SignInDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { faceUrl, headCrop } from "@/lib/skin";
import type { AccountKind } from "@/lib/tauri";
import { activeAccount, useAccounts } from "@/store/useAccounts";

/** Sidebar footer showing the active player and account switching. */
export function AccountMenu() {
  const [signInOpen, setSignInOpen] = useState(false);
  const accounts = useAccounts((state) => state.accounts);
  const setActive = useAccounts((state) => state.setActive);
  const logout = useAccounts((state) => state.logout);

  const account = activeAccount(accounts);

  if (!account) {
    return (
      <>
        <Button variant="outline" className="w-full" onClick={() => setSignInOpen(true)}>
          <UserRound /> Sign in
        </Button>
        <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-3 rounded-lg border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-accent/50">
            <SkinAvatar name={account.username} kind={account.kind} skinUrl={account.skinUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{account.username}</p>
              <p className="truncate text-xs text-muted-foreground">
                {account.kind === "microsoft" ? "Microsoft account" : "Offline profile"}
              </p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>Accounts</DropdownMenuLabel>
          {accounts.map((entry) => (
            <DropdownMenuItem
              key={entry.uuid}
              onSelect={() => {
                if (!entry.active) void setActive(entry.uuid);
              }}
            >
              <SkinAvatar
                name={entry.username}
                kind={entry.kind}
                skinUrl={entry.skinUrl}
                className="h-6 w-6"
              />
              <span className="truncate">{entry.username}</span>
              {entry.active && (
                <span className="ml-auto text-[10px] uppercase text-primary">Active</span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSignInOpen(true)}>
            <Plus /> Add account
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => {
              void logout(account.uuid);
              toast.success(`Signed out ${account.username}`);
            }}
          >
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </>
  );
}

/**
 * How an image the launcher wants to draw resolved: not asked for, still in
 * flight, loaded, or refused.
 *
 * `height` is only meaningful once loaded, and only matters for skin sheets —
 * their two layouts (64x64 modern, 64x32 legacy) put the head at different
 * heights.
 */
type ImageLoad =
  | { state: "absent" }
  | { state: "pending" }
  | { state: "loaded"; height: number }
  | { state: "broken" };

/**
 * Preload an image and report how it went, plus how tall it turned out.
 *
 * The height is the only way to tell a modern skin sheet from a legacy one
 * before layout, and the plain failure is what lets the caller fall back
 * instead of rendering an empty circle.
 */
function useImageLoad(url: string | null | undefined): ImageLoad {
  const [texture, setTexture] = useState<ImageLoad>(
    url ? { state: "pending" } : { state: "absent" },
  );

  useEffect(() => {
    if (!url) {
      setTexture({ state: "absent" });
      return;
    }

    // Return the current state when it is already `pending` so a url that
    // resolves from cache does not schedule a pointless render.
    setTexture((current) => (current.state === "pending" ? current : { state: "pending" }));

    const image = new Image();
    image.onload = () => setTexture({ state: "loaded", height: image.naturalHeight });
    image.onerror = () => setTexture({ state: "broken" });
    image.src = url;

    // A url already in the browser's cache can be settled before its events
    // run, so check directly: `complete` is also true once a load has *failed*,
    // which is why `naturalHeight` (0 on failure) is what separates the two.
    if (image.complete) {
      if (image.naturalHeight > 0) {
        setTexture({ state: "loaded", height: image.naturalHeight });
      } else {
        setTexture({ state: "broken" });
      }
    }

    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [url]);

  return texture;
}

/**
 * Player head, falling back through the player's own texture to initials.
 *
 * Heads are rendered by skinmc.net from the username: it composites the hat
 * layer and works for any online account, including one whose sheet the
 * launcher never managed to fetch. The player's own texture fills the circle
 * while that request is in flight — it is the same skin and needs no network —
 * and stays if the request fails, so an unreachable service costs nothing.
 *
 * Offline profiles go straight to initials: their username belongs to nobody,
 * so a lookup would show the face of whoever really holds the name.
 *
 * Note the pairs below are the only place two children share the circle, which
 * is what Radix's `Avatar` is built for: it hides `AvatarFallback` once the
 * image loads. Two plain fill elements would each take half of it instead.
 */
export function SkinAvatar({
  name,
  kind,
  skinUrl,
  className,
}: {
  name: string;
  kind: AccountKind;
  skinUrl: string | null;
  className?: string;
}) {
  const texture = useImageLoad(skinUrl);
  const head = kind === "offline" ? null : faceUrl(name);
  const face = useImageLoad(head);

  if (head !== null && face.state === "loaded") {
    return (
      <Avatar className={className}>
        <AvatarImage src={head} alt={name} loading="lazy" />
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
    );
  }

  // The sheet stands in until the render arrives; only give up on it if it fails.
  const sheetUrl = skinUrl && texture.state !== "broken" ? skinUrl : null;

  if (sheetUrl !== null) {
    return (
      <Avatar className={className}>
        <div
          role="img"
          aria-label={`${name}'s skin`}
          // Match the fallback's placeholder so the circle is never a hole
          // while the sheet decodes.
          className="h-full w-full bg-muted"
          style={headCrop(sheetUrl, texture.state === "loaded" ? texture.height : null)}
        />
      </Avatar>
    );
  }

  return (
    <Avatar className={className}>
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
