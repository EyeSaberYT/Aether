import { ArrowLeft, Compass, Home, Telescope } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";

/** Friendly fallback screen for routes that no longer exist. */
export function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="screen-page flex min-h-[calc(100vh-5rem)] items-center justify-center">
      <div className="max-w-lg text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-[1.6rem] border border-primary/20 bg-primary/[0.08] text-primary shadow-[0_0_60px_hsl(var(--primary)/0.08)]">
          <Telescope className="h-9 w-9" />
        </div>
        <p className="mt-7 text-6xl font-black tracking-[-0.08em] text-foreground/15">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">This world doesn't exist</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          The page may have moved, or the link you followed may be out of date.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="brand" onClick={() => navigate("/")}>
            <Home /> Home
          </Button>
          <Button variant="outline" onClick={() => navigate("/discover")}>
            <Compass /> Discover
          </Button>
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft /> Go back
          </Button>
        </div>
      </div>
    </div>
  );
}
