// Calcul du rapport de contraste WCAG 2 entre deux couleurs hexadécimales.

function canal(valeur: number): number {
  const c = valeur / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Couleur invalide : ${hex}`);
  const [r, v, b] = [m[1]!, m[2]!, m[3]!].map((x) => canal(parseInt(x, 16))) as [number, number, number];
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (clair + 0.05) / (sombre + 0.05);
}
