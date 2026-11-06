import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Top Play Training | Centro de Control',
  description: 'Plataforma de planificación y rendimiento — Top Play Training',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  try {
    var RESTORE_FLAG = "local_storage_restored_2026_11_06_v4";
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
  } catch (e) {
    console.error("[Restore] Exception:", e);
  }
})();
`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
