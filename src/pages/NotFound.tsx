import { Compass, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";

/** Fallback screen for unknown routes. */
export function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="text-6xl font-bold text-muted-foreground/40">404</p>
      <h1 className="text-xl font-semibold">This page took a wrong turn</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The screen you're looking for doesn't exist or has moved.
      </p>
      <div className="flex gap-2">
        <Button variant="brand" onClick={() => navigate("/")}>
          <Home /> Go home
        </Button>
        <Button variant="outline" onClick={() => navigate("/discover")}>
          <Compass /> Discover
        </Button>
      </div>
    </div>
  );
}
