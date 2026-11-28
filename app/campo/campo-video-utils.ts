// Utilidades para parsing, detección y renderizado de vídeos en ejercicios de campo

export interface VideoEmbedInfo {
  type: "youtube" | "vimeo" | "drive" | "loom" | "mp4" | "external";
  embedUrl: string;
  originalUrl: string;
  isEmbeddable: boolean;
  isDirectVideo: boolean;
  providerLabel: string;
  thumbnailUrl?: string;
}

/**
 * Analiza una URL de vídeo y genera la URL embebida óptima para iframes o reproductores HTML5.
 */
export function getVideoEmbedInfo(url?: string | null): VideoEmbedInfo | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // 1. YOUTUBE (youtube.com, youtu.be, youtube.com/shorts, youtube.com/embed)
  const ytMatch = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/
  );
  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    return {
      type: "youtube",
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`,
      originalUrl: trimmed,
      isEmbeddable: true,
      isDirectVideo: false,
      providerLabel: "YouTube",
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }

  // 2. VIMEO (vimeo.com/...)
  const vimeoMatch = trimmed.match(
    /(?:vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|))(\d+)/
  );
  if (vimeoMatch && vimeoMatch[1]) {
    const videoId = vimeoMatch[1];
    return {
      type: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${videoId}?autoplay=1&title=0&byline=0&portrait=0`,
      originalUrl: trimmed,
      isEmbeddable: true,
      isDirectVideo: false,
      providerLabel: "Vimeo",
    };
  }

  // 3. GOOGLE DRIVE (drive.google.com/file/d/.../view)
  const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    const fileId = driveMatch[1];
    return {
      type: "drive",
      embedUrl: `https://drive.google.com/file/d/${fileId}/preview`,
      originalUrl: trimmed,
      isEmbeddable: true,
      isDirectVideo: false,
      providerLabel: "Google Drive",
    };
  }

  // 4. LOOM (loom.com/share/...)
  const loomMatch = trimmed.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (loomMatch && loomMatch[1]) {
    const videoId = loomMatch[1];
    return {
      type: "loom",
      embedUrl: `https://www.loom.com/embed/${videoId}?autoplay=1`,
      originalUrl: trimmed,
      isEmbeddable: true,
      isDirectVideo: false,
      providerLabel: "Loom",
    };
  }

  // 5. ARCHIVOS DIRECTOS DE VÍDEO (.mp4, .webm, .ogg, .mov)
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(trimmed)) {
    return {
      type: "mp4",
      embedUrl: trimmed,
      originalUrl: trimmed,
      isEmbeddable: true,
      isDirectVideo: true,
      providerLabel: "Vídeo MP4 / WebM",
    };
  }

  // 6. Enlace externo genérico
  return {
    type: "external",
    embedUrl: trimmed,
    originalUrl: trimmed,
    isEmbeddable: false,
    isDirectVideo: false,
    providerLabel: "Enlace Web",
  };
}
