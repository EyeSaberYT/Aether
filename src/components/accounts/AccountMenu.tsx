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
import { headCrop } from "@/lib/skin";
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
            <SkinAvatar
              uuid={account.uuid}
              name={account.username}
              kind={account.kind}
              skinUrl={account.skinUrl}
            />
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
                uuid={entry.uuid}
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
 * A Minecraft skin sheet that has been resolved, or is being resolved, for
 * display.
 *
 * `height` is the sheet's real pixel height in pixels: sheets come in two
 * sizes (64x64 modern, 64x32 legacy) and the head sits at a different height
 * in each, so the crop needs it.
 */
type SkinTexture =
  | { state: "absent" }
  | { state: "pending" }
  | { state: "loaded"; height: number }
  | { state: "broken" };

/**
 * Preload a skin sheet and report how tall it turned out to be.
 *
 * The head is cropped out of the sheet with CSS rather than by a service, and
 * the only way to learn a sheet's dimensions before layout is to read them off
 * a hidden `Image`. A load failure is reported as `broken` so the caller can
 * fall back instead of rendering an empty circle.
 */
function useSkinTexture(url: string | null | undefined): SkinTexture {
  const [texture, setTexture] = useState<SkinTexture>(
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
 * Player head rendered from Minecraft skins, falling back to initials.
 *
 * The texture stored on the account wins: it comes straight from Mojang's
 * profile, so it always matches the player's current skin and needs no
 * third-party renderer. The head service is only reached for accounts with no
 * texture on file — or one that failed to load — and offline profiles go
 * straight to initials because they have no authentic skin to show.
 *
 * Note the branch below renders exactly one of {texture, image} alongside a
 * fallback: Radix only hides `AvatarFallback` while an `AvatarImage` is
 * loaded, and two `w-full` children in the flex row would each take half the
 * circle.
 */
export function SkinAvatar({
  uuid,
  name,
  kind,
  skinUrl,
  className,
}: {
  uuid: string;
  name: string;
  kind: AccountKind;
  skinUrl: string | null;
  className?: string;
}) {
  const texture = useSkinTexture(skinUrl);

  // The sheet takes over as soon as it exists; only give up on it if it fails.
  const sheetUrl = skinUrl && texture.state !== "broken" ? skinUrl : null;
  // An offline profile has no authentic skin, so its initials are the honest
  // answer rather than an arbitrary default head.
  const useService = sheetUrl === null && kind !== "offline";

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
      {useService && (
        <AvatarImage src={`https://mc-heads.net/avatar/${uuid}/64`} alt={name} loading="lazy" />
      )}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
