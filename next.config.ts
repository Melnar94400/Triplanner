import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development", // Désactive le cache en dev
});

const nextConfig: NextConfig = {
  turbopack: {}, // <--- C'EST CETTE LIGNE QUI RÈGLE L'ERREUR
};

export default withPWA(nextConfig);

module.exports = {
  allowedDevOrigins: ['common-bars-find.loca.lt'],
}
