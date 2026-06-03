import { Navigate, Route, Routes } from "react-router-dom";
import { SiteLayout } from "./components/layout/SiteLayout";
import { HomePage } from "./pages/HomePage";
import { LabPage } from "./pages/LabPage";
import { MethodPage } from "./pages/MethodPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PersonasPage } from "./pages/PersonasPage";
import { SourcesPage } from "./pages/SourcesPage";

export function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/lab" element={<Navigate to="/" replace />} />
        <Route path="/lab/:demoSlug" element={<LabPage />} />
        <Route path="/method" element={<MethodPage />} />
        <Route path="/personas" element={<PersonasPage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
