const md = require('markdown').markdown;

const config = require('../config');
const quills = require('../quills');
const server = require('../server');
const storage = require('../storage');
const utils = require('../utils');

quills.addShopItem('bio', "Personalized Bio", 500, `A personalized bio <a href="bios.html">on The Scribe's website</a>. Use <code>${config.commandToken}setbio text</code> to set your bio. Bios use Markdown formatting. Inappropriate bios will get your bio removed and purchase revoked.`, null, true);

quills.addShopItem('page', "Personal Webpage", 2500, `A personal webpage on The Scribe's site you can use for <em>anything</em>*! Personal pages use Markdown formatting.<br>* Abuse of the personal pages will lead to deletion of the page and having your purchase revoked.`, null, true);

server.addRoute(`/page.html`, (req, res) => {
	const queryData = utils.parseQueryString(req.url);
	let userid = queryData.user;
	if (!userid) return res.end(`Please provide a username.`);
	const tokenData = server.getAccessToken(queryData.token);

	let output;

	if (tokenData) {
		if (!tokenData || tokenData.permission !== 'page' || tokenData.user !== queryData.user) return res.end(`Invalid or expired token provided. Please re-use the '${config.commandToken}editpage' command to get a new, valid token.`);
		if (req.method === "POST" && req.body) {
			storage.getJSON('pages')[userid] = req.body.content;
			storage.exportJSON('pages');
		}
		output = `<form method="post"><textarea style=width:100%;" rows=50 name="content">${storage.getJSON('pages')[userid] || ''}</textarea><input type="submit" value="Submit changes"/></form>`;
	} else {
		if (!storage.getJSON('pages')[queryData.user]) return res.end(`This user does not have a page.`);
		output = md.toHTML(storage.getJSON('pages')[userid] || '');
	}

	return res.end(utils.wrapHTML(`${userid}'s personal page`, output));
});

module.exports = {
	commands: {
		async setbio(userid, roomid, message) {
			if (!quills.getAccount(userid).inventory.bio) return this.sendPM(userid, `In order to set a personal bio, you need to purchase it in the [[Scribe Shop <${server.url}shop.html>]].`);
			message = message.trim();
			if (!message) return this.sendPM(userid, `Syntax: \`\`${config.commandToken}setbio message\`\``);

			storage.getJSON('bios')[userid] = message;
			storage.exportJSON('bios');
			return this.sendPM(userid, `Bio successfully set.`);
		},
		async deletebio(userid, roomid, message) {
			if (!this.hasPerms('%')) return this.send(`Permission denied.`);
			message = utils.toId(message);
			if (!(quills.getAccount(message).inventory.bio && storage.getJSON('bios')[userid])) return this.send(`This user does not have a bio set.`);

			delete storage.getJSON('bios')[userid];
			quills.useItem(userid, 'bio');
			storage.exportJSON('bios');
			this.send(`/modnote ${message} had their bio forcibly removed.`);
			return this.send(`Bio removed.`);
		},
		async page(userid, roomid, message) {
			let target = utils.toId(message) || userid;
			if (!quills.getAccount(target).inventory.page) return this.send(`${userid === target ? `You don't have` : `This user doesn't have`} a personal page.`);
		},
		async editpage(userid, roomid) {
			if (!quills.getAccount(userid).inventory.page) return this.sendPM(userid, `In order to get a personal page, you need to purchase it in the [[Scribe Shop <${server.url}shop.html>]].`);

			return this.sendPM(userid, `Edit link for you personal webpage (DO NOT SHARE THIS LINK): ${server.url}page.html?user=${userid}&token=${server.createAccessToken('page', roomid, userid, 180)}`); // Token lasts 3 hours because people might work on their page for a while
		},
		async deletepage(userid, roomid, message) {
			if (!this.hasPerms('%')) return this.send(`Permission denied.`);
			message = utils.toId(message);
			if (!(quills.getAccount(message).inventory.page && storage.getJSON('pages')[userid])) return this.send(`This user does not have a personal page.`);

			delete storage.getJSON('pages')[userid];
			quills.useItem(userid, 'page');
			storage.exportJSON('pages');
			this.send(`/modnote ${message} had their personal page forcibly removed.`);
			return this.send(`Page removed.`);
		},
	}
};