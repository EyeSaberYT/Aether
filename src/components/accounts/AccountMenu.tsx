import { useState } from "react";
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
            <SkinAvatar uuid={account.uuid} name={account.username} />
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
              <SkinAvatar uuid={entry.uuid} name={entry.username} className="h-6 w-6" />
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

/** Player head rendered from Minecraft skins, falling back to initials. */
export function SkinAvatar({
  uuid,
  name,
  className,
}: {
  uuid: string;
  name: string;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      <AvatarImage
        src={`https://crafatar.com/avatars/${uuid}?size=64&overlay`}
        alt={name}
        loading="lazy"
      />
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
