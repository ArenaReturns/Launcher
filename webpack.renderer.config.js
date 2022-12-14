const rules = require("./webpack.rules");
const plugins = require("./webpack.plugins");

rules.push({
  test: /\.s[ac]ss$/i,
  use: [
    { loader: "style-loader" },
    {
      loader: "css-loader",
      options: {
        esModule: false,
      },
    },
    { loader: "sass-loader" },
  ],
});

rules.push({
  test: /\.css$/,
  use: [
    { loader: "style-loader" },
    {
      loader: "css-loader",
      options: {
        esModule: false,
      },
    },
  ],
});

module.exports = {
  module: {
    rules,
  },
  plugins: plugins,
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css", ".scss", ".sass"],
  },
};
