import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BarChart3,
  ListTree,
  Settings,
  ChevronLeft,
  Image as ImageIcon,
  Tag,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "首页" },
  { to: "/stats", icon: BarChart3, label: "统计" },
  { to: "/details", icon: ListTree, label: "详细" },
  { to: "/review", icon: ImageIcon, label: "回顾" },
  { to: "/categories", icon: Tag, label: "分类" },
  { to: "/settings", icon: Settings, label: "设置" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-card transition-all duration-300",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Nav Items */}
      <nav className="flex-1 space-y-1 p-3 pt-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse Button */}
      <div className="border-t p-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform",
              collapsed && "rotate-180"
            )}
          />
          {!collapsed && <span>收起</span>}
        </button>
      </div>
    </aside>
  );
}
