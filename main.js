/*
 * main.js: Main file
 *
 * Starts the client, sets some global things, and yells at the user if they haven't configured their bot properly.
 */

const fs = require('fs');

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
	require.resolve('colors');
	require.resolve('request');
	require.resolve('probe-image-size');
	require.resolve('markdown');
} catch (e) {
	console.log(`Not all dependencies are installed. Please run 'npm install' before running the bot.`);
	process.exit(0);
}

// Inject the colour methods into String.prototype.
require('colors');

const utils = require('./utils');

process.on('uncaughtException', err => utils.errorMsg(err.stack));
process.on('unhandledRejection', err => utils.errorMsg(err.stack));

// Check if the config is renamed properly. Based on code from sirDonovan/Cassius.
try {
	fs.accessSync('./config.js');
} catch (e) {
	if (e.code !== 'ENOENT') throw e;
	utils.errorMsg(`No config.js file found. Please edit the example config to configure Kobold Librarian.`);
	fs.writeFileSync('./config.js', fs.readFileSync('./config-example.js'));
	process.exit(0);
}

// Initialise our persistence.
require('./storage');
// Start the client.
require('./client');
