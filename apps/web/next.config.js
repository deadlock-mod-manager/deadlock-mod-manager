/**
 * @type {import('next').NextConfig}
 */
module.exports = {
  reactStrictMode: true,
  experimental: {
    staleTimes: {
      dynamic: 30, // 30 seconds
      static: 180, // 180 seconds
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};
