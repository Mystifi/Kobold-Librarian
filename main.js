/*
 * main.js: Main file
 *
 * Starts the client, sets some global things, and yells at the user if they haven't configured their bot properly.
 */

const fs = require('fs');

// Inject the colour methods into String.prototype.
require('colors');

process.on('uncaughtException', err => console.log(err.stack));
process.on('unhandledRejection', err => console.log(err.stack));

// Checks whether node.js version is sufficient and whether all dependencies are installed. Based on code from Zarel/Pokemon-Showdown.
try {
	eval('{ let a = async () => {}; }');
} catch (e) {
	console.log(`This bot requires node.js 8 or higher. The version of node currently installed is ${process.version}. Please update node.js before using this bot.`);
	// Seemed like a nice thing to me to help out people on an ubuntu installation. Remove this when ubuntu updates their repos.
	if (process.version[1] === '6') console.log(`Note that node.js 8 isn't available in the Ubuntu repositories. Recommended is to use 'n' (installed with 'sudo npm install -g n').`);
	process.exit(0);
}
try {
	require.resolve('websocket');
	require.resolve('connect');
	require.resolve('serve-static');
	require.resolve('body-parser');
} catch (e) {
	console.log(`Not all dependencies are installed. Please run 'npm install' before running the bot.`);
	process.exit(0);
}

// Check if the config is renamed properly. Based on code from sirDonovan/Cassius.
try {
	fs.accessSync('./config.js');
} catch (e) {
	if (e.code !== 'ENOENT') throw e;
	console.log(`No config.js file found. Please edit the example config to configure The Scribe.`);
	fs.writeFileSync('./config.js', fs.readFileSync('./config-example.js'));
	process.exit(0);
}

// Start the client.
require('./client.js');
