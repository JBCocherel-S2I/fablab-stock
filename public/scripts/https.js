// En ligne, l'application ne s'utilise qu'en HTTPS : les codes d'accès et le
// cookie de session ne doivent jamais circuler en clair. Une page ouverte en
// http:// est aussitôt rechargée en https://.
// En développement (ce PC, ou un téléphone du même réseau local), HTTP reste permis.

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

if (location.protocol === "http:" && !LOCAL.test(location.hostname)) {
  location.replace(`https://${location.host}${location.pathname}${location.search}${location.hash}`);
}
