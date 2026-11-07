import type { Metadata, Viewport } from 'next';
import './globals.css';
import DeviceViewSwitcher from './components/DeviceViewSwitcher';

export const metadata: Metadata = {
  title: 'Top Play Training | Centro de Control',
  description: 'Plataforma de planificación y rendimiento — Top Play Training',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#1e3a8a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/ce-europa.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Top Play" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#1e3a8a" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  try {
    var mode = localStorage.getItem("app_device_view_mode") || "auto";
    var zoom = localStorage.getItem("app_device_zoom_level") || "100";
    var resolved = mode;
    if (mode === "auto") {
      var w = window.innerWidth || document.documentElement.clientWidth || screen.width;
      if (w < 768) resolved = "mobile";
      else if (w <= 1024) resolved = "tablet";
      else resolved = "desktop";
    }
    document.documentElement.setAttribute("data-device-mode", resolved);
    document.documentElement.setAttribute("data-user-mode-preference", mode);
    if (zoom && zoom !== "100") {
      document.documentElement.style.setProperty("--app-user-zoom", (parseInt(zoom, 10) / 100).toString());
    }
  } catch (e) {}
})();
(function() {
  try {
    var RESTORE_FLAG = "local_storage_restored_2026_11_06_v6";
    window.restoreLocalBackup = function() {
      localStorage.removeItem("__local_restore_flag__");
      location.reload();
    };
    if (typeof window !== "undefined" && window.localStorage && localStorage.getItem("__local_restore_flag__") !== RESTORE_FLAG) {
      fetch("/local_storage_restore.json")
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data && typeof data === "object") {
            var count = 0;
            for (var key in data) {
              try {
                localStorage.setItem(key, data[key]);
                count++;
              } catch (e) {
                console.warn("[Restore] Storage quota warning on " + key, e);
              }
            }
            localStorage.setItem("__local_restore_flag__", RESTORE_FLAG);
            console.log("[Restore] Successfully injected " + count + " keys into localStorage!");
            window.dispatchEvent(new Event("storage"));
            window.location.reload();
          }
        })
        .catch(function(err) {
          console.error("[Restore] Error fetching local_storage_restore.json:", err);
        });
    }
  } catch (e) {}
})();
`,
          }}
        />
      </head>
      <body>
        {children}
        <DeviceViewSwitcher />
      </body>
    </html>
  );
}
