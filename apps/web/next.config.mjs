/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@specforge/core"],
  typedRoutes: false
};

export default nextConfig;
