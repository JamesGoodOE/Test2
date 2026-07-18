/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf-parse and mammoth are server-only; keep them out of the client bundle.
  serverExternalPackages: ["pdf-parse", "mammoth", "exceljs"],
};

export default nextConfig;
