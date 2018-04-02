/*
 * core-commands.js: Core bot commands
 *
 * This file contains all the basic commands every version of this bot should include. This includes administrative commands, help commands and core functionalities.
 */

const config = require('./config');
const packageInfo = require('./package.json');

const server = require('./server');

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

	async shop(userid, roomid) {
		let message = `Here is the Scribe Shop: ${server.url}shop.html${!roomid ? `?token=${server.createAccessToken('shop', roomid, userid)}` : ''}`;
		if (!this.hasPerms('+')) return this.sendPM(userid, message);

		return this.send(message);
	},
};
