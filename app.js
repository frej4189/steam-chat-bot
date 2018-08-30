/* 
 * Copyright (c) 2018 Frej Alexander Nielsen
 */
const initialTime = Date.now()
const fs = require('fs');

const SteamUser = require('steam-user');
const SteamTOTP = require('steam-totp');

let client = new SteamUser({promptSteamGuardCode: false});
let config;
let responses;

const generateConfig = () => {
	let json = {
		"admins": ["STEAMID64 of an admin", "STEAMID64 of another admin", "..."],
		"autoaccept": "true if you want the bot to auto-accept friend requests, anything else will be treated as false.",
		"username": "Enter account username here.",
		"password": "Enter account password here.",
		"shared_secret": "If 2FA is enabled, enter your account's shared secret here."
	}

	let stream = fs.createWriteStream("data/config.json");
	stream.end(JSON.stringify(json, null, 4), () => {
		console.log("Default config generated, please correct the values and restart the bot.");
		process.exit(0);
	});
}

try {
	config = require('./data/config.json');
} catch(error) {
	console.log("Missing config values, generating a default one...");
	return generateConfig();
}

try {
	responses = require('./data/responses.json');
} catch(error) {
	responses = {};
}

if(config.username && config.password) {
	client.logOn({
		"accountName": config.username,
		"password": config.password
	});
} else {
	console.log("Missing config values, generating a default one...");	
	return generateConfig();
}

client.on('steamGuard', (domain, callback) => {
	if(domain) {
		rl.question('Enter steam guard code: ', (code) =>
			callback(code)
		);
	} else {
		if(config.shared_secret)
			callback(SteamTOTP.generateAuthCode(config.shared_secret));
		else {
			console.log("Missing config values, generating a default one...");	
			return generateConfig();
		}
	}
});

client.on('loggedOn', () => {
	client.setPersona(1);
	console.log("Logged in. (took " + (Date.now() - initialTime) + "ms).");
});

client.on('friendRelationship', (friend, relationship) => {
	if(relationship == SteamUser.EFriendRelationship.RequestRecipient && config.autoaccept && config.autoaccept == "true")
		return client.addFriend(friend);
})

const addResponse = (message, response, callback) => {
	responses[message] = response;

	let stream = fs.createWriteStream("data/responses.json");

	stream.end(JSON.stringify(responses, null, 4), error => callback(error));
}

const setAction = (obj, callback) => {
//response, message, action, user, delayed, delay

	let action = obj.action;

	switch(action) {
		case "message":
			let message = obj.message;
			let user = obj.user;

			
			break;
	}
}

const removeResponse = (message, callback) => {
	delete responses[message];

	let stream = fs.createWriteStream("data/responses.json");

	stream.end(JSON.stringify(responses, null, 4), error => callback(error));
}

const isAdmin = (user) => {
	return config.admins.indexOf(user) > -1;
}

const strings = {};
const adding = {};

const removing = {};
const actions = {};

client.on('friendMessage', (friend, message) => {
	if(adding[friend.getSteamID64()]) {
		if(message == "cancel") {
			delete adding[friend.getSteamID64()];
			delete strings[friend.getSteamID64()];
			client.chatMessage(friend, "Action cancelled.");
		} else {
			switch(adding[friend.getSteamID64()]) {
				case "message":
					adding[friend.getSteamID64()] = "sensitive";
					strings[friend.getSteamID64()].message = message;
					client.chatMessage(friend, "Do you want the message to be case-sensitive? (Y/N)");
					break;
				case "sensitive":
					if(message.toUpperCase() == "Y") {
						adding[friend.getSteamID64()] = "response";
						strings[friend.getSteamID64()].sensitive = true;
						client.chatMessage(friend, "Please enter the response that I should send to this message.");
					} else if(message.toUpperCase() == "N") {
						adding[friend.getSteamID64()] = "response";
						strings[friend.getSteamID64()].sensitive = false;
						client.chatMessage(friend, "Please enter the response that I should send to this message.");
					} else {
						client.chatMessage(friend, "Please only enter Y or N.");
						client.chatMessage(friend, "Do you want the message to be case-sensitive? (Y/N)");
					}
					break;
				case "response":
					addResponse((strings[friend.getSteamID64()].sensitive ? "MATCH " + strings[friend.getSteamID64()].message : strings[friend.getSteamID64()].message.toLowerCase()), message, error => {
						if(error) {
							delete adding[friend.getSteamID64()];
							delete strings[friend.getSteamID64()];
							return client.chatMessage(friend, "Failed to add response, please try again later.");
						}

						delete adding[friend.getSteamID64()];
						delete strings[friend.getSteamID64()];
						client.chatMessage(friend, "Response added, if you want further actions, type \"add action\" (no quotes).");
					});
					break;
			}
		}
	} else if(removing[friend.getSteamID64()]) {
		let remove = removing[friend.getSteamID64()][message];

		if(message == "cancel") {
			delete removing[friend.getSteamID64()];
			client.chatMessage(friend, "Action cancelled.");
		} else if(remove) {
			removeResponse(remove, error => {
				if(error) {
					delete removing[friend.getSteamID64()];
					return client.chatMessage(friend, "Failed to remove response, please try again later.");
				}

				delete removing[friend.getSteamID64()];

				let info = remove;
				if(message.startsWith("MATCH "))
					info = remove.substring(6);
				client.chatMessage(friend, "Response #" + message + " (" + remove + ") has been removed.");
			});
		} else
			client.chatMessage(friend, "Invalid ID, please type a correct ID or type cancel to cancel.");
	} else if(actions[friend.getSteamID64()]) {
		if(message == "cancel") {
			delete actions[friend.getSteamID64()];
			delete strings[friend.getSteamID64()];
			client.chatMessage(friend, "Action cancelled.");
		} else {
			switch(actions[friend.getSteamID64()]) {
				case "select":
					let response = strings[friend.getSteamID64()].responses[message];

					if(response) {
						strings[friend.getSteamID64()].response = response;
						actions[friend.getSteamID64()] = "action";
						client.chatMessage(friend, "What action do you want me to perform on this response? Write exactly as given in actions.txt");
					} else
						client.chatMessage(friend, "Invalid ID, please type a correct ID or type cancel to cancel.");
					break;
				case "action":
					switch(message) {
						case "message":
							strings[friend.getSteamID64()].action = "message";
							actions[friend.getSteamID64()] = "message";
							client.chatMessage(friend, "What message should I send?");
							break;
					}
					break;
				case "message":
					strings[friend.getSteamID64()].message = message;
					actions[friend.getSteamID64()] = "user";
					client.chatMessage(friend, "To whom should this message be sent? Give either a SteamID64, or one of the following strings: admins, user");
					break;
				case "user":
					if(isNaN(user) && user != "admins" && user != "user") {
						client.chatMessage(friend, "Invalid user format.");
						client.chatMessage(friend, "To whom should this message be sent? Give either a SteamID64, or one of the following strings: admins, user");
					} else {
						strings[friend.getSteamID64()].user = user;
						actions[friend.getSteamID64()] = "delayed";
						client.chatMessage(friend, "Should this action be delayed? (Y/N)");
					}
					break;
				case "delayed":
					if(message.toUpperCase() == "Y") {
						actions[friend.getSteamID64()] = "delay";
						strings[friend.getSteamID64()].delayed = true;
						client.chatMessage(friend, "How much should the delay be in seconds?");
					} else if(message.toUpperCase() == "N") {
						actions[friend.getSteamID64()] = "response";
						strings[friend.getSteamID64()].delayed = false;
						addAction(strings[friend.getSteamID64()], error => {
							delete actions[friend.getSteamID64()];
							delete strings[friend.getSteamID64()];
							if(error) {
								client.chatMessage(friend, "An error occurred while attempting to add action \"" + strings[friend.getSteamID64()].action + "\", please try again later.");
							} else {
								client.chatMessage(friend, "Action added.");
							}
						});
					} else {
						client.chatMessage(friend, "Please only enter Y or N.");
						client.chatMessage(friend, "Should this action be delayed? (Y/N)");
					}
					break;
			}
		}
	} else {
		let content = responses[message.toLowerCase()];

		if(content)
			client.chatMessage(friend, content);
		else {
			content = responses["MATCH " + message];

			if(content)
				client.chatMessage(friend, content);
			else {
				if(isAdmin(friend.getSteamID64()) && message.toLowerCase() == "add response") {
					adding[friend.getSteamID64()] = "message";
					strings[friend.getSteamID64()] = {
						message: "",
						sensitive: false
					}

					client.chatMessage(friend, "If at anytime you want to cancel, simply type cancel.");
					client.chatMessage(friend, "Please enter the message you would like me to respond to.");
				} else if(isAdmin(friend.getSteamID64()) && message.toLowerCase() == "remove response") {
					let obj = {};
					let count = 0;
					let send = "Please type the ID of the response to remove:\n";
					for(let message in responses) {
						if(responses.hasOwnProperty(message)) {
							count++;

							let info = message;
							if(message.startsWith("MATCH "))
								info = message.substring(6);

							obj[count.toString()] = message;
							send += count.toString() + ": " + info + "\n";
						}
					}

					if(count <= 0)
						return client.chatMessage(friend, "There are currently no responses, type \"add response\" (no quotes) to get started.");

					removing[friend.getSteamID64()] = obj;
					client.chatMessage(friend, "If at anytime you want to cancel, simply type cancel.");
					client.chatMessage(friend, send);
				} else if(isAdmin(friend.getSteamID64()) && message.toLowerCase() == "add action") {
					let obj = {};
					let count = 0;
					let send = "Please type the ID of the response to add an action on:\n";
					for(let message in responses) {
						if(responses.hasOwnProperty(message)) {
							count++;

							let info = message;
							if(message.startsWith("MATCH "))
								info = message.substring(6);

							obj[count.toString()] = message;
							send += count.toString() + ": " + info + "\n";
						}
					}

					if(count <= 0)
						return client.chatMessage(friend, "There are currently no responses, type \"add response\" (no quotes) to get started.");

					actions[friend.getSteamID64()] = "select";
					strings[friend.getSteamID64()] = {
						responses: obj
					};

					client.chatMessage(friend, send);
				}
			}
		}
	}
});
