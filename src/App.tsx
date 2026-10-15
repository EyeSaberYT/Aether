import { Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { Discover } from "@/pages/Discover";
import { Home } from "@/pages/Home";
import { InstanceDetail } from "@/pages/InstanceDetail";
import { Library } from "@/pages/Library";
import { NotFound } from "@/pages/NotFound";
import { ProjectDetail } from "@/pages/ProjectDetail";
import { Settings } from "@/pages/Settings";

/**
 * Route table. Every screen renders inside {@link AppShell}, which owns the
 * sidebar, startup data-loading and the progress footer.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="library" element={<Library />} />
        <Route path="library/:id" element={<InstanceDetail />} />
        <Route path="discover" element={<Discover />} />
        <Route path="project/:projectType/:id" element={<ProjectDetail />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
