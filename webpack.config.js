const path = require('path');

const devConfig = {
   name: 'devConfig',
   entry: './src/browser.ts',
   devtool: 'inline-source-map',
   devServer: {
      contentBase: './dist',
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
   resolve: {
      extensions: [ '.tsx', '.ts', '.js' ]
   },
   output: {
      filename: 'kheprichess_browser.js',
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
   resolve: {
      extensions: [ '.tsx', '.ts', '.js' ]
   },
   output: {
      filename: 'kheprichess_uci.js',
      path: path.resolve(__dirname, 'dist')
   },
}

module.exports = [devConfig, browserConfig, uciConfig];
