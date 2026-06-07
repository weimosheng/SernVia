import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { TitleBar } from "@/components/TitleBar";

export function Layout() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
