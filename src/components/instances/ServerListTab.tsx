import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  EllipsisVertical,
  EyeOff,
  FolderOpen,
  Pencil,
  Play,
  Plus,
  Save,
  Server,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Spinner } from "@/components/common/Spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { servers as serversApi } from "@/lib/api";
import type { ServerEntry, ServerListFile } from "@/lib/tauri";

/**
 * The instance's in-game multiplayer list — `servers.dat`.
 *
 * Edits are held here as a draft and written as a whole on Save. The game reads
 * the file at startup and rewrites it whenever the player changes the list in
 * game, so a save underneath a running instance would be silently overwritten;
 * the tab refuses one and says why rather than losing the player's rows.
 */
export function ServerListTab({
  instanceId,
  isRunning,
  launching,
  onJoin,
  onReveal,
}: {
  instanceId: string;
  /** The game is running, so the list can't be written underneath it. */
  isRunning: boolean;
  /** This instance is being launched right now. */
  launching: boolean;
  /** Start the game straight into a server. */
  onJoin: (address: string) => void;
  /** Open the game folder that holds `servers.dat`. */
  onReveal: () => void;
}) {
  const [file, setFile] = useState<ServerListFile | null>(null);
  const [saved, setSaved] = useState<ServerEntry[]>([]);
  const [draft, setDraft] = useState<ServerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  // Bumped on every open so the dialog starts from fresh fields even though
  // Radix keeps it mounted between opens.
  const openCount = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await serversApi.list(instanceId);
      setFile(list);
      setSaved(list.servers);
      setDraft(list.servers);
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = !sameList(saved, draft);

  function openEditor(index: number | null) {
    openCount.current += 1;
    setEditor({ index, seq: openCount.current });
  }

  function applyEntry(index: number | null, entry: ServerEntry) {
    setDraft((current) =>
      index === null
        ? [...current, entry]
        : current.map((existing, at) => (at === index ? entry : existing)),
    );
  }

  function removeEntry(index: number) {
    setDraft((current) => current.filter((_, at) => at !== index));
  }

  /** Swap a row with its neighbour: the order here is the order in game. */
  function moveEntry(index: number, by: number) {
    setDraft((current) => {
      const target = index + by;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [entry] = next.splice(index, 1);
      next.splice(target, 0, entry);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const list = await serversApi.save(instanceId, draft);
      setFile(list);
      setSaved(list.servers);
      setDraft(list.servers);
      const count = list.servers.length;
      toast.success(`Saved ${count} server${count === 1 ? "" : "s"}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner /> Reading the server list…
      </div>
    );
  }

  if (error !== null) {
    return (
      <EmptyState
        icon={Server}
        title="Couldn't read the server list"
        description={error instanceof Error ? error.message : String(error)}
        action={
          <Button variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {isRunning && (
        <Card className="border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-300">
          <p className="font-medium">This instance is running</p>
          <p className="mt-0.5">
            Minecraft rewrites its server list whenever you change it in game, so Aether can't save
            until this instance closes. Your edits can stay here until then.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => openEditor(null)}>
            <Plus /> Add server
          </Button>
          <p className="text-xs text-muted-foreground">
            {draft.length === 0
              ? "No servers yet"
              : `${draft.length} server${draft.length === 1 ? "" : "s"} in the game's list`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-300">Unsaved changes</span>}
          <Button
            variant="ghost"
            size="sm"
            disabled={!dirty || saving}
            onClick={() => setDraft(saved)}
          >
            <Undo2 /> Revert
          </Button>
          <Button
            variant="brand"
            size="sm"
            disabled={!dirty || saving || isRunning}
            title={isRunning ? "Close the game before saving" : undefined}
            onClick={() => void save()}
          >
            {saving ? <Spinner /> : <Save />} Save
          </Button>
        </div>
      </div>

      {draft.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No multiplayer servers"
          description="Servers added here turn up in the game's multiplayer screen, and servers you add in game turn up here."
          action={
            <Button variant="brand" onClick={() => openEditor(null)}>
              <Plus /> Add server
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {draft.map((entry, index) => (
            <ServerRow
              key={`${index}-${entry.address}`}
              entry={entry}
              first={index === 0}
              last={index === draft.length - 1}
              joinLabel={launching ? "Launching" : "Join"}
              joinDisabled={isRunning || launching}
              joinTitle={
                isRunning
                  ? "This instance is already running"
                  : `Start Minecraft on ${entry.address}`
              }
              onJoin={() => onJoin(entry.address)}
              onEdit={() => openEditor(index)}
              onMoveUp={() => moveEntry(index, -1)}
              onMoveDown={() => moveEntry(index, 1)}
              onRemove={() => removeEntry(index)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <p className="min-w-0 flex-1 truncate" title={file?.path}>
          {file?.exists ? "Saved to " : "Will be saved to "}
          <span className="font-mono">{file?.path}</span>
        </p>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={onReveal}>
          <FolderOpen /> Open folder
        </Button>
      </div>

      <ServerEditor
        key={editor?.seq ?? 0}
        open={editor !== null}
        entry={editor?.index == null ? null : (draft[editor.index] ?? null)}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onSubmit={(entry) => {
          applyEntry(editor?.index ?? null, entry);
          setEditor(null);
        }}
      />
    </div>
  );
}

/** The row the editor is open for; `null` index means it is adding a new one. */
interface EditorTarget {
  index: number | null;
  /** Distinguishes one open from the next, so the dialog re-seeds its fields. */
  seq: number;
}

function ServerRow({
  entry,
  first,
  last,
  joinLabel,
  joinDisabled,
  joinTitle,
  onJoin,
  onEdit,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  entry: ServerEntry;
  first: boolean;
  last: boolean;
  joinLabel: string;
  joinDisabled: boolean;
  joinTitle: string;
  onJoin: () => void;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <ServerIcon icon={entry.icon} />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{entry.name || entry.address}</span>
          {entry.hidden && (
            <Badge variant="muted" className="shrink-0 gap-1 text-[10px]">
              <EyeOff className="h-3 w-3" /> Hidden
            </Badge>
          )}
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {entry.address || "No address"}
          {entry.acceptTextures && " · resource packs allowed"}
        </p>
      </div>

      <Button variant="brand" size="sm" disabled={joinDisabled} title={joinTitle} onClick={onJoin}>
        <Play className="fill-current" /> {joinLabel}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" title="More">
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem disabled={first} onSelect={onMoveUp}>
            <ArrowUp /> Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={last} onSelect={onMoveDown}>
            <ArrowDown /> Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onRemove}>
            <Trash2 /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * The server's icon, as the game cached it: a base64 PNG with no `data:` prefix.
 *
 * Nothing here invents or uploads one — the game only ever draws what it
 * downloaded while pinging a server — so a list entry that has no icon, or one
 * that no longer decodes, gets the placeholder.
 */
function ServerIcon({ icon }: { icon: string | null }) {
  const [broken, setBroken] = useState(false);

  if (icon === null || broken) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Server className="h-4 w-4" />
      </div>
    );
  }

  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
      <img
        src={`data:image/png;base64,${icon}`}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

/**
 * Add or edit one server.
 *
 * Everything the game stores for a server is editable here, which includes the
 * icon it cached and the legacy "send resource packs" flag: Aether carries both
 * through untouched rather than resetting a choice the game made.
 *
 * The caller remounts this per open (see `EditorTarget.seq`), so the fields can
 * be seeded straight from `entry` with no effect.
 */
function ServerEditor({
  open,
  entry,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  /** The entry being edited, or `null` when adding one. */
  entry: ServerEntry | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (entry: ServerEntry) => void;
}) {
  const [name, setName] = useState(entry?.name ?? "");
  const [address, setAddress] = useState(entry?.address ?? "");
  const [hidden, setHidden] = useState(entry?.hidden ?? false);
  const [acceptTextures, setAcceptTextures] = useState(entry?.acceptTextures ?? false);

  const trimmed = address.trim();
  // Mirrored from the backend's own validation, but only where the user is
  // typing: a row added in game with a space in its address can still be read,
  // and Aether simply won't save it until it is fixed.
  const problem =
    trimmed === ""
      ? "An address is required."
      : /\s/.test(trimmed)
        ? 'Addresses can\'t contain spaces — try "play.example.com:25565".'
        : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (problem !== null) return;
            onSubmit({
              // The game shows the address when a server has no name, so a
              // blank name is not an error — it just reads as the address.
              name: name.trim() || trimmed,
              address: trimmed,
              icon: entry?.icon ?? null,
              hidden,
              acceptTextures,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{entry === null ? "Add server" : "Edit server"}</DialogTitle>
            <DialogDescription>
              The game's own fields, kept exactly as the game stores them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="server-address">Address</Label>
              <Input
                id="server-address"
                autoFocus
                value={address}
                placeholder="play.example.com"
                onChange={(event) => setAddress(event.target.value)}
              />
              {address !== "" && problem !== null && (
                <p className="text-xs text-destructive">{problem}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="server-name">Name</Label>
              <Input
                id="server-name"
                value={name}
                placeholder="My server"
                onChange={(event) => setName(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Shown in the game's server list. Defaults to the address.
              </p>
            </div>

            <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <span>
                <span className="block text-sm">Hidden</span>
                <span className="block text-xs text-muted-foreground">
                  Only listed in game while hidden servers are shown.
                </span>
              </span>
              <Switch checked={hidden} onCheckedChange={setHidden} />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <span>
                <span className="block text-sm">Resource packs</span>
                <span className="block text-xs text-muted-foreground">
                  Whether this server may send its own packs.
                </span>
              </span>
              <Switch checked={acceptTextures} onCheckedChange={setAcceptTextures} />
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" disabled={problem !== null}>
              {entry === null ? "Add server" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Whether two lists hold the same rows.
 *
 * Compared field by field rather than by reference, so Save and Revert react to
 * exactly the data that would be written.
 */
function sameList(a: ServerEntry[], b: ServerEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every((entry, index) => {
      const other = b[index];
      return (
        entry.name === other.name &&
        entry.address === other.address &&
        entry.icon === other.icon &&
        entry.hidden === other.hidden &&
        entry.acceptTextures === other.acceptTextures
      );
    })
  );
}
