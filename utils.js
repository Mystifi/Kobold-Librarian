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

	// Utilies from Zarel/Pokemon-Showdown
	plural(num, plural = 's', singular = '') {
		if (num && typeof num.length === 'number') {
			num = num.length;
		} else if (num && typeof num.size === 'number') {
			num = num.size;
		} else {
			num = Number(num);
		}
		return (num !== 1 ? plural : singular);
	},
	toDurationString(number) {
		// TODO: replace by Intl.DurationFormat or equivalent when it becomes available (ECMA-402)
		// https://github.com/tc39/ecma402/issues/47
		const date = new Date(+number);
		const parts = [date.getUTCFullYear() - 1970, date.getUTCMonth(), date.getUTCDate() - 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
		const unitNames = ["second", "minute", "hour", "day", "month", "year"];
		const positiveIndex = parts.findIndex(elem => elem > 0);
		return parts.slice(positiveIndex).reverse().map((value, index) => value ? `${value} ${unitNames[index]}${this.plural(value)}` : "").reverse().join(" ").trim();
	},
	levenshtein(s, t, l) {
		// Original levenshtein distance function by James Westgate, turned out to be the fastest
		let d = [];

		// Step 1
		let n = s.length;
		let m = t.length;

		if (n === 0) return m;
		if (m === 0) return n;
		if (l && Math.abs(m - n) > l) return Math.abs(m - n);

		// Create an array of arrays in javascript (a descending loop is quicker)
		for (let i = n; i >= 0; i--) d[i] = [];

		// Step 2
		for (let i = n; i >= 0; i--) d[i][0] = i;
		for (let j = m; j >= 0; j--) d[0][j] = j;

		// Step 3
		for (let i = 1; i <= n; i++) {
			let s_i = s.charAt(i - 1);

			// Step 4
			for (let j = 1; j <= m; j++) {
				// Check the jagged ld total so far
				if (i === j && d[i][j] > 4) return n;

				let t_j = t.charAt(j - 1);
				let cost = (s_i === t_j) ? 0 : 1; // Step 5

				// Calculate the minimum
				let mi = d[i - 1][j] + 1;
				let b = d[i][j - 1] + 1;
				let c = d[i - 1][j - 1] + cost;

				if (b < mi) mi = b;
				if (c < mi) mi = c;

				d[i][j] = mi; // Step 6
			}
		}

		// Step 7
		return d[n][m];
	},
	// (Technically came from Zarel/Pokemon-Showdown-Client but shhh)
	arrayToPhrase(array, finalSeparator = 'and') {
		return (array.length <= 1 ? array.join() : `${array.slice(0, -1).join(", ")}, ${finalSeparator} ${array.slice(-1)[0]}`);
	},

	// HTML-related functions used by webpages
	wrapHTML(title, body) {
		return `<!DOCTYPE html>\
		<html>\
			<head>\
				<meta charset="UTF-8">\
				<link rel="stylesheet" href="/style.css">\
				<link href="https://fonts.googleapis.com/css?family=Ovo" rel="stylesheet">\
				<title>${title} - The Scribe</title>\
			</head>\
			<body>\
				<div id="container">\
					<div id="header">\
						<h1>${title} - The Scribe</h1>\
					</div>\
					<div id="text-area">\
						${body}\
					</div>\
				</div>\
			</body>\
		</html>`;
	},

	// Logging-specific utility functions. `output` is exported to allow
	// extensibility.
	colourMap: new Map([
		['STATUS', ['green', 'STATUS'.green]],
		['ERROR', ['red', 'ERROR'.red]],
		['PM', ['cornflowerblue', 'PM'.cyan]],
	]),
	stdout: '',
	output(messageType, text) {
		let [htmlColour, outputColour] = this.colourMap.get(messageType);
		this.stdout += `${this.timestamp()} <strong style="color: ${htmlColour};">${messageType}</strong>: ${text}<br/>`;
		console.log(`${this.timestamp()} ${outputColour}: ${text}`);
	},
	statusMsg(text) {
		this.output('STATUS', text);
	},
	errorMsg(text) {
		this.output('ERROR', text);
	},
	pmMsg(text) {
		this.output('PM', text);
	},
};
