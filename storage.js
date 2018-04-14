/**
 * storage.js: Data persistence.
 *
 * Modified from sirDonovan/Cassius's Storage module to best fit the bot's needs.
 */

'use strict';

const utils = require('./utils');

const fs = require('fs');
const BACKUP_INTERVAL = 60 * 60 * 1000;

class Storage {
	constructor() {
		this._storage = {};
		this.frozenKeys = new Set();
		this.backupInterval = setInterval(() => this.exportStorage(), BACKUP_INTERVAL);

		this.importStorage();
		utils.statusMsg("Storage imported successfully.");
	}

	getJSON(key) {
		if (!(key in this._storage)) this._storage[key] = {};
		return this._storage[key];
	}

	importJSON(key) {
		fs.readFile(`./data/${key}.json`, (e, data) => {
			let file = '{}';

			if (e) {
				utils.errorMsg(`Error reading from './data/${key}.json': ${e.stack}`);
				utils.errorMsg("The file will be marked as frozen; saved data will not be overwritten.");
				this.frozenKeys.add(key);
			} else {
				file = data.toString();
			}

			this._storage[key] = JSON.parse(file);
		});
	}

	exportJSON(key) {
		if (!(key in this._storage)) return;
		let frozen = this.frozenKeys.has(key);
		if (frozen) {
			utils.errorMsg(`The file './data/${key}.json' is marked as frozen; it will be saved to './data/${key}.temp.json' instead.`);
		}
		fs.writeFile(`./data/${frozen ? `${key}.temp` : key}.json`, JSON.stringify(this._storage[key]), e => {
			if (e) {
				utils.errorMsg(`Error writing to './data/${frozen ? `${key}.temp` : key}.json': ${e.stack}`);
			}
		});
	}

	importStorage() {
		let files = fs.readdirSync('./data');
		for (let file of files) {
			if (!file.endsWith('.json')) continue;
			this.importJSON(file.substr(0, file.indexOf('.json')));
		}
	}

	exportStorage() {
		for (let key in this._storage) {
			this.exportJSON(key);
		}
	}
}

module.exports = new Storage();
