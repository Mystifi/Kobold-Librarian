/*
 * core-commands.js: Core bot commands
 *
 * This file contains all the basic commands every version of this bot should include. This includes administrative commands, help commands and core functionalities.
 */

const config = require('./config');
const quills = require('./quills');
const server = require('./server');
const utils = require('./utils');

const packageInfo = require('./package.json');

module.exports = {
	// Based on the eval function in Kid A.
	async eval(userid, roomid, message) {
		if (!config.owners.includes(userid)) return this.send(`You need to be listed as a bot owner to use this command.`);
		if (/require\(.+?\)/.test(message)) return this.send("You are not allowed to use ``require()`` when using eval.");

		let ret;
		try {
			ret = JSON.stringify(eval(message));
			if (ret === undefined) return;
		} catch (e) {
			ret = `Failed to eval \`\`${message}\`\`: ${e.toString()}`;
		}
		return this.send(ret);
	},

	async git(userid) {
		let message = `[[Github repository for this bot <${packageInfo.repository.url}>]]`;
		if (!this.hasPerms('+')) return this.sendPM(userid, message);

		return this.send(message);
	},

	async owners(userid) {
		let message = `The owners of this bot are: ${config.owners.join(', ')}.`;
		if (!this.hasPerms('+')) return this.sendPM(userid, message);

		return this.send(message);
	},

	// Quills commands

	async shop(userid, roomid) {
		let message = `Here is the Scribe Shop: ${server.url}shop.html${!roomid ? `?token=${server.createAccessToken('shop', roomid, userid)}` : ''}`;
		if (!this.hasPerms('+')) return this.sendPM(userid, message);

		return this.send(message);
	},
	async addquills(userid, roomid, message) {
		if (!this.hasPerms('%')) return this.sendPM(userid, `Permission denied.`);
		let [target, amount] = message.split(',');
		target = utils.toId(target);
		amount = parseInt(amount);
		if (!target || !amount || isNaN(amount)) return this.send('Syntax: ``.addquills username, amount``');
	
		let newBalance = quills.addQuills(target, amount);
		this.send(`Quills successfully added to the account of ${target}.`);
		this.sendPM(target, `${amount} quill${utils.plural(amount)} have been added to your account. You now have ${newBalance} quill${utils.plural(newBalance)}.`);
	},
	async removequills(userid, roomid, message) {
		if (!this.hasPerms('%')) return this.sendPM(userid, `Permission denied.`);
		let [target, amount] = message.split(',');
		target = utils.toId(target);
		amount = parseInt(amount);
		if (!target || !amount || isNaN(amount)) return this.send('Syntax: ``.removequills username, amount``');
	
		let newBalance = quills.removeQuills(target, amount);
		this.send(`Quills successfully removed from the account of ${target}.`);
		this.sendPM(target, `${amount} quill${utils.plural(amount)} have been removed from your account. You now have ${newBalance} quill${utils.plural(newBalance)}.`);	},
};
