/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // lint 由独立的 npm run lint 负责，构建时不阻塞
    ignoreDuringBuilds: true,
  },
  experimental: {
    // MCP SDK 依赖 child_process（stdio 传输），保持为 Node 外部依赖
    serverComponentsExternalPackages: ["@modelcontextprotocol/sdk"],
  },
};

module.exports = nextConfig;
