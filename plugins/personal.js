/*
 * personal.js: Personal bios and pages.
 * 
 * Also provides the commands and logic for the RO-set public pages (anything in the /pages/ directory on the website)
 */

const md = require('markdown').markdown;

const client = require('../client');
const config = require('../config');
const quills = require('../quills');
const server = require('../server');
const storage = require('../storage');
const utils = require('../utils');

quills.addShopItem('bio', "Personalized Bio", 500, `A personalized bio <a href="bios.html">on The Scribe's website</a>. Use <code>${config.commandToken}setbio text</code> to set your bio. Bios use Markdown formatting. Inappropriate bios will get your bio removed and purchase revoked.`, null, true);

quills.addShopItem('page', "Personal Webpage", 2500, `A personal webpage on The Scribe's site you can use for <em>anything</em>*! Personal pages use Markdown formatting.<br>* Abuse of the personal pages will lead to deletion of the page and having your purchase revoked.`, null, true);

const pubResolver = (req, res) => {
	const pageid = req.originalUrl.split('/')[2].slice(0, -5);
	return res.end(utils.wrapHTML(pageid, md.toHTML(storage.getJSON('public-pages')[pageid])));
}

server.addRoute(`/public-page.html`, (req, res) => {
	const queryData = utils.parseQueryString(req.url);
	let pageid = queryData.pageid;
	if (!pageid) return res.end(`Please provide a page name`);
	const tokenData = server.getAccessToken(queryData.token);
	if (!tokenData || tokenData.permission !== 'publicpage') return res.end(`Invalid or expired token provided. Please re-use the '${config.commandToken}editpage' command to get a new, valid token.`);
		
	if (req.method === "POST" && req.body) {
		if (!storage.getJSON('public-pages')[pageid]) server.addRoute(`/pages/${pageid}.html`, pubResolver);
		storage.getJSON('public-pages')[pageid] = req.body.content;
		storage.exportJSON('public-pages');
		client.send(tokenData.room, `/modnote ${tokenData.user} updated ${pageid}.html`);
	}	

	return res.end(utils.wrapHTML(pageid, `<form method="post"><textarea style=width:100%;" rows=50 name="content">${storage.getJSON('public-pages')[pageid] || ''}</textarea><input type="submit" value="Submit changes"/></form>`));
});

server.addRoute(`/page.html`, (req, res) => {
	const queryData = utils.parseQueryString(req.url);
	let userid = queryData.user;
	if (!userid) return res.end(`Please provide a username.`);
	const tokenData = server.getAccessToken(queryData.token);

	let output;

	if (tokenData) {
		if (tokenData.permission !== 'page' || tokenData.user !== queryData.user) return res.end(`Invalid or expired token provided. Please re-use the '${config.commandToken}editpage' command to get a new, valid token.`);
		if (req.method === "POST" && req.body) {
			storage.getJSON('personal-pages')[userid] = req.body.content;
			storage.exportJSON('personal-pages');
		}
		output = `<form method="post"><textarea style=width:100%;" rows=50 name="content">${storage.getJSON('personal-pages')[userid] || ''}</textarea><input type="submit" value="Submit changes"/></form>`;
	} else {
		if (!storage.getJSON('personal-pages')[queryData.user]) return res.end(`This user does not have a page.`);
		output = md.toHTML(storage.getJSON('personal-pages')[userid] || '');
	}

	return res.end(utils.wrapHTML(`${userid}'s personal page`, output));
});

for (let key in storage.getJSON('public-pages')) {
	server.addRoute(`/pages/${key}.html`, pubResolver);
}

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
		async editpage(userid, roomid, message) {
			message = utils.toId(message);
			if (message) {
				if (!this.hasPerms('#')) return this.sendPM(userid, `Editing public pages requires #. If you meant to update your own personal page, use the command without any arguments.`);

				return this.sendPM(userid, `Edit link for /pages/${message}.html (DO NOT SHARE THIS LINK): ${server.url}public-page.html?pageid=${message}&token=${server.createAccessToken('publicpage', roomid, userid, 180)}`); // Token lasts 3 hours because people might work on their page for a while
			} else {
				if (!quills.getAccount(userid).inventory.page) return this.sendPM(userid, `In order to get a personal page, you need to purchase it in the [[Scribe Shop <${server.url}shop.html>]].`);

				return this.sendPM(userid, `Edit link for your personal webpage (DO NOT SHARE THIS LINK): ${server.url}page.html?user=${userid}&token=${server.createAccessToken('page', roomid, userid, 180)}`); // Token lasts 3 hours because people might work on their page for a while
			}
		},
		async deletepage(userid, roomid, message) {
			if (!this.hasPerms('%')) return this.send(`Permission denied.`);
			message = utils.toId(message);
			if (!(quills.getAccount(message).inventory.page && storage.getJSON('personal-pages')[userid])) return this.send(`This user does not have a personal page.`);

			delete storage.getJSON('personal-pages')[userid];
			quills.useItem(userid, 'page');
			storage.exportJSON('personal-pages');
			this.send(`/modnote ${message} had their personal page forcibly removed.`);
			return this.send(`Page removed.`);
		},
	}
};