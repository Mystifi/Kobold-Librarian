/*
 * leaderboard.js: Leaderboard-related commands for the bot
 *
 * This plugin handles commands about the leaderboard, which orders users by most total-earned quills
 * to the least. By default, a max of fifty users are shown.
 */

const server = require('../server');

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
