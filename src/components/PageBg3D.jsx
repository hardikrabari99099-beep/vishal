import { useSettings } from "../context/SettingsContext";

export default function PageBg3D() {
  const { settings } = useSettings();
  if (settings.widgets?.bg_3d?.enabled === false) return null;

  return (
    <div className="page-bg-3d" aria-hidden="true">
      <span className="pb-orb pb-orb-1" />
      <span className="pb-orb pb-orb-2" />
      <span className="pb-blob" />
    </div>
  );
}
