import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@safenest/shared'],
  // The Postgres driver loads optional native modules; keep it out of the bundle.
  serverExternalPackages: ['pg', '@netlify/database'],
};

export default config;
