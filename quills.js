/*
 * quills.js: Core functionality of the Scribe Shop
 *
 * Handles creating the webserver routes for the Scribe Shop, as well as managing quills, the virtual
 * currency used by the bot.
 */

const config = require('./config');
const utils = require('./utils');

const server = require('./server');
const storage = require('./storage');

class Quills {
	constructor() {
		this.data = storage.getJSON('quills');
		this.shop = new Map();

		server.addRoute(`/shop.html`, (req, res) => {
			let queryData = utils.parseQueryString(req.url);
			let userid;
			if (queryData.token) {
				const tokenData = server.getAccessToken(queryData.token);
				if (!tokenData || tokenData.permission !== 'shop') return res.end(`Invalid or expired token provided. Please re-use the '${config.commandToken}shop' command to get a new, valid token.`);
				userid = tokenData.user;
			}

			let output = `<h2>Got some spare quills? This is where you can spend them!</h2>`;
			if (userid) {
				output += `<p>Greetings, ${userid}. You currently have <strong>${this.getAccount(userid).balance} quill${utils.plural(this.getAccount(userid).balance)}</strong> to spend.</p>\
				<p>To purchase items, type the amount you wish to buy in the box below the item description, and press the Purchase button when you're done.</p>`;
			} else {
				`<p>Purchasing items in the shop can be done by using the '${config.commandToken}shop' command in PM with the bot. This will send you a personalized URL allowing you to purchase items in the shop.</p>`;
			}
			output += `<h3>Items:</h3><form method="POST">`;
			this.shop.forEach((item, itemId) => {
				output += `<p><h4>${item.name}</h4><br/>\
					Price: ${item.price} quills<br/>\
					Description: <em>${item.description}</em><br/>\
					${item.uses > 0 ? `Number of uses: ${item.uses}`: ''}\
					${userid ? `<input type="number" name="${itemId}" placeholder="0"/>` : ''}</p>`;
			});
			if (userid) output += `<input type="submit" value="Purchase">`;
			output += `</form>`;
			return res.end(utils.wrapHTML('Scribe Shop', output));
		});
	}

	addShopItem(id, name, price, description, uses) {
		if (id in this.shop) return utils.errorMsg(`'${id}' is already a shop item.`);
		this.shop.set(id, {name, price, description, uses});
	}

	getAccount(userid) {
		if (!(userid in this.data)) this.data[userid] = {balance: 0, totalEarned: 0, inventory: {}};
		return this.data[userid];
	}

	getTop(limit) {
		return Object.entries(this.data).sort((a, b) => b[1].totalEarned - a[1].totalEarned).slice(0, limit);
	}

	addQuills(userid, amount) {
		let account = this.getAccount(userid);
		let balance = account.balance += amount;
		account.totalEarned += amount;
		storage.exportJSON('quills');
		return balance;
	}

	removeQuills(userid, amount) {
		let account = this.getAccount(userid);
		if (account.balance - amount < 0) amount = account.balance;
		let balance = account.balance -= amount;
		storage.exportJSON('quills');
		return balance;
	}

	purchase(userid, itemId, amount = 1) {
		if (!(itemId in this.shop)) return `The item "${itemId}" doesn't exist.`;
		let account = this.getAccount(userid);
		let item = this.shop.get(itemId);
		let limited = ('uses' in item);
		if (limited) {
			// Count how many more copies a user needs. If the user already has the item, then find
			// the number of copies they need to return to the maximum number of uses; otherwise, just
			// default to the max number of uses.
			amount = itemId in account.inventory ? (item.uses - account.inventory[itemId].uses) : item.uses;
		}
		if (amount <= 0) return (limited ? `You have the maximum amount of usages for a ${item.name} (${item.uses}).` : "You can't purchase zero (or less) of something...");
		// If the item has a limited number of uses, then we don't multiply the price by the number
		// of copies of the item.
		let price = item.price * (limited ? 1 : amount);
		let exceeding = price > account.balance;
		if (exceeding) {
			// See if we can purchase a fewer amount of the item by decrementing the amount
			// by one each pass. We don't do this if the item is limited because a person,
			// when purchasing an item with uses, cannot end up purchasing less than the maximum
			// number of usages. (That would be scamming them.)
			while (!limited && exceeding && amount > 0) {
				amount--;
				price = item.price * amount;
				exceeding = price > account.balance;
			}
			if (exceeding) {
				return `You don't have enough money to purchase any ${item.name}s.`;
			} else {
				return `You only have enough money to purchase ${amount} ${item.name}${utils.plural(amount)} for ${price} quills.`;
			}
		}
		let balance = this.removeQuills(userid, price);
		if (!(itemId in account.inventory)) account.inventory[itemId] = {};
		let purchased = account.inventory[itemId];
		let itemMessage = '';
		if (!limited) {
			// If an item does not have a limited amount of uses, then a user can purchase
			// more than one of the item.
			if (!('amount' in purchased)) purchased.amount = 0;
			purchased.amount += amount;
			itemMessage = `You now have ${purchased.amount} ${item.name}${utils.plural(purchased.amount)}.`;
		} else {
			purchased.uses = item.uses;
			itemMessage = `You have ${item.uses} available use${utils.plural(item.uses)} for your ${item.name}.`;
		}
		storage.exportJSON('quills');
		return `Successfully purchased ${amount} ${item.name}${utils.plural(amount)} for ${price} quills. ${itemMessage} New balance: ${balance}`;
	}
}

module.exports = new Quills();
