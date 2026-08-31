/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel packages Next.js functions itself. Standalone output is only for
  // Mercury's Docker image and breaks Vercel's post-build trace collection.
  output: process.env.VERCEL ? undefined : "standalone",
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
