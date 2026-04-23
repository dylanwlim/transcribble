/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /transformers\.web\.js/,
        message: /Accessing import\.meta directly is unsupported/,
      },
    ];

    return config;
  },
};

export default nextConfig;
