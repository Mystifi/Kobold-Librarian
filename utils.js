/*
 * utils.js: Utility functions
 *
 * This file contains the various utility functions used throughout the bot.
 */

const probe = require('probe-image-size');

module.exports = {
	// Basic functions used across the repo.
	leftpad(str) {
		return (str < 10 ? `0${str}` : `${str}`);
	},
	toId(str) {
		return str.toLowerCase().replace(/[^a-z0-9]/g, '');
	},
	toRoomId(str) {
		return str.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
	},
	timestamp() {
		let date = new Date();
		let parts = [date.getDate(), date.getMonth() + 1, date.getHours(), date.getMinutes(), date.getSeconds()].map(this.leftpad);
		return `[${parts.slice(0, 2).join('/')} ${parts.slice(2, 5).join(':')}]`;
	},
	parseQueryString(url) {
		let split = url.split('?');
		if (split.length === 1) return {};
		let query = split[1];
		let parts = query.split('&');
		let output = {};
		for (let i = 0; i < parts.length; i++) {
			let elem = parts[i].split('=');
			if (elem.length === 2) {
				output[elem[0]] = elem[1];
			}
		}
		return output;
	},
	async fitImage(url, maxHeight = 300, maxWidth = 400) {
		let {height, width} = await probe(url);

		let ratio = 1;

		if (width <= maxWidth && height <= maxHeight) return [width, height];

		if (height * (maxWidth/maxHeight) > width) {
			ratio = maxHeight / height;
		} else {
			ratio = maxWidth / width;
		}

		return [Math.round(width * ratio), Math.round(height * ratio)];
	},

	// Logging-specific utility functions. `output` is exported to allow
	// extensibility.
	output(messageType, text) {
		console.log(`${this.timestamp()} ${messageType}: ${text}`);
	},
	statusMsg(text) {
		this.output('STATUS'.green, text);
	},
	errorMsg(text) {
		this.output('ERROR'.red, text);
	},
	pmMsg(text) {
		this.output('PM'.cyan, text);
	},
};
