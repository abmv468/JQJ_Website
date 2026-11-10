/** @type {import('next').NextConfig} */
const nextConfig = {
  // Every next/image src is a site-local path. Do not add remotePatterns
  // or domains unless a real host is passed to next/image; a wildcard
  // hostname lets the optimizer fetch and decode arbitrary remote images.
};

module.exports = nextConfig;
