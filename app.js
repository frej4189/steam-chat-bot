/* 
 * Copyright (c) 2018 Frej Alexander Nielsen
 */
//Get current time, used for calculating startup time.
const initialTime = Date.now();

const fs = require('fs');

const SteamUser = require('steam-user');
const SteamTOTP = require('steam-totp');

let client = new SteamUser({promptSteamGuardCode: false});
let config;
let responses;

//Creates a placeholder config, useful if users accidentally remove options, deleting the file will get this function called.
const generateConfig = () => {
	//Options
	let json = {
		"admins": ["STEAMID64 of an admin", "STEAMID64 of another admin", "..."],
		"autoaccept": "true if you want the bot to auto-accept friend requests, anything else will be treated as false.",
		"username": "Enter account username here.",
		"password": "Enter account password here.",
		"shared_secret": "If 2FA is enabled, enter your account's shared secret here."
	}
	
	//Create, or simply write to the file.
	let stream = fs.createWriteStream("data/config.json");
	stream.end(JSON.stringify(json, null, 4), () => {
		console.log("Default config generated, please correct the values and restart the bot.");
		process.exit(0);
	});
}

//Loads config, or creates a new one if it doesn't exist.
try {
	config = require('./data/config.json');
} catch(error) {
	console.log("Missing config values, generating a default one...");
	return generateConfig();
}

//Loads in responses.
try {
	responses = require('./data/responses.json');
} catch(error) {
	responses = {};
}

//Check if username and password is set.
if(config.username && config.password) {
	//Log in.
	client.logOn({
		"accountName": config.username,
		"password": config.password
	});
} else {
	//If not, generate a placeholder config.
	console.log("Missing config values, generating a default one...");	
	return generateConfig();
}

//Emitted when steam asks for a 2FA or Email code
client.on('steamGuard', (domain, callback) => {
	//Check if the code is an email code.
	if(domain) {
		rl.question('Enter steam guard code: ', (code) =>
			callback(code)
		);
	} else {
		//If not, check if shared secret exists in config
		if(config.shared_secret)
			//Generate a 2FA code.
			callback(SteamTOTP.generateAuthCode(config.shared_secret));
		else {
			//If not, generate a placeholder config.
			console.log("Missing config values, generating a default one...");	
			return generateConfig();
		}
	}
});

//Emitted when logon is successful.
client.on('loggedOn', () => {
	//Set client status (1 = Online)
	client.setPersona(1);
	console.log("Logged in. (took " + (Date.now() - initialTime) + "ms).");
});

//Emitted when our relationship with a user changes (accepted friend request, declined friend request, requested to be friend)
client.on('friendRelationship', (friend, relationship) => {
	//Check if relationship is a friend invite, and if autoaccept is enabled
	if(relationship == SteamUser.EFriendRelationship.RequestRecipient && config.autoaccept && config.autoaccept == "true")
		//If it is, add the user as friend
		return client.addFriend(friend);
});

//Adds a response
const addResponse = (message, response, callback) => {
	//Add response to responses object.
	responses[message] = response;

	//Update responses file
	let stream = fs.createWriteStream("data/responses.json");

	stream.end(JSON.stringify(responses, null, 4), error => callback(error));
}

//Removes a response
const removeResponse = (message, callback) => {
	//Remove response from responses object.
	delete responses[message];

	//Update responses file
	let stream = fs.createWriteStream("data/responses.json");

	stream.end(JSON.stringify(responses, null, 4), error => callback(error));
}

//Returns whether or not a user is an admin
const isAdmin = (user) => {
	return config.admins.indexOf(user) > -1;
}

const strings = {};
const adding = {};

const removing = {};

//Emitted whenever the bot receives a message
client.on('friendMessage', (friend, message) => {
	//Check if user is adding a response
	if(adding[friend.getSteamID64()]) {
		//Check if the user wants to cancel
		if(message == "cancel") {
			//Cancel the action:
			//Remove user from adding object
			delete adding[friend.getSteamID64()];
			//Remove user from string object
			delete strings[friend.getSteamID64()];
			//Let the user know
			client.chatMessage(friend, "Action cancelled.");
		} else {
			//Check the current state that the user is in
			switch(adding[friend.getSteamID64()]) {
				//Set message to respond to
				case "message":
					//Change state to "sensitive"
					adding[friend.getSteamID64()] = "sensitive";
					//Set the message in the strings object
					strings[friend.getSteamID64()].message = message;
					//Send instructions for next state
					client.chatMessage(friend, "Do you want the message to be case-sensitive? (Y/N)");
					break;
				//Set case-sensitivity
				case "sensitive":
					//Check if user wants case-sensitive string
					if(message.toUpperCase() == "Y") {
						//Change state to "response"
						adding[friend.getSteamID64()] = "response";
						//Set case-sensitivty to true
						strings[friend.getSteamID64()].sensitive = true;
						//Send instructions for next state
						client.chatMessage(friend, "Please enter the response that I should send to this message.");
					//Check if user does not want case-sensitive string
					} else if(message.toUpperCase() == "N") {
						//Change state to "response"
						adding[friend.getSteamID64()] = "response";
						//Set case-sensitivity to false
						strings[friend.getSteamID64()].sensitive = false;
						//Send instructions for next state
						client.chatMessage(friend, "Please enter the response that I should send to this message.");
					} else {
						//If neither, send instructions
						client.chatMessage(friend, "Please only enter Y or N.");
						client.chatMessage(friend, "Do you want the message to be case-sensitive? (Y/N)");
					}
					break;
				//Set response
				case "response":
					//Add response
					addResponse((strings[friend.getSteamID64()].sensitive ? "MATCH " + strings[friend.getSteamID64()].message : strings[friend.getSteamID64()].message.toLowerCase()), message, error => {
						//Check for errors
						if(error) {
							//Cancel the action:
							//Remove user from adding object
							delete adding[friend.getSteamID64()];
							//Remove user from strings object
							delete strings[friend.getSteamID64()];
							//Let the user know that something went wrong
							return client.chatMessage(friend, "Failed to add response, please try again later.");
						}
						
						//Remove user from adding object
						delete adding[friend.getSteamID64()];
						//Remove user from strings object
						delete strings[friend.getSteamID64()];
						//Let the user know that everything went as intended.
						client.chatMessage(friend, "Response added, if you want further actions, type \"add action\" (no quotes).");
					});
					break;
			}
		}
	//If not, check if user is removing a response
	} else if(removing[friend.getSteamID64()]) {
		//Load the response corresponding to the message (possibly ID) provided by the user
		let remove = removing[friend.getSteamID64()][message];
		
		//Check if the user wants to cancel
		if(message == "cancel") {
			//Cancel the action:
			//Remove user from the removing object
			delete removing[friend.getSteamID64()];
			//Let the user know
			client.chatMessage(friend, "Action cancelled.");
		//Check if the ID actually corresponded to a response	
		} else if(remove) {
			//Remove the response
			removeResponse(remove, error => {
				//Check for errors
				if(error) {
					//Cancel the action:
					//Remove user from the removing object
					delete removing[friend.getSteamID64()];
					//Let the user know that something went wrong
					return client.chatMessage(friend, "Failed to remove response, please try again later.");
				}
				
				//Remove user from the removing object
				delete removing[friend.getSteamID64()];
				
				//Let the user know that everything went as intended.
				client.chatMessage(friend, "Response #" + message + " (" + remove + ") has been removed.");
			});
		} else
			//If not, let the user know
			client.chatMessage(friend, "Invalid ID, please type a correct ID or type cancel to cancel.");
	} else {
		//If not, load the response to the user's message
		let content = responses[message.toLowerCase()];
		
		//Check if the response exists
		if(content)
			//Send the response to the user
			client.chatMessage(friend, content);
		else {
			//If not, check for case sensitive response in config.
			content = responses["MATCH " + message];
	
			//Check if the response exists
			if(content)
				//Send the response to the user
				client.chatMessage(friend, content);
			else {
				//If not, check if the user is admin, and if the message is an admin command
				if(isAdmin(friend.getSteamID64()) && message.toLowerCase() == "add response") {
					//If the message is the add command, set the user as adding
					adding[friend.getSteamID64()] = "message" /* Message = They are setting the message to respond to */;
					strings[friend.getSteamID64()] = {
						message: "",
						sensitive: false
					}
					
					//Message instructions.
					client.chatMessage(friend, "If at anytime you want to cancel, simply type cancel.");
					client.chatMessage(friend, "Please enter the message you would like me to respond to.");
				} else if(isAdmin(friend.getSteamID64()) && message.toLowerCase() == "remove response") {
					//If the message is the remove command, set the user as removing
					let obj = {};
					let count = 0;
					let send = "Please type the ID of the response to remove:\n";
					//Load all responses, and give them an ID each.
					for(let message in responses) {
						if(responses.hasOwnProperty(message)) {
							//Increase count (for keeping track of ID's)
							count++;
							
							//Change the message to remove any syntax that is not supposed to be shown to the user
							let info = message;
							if(message.startsWith("MATCH "))
								info = message.substring(6);
							
							//Add the response to the ID object
							obj[count.toString()] = message;
							//Add the id and response to the instruction string
							send += count.toString() + ": " + info + "\n";
						}
					}
					
					//Check if there are no responses
					if(count <= 0)
						//Let the user know
						return client.chatMessage(friend, "There are currently no responses, type \"add response\" (no quotes) to get started.");
					
					//Set the user as removing
					removing[friend.getSteamID64()] = obj /* Provides the object of id's */;
					
					//Message instructions.
					client.chatMessage(friend, "If at anytime you want to cancel, simply type cancel.");
					client.chatMessage(friend, send);
				}
				//If not, simply ignore the message.
			}
		}
	}
});
