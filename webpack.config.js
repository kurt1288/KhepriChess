const webpack = require('webpack');
const path = require('path');
const package = require('./package.json');

const version = package.version;

const plugins = [
   new webpack.DefinePlugin({
      __VERSION__: JSON.stringify(version),
   }),
];

const devConfig = {
   name: 'devConfig',
   entry: './src/browser.ts',
   devtool: 'inline-source-map',
   devServer: {
      static: {
         directory: path.join(__dirname, "dist")
      },
      port: 9000,
   },
   mode: 'development',
   module: {
      rules: [
         {
            test: /\.tsx?$/,
            use: 'ts-loader',
            exclude: /node_modules/,
         }
      ]
   },
   plugins,
   resolve: {
      extensions: [ '.tsx', '.ts', '.js' ],
   },
   output: {
      filename: 'browser.js',
      path: path.resolve(__dirname, 'dist'),
   },
}

const browserConfig = {
   name: 'browserConfig',
   entry: './src/engine.ts',
   mode: 'production',
   module: {
      rules: [
         {
            test: /\.tsx?$/,
            use: 'ts-loader',
            exclude: /node_modules/
         }
      ]
   },
   plugins,
   resolve: {
      extensions: [ '.tsx', '.ts', '.js' ]
   },
   output: {
      filename: `kheprichess_browser-${version}.js`,
      path: path.resolve(__dirname, 'dist'),
      library: 'Engine',
      libraryTarget: 'var',
      libraryExport: 'default'
   },
};

const uciConfig = {
   name: 'uciConfig',
   target: 'node',
   mode: 'production',
   entry: './src/uci.ts',
   module: {
      rules: [
         {
            test: /\.tsx?$/,
            use: 'ts-loader',
            exclude: /node_modules/
         }
      ]
   },
   plugins,
   resolve: {
      extensions: [ '.tsx', '.ts', '.js' ]
   },
   output: {
      filename: `kheprichess_uci-${version}.js`,
      path: path.resolve(__dirname, 'dist')
   },
}

const tuneConfig = {
   name: 'tuneConfig',
   entry: './tuner/tuner.ts',
   devtool: 'inline-source-map',
   target: "node",
   devServer: {
      static: {
         directory: path.join(__dirname, "dist")
      },
      port: 9000,
   },
   mode: 'development',
   module: {
      rules: [
         {
            test: /\.tsx?$/,
            use: 'ts-loader',
            exclude: /node_modules/,
         }
      ]
   },
   resolve: {
      extensions: [ '.tsx', '.ts', '.js' ],
   },
   output: {
      filename: 'tuner.js',
      path: path.resolve(__dirname, 'dist'),
   }, 
}

module.exports = [devConfig, browserConfig, uciConfig, tuneConfig];
