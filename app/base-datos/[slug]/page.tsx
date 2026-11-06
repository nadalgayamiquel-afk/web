import Link from "next/link";
import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ slug: string }> };

export default async function DatabasePlaceholder({ params }: PageProps) {
  const { slug } = await params;

  if (slug.toLowerCase() === "bbdd_gps" || slug.toLowerCase() === "bbdd-gps") {
    redirect("/base-datos/bbdd_gps");
  }

  return (
    <main className="placeholder-page">
      <span className="eyebrow">BASE DE DATOS</span>
      <h1>{slug.replaceAll("-", "_").toUpperCase()}</h1>
      <p>Placeholder de la base de datos. La tabla y las acciones se incorporarán próximamente.</p>
      <Link className="placeholder-back" href="/">← Volver al índice</Link>
    </main>
  );
}
