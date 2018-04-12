/*
 * mail.js: Offline messaging plugin
 *
 * Handles scheduling offline messages for users. When a user with mail joins a room the bot's in,
 * they will be sent all messages in PMs.
 */

const config = require('../config');
const storage = require('../storage');
const utils = require('../utils');

const MONTH = 31 * 24 * 60 * 60 * 1000;

// Prune mail scheduled over a month ago.
for (let [curUser, messages] of Object.entries(storage.getJSON('mail'))) {
	messages = messages.filter(({time}) => Date.now() - time < MONTH);
	if (messages) {
		storage.getJSON('mail')[curUser] = messages;
	} else {
		delete storage.getJSON('mail')[curUser];
	}
}
storage.exportJSON('mail');

module.exports = {
	async onJoin(userid) {
		let inbox = storage.getJSON('mail')[userid];
		if (inbox) {
			for (let {sender, message, time} of inbox) {
				this.sendPM(userid, `[${utils.toDurationString(Date.now() - time)} ago] **${sender}**: ${message}`);
			}
			delete storage.getJSON('mail')[userid];
			storage.exportJSON('mail');
		}
	},
	commands: {
		async mail(userid, roomid, message) {
			let [target, ...toSend] = message.split(',');
			target = utils.toId(target);
			toSend = toSend.join(',').trim();
			if (!(target && toSend)) return this.sendPM(userid, `Syntax: \`\`${config.commandToken}mail user, message\`\``);
			if (toSend.length > 250) return this.sendPM(userid, `Your message is too long. (${toSend.length}/250)`);

			let inbox = storage.getJSON('mail')[target] || [];
			if (inbox.length >= 5) return this.sendPM(userid, `${target}'s inbox is full.`);
			storage.getJSON('mail')[target] = inbox.concat({sender: userid, message: toSend, time: Date.now()});
			storage.exportJSON('mail');

			return this.send(`Mail successfully scheduled for ${target}.`);
		},
	},
};
