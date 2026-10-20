import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  error: unknown;
  onRetry?: () => void;
}

/** Inline error card shown when a request fails. */
export function ErrorState({ title = "Something went wrong", error, onRetry }: ErrorStateProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-destructive/20 bg-destructive/[0.045] px-8 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <p className="text-lg font-bold tracking-tight">{title}</p>
      <p className="mt-1 max-w-md break-words text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          <RotateCcw /> Try again
        </Button>
      )}
    </div>
  );
}
