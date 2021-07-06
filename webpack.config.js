const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: "./scripts/browser-sync.js",
  output: {
    filename: "full-sync.js",
    path: path.resolve(__dirname, "bundle"),
  },
  resolve:{
    fallback: {
      fs: false,
      path: require.resolve("path-browserify"),
      crypto: require.resolve("crypto-browserify"),
      os: require.resolve("os-browserify/browser"),
      http: require.resolve("stream-http"),
      https: require.resolve("https-browserify"),
      stream: require.resolve("stream-browserify")
    }
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer']
    }),
  ],
  mode: "development",
  target: 'web',
};
