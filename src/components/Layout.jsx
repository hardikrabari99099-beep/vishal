import { Header } from "./Header";
import { Footer } from "./Footer";
import AnnouncementBar from "./AnnouncementBar";
import ScrollProgress from "./ScrollProgress";
import PageBg3D from "./PageBg3D";
import { Outlet, useLocation } from "@/lib/router-compat";
import { useSettings } from "../context/SettingsContext";
import { getRouteTransitionClass } from "./MotionSystem";

export default function Layout() {
  const loc = useLocation();
  const { settings } = useSettings();
  const w = settings.widgets || {};
  return (
    <div className="min-h-screen flex flex-col grain relative">
      {loc.pathname !== "/" && <PageBg3D />}
      {w.scroll_progress?.enabled !== false && <ScrollProgress />}
      <AnnouncementBar />
      <Header />
      <main key={loc.pathname} className={`flex-1 ${getRouteTransitionClass(loc.pathname)}`}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
