const { NxAppWebpackPlugin } = require("@nx/webpack/app-plugin");
const webpack = require("webpack");
const { join } = require("path");

const optionalDependencies = [
  /^pg-native$/,
  /^pg-query-stream$/,
  /^mongodb$/,
  /^mysql$/,
  /^mysql2$/,
  /^oracledb$/,
  /^sqlite3$/,
  /^better-sqlite3$/,
  /^sql\.js$/,
  /^mssql$/,
  /^redis$/,
  /^ioredis$/,
  /^react-native-sqlite-storage$/,
  /^@sap\/hana-client/,
  /^@google-cloud\/spanner$/,
  /^typeorm-aurora-data-api-driver$/,
];

module.exports = {
  output: {
    path: join(__dirname, "dist"),
    clean: true,
    ...(process.env.NODE_ENV !== "production" && {
      devtoolModuleFilenameTemplate: "[absolute-resource-path]",
    }),
  },
  ignoreWarnings: [
    {
      message:
        /Critical dependency: the request of a dependency is an expression/,
    },
  ],
  plugins: [
    new webpack.IgnorePlugin({
      checkResource(resource) {
        return optionalDependencies.some((pattern) => pattern.test(resource));
      },
    }),
    new NxAppWebpackPlugin({
      target: "node",
      compiler: "tsc",
      main: "./src/main.ts",
      tsConfig: "./tsconfig.app.json",
      assets: ["./src/assets"],
      optimization: false,
      outputHashing: "none",
      generatePackageJson: false,
      sourceMap: true,
    }),
  ],
};
