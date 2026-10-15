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
    <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-8 py-12 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 max-w-md break-words text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          <RotateCcw /> Try again
        </Button>
      )}
    </div>
  );
}
