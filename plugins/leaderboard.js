/*
 * leaderboard.js: Leaderboard-related commands for the bot
 *
 * This plugin handles commands about the leaderboard, which orders users by most total-earned quills
 * to the least.
 */

const quills = require('../quills');
const server = require('../server');
const utils = require('../utils');

server.addRoute(`/leaderboard.html`, (req, res) => {
	let entries = quills.getTop().filter(([, value]) => value.totalEarned > 0);
	let output = `<table><tr><th>Username</th><th>Current Balance</th><th>Total Earned</th></tr>`;
	for (let [userid, data] of entries) {
		output += `<tr><td>${userid}</td><td>${data.balance}</td><td>${data.totalEarned}</td></tr>`;
	}
	output += `</table>`;
	return res.end(utils.wrapHTML('Quills Leaderboard', output));
});

module.exports = {
	commands: {
		async leaderboard(userid, roomid) {
			const pm = !(roomid && this.hasPerms('+'));
			const message = `Here is the leaderboard: ${server.url}leaderboard.html`;

			if (pm) return this.sendPM(userid, message);
			return this.send(message);
		},
	},
};
