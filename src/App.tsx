import { Routes, Route } from "react-router-dom";
import "./App.css";
import { Layout } from "@/pages/Layout";
import { HomePage } from "@/pages/HomePage";
import { StatsPage } from "@/pages/StatsPage";
import { DetailsPage } from "@/pages/DetailsPage";
import { AppDetailPage } from "@/pages/AppDetailPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ReviewPage } from "@/pages/ReviewPage";
import { CategoriesPage } from "@/pages/CategoriesPage";
import { ToastProvider } from "@/components/Toast";

function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/details/:appName" element={<AppDetailPage />} />
          <Route path="/details" element={<DetailsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}

export default App;
