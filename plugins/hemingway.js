/*
 * hemingway.js: Scripted game of Ernest Hemingway
 *
 * This is a bot-hosted version of a game that originated from Writing, where
 * participants post three-to-six word entries for a specific writing prompt.
 */

const {commandToken, username} = require('../config');
const GameBase = require('../game');
const quills = require('../quills');
const utils = require('../utils');

const name = "Ernest Hemingway";
const nameId = 'hemingway';

class Hemingway extends GameBase {
	constructor(...args) {
		super(...args);
		this.name = name;
		this.nameId = nameId;
		this.description = "Write a three-to-six word description about the given topic!";
		this.pmCommands = ['submit', 'vote'];
		this.submissionsOpen = false;
		this.submissions = new Map();
		this.votableUsers = new Map();
		this.votesOpen = false;
		this.votes = new Map();
		// makes sure users are accounted for after using commands
		this.accountability = new Set();
		this.passed = new Set();
		this.timer = null;
	}

	// TODO: Create a storage of game information (like this announcement) that can be automatically
	// sent upon the creation of each game, as well as a command that can automatically retrieve the
	// info.
	onSignups() {
		let announcement = `/addhtmlbox <details><summary style="text-align: center;"><b><u>Rundown of ${name} (Click to expand)</u></b></summary>
		<p>Anyone can join or leave the game by typing <code>/me in</code> or <code>/me out</code> respectively within the room. Since this game is free-join, you are able to join/leave at any time!</p>\
		<p>At the beginning of each round, the host, <b>${this.host}</b>, will post the topic of the first round using <code>${commandToken}topic [topic]</code>. After the topic is announced, you'll have 2.5 minutes to write an entry.</p>\
		<p>When you have finished writing your entry, type <code>/pm ${username}, ${commandToken}submit [your submission]</code>. Voting will automatically happen when all players have submitted, and players who don't submit are marked inactive for the round.</p>\
		<p>Alternatively, players can PM ${username} <code>${commandToken}pass</code> to skip the round. This means you will not be able to submit or vote for the round, and you can join in on the next round. <b>You cannot rejoin the round once you have passed.</b></p>\
		<p>When all players have submitted, ${username} will post an htmlbox with all of the entries. To ensure fair voting, userids will instead be masked by numbers. You can vote for a submission by PMing ${username} <code>${commandToken}vote [number]</code>.</p>\
		<p>Any winners are automatically announced at the end of the round, where they will be given quills. The host, <b>${this.host}</b>, will then be able to start the next round by using <code>${commandToken}topic [topic]</code>.</p>\
		<p>At any point in the round, a Room Voice or higher or the host can use <code>;submitted</code> to see which players have not submitted or voted.</p></ul></details>`;
		this.send(announcement);
	}

	setupRound() {
		this.send(`/addhtmlbox <b>Current players ${this.players.length}</b>: ${this.players.join(', ')}`);
		this.submissionsOpen = true;
		this.votingOpen = false;
		// gotta love clearing all of this state
		this.submissions.clear();
		this.accountability.clear();
		this.votes.clear();
		this.passed.clear();
		this.votableUsers.clear();
	}

	submit(userid, message) {
		if (!this.canParticipate(userid)) return;
		if (!this.submissionsOpen) return this.sendPM(userid, "I'm not accepting any submissions right now.");
		if (this.passed.has(userid)) return this.sendPM(userid, "You can't submit since you have passed for the round.");
		message = message.trim();
		let words = message.split(' ').length;
		if (words < 3 || words > 6) return this.sendPM(userid, "Your submission must contain anywhere from 3-6 words.");
		// Some users get confused from the help, so let's fix the entry in case they actually surround the submission with brackets
		message = message.replace(/^\[*([^\]]+)\]*$/, (m, p1) => p1);
		this.submissions.set(userid, message);
		this.accountability.add(userid);
		this.sendPM(userid, `Your submission (${message}) has been recorded.`);
		// If everyone has submitted, go ahead and open voting
		if (this.allHaveSubmitted) this.openVoting();
	}

	pass(userid) {
		if (!this.canParticipate(userid)) return;
		if (!this.submissionsOpen) return this.sendPM(userid, "There's no sense in passing now; you might as well vote.");
		this.passed.add(userid);
		this.sendPM(userid, `Successfully passed. You will be unable to submit and vote until the next round.`);
		// a user should end up passing before submitting, but just in case:
		if (this.submissions.has(userid)) this.submissions.delete(userid);
		// if the user who is passing is the last user who should submit, we need to actually open voting now
		if (this.allHaveSubmitted) this.openVoting();
	}

	openVoting(fromCommand = false) {
		let submissionsTable = `<b><u>Topic: ${this.roundTopic}</u></b><br/><br/><table border=1 cellspacing=0 cellpadding=3><tr><td><b>#</b></td><td><b>Submission:</b></td></tr>`;
		let i = 1;
		for (let [userid, submission] of this.submissions.entries()) {
			if (!fromCommand) this.votableUsers.set(i, userid);
			submissionsTable += `<tr><td><b>${i}</b></td><td>${submission}</td></tr>`;
			i++;
		}
		submissionsTable += `</table><br/><b>Users who have passed for this round:</b> ${[...this.passed.keys()].map(p => `<i>${p}</i>`).join(', ')}`;
		this.send(`/addhtmlbox ${submissionsTable}`);
		if (fromCommand) return; // don't do anything else
		if (this.timer) clearTimeout(this.timer);
		this.accountability.clear();
		this.send(`You have one minute to PM me your votes with the command \`\`${commandToken}vote [submission number]\`\`!`);
		this.submissionsOpen = false;
		this.votingOpen = true;
		this.timer = setTimeout(() => this.parseVotes(), 60 * 1000);
	}

	vote(userid, message) {
		if (!this.canParticipate(userid)) return;
		if (!this.votingOpen) return this.sendPM(userid, "I'm not accepting any votes right now.");
		if (this.passed.has(userid)) return this.sendPM(userid, "You can't vote since you have passed for the round.");
		// Some users get confused from the help, so let's fix the entry in case they actually surround the vote with brackets
		message = parseInt(message.replace(/^\[([^\]]+)\]$/, (m, p1) => p1));
		if (isNaN(message) || !this.votableUsers.has(message)) return this.sendPM(userid, "Please specify a valid submission number.");
		let targetUser = this.votableUsers.get(message);
		if (!this.players.includes(targetUser)) return this.sendPM(userid, "Please vote for an active participant.");
		if (!this.submissions.has(targetUser)) return this.sendPM(userid, "Please vote for someone who has submitted an entry for this round.");
		if (targetUser === userid) return this.sendPM(userid, "You can't vote for yourself.");
		let currentVotes = this.votes.get(targetUser) || 0;
		this.votes.set(targetUser, currentVotes + 1);
		this.accountability.add(userid);
		this.sendPM(userid, `Your vote (entry #${message}) has been recorded.`);
		// If everyone has voted, tally the results
		if (this.allHaveSubmitted) this.parseVotes();
	}

	parseVotes() {
		if (this.timer) clearTimeout(this.timer);
		let votes = [...this.votes.entries()].sort((a, b) => b[1] - a[1]);
		// Account for any possible ties:
		votes = votes.filter(([, voteNumber]) => voteNumber === votes[0][1]);
		if (votes.length > 1) {
			let ties = votes.map(([userid]) => userid);
			this.send(`There is a tie between the following users: ${ties.join(', ')}. Quills have been automatically awarded to each tied player.`, true);
			for (let tied of ties) this.sendPM(tied, `10 quills have been added to your account for winning the round of ${name}! You now have ${quills.addQuills(tied, 10)} quills.`);
			this.sendPM(this.host, `You can now start the next round by using \`\`${commandToken}topic [topic]\`\`. The current players will be automatically posted after setting the topic.`);
		}
		let [winner, number] = votes[0];
		this.send(`**${winner}** won the round with a total of **${number}** votes! Quills have been automatically awarded. Submission: "${this.submissions.get(winner)}"`, true);
		this.sendPM(winner, `10 quills have been added to your account for winning the round of ${name}! You now have ${quills.addQuills(winner, 10)} quills.`);
		this.sendPM(this.host, `You can now start the next round by using \`\`${commandToken}topic [topic]\`\`. The current players will be automatically posted after setting the topic.`);
	}

	get allHaveSubmitted() {
		return [...this.accountability.keys()].length === this.players.filter(player => !this.passed.has(player)).length;
	}

	canParticipate(type, userid) {
		if (!this.players.includes(userid)) {
			if (!this.freeJoin) {
				this.sendPM(userid, `You cannot join the game of ${name} as it has already started.`);
				return false;
			}
			this.userJoin(userid);
		}
		return true;
	}
}

module.exports = {
	games: {[nameId]: Hemingway},
	aliases: {
		eh: 'hemingway',
		// These are aliases because the functionality of both commands
		// is the exact same; I'm just blocking people from stricly using
		// ";ehcommand". Extra commands should only alias to ehcommand if
		// they're supposed to be used in PMS only
		submit: 'ehcommand',
		pass: 'ehcommand',
		vote: 'ehcommand',

		timer: 'starttimer',
		submissions: 'openvoting',
	},
	commands: {
		async hemingway(userid, roomid) {
			await this.run('game', this.rank, userid, roomid, nameId);
		},
		async ehcommand(userid, roomid, message) {
			if (this.command === 'ehcommand') return;
			// Basic pre-requisites before we let the game itself handle the command
			let [game, gameRoom] = this.findCurrentGame(nameId);
			if (!(game && gameRoom)) return this.sendPM(userid, `There is no current game of ${name}.`);
			if (game.pmCommands.includes(this.command) && roomid) return this.sendPM(userid, "Please use this command in PMs only.");
			// now the game can do its job
			game[this.command](userid, message);
		},
		async topic(userid, roomid, message) {
			let [game, gameRoom] = this.findCurrentGame(nameId);
			if (!(game && gameRoom)) return this.send(`There is no current game of ${name}.`);
			if (userid !== game.host && !this.hasPerms('%')) return this.sendPM(userid, `Setting the topic requires room staff or being the host (${game.host}).`);
			game.roundTopic = message;
			game.send(`The topic for the round is **${message}**! You have two and a half minutes to write your submissions and PM them to me using \`\`${commandToken}submit [entry]\`\`!`, true);
			game.setupRound();
			game.timer = setTimeout(() => {
				let inactive = game.players.filter(player => !game.accountability.has(player));
				if (game.submissionsOpen) {
					for (let player of inactive) game.passed.add(player);
					game.send(`The following players have been marked inactive for the round: ${inactive.join(', ')}.`, true);
					game.openVoting();
				}
			}, 2.5 * 60 * 1000);
		},
		async submitted(userid, roomid) {
			let [game, gameRoom] = this.findCurrentGame(nameId);
			if (!(game && gameRoom)) return this.send(`There is no current game of ${name}.`);
			if (userid !== game.host && !this.hasPerms('+')) return this.send(`Please ask either a Room Voice or above or the host (${game.host}) to use this command.`);
			let submitted = game.players.filter(player => game.accountability.has(player));
			game.send(`/addhtmlbox <p><b>Users who have ${game.submissionsOpen ? 'submitted' : 'voted'}:</b> ${submitted.map(p => `<i>${p}</i>`).join(', ')}</p><p><b>Users being awaited on:</b> ${this.players.filter(p => !submitted.includes(p)).map(p => `<i>${p}</i>`).join(', ')}</p>`);
		},
		async check(userid, roomid, message) {
			let [game, gameRoom] = this.findCurrentGame(nameId);
			if (!(game && gameRoom)) return this.sendPM(userid, `There is no current game of ${name}.`);
			if (userid !== game.host) return this.sendPM(userid, 'Only the host can use this command.');
			if (roomid) return this.sendPM(userid, 'Use this command in PMs only.');
			if (!game.votesOpen) return this.sendPM(userid, 'You can only use this in the voting phase.');
			message = parseInt(message.replace(/^\[([^\]]+)\]$/, (m, p1) => p1));
			let targetUser = game.votableUsers.get(message);
			this.sendPM(`Submission #${message} belongs to ${targetUser}.`);
		}
		/* This is kept omitted so I can research if using this actually messes around whose votes are whose within the game
		 * (this led to a user getting three votes when there were only three players, meaning they must have switched indices in order to have the player vote for themselves)
		async openvoting(userid, roomid) {
			let [game, gameRoom] = this.findCurrentGame(nameId);
			if (!(game && gameRoom)) return this.send(`There is no current game of ${name}.`);
			if (!this.hasPerms(this.command === 'submissions' ? '+' : '%')) return this.sendPM(userid, "Please ask a staff member to do this for you.");
			// if it's going to be used in chat, make sure it's used in the proper room
			if (roomid && roomid !== gameRoom) return this.sendPM(userid, `If you're going to use this command in a room, please use it in <<${gameRoom}>>.`);
			game.openVoting(this.command === 'submissions' ? true : false);
		},
		*/
	},
};
