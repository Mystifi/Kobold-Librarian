/*
 * utils.js: Utility functions
 *
 * This file contains the various utility functions used throughout the bot.
 */

module.exports = {
	toId(str) {
		return str.toLowerCase().replace(/[^a-z0-9]/g, '');
	}
};
