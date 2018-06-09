/*
 * hemingway.js: Scripted game of Ernest Hemingway
 *
 * This is a bot-hosted version of a game that originated from Writing, where
 * participants post three-to-six word entries for a specific writing prompt.
 */

const {commandToken} = require('../config');
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
		this.overwriteWarnings = new Map();
		this.submissionsOpen = false;
		this.submissions = new Map();
		this.votesOpen = false;
		this.votes = new Map();
		// makes sure users are accounted for after using commands
		this.accountability = new Set();
		this.ties = null;
	}

	onSignups() {
		let announcement = `/addhtmlbox <center><b><u>General rundown of ${name}</u></b></center><ul>\
			<li>You can join the game via typing <code>/me in</code> into the chat.${this.freeJoin ? ` Since this game is free-join, you are able to join at any time!` : ``}</li>\
			<li>When the host, <b>${this.host}</b>, posts the topic for the first round, you will have roughly <b>2-3</b> minutes to write your submission.</li>\
			<li>After the host says "Time's up!", you will PM me your submissions via <code>${commandToken}submit [entry]</code>. All submissions will be automatically posted in the chat when all players have submitted.</li>\
			<li>When the host announces that it's time to submit your vote, you will PM me with <code>${commandToken}vote [user]</code>.</li>\
			<li>The winner will earn 10 quills for the round, and they will be able to PM the host the topic for the next round.</li>\
			<li>If a tie occurs between votes, then a "sudden death" will happen between the tied players. They will have less time to write about a new topic, and only they can submit an entry. The rest of the players will vote on who the winner should be, and the winner will earn 20 quills rather than 10.</li></ul>`;
		this.send(announcement);
		this.setupRound();
	}

	onStart() {
		this.setupRound();
	}

	setupRound(tieRound = false) {
		if (!tieRound && this.ties) this.ties = null;
		this.submissionsOpen = true;
		this.votingOpen = false;
		this.overwriteWarnings.clear();
		this.accountability.clear();
	}

	submit(userid, message) {
		if (!this.submissionsOpen) return this.sendPM(userid, "I'm not accepting any submissions right now.");
		let success = this.canParticipate('submissions', userid);
		if (!success) return;
		let words = message.split(' ').length;
		if (words < 3 || words > 6) return this.sendPM(userid, "Your submission must contain anywhere from 3-6 words.");
		success = this.canOverwrite('submit', userid, message);
		if (!success) return;
		this.submissions.set(userid, message);
		this.accountability.add(userid);
		this.sendPM(userid, `Your submission (${message}) has been recorded.`);
		// If everyone has submitted, go ahead and open voting
		if (this.allHaveSubmitted('submissions')) this.openVoting();
	}

	openVoting() {
		this.accountability.clear();
		let submissionsTable = `<table border=1 cellspacing=0 cellpadding=3><tr><td><b>User:</b></td><td><b>Submission:</b></td></tr>`;
		this.submissions.forEach((submission, userid) => {
			submissionsTable += `<tr><td><b>${userid}</b></td><td>${submission}</td></tr>`;
		});
		submissionsTable += `</table>`;
		this.send(`/addhtmlbox ${submissionsTable}`);
		this.send(`PM me your votes with the command \`\`${commandToken}vote userid\`\`!`);
		this.overwriteWarnings.clear(); // open up overwriting for voting
		this.submissionsOpen = false;
		this.votingOpen = true;
	}

	vote(userid, message) {
		if (!this.votingOpen) return this.sendPM(userid, "I'm not accepting any votes right now.");
		let success = this.canParticipate('voting', userid);
		if (!success) return;
		message = utils.toId(message);
		if (!this.players.includes(message)) return this.sendPM(userid, "Please vote for an active participant.");
		if (message === userid) return this.sendPM(userid, "You can't vote for yourself.");
		success = this.canOverwrite('vote', userid, message);
		if (!success) return;
		let currentVotes = this.votes.get(message) || 0;
		this.votes.set(message, currentVotes + 1);
		this.accountability.add(userid);
		this.sendPM(userid, `Your vote (${message}) has been recorded.`);
		// If everyone has voted, tally the results
		if (this.allHaveSubmitted('voting')) this.parseVotes();
	}

	parseVotes() {
		let votes = [...this.votes.entries()].sort((a, b) => b[1] - a[1]);
		// Account for any possible ties:
		votes = votes.filter(([_, voteNumber]) => voteNumber === votes[0][1]);
		if (votes.length > 1) {
			this.ties = votes.map(([userid]) => userid);
			this.send(`There is a tie between the following users: ${this.ties.join(', ')}. The host (${this.host}) will open up a sudden death round.`);
			return this.setupRound(true);
		}
		let [winner, number] = votes[0];
		this.send(`**${winner}** won the round with a total of **${number}** votes!`);
		let newBalance = quills.addQuills(winner, 10);
		this.send(`${winner}, ten quills have been added to your account! You now have ${newBalance} quills.`);
		this.setupRound();
	}

	allHaveSubmitted(type) {
		let comparator = this.ties && type === 'submissions' ? this.ties : this.players;
		return [...this.accountability.keys()].length === comparator.length;
	}

	canParticipate(type, userid) {
		if (!this.players.includes(userid)) {
			if (!this.freeJoin) {
				this.sendPM(userid, `You can not join the game of ${name} as it has already started.`);
				return false;
			}
			this.userJoin(userid);
		}
		if (this.ties && !this.ties.includes(userid) && type !== 'submissions') {
			this.sendPM(userid, "Only tied players can participate right now.");
			return false;
		}
		return true;
	}

	canOverwrite(command, userid, message) {
		let map = command === 'submit' ? 'submissions' : 'votes';
		if (this.accountability.has(userid)) {
			let warned = this.overwriteWarnings.has(userid) && utils.toId(this.overwriteWarnings.get(userid)) !== utils.toId(message);
			if (!warned) {
				this.overwriteWarnings.set(userid, message);
				this.sendPM(userid, `You are about to overwrite a previous ${map.slice(0, -1)}. If you're aware of this and wish to do so, please send \`\`${commandToken}${command} ${message}\`\` again.`);
				return false;
			}
			this.overwriteWarnings.delete(userid);
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
		// ";ehcommand".
		submit: 'ehcommand',
		vote: 'ehcommand',
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
			if (roomid) return this.sendPM(userid, "Please use this command in PMs only.");
			// now the game can do its job
			game[this.command](userid, message);
		},
	},
};
