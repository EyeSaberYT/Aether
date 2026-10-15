import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/common/Spinner";
import { system } from "@/lib/api";
import { useAccounts } from "@/store/useAccounts";
import { cn } from "@/lib/utils";

interface SignInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Two-tab sign-in: real Microsoft account or a local offline profile. */
export function SignInDialog({ open, onOpenChange }: SignInDialogProps) {
  const [tab, setTab] = useState<"microsoft" | "offline">("microsoft");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  const signingIn = useAccounts((state) => state.signingIn);
  const deviceCode = useAccounts((state) => state.deviceCode);
  const loginMicrosoft = useAccounts((state) => state.loginMicrosoft);
  const loginOffline = useAccounts((state) => state.loginOffline);

  // Reset transient state whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setBusy(false);
      setUsername("");
    }
  }, [open]);

  async function handleMicrosoft() {
    try {
      const account = await loginMicrosoft();
      toast.success(`Signed in as ${account.username}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleOffline() {
    const name = username.trim();
    if (!name) return;
    setBusy(true);
    try {
      const account = await loginOffline(name);
      toast.success(`Welcome, ${account.username}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add an account</DialogTitle>
          <DialogDescription>
            Sign in with Microsoft to play online, or create an offline profile for
            single-player and mod testing.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <TabButton active={tab === "microsoft"} onClick={() => setTab("microsoft")}>
            <KeyRound className="h-4 w-4" /> Microsoft
          </TabButton>
          <TabButton active={tab === "offline"} onClick={() => setTab("offline")}>
            <UserRound className="h-4 w-4" /> Offline
          </TabButton>
        </div>

        {tab === "microsoft" ? (
          <div className="space-y-4">
            {deviceCode ? (
              <div className="space-y-3 rounded-lg border bg-card p-4">
                <p className="text-sm text-muted-foreground">
                  Open the Microsoft page and enter this code:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-center text-lg font-semibold tracking-[0.3em]">
                    {deviceCode.userCode}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Copy code"
                    onClick={() => {
                      void navigator.clipboard.writeText(deviceCode.userCode);
                      toast.success("Code copied");
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => void system.openUrl(deviceCode.verificationUri)}
                >
                  <ExternalLink /> Open {hostname(deviceCode.verificationUri)}
                </Button>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Spinner className="h-3 w-3" /> Waiting for you to finish…
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                A browser window will open so you can approve the sign-in. Aether never
                sees your password.
              </p>
            )}

            <Button
              className="w-full"
              variant="brand"
              disabled={signingIn}
              onClick={handleMicrosoft}
            >
              {signingIn ? <Spinner /> : <Check />}
              {signingIn ? "Waiting for approval…" : "Sign in with Microsoft"}
            </Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleOffline();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="offline-username">Username</Label>
              <Input
                id="offline-username"
                value={username}
                maxLength={16}
                placeholder="Steve"
                autoFocus
                onChange={(event) => setUsername(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Offline profiles can build and test mods but can't join online servers.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={busy || !username.trim()}>
              {busy ? <Spinner /> : <UserRound />} Create offline profile
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
