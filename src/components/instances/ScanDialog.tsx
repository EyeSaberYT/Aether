import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CircleX,
  Info,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { Spinner } from "@/components/common/Spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { security } from "@/lib/api";
import { formatBytes, projectTypeLabel, severityColor, severityLabel } from "@/lib/format";
import type {
  ScanFileReport,
  ScanFinding,
  ScanProvenance,
  ScanReport,
  ScanSeverity,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface ScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  instanceName: string;
}

/**
 * Runs a content scan for an instance and shows what it found.
 *
 * The framing matters as much as the rules do. The backend can only report
 * evidence, so the copy everywhere says "review this", never "this is a
 * virus" — and a file that merely is not on Modrinth is described as exactly
 * that, because that is true of every CurseForge mod ever downloaded.
 */
export function ScanDialog({ open, onOpenChange, instanceId, instanceName }: ScanDialogProps) {
  const [report, setReport] = useState<ScanReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [failed, setFailed] = useState<unknown>(null);

  const run = useCallback(async () => {
    setScanning(true);
    setFailed(null);
    try {
      setReport(await security.scan(instanceId));
    } catch (cause) {
      setReport(null);
      setFailed(cause);
    } finally {
      setScanning(false);
    }
  }, [instanceId]);

  // Rescan on open: installing or deleting a mod changes the answer, so a
  // remembered report would be giving stale security advice.
  useEffect(() => {
    if (open) void run();
  }, [open, run]);

  const flagged = report?.files.filter((file) => file.findings.length > 0) ?? [];
  const clean = report?.files.filter((file) => file.findings.length === 0) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Scan “{instanceName}”
          </DialogTitle>
          <DialogDescription>
            Reads every mod, pack and shader for the concrete signs of an account stealer — bundled
            programs, code that reaches for your Microsoft tokens or Discord — then checks each
            file&rsquo;s hash against Modrinth&rsquo;s database to catch tampering. This is not an
            antivirus: treat findings as a reason to look closer, not a verdict.
          </DialogDescription>
        </DialogHeader>

        {scanning ? (
          <ScanningState />
        ) : failed !== null ? (
          <FailedState cause={failed} onRetry={() => void run()} />
        ) : report ? (
          <div className="space-y-4">
            <SummaryBanner report={report} flagged={flagged.length} />

            {flagged.length > 0 && (
              <div className="space-y-3">
                {flagged.map((file) => (
                  <FindingCard
                    key={file.file}
                    file={file}
                    provenanceChecked={report.provenanceChecked}
                  />
                ))}
              </div>
            )}

            {clean.length > 0 && (
              <CleanList files={clean} provenanceChecked={report.provenanceChecked} />
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" disabled={scanning} onClick={() => void run()}>
            {scanning ? <Spinner /> : <RefreshCw />} Rescan
          </Button>
          <Button disabled={scanning} onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function ScanningState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-10 text-center">
      <Spinner className="h-6 w-6" />
      <div>
        <p className="text-sm font-medium">Reading every mod and pack…</p>
        <p className="text-xs text-muted-foreground">
          Then checking each file&rsquo;s hash against Modrinth.
        </p>
      </div>
    </div>
  );
}

function FailedState({ cause, onRetry }: { cause: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-10 text-center">
      <CircleX className="h-6 w-6 text-red-300" />
      <div>
        <p className="text-sm font-medium">The scan could not run</p>
        <p className="text-xs text-muted-foreground">
          {cause instanceof Error ? cause.message : String(cause)}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw /> Try again
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/** The verdict, tinted by the worst thing the scan saw. */
function SummaryBanner({ report, flagged }: { report: ScanReport; flagged: number }) {
  const tone =
    report.critical > 0
      ? {
          Icon: ShieldAlert,
          className: "border-red-500/30 bg-red-500/10 text-red-300",
          title: `${report.critical} critical finding${report.critical === 1 ? "" : "s"}`,
        }
      : report.warnings > 0
        ? {
            Icon: AlertTriangle,
            className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
            title: `${report.warnings} file${report.warnings === 1 ? "" : "s"} worth a look`,
          }
        : {
            Icon: ShieldCheck,
            className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
            title: "Nothing suspicious found",
          };

  const verified = report.files.filter((file) => file.provenance.status === "verified").length;
  const { Icon } = tone;

  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-4", tone.className)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{tone.title}</p>
        <p className="text-xs opacity-80">
          Checked {report.examined} file{report.examined === 1 ? "" : "s"} in{" "}
          {(report.durationMs / 1000).toFixed(1)}s
          {report.provenanceChecked
            ? ` · ${verified} verified as official Modrinth files`
            : " · hashes not checked against Modrinth"}
        </p>
        {report.critical > 0 && (
          <p className="mt-1 text-xs">
            Remove or replace the files below before playing this instance.
          </p>
        )}
        {!report.provenanceChecked && (
          <p className="mt-1 text-xs opacity-70">
            Aether was offline or Modrinth was rate limiting, so tampering could not be checked this
            time. The content scan above still applies.
          </p>
        )}
        {flagged > 0 && report.critical === 0 && report.warnings === 0 && (
          <p className="mt-1 text-xs opacity-70">Only informational notes below.</p>
        )}
      </div>
    </div>
  );
}

const SEVERITY_RANK: Record<ScanSeverity, number> = { info: 0, warning: 1, critical: 2 };

/** One flagged file: what it is, where it came from, and what was seen. */
function FindingCard({
  file,
  provenanceChecked,
}: {
  file: ScanFileReport;
  provenanceChecked: boolean;
}) {
  const worst = file.findings.reduce(
    (acc, finding) =>
      SEVERITY_RANK[finding.severity] > SEVERITY_RANK[acc] ? finding.severity : acc,
    "info" as ScanSeverity,
  );

  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="truncate text-sm font-medium">{fileName(file.file)}</span>
        <Badge variant="muted">{projectTypeLabel(file.kind)}</Badge>
        <Badge variant="outline" className={severityColor(worst)}>
          {severityLabel(worst)}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">{formatBytes(file.size)}</span>
      </div>

      <ProvenanceLine provenance={file.provenance} checked={provenanceChecked} className="mt-2" />

      <ul className="mt-3 space-y-2.5">
        {file.findings.map((finding, index) => (
          <FindingRow key={`${finding.code}-${index}`} finding={finding} />
        ))}
      </ul>

      {file.truncated && (
        <p className="mt-3 text-xs text-muted-foreground">
          Only partly read — very large archives are scanned up to a fixed budget, so a clean result
          here is not a guarantee for the unread remainder.
        </p>
      )}
    </div>
  );
}

function FindingRow({ finding }: { finding: ScanFinding }) {
  const Icon =
    finding.severity === "critical"
      ? ShieldAlert
      : finding.severity === "warning"
        ? AlertTriangle
        : Info;

  return (
    <li className="flex gap-2.5">
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          finding.severity === "critical"
            ? "text-red-300"
            : finding.severity === "warning"
              ? "text-amber-300"
              : "text-sky-300",
        )}
      />
      <div className="min-w-0">
        <p className="text-sm">{finding.summary}</p>
        <p className="text-xs text-muted-foreground">{finding.detail}</p>
        {finding.entry && (
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/70">
            {finding.entry}
          </p>
        )}
      </div>
    </li>
  );
}

/** Where this file came from, stated precisely enough to act on. */
function ProvenanceLine({
  provenance,
  checked,
  className,
}: {
  provenance: ScanProvenance;
  checked: boolean;
  className?: string;
}) {
  if (provenance.status === "verified") {
    return (
      <p className={cn("flex items-center gap-1.5 text-xs text-emerald-300", className)}>
        <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          Official Modrinth file
          {provenance.version ? ` — ${provenance.version}` : ""}
        </span>
      </p>
    );
  }

  if (!checked || provenance.status === "unchecked") {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Hash not checked against Modrinth.
      </p>
    );
  }

  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Not in Modrinth&rsquo;s database — the usual case for CurseForge mods, shader packs and
      locally built mods, and also what an edited file looks like.
    </p>
  );
}

/**
 * The reassuring half. Listed rather than summarised, because "which of my
 * mods were not verified" is the question people actually have.
 */
function CleanList({
  files,
  provenanceChecked,
}: {
  files: ScanFileReport[];
  provenanceChecked: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed p-4">
      <p className="text-sm font-medium text-muted-foreground">
        {files.length} file{files.length === 1 ? "" : "s"} with nothing flagged
      </p>
      <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
        {files.map((file) => (
          <li key={file.file} className="flex items-center gap-2 text-xs">
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
            <span className="truncate">{file.file}</span>
            {file.provenance.status === "verified" && (
              <span className="ml-auto max-w-[45%] shrink-0 truncate text-muted-foreground">
                {file.provenance.version ?? file.provenance.project ?? "verified"}
              </span>
            )}
          </li>
        ))}
      </ul>
      {!provenanceChecked && (
        <p className="mt-2 text-xs text-muted-foreground">
          Hashes were not checked against Modrinth this time, so these are clean on content only.
        </p>
      )}
    </div>
  );
}

/** `mods/sodium.jar` → `sodium.jar`. */
function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}
