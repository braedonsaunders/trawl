import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "playwright", "imapflow", "nodemailer"],
};

export default nextConfig;
