/**
 * storage.js: Data persistence.
 *
 * Modified from sirDonovan/Cassius's Storage module to best fit The Scribe's needs.
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
		let file = '{}';
		fs.readFile(`./storage/${key}.json`, (e, data) => {
			if (e) {
				utils.errorMsg(`Error reading from './storage/${key}.json': ${e.stack}`);
				utils.errorMsg("The file will be marked as frozen; saved data will not be overwritten.");
				this.frozenKeys.add(key);
			} else {
				file = data.toString();
			}
		});
		this._storage[key] = JSON.parse(file);
	}

	exportJSON(key) {
		if (!(key in this._storage)) return;
		let frozen = this.frozenKeys.has(key);
		if (frozen) {
			utils.errorMsg(`The file './storage/${key}.json' is marked as frozen; it will be saved to './storage/${key}.temp.json' instead.`);
		}
		fs.writeFile(`./storage/${frozen ? `${key}.temp` : key}.json`, JSON.stringify(this._storage[key]), e => {
			if (e) {
				utils.errorMsg(`Error writing to './storage/${frozen ? `${key}.temp` : key}.json': ${e.stack}`);
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
