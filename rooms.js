function BattleRoom(roomid, format, p1, p2, parentid, rated) {
	var selfR = this;

	format = ''+(format||'');

	this.type = 'room';
	this.id = roomid;
	this.i = {};
	this.users = {};
	this.format = format;
	console.log("NEW BATTLE");

	var formatid = toId(format);

	if (rated && Tools.getFormat(formatid).rated) {
		rated = {
			p1: p1.userid,
			p2: p2.userid,
			format: format
		};
	} else {
		rated = false;
	}

	this.rated = rated;
	this.battle = new Battle(selfR.id, format, rated);
	this.resetTimer = null;
	this.destroyTimer = null;
	this.graceTime = 0;

	this.parentid = parentid||'';
	this.p1 = p1 || '';
	this.p2 = p2 || '';

	this.sideTicksLeft = [8, 8];
	this.sideFreeTicks = [0, 0];
	this.inactiveTicksLeft = 0;

	this.active = false;

	this.update = function(excludeUser) {
		update = selfR.battle.getUpdates();
		if (!update) return;

		if (selfR.battle.ended && selfR.rated) {
			var rated = selfR.rated;
			selfR.rated = false;
			var p1score = 0.5;

			if (selfR.battle.winner === rated.p1) {
				p1score = 1;
			} else if (selfR.battle.winner === rated.p2) {
				p1score = 0;
			}

			var p1 = rated.p1;
			if (Users.get(rated.p1)) p1 = Users.get(rated.p1).name;
			var p2 = rated.p2;
			if (Users.get(rated.p2)) p2 = Users.get(rated.p2).name;

			//update.updates.push('[DEBUG] uri: '+config.loginserver+'action.php?act=ladderupdate&serverid='+config.serverid+'&p1='+encodeURIComponent(p1)+'&p2='+encodeURIComponent(p2)+'&score='+p1score+'&format='+toId(rated.format)+'&servertoken=[token]');

			if (!rated.p1 || !rated.p2) {
				update.updates.push('| chatmsg | ERROR: Ladder not updated: a player does not exist');
			} else {
				var winner = Users.get(selfR.battle.winner);
				if (winner && !winner.authenticated) {
					winner.emit('console', {rawMessage: '<div style="background-color:#6688AA;color:white;padding:2px 4px"><b>Register an account to protect your ladder rating!</b><br /><button onclick="overlay(\'register\',{ifuserid:\''+winner.userid+'\'});return false"><b>Register</b></button></div>'});
				}
				// update rankings
				request({
					uri: config.loginserver+'action.php?act=ladderupdate&serverid='+config.serverid+'&p1='+encodeURIComponent(p1)+'&p2='+encodeURIComponent(p2)+'&score='+p1score+'&format='+toId(rated.format)+'&servertoken='+config.servertoken+'&nocache='+new Date().getTime()
				}, function(error, response, body) {
					if (body) {
						try {
							var data = JSON.parse(body);
							// we don't actually do much with this data
							selfR.add("Ladder updated.");
							selfR.update();
						} catch(e) {
						}
					} else {
					}
				});
				fs.writeFile('logs/lastbattle.txt', ''+rooms.lobby.numRooms);
				var logData = {
					p1score: p1score,
					turns: selfR.battle.turn,
					p1: selfR.battle.p1.name,
					p2: selfR.battle.p2.name,
					p1team: selfR.battle.p1.team,
					p2team: selfR.battle.p2.team
				};
				fs.writeFile('logs/'+selfR.format.toLowerCase().replace(/[^a-z0-9]+/g,'')+'/'+selfR.id+'.log.json',
					JSON.stringify(logData)
				);
			}
		}

		update.room = roomid;
		var hasUsers = false;
		for (var i in selfR.users) {
			hasUsers = true;
			if (selfR.users[i] === excludeUser) continue;
			selfR.users[i].emit('update', update);
		}

		// empty rooms time out after ten minutes
		if (!hasUsers) {
			if (!selfR.destroyTimer) {
				selfR.destroyTimer = setTimeout(selfR.tryDestroy, 600000);
			}
		} else if (selfR.destroyTimer) {
			clearTimeout(selfR.destroyTimer);
			selfR.destroyTimer = null;
		}
	};
	this.emit = function(type, message, user) {
		if (type === 'console' || type === 'update') {
			if (typeof message === 'string') {
				message = {message: message};
			}
			message.room = selfR.id;
		}
		if (user && user.emit) {
			user.emit(type, message);
		} else {
			for (var i in selfR.users) {
				selfR.users[i].emit(type, message);
			}
		}
	};
	this.tryDestroy = function() {
		for (var i in selfR.users) {
			// don't destroy ourselves if there are users in this room
			// theoretically, Room.update should've stopped tryDestroy's timer
			// well before we get here
			return;
		}
		selfR.destroy();
	};
	this.broadcastError = function(message) {
		for (var i in selfR.users) {
			selfR.users.emit('connectionError', message);
		}
	};
	this.reset = function(reload) {
		clearTimeout(selfR.resetTimer);
		selfR.resetTimer = null;

		if (lockdown) {
			selfR.add('The battle was not restarted because the server is preparing to shut down.');
			return;
		}

		selfR.battle.add('RESET');
		selfR.update();

		if (selfR.battle.p1 && selfR.battle.p1.user) delete selfR.battle.p1.user.sides[selfR.id];
		if (selfR.battle.p2 && selfR.battle.p2.user) delete selfR.battle.p2.user.sides[selfR.id];

		console.log("NEW BATTLE (reset)");
		selfR.battle = new Battle(selfR.id, selfR.format, false);
		selfR.active = selfR.battle.active;
		if (selfR.parentid) {
			getRoom(selfR.parentid).updateRooms();
		}
	};
	this.getInactiveSide = function() {
		var inactiveSide = -1;
		if (!selfR.battle.p1.user && selfR.battle.p2.user) {
			inactiveSide = 0;
		} else if (selfR.battle.p1.user && !selfR.battle.p2.user) {
			inactiveSide = 1;
		} else if (!selfR.battle.p1.decision && selfR.battle.p2.decision) {
			inactiveSide = 0;
		} else if (selfR.battle.p1.decision && !selfR.battle.p2.decision) {
			inactiveSide = 1;
		}
		return inactiveSide;
	};
	// side can be a side or user
	this.forfeit = function(side, message) {
		var forfeitSide = -1;
		if (!selfR.battle || selfR.battle.ended || !selfR.battle.started) return false;

		if (side === selfR.battle.sides[0]) forfeitSide = 0;
		else if (side === selfR.battle.sides[1]) forfeitSide = 1;
		else if (side === 0) forfeitSide = 0;
		else if (side === 1) forfeitSide = 1;
		else if (side === selfR.battle.sides[0].user) forfeitSide = 0;
		else if (side === selfR.battle.sides[1].user) forfeitSide = 1;
		else return false;

		if (!message) message = ' forfeited.';

		selfR.battle.add('-message', selfR.battle.sides[forfeitSide].name+message);
		selfR.battle.win(selfR.battle.sides[forfeitSide].foe);
		selfR.active = selfR.battle.active;
		selfR.update();
		return true;
	};
	this.kickInactive = function() {
		clearTimeout(selfR.resetTimer);
		selfR.resetTimer = null;

		var action = 'be kicked';
		if (selfR.rated) {
			action = 'forfeit';
		}

		var inactiveSide = selfR.getInactiveSide();

		if (!selfR.battle || selfR.battle.ended || !selfR.battle.started) return false;

		if (inactiveSide == -1) {
			selfR.add('Both players are inactive, so neither player was kicked.');
			selfR.update();
			return;
		}
		if (!selfR.battle.curCallback) {
			selfR.add('We are experiencing a bug. Please notify a system operator (people with & next to their name).');
			selfR.update();
			return;
		}

		// now to see how much time we have left
		if (selfR.inactiveTicksLeft) {
			selfR.inactiveTicksLeft--;
		}
		if (selfR.sideFreeTicks[inactiveSide]) {
			selfR.sideFreeTicks[inactiveSide]--;
		} else {
			selfR.sideTicksLeft[inactiveSide]--;
		}
		if (selfR.inactiveTicksLeft) {
			selfR.add('Inactive players will '+action+' in '+(selfR.inactiveTicksLeft*30)+' seconds.'+(selfR.sideFreeTicks[inactiveSide]?selfR.inactiveAtrrib:''));
			selfR.update();
			selfR.resetTimer = setTimeout(selfR.kickInactive, 30*1000);
			return;
		}

		if (selfR.battle.rated) {
			selfR.forfeit(inactiveSide,' lost because of their inactivity.');
		} else {
			if (selfR.battle.sides[0].user && selfR.battle.sides[1].user) {
				selfR.add('Kicking inactive players.');
				selfR.battle.leave(selfR.battle.sides[inactiveSide].user);
				selfR.active = selfR.battle.active;
				selfR.update();
			} else {
				selfR.add('There are already empty slots; no kicks are necessary.');
			}
		}

		if (selfR.parentid) {
			getRoom(selfR.parentid).updateRooms();
		}
	};
	this.requestReset = function(user) {
		if (selfR.resetTimer) return;
		if (!selfR.battle.started) return; // no point
		if (user) attrib = ' (requested by '+user.name+')';
		if (selfR.rated) {
			selfR.add('The battle cannot be restarted because it is a rated battle'+attrib+'.');
			return;
		}
		var elapsedTime = new Date().getTime() - selfR.graceTime;

		// tickTime is in chunks of 30
		var tickTime = 1;

		if (elapsedTime < 60000) {
			tickTime = 6;
		} else if (elapsedTime < 120000) {
			tickTime = 4;
		} else if (elapsedTime < 150000) {
			tickTime = 2;
		} else {
			tickTime = 1;
		}
		selfR.add('The battle will restart if there is no activity for '+(tickTime*30)+' seconds.'+attrib);
		selfR.update();
		selfR.resetTimer = setTimeout(selfR.reset, tickTime*30*1000);
	};
	this.requestKickInactive = function(user) {
		if (selfR.resetTimer) {
			user.emit('console', {room:selfR.id, message: 'The inactivity timer is already counting down.'});
				return;
		}
		if ((!selfR.battle.p1.user || !selfR.battle.p2.user) && !selfR.rated) {
			selfR.add('This isn\'t a rated battle; victory doesn\'t mean anything.');
			selfR.add('Do you just want to see the text "you win"? Okay. You win.');
			selfR.update();
			return;
		}

		selfR.inactiveAtrrib = '';
		if (user) selfR.inactiveAtrrib = ' (requested by '+user.name+')';

		var action = 'be kicked';
		if (selfR.rated) {
			action = 'forfeit';
		}

		// a tick is 30 seconds

		var elapsedTicks = Math.floor((new Date().getTime() - selfR.graceTime) / 30000);
		tickTime = 6 - elapsedTicks;
		if (tickTime < 1) {
			tickTime = 1;
		}

		if (tickTime > 2 && (!selfR.battle.p1.user || !selfR.battle.p2.user)) {
			// if a player has left, don't wait longer than 2 ticks (60 seconds)
			tickTime = 2;
		}

		if (elapsedTicks >= 8) selfR.sideTicksLeft[inactiveSide]--;
		if (elapsedTicks >= 6) selfR.sideTicksLeft[inactiveSide]--;
		if (elapsedTicks >= 4) selfR.sideTicksLeft[inactiveSide]--;
		if (elapsedTicks >= 2) selfR.sideTicksLeft[inactiveSide]--;
		var inactiveSide = selfR.getInactiveSide();
		if (tickTime > 2 && selfR.sideTicksLeft[inactiveSide] < tickTime) {
			tickTime = selfR.sideTicksLeft[inactiveSide];
			if (tickTime < 2) tickTime = 2;
		}

		selfR.inactiveTicksLeft = tickTime;
		var message = 'Inactive players will '+action+' in '+(tickTime*30)+' seconds.'+selfR.inactiveAtrrib;
		if (elapsedTicks < 1 && tickTime >= 2 && selfR.sideTicksLeft[inactiveSide] > -4) {
			// the foe has at least a minute left, and hasn't been given 30 seconds to make a move yet
			// we'll wait another 30 seconds before notifying them that they have a time limit
			user.emit('console', {room:selfR.id, message: message});
			selfR.sideFreeTicks[inactiveSide] = 1;
		} else {
			selfR.add(message);
			selfR.sideFreeTicks[inactiveSide] = 0;
		}
		selfR.update();
		selfR.resetTimer = setTimeout(selfR.kickInactive, 30*1000);
	};
	this.cancelReset = function() {
		if (selfR.resetTimer) {
			selfR.add('The restart or kick was interrupted by activity.');
			selfR.update();
			clearTimeout(selfR.resetTimer);
			selfR.resetTimer = null;
		}
		selfR.graceTime = new Date().getTime();
	};
	this.decision = function(user, choice, data) {
		selfR.cancelReset();
		selfR.battle.decision(user, choice, data);
		if (selfR.battle.ended) {
			selfR.battle.add('callback', 'restart');
		}
		if (selfR.active !== selfR.battle.active) {
			selfR.active = selfR.battle.active;
			if (selfR.parentid) {
				getRoom(selfR.parentid).updateRooms();
			}
		}
		selfR.update();
	};
	this.battleEndRestart = function() {
		selfR.add('Rematch support has been temporarily disabled. Please challenge this user again in the lobby.');
		return;

		if (selfR.resetTimer) return;
		if (selfR.battle.ended) {
			selfR.add('A new game will start in 5 seconds.');
			// reset in 5 seconds
			selfR.resetTimer = setTimeout(selfR.reset, 5000);
		}
	};
	this.initSocket = function(user, socket) {
		var initdata = {
			name: user.name,
			userid: user.userid,
			named: user.named,
			renamePending: user.renamePending,
			token: user.token,
			room: selfR.id,
			roomType: 'battle',
			battlelog: selfR.battle.log
		};
		socket.emit('init', initdata);
	};
	this.join = function(user) {
		if (!user) return false;
		if (selfR.users[user.userid]) return user;

		selfR.users[user.userid] = user;

		if (user.named) {
			selfR.battle.add('join', user.name);
			selfR.update(user);
		}

		var initdata = {
			name: user.name,
			userid: user.userid,
			named: user.named,
			renamePending: user.renamePending,
			token: user.token,
			room: selfR.id,
			roomType: 'battle',
			battlelog: selfR.battle.log
		};
		user.emit('init', initdata);

		return user;
	};
	this.rename = function(user, oldid, joining) {
		if (joining) {
			selfR.battle.add('join', user.name);
		}
		if (user.sides[selfR.id]) {
			selfR.battle.rename(user);
		}
		delete selfR.users[oldid];
		selfR.users[user.userid] = user;
		selfR.update();
		return user;
	};
	this.joinBattle = function(user) {
		var slot = 0;
		if (selfR.rated) {
			if (selfR.rated.p1 === user.userid) {
				slot = 1;
			} else if (selfR.rated.p2 === user.userid) {
				slot = 2;
			} else {
				return;
			}
		}

		selfR.cancelReset();
		selfR.battle.join(user, slot);
		selfR.active = selfR.battle.active;
		selfR.update();

		if (selfR.parentid) {
			getRoom(selfR.parentid).updateRooms();
		}
	};
	this.leaveBattle = function(user) {
		if (!user) return; // ...
		if (user.sides[selfR.id]) {
			selfR.battle.leave(user);
		}
		selfR.active = selfR.battle.active;
		selfR.update();

		if (selfR.parentid) {
			getRoom(selfR.parentid).updateRooms();
		}
	};
	this.leave = function(user) {
		if (!user) return; // ...
		if (user.sides[selfR.id]) {
			selfR.battle.leave(user);
			selfR.active = selfR.battle.active;
			if (selfR.parentid) {
				getRoom(selfR.parentid).updateRooms();
			}
		} else if (!user.named) {
			delete selfR.users[user.userid];
			return;
		}
		delete selfR.users[user.userid];
		selfR.battle.add('leave', user.name);
		selfR.update();
	};
	this.isEmpty = function() {
		if (selfR.battle.p1 && selfR.battle.p1.user) return false;
		if (selfR.battle.p2 && selfR.battle.p2.user) return false;
		return true;
	};
	this.isFull = function() {
		if (selfR.battle.p1 && selfR.battle.p1.user && selfR.battle.p2 && selfR.battle.p2.user) return true;
		return false;
	};
	this.add = function(message) {
		if (message.rawMessage) {
			selfR.battle.add('chatmsg-raw', message.rawMessage);
		} else if (message.name) {
			selfR.battle.add('chat', message.name.substr(1), message.message);
		} else {
			selfR.battle.add('chatmsg', message);
		}
	};
	this.addRaw = function(message) {
		selfR.battle.add('chatmsg-raw', message);
	};
	this.chat = function(user, message, socket) {
		var cmd = '', target = '';
		if (message.length > 511 && !user.can('ignorelimits')) {
			socket.emit('message', "Your message is too long:\n\n"+message);
			return;
		}
		if (message.substr(0,2) === '//') {
			message = message.substr(1);
		} else if (message.substr(0,1) === '/') {
			var spaceIndex = message.indexOf(' ');
			if (spaceIndex > 0) {
				cmd = message.substr(1, spaceIndex-1);
				target = message.substr(spaceIndex+1);
			} else {
				cmd = message.substr(1);
				target = '';
			}
		} else if (message.substr(0,1) === '!') {
			var spaceIndex = message.indexOf(' ');
			if (spaceIndex > 0) {
				cmd = message.substr(0, spaceIndex);
				target = message.substr(spaceIndex+1);
			} else {
				cmd = message;
				target = '';
			}
		}

		var parsedMessage = parseCommand(user, cmd, target, selfR, socket, message);
		if (typeof parsedMessage === 'string') {
			message = parsedMessage;
		}
		if (parsedMessage === false) {
			// do nothing
		} else if (message.substr(0,3) === '>> ') {
			var cmd = message.substr(3);

			var room = selfR;
			var battle = selfR.battle;
			var selfB = battle;
			var p2;
			var p1;
			var p2active;
			var p1active;
			var me = user;
			if (battle) {
				p2 = battle.p2;
				p1 = battle.p1;
				if (p2) {
					p2active = p2.active[0];
				}
				if (p1) {
					p1active = p1.active[0];
				}
			}
			selfR.battle.add('chat', user.name, '>> '+cmd);
			if (user.can('console')) {
				try {
					selfR.battle.add('chat', user.name, '<< '+eval(cmd));
				} catch (e) {
					selfR.battle.add('chat', user.name, '<< error: '+e.message);
					var stack = (""+e.stack).split("\n");
					for (var i=0; i<stack.length; i++) {
						user.emit('console', '<< '+stack[i]);
					}
				}
			} else {
				selfR.battle.add('chat', user.name, '<< Access denied.');
			}
		} else {
			selfR.battle.add('chat', user.name, message);
		}
		selfR.update();
	};

	this.destroy = function() {
		// deallocate ourself

		// remove references to ourself
		for (var i in selfR.users) {
			selfR.users[i].leaveRoom(selfR);
			delete selfR.users[i];
		}
		selfR.users = null;

		// deallocate children and get rid of references to them
		if (selfR.battle) {
			selfR.battle.destroy();
		}
		selfR.battle = null;

		if (selfR.resetTimer) {
			clearTimeout(selfR.resetTimer);
		}
		selfR.resetTimer = null;

		// get rid of some possibly-circular references
		delete rooms[selfR.id];

		selfR = null;
	};
}

function LobbyRoom(roomid) {
	var selfR = this; // a lobby is like a room, selfR makes things simpler
	this.type = 'lobby';
	this.id = roomid;
	this.i = {};
	this.log = [];
	this.lastUpdate = 0;
	this.users = {};
	this.rooms = [];
	this.numRooms = 0;
	this.searchers = [];

	this.usersChanged = true;
	this.roomsChanged = true;

	// Never do any other file IO synchronously
	// but this is okay to prevent race conditions as we start up PS
	this.numRooms = 0;
	try {
		parseInt(fs.readFileSync('logs/lastbattle.txt')) || 0;
	} catch (e) {} // file doesn't exist [yet]

	this.getUpdate = function(since, omitUsers, omitRoomList) {
		var update = {room: roomid};
		var i = since;
		if (!i) i = selfR.log.length - 100;
		if (i<0) i = 0;
		update.logStart = i;
		update.logUpdate = [];
		for (;i<selfR.log.length;i++) {
			update.logUpdate.push(selfR.log[i]);
		}
		if (!omitRoomList) update.rooms = selfR.getRoomList();
		if (!omitUsers) update.users = selfR.getUserList();
		update.searcher = selfR.searchers.length;
		return update;
	};
	this.getUserList = function() {
		var userList = {list: {}, users: 0, unregistered: 0, guests: 0};
		for (var i in selfR.users) {
			if (!selfR.users[i].named) {
				userList.guests++;
				continue;
			}
			userList.users++;
			userList.list[selfR.users[i].userid] = selfR.users[i].getIdentity();
		}
		return userList;
	};
	this.getRoomList = function(filter) {
		var roomList = {};
		var total = 0;
		for (i=selfR.rooms.length-1; i>=0; i--) {
			var room = selfR.rooms[i];
			if (!room || !room.active) continue;
			if (filter && filter !== room.format && filter !== true) continue;
			var roomData = {};
			if (room.battle && room.battle.sides[0] && room.battle.sides[1]) {
				if (room.battle.sides[0].user && room.battle.sides[1].user) {
					roomData.p1 = room.battle.sides[0].user.getIdentity();
					roomData.p2 = room.battle.sides[1].user.getIdentity();
				} else if (room.battle.sides[0].user) {
					roomData.p1 = room.battle.sides[0].user.getIdentity();
				} else if (room.battle.sides[1].user) {
					roomData.p1 = room.battle.sides[1].user.getIdentity();
				}
			}
			roomList[selfR.rooms[i].id] = roomData;

			total++;
			if (total >= 8 && !filter) break;
		}
		return roomList;
	};
	this.cancelSearch = function(user, noUpdate) {
		user.cancelChallengeTo();
		for (var i=0; i<selfR.searchers.length; i++) {
			var search = selfR.searchers[i];
			if (!search.user.connected) {
				selfR.searchers.splice(i,1);
				i--;
				continue;
			}
			if (search.user === user) {
				selfR.searchers.splice(i,1);
				search.user.emit('update', {searching: false, room: selfR.id});
				if (!noUpdate) {
					selfR.update();
				}
				return true;
			}
		}
		return false;
	};
	this.searchBattle = function(user, format) {
		if (!user.connected) return;
		if (lockdown) {
			user.emit('message', 'The server is shutting down. Battles cannot be started at this time.');
			return;
		}

		var problems = Tools.validateTeam(user.team, format);
		if (problems) {
			user.emit('message', "Your team was rejected for the following reasons:\n\n- "+problems.join("\n- "));
			return;
		}

		for (var i=0; i<selfR.searchers.length; i++) {
			var search = selfR.searchers[i];
			if (!search.user.connected) {
				selfR.searchers.splice(i,1);
				i--;
				continue;
			}
			if (format === search.format) {
				if (search.user === user) {
					return;
				}
				selfR.searchers.splice(i,1);
				search.user.emit('update', {searching: false, room: selfR.id});
				search.user.team = search.team;
				selfR.startBattle(search.user, user, format, true);
				return;
			}
		}
		var newSearch = {
			user: user,
			format: format,
			room: selfR.id,
			team: user.team
		};
		var newSearchData = {
			userid: user.userid,
			format: format,
			room: selfR.id
		};
		selfR.searchers.push(newSearch);
		user.emit('update', {searching: newSearchData, room: selfR.id});
		selfR.update();
	};
	this.update = function(excludeUser) {
		var update = selfR.getUpdate(selfR.lastUpdate, !selfR.usersChanged, !selfR.roomsChanged);
		update.room = selfR.id;
		if (selfR.log.length > 100) selfR.log = selfR.log.slice(-100);
		selfR.lastUpdate = selfR.log.length;
		for (var i in selfR.users) {
			if (selfR.users[i] === excludeUser) continue;
			selfR.users[i].emit('update', update);
		}
		selfR.usersChanged = false;
		selfR.roomsChanged = false;
	};
	this.emit = function(type, message, user) {
		if (type === 'console' || type === 'update') {
			if (typeof message === 'string') {
				message = {message: message};
			}
			message.room = selfR.id;
		}
		if (user && user.emit) {
			user.emit(type, message);
		} else {
			for (var i in selfR.users) {
				selfR.users[i].emit(type, message);
			}
		}
	};
	this.updateRooms = function(excludeUser) {
		var update = {
			rooms: selfR.getRoomList()
		};
		update.room = selfR.id;
		for (var i in selfR.users) {
			if (selfR.users[i] === excludeUser) continue;
			selfR.users[i].emit('update', update);
		}
		selfR.roomsChanged = false;
	};
	this.add = function(message) {
		if (typeof message === 'string') {
			selfR.log.push({
				message: message
			});
		} else {
			selfR.log.push(message);
		}
		selfR.update();
	};
	this.addRaw = function(message) {
		selfR.log.push({
			rawMessage: message
		});
		selfR.update();
	};
	this.initSocket = function(user, socket) {
		var initdata = {
			name: user.name,
			userid: user.userid,
			named: user.named,
			renamePending: user.renamePending,
			token: user.token,
			room: selfR.id,
			rooms: selfR.getRoomList(),
			users: selfR.getUserList(),
			roomType: 'lobby',
			log: selfR.log.slice(-100),
			searcher: selfR.searchers.length
		};
		socket.emit('init', initdata);
	};
	this.join = function(user) {
		if (!user) return false; // ???
		if (selfR.users[user.userid]) return user;

		selfR.users[user.userid] = user;
		if (user.named && config.reportjoins) {
			selfR.log.push({name: user.getIdentity(), action: 'join'});
			selfR.update(user);
		} else if (user.named) {
			selfR.emit('console', {name: user.getIdentity(), action: 'join', silent: 1});
		}

		var initdata = {
			name: user.name,
			userid: user.userid,
			named: user.named,
			renamePending: user.renamePending,
			token: user.token,
			room: selfR.id,
			rooms: selfR.getRoomList(),
			users: selfR.getUserList(),
			roomType: 'lobby',
			log: selfR.log.slice(-100),
			searcher: selfR.searchers.length
		};
		user.emit('init', initdata);

		return user;
	};
	this.rename = function(user, oldid, joining) {
		delete selfR.users[oldid];
		selfR.users[user.userid] = user;
		if (joining && config.reportjoins) {
			selfR.log.push({name: user.getIdentity(), oldid: oldid, action: 'join'});
			selfR.update();
		} else if (joining) {
			selfR.emit('console', {name: user.getIdentity(), oldid: oldid, action: 'join', silent: 1});
		} else if (!user.named) {
			selfR.emit('console', {name: oldid, action: 'leave', silent: 1});
		} else {
			selfR.emit('console', {name: user.getIdentity(), oldid: oldid, action: 'rename', silent: 1});
		}
		return user;
	};
	this.leave = function(user) {
		if (!user) return; // ...
		delete selfR.users[user.userid];
		selfR.cancelSearch(user, true);
		if (config.reportjoins) {
			selfR.log.push({name: user.getIdentity(), action: 'leave'});
			selfR.update();
		} else if (user.named) {
			selfR.emit('console', {name: user.getIdentity(), action: 'leave', silent: 1});
		}
	};
	this.startBattle = function(p1, p2, format, rated) {
		var newRoom;
		p1 = Users.get(p1);
		p2 = Users.get(p2);

		if (p1 === p2) {
			selfR.cancelSearch(p1, true);
			selfR.cancelSearch(p2, true);
			p1.emit('message', 'You can\'t battle your own account. Please use Private Browsing to battle yourself.');
			return;
		}

		if (lockdown) {
			selfR.cancelSearch(p1, true);
			selfR.cancelSearch(p2, true);
			p1.emit('message', 'The server is shutting down. Battles cannot be started at this time.');
			p2.emit('message', 'The server is shutting down. Battles cannot be started at this time.');
			selfR.update();
			return;
		}

		//console.log('BATTLE START BETWEEN: '+p1.userid+' '+p2.userid);
		var i = selfR.numRooms+1;
		var formaturlid = format.toLowerCase().replace(/[^a-z0-9]+/g,'');
		while(rooms['battle-'+formaturlid+i]) {
			i++;
		}
		selfR.numRooms = i;
		newRoom = selfR.addRoom('battle-'+formaturlid+i, format, p1, p2, selfR.id, rated);
		p1.joinRoom(newRoom);
		p2.joinRoom(newRoom);
		newRoom.joinBattle(p1);
		newRoom.joinBattle(p2);
		selfR.cancelSearch(p1, true);
		selfR.cancelSearch(p2, true);
		selfR.roomsChanged = true;
		if (config.reportbattles) {
			selfR.log.push({
				name: p1.name,
				name2: p2.name,
				room: newRoom.id,
				format: format,
				action: 'battle'
			});
			selfR.update();
		}
	};
	this.addRoom = function(room, format, p1, p2, parent, rated) {
		room = newRoom(room, format, p1, p2, parent, rated);
		if (typeof room.i[selfR.id] !== 'undefined') return;
		room.i[selfR.id] = selfR.rooms.length;
		selfR.rooms.push(room);
		return room;
	};
	this.removeRoom = function(room) {
		room = getRoom(room);
		if (typeof room.i[selfR.id] !== 'undefined') {
			selfR.rooms = selfR.rooms.splice(room.i[selfR.id],1);
			delete room.i[selfR.id];
			for (var i=0; i<selfR.rooms.length; i++) {
				selfR.rooms[i].i[selfR.id] = i;
			}
		}
	};
	this.isEmpty = function() { return false; };
	this.isFull = function() { return false; };
	this.chat = function(user, message, socket) {
		if (!user.named || !message || !message.trim || !message.trim().length) return;
		if (message.length > 255 && !user.can('ignorelimits')) {
			socket.emit('message', "Your message is too long:\n\n"+message);
			return;
		}
		var cmd = '', target = '';
		if (message.substr(0,2) === '//') {
			message = message.substr(1);
		} else if (message.substr(0,1) === '/') {
			var spaceIndex = message.indexOf(' ');
			if (spaceIndex > 0) {
				cmd = message.substr(1, spaceIndex-1);
				target = message.substr(spaceIndex+1);
			} else {
				cmd = message.substr(1);
				target = '';
			}
		} else if (message.substr(0,1) === '!') {
			var spaceIndex = message.indexOf(' ');
			if (spaceIndex > 0) {
				cmd = message.substr(0, spaceIndex);
				target = message.substr(spaceIndex+1);
			} else {
				cmd = message;
				target = '';
			}
		}

		var parsedMessage = parseCommand(user, cmd, target, selfR, socket, message);
		if (typeof parsedMessage === 'string') message = parsedMessage;
		if (parsedMessage === false) {
			// do nothing
		} else if (message.substr(0,3) === '>> ') {
			var cmd = message.substr(3);

			var room = selfR;
			var me = user;
			selfR.log.push({
				name: user.getIdentity(),
				message: '>> '+cmd
			});
			if (user.can('console')) {
				try {
					selfR.log.push({
						name: user.getIdentity(),
						message: '<< '+eval(cmd)
					});
				} catch (e) {
					selfR.log.push({
						name: user.getIdentity(),
						message: '<< error: '+e.message
					});
					var stack = (""+e.stack).split("\n");
					for (var i=0; i<stack.length; i++) {
						user.emit('console', '<< '+stack[i]);
					}
				}
			} else {
				selfR.log.push({
					name: user.getIdentity(),
					message: '<< Access denied.'
				});
			}
		} else if (!user.muted) {
			selfR.log.push({
				name: user.getIdentity(),
				message: message
			});
		}
		selfR.update();
	};
}

getRoom = function(roomid) {
	if (roomid && roomid.id) return roomid;
	if (!roomid) roomid = 'default';
	if (!rooms[roomid]) {
		return rooms.lobby;
	}
	return rooms[roomid];
};
newRoom = function(roomid, format, p1, p2, parent, rated) {
	if (roomid && roomid.id) return roomid;
	if (!roomid) roomid = 'default';
	if (!rooms[roomid]) {
		console.log("NEW ROOM: "+roomid);
		rooms[roomid] = new BattleRoom(roomid, format, p1, p2, parent, rated);
	}
	return rooms[roomid];
};

rooms = {};
console.log("NEW LOBBY: lobby");
rooms.lobby = new LobbyRoom('lobby');

exports.BattleRoom = BattleRoom;
exports.LobbyRoom = LobbyRoom;

exports.get = getRoom;
exports.create = newRoom;
exports.rooms = rooms;
exports.lobby = rooms.lobby;
