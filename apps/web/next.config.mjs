/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.SPECFORGE_NEXT_STANDALONE === "0" ? {} : { output: "standalone" }),
  transpilePackages: ["@specforge/core"],
  typedRoutes: false
};

export default nextConfig;
