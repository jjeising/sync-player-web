const path = require('path');

module.exports = {
	entry: './src/index.js',
	output: {
		filename: 'main.js',
		path: path.resolve(__dirname, 'public/js'),
	},
	
	module: {
		rules: [
			{
				test: /\.(js|jsx)$/,
				exclude: /nodeModules/,
				use: {
					loader: 'babel-loader',
					options: {
						presets: [
							'@babel/preset-react'
						]
					}
				}
			}
		]
	},
};
