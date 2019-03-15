// Copyright (C) 2019 hetuw
// GNU General Public License version 2 https://www.gnu.org/licenses/gpl-2.0.txt

let isWin = process.platform === "win32";
let fileSeperator = '/';
if (isWin) fileSeperator = '\\';

const fs = require('fs');

const http = require('http');

let showDownloadProgress = false; // sometimes this is not working correctly
if (isWin) showDownloadProgress = false;

function getHttp( link ) {
	return new Promise( function (resolve, reject) {
// -------------------------------------------------------------------
		var data = '';
		console.log(link);
		http.get(link, (resp) => {
			// A chunk of data has been recieved.
			resp.on('data', (chunk) => {
				data += chunk;
				if (showDownloadProgress) {
					console.log("\033[1A\033[200D\033[K"); // delete terminal line above
					console.log("\033[1A"+link + " - " + data.length);
				}
			});
			// The whole response has been received. Return the result.
			resp.on('end', () => {
				if (showDownloadProgress) {
					console.log("\033[1A\033[200D\033[K"); // delete terminal line above
					console.log("\033[1A"+link + " - " + data.length);
				}
				resolve(data);
			});
		}).on("error", (err) => {
			if (showDownloadProgress) {
				console.log("\033[1A\033[200D\033[K"); // delete terminal line above
				console.log("\033[1A"+link + " - " + data.length);
				console.log(err.message);
			}
			reject(err.message);
		});
// -------------------------------------------------------------------
	});
}

async function sleep(millis) {
	return new Promise( resolve => {
		setTimeout(resolve, millis);
	});
}

async function keepDownloading(link) {
	let success = false;
	let data;
	while (!success) {
		try {
			data = await getHttp(link);
			success = true;
		} catch(err) {
			console.log("ERROR while downloading "+link);
			console.log(err);
			let waitSeconds = getRandomInt(7) + 7;
			console.log("Trying again in "+waitSeconds+" seconds ...");
			await sleep(waitSeconds*1000);
		}
	}
	return data;
}

const readline = require('readline');

async function getUserInput(question) {
	return new Promise( function (resolve, reject) {
// -------------------------------------------------------------------
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});
		rl.question(question, (answer) => {
	  		rl.close();
			resolve(answer);
		});
// -------------------------------------------------------------------
	});
}

// ------------------------- MODIFY ----------------------------------
// -------------------------------------------------------------------
const ignoreDisconnects = true;
const ignoreDeathsUnderAge = 3; // disable it by setting it to 0
const countDeathsAsOldAgeOverAge = 54; // disable it by setting it to 60 or higher
// -------------------------------------------------------------------

const rootLink = "http://onehouronelife.com/publicLifeLogData/";
const rootFolder = "oholData";
const eveSpawningAge = 14;

var date_begin = []; // contains 3 ints, year - month - day
var date_end = [];
var date_current = [];

// chosen by user
var date_real_begin = [];
var date_real_end = [];

let localDataAvailable = false;

let outputResultsToFile = false;
let resultFile = "";

var players = []; // array of PlayerData that contains hashes as indices

function PlayerData() {
	this.desc = ""; // user defined descripton for hash

	this.births = 0;
	this.deaths = 0;
	this.minutesAlive = 0;
	this.deathReasons = []; 

	this.eves = 0; // how often the player spawned as an eve (with generation 1)
	this.eveChains = 0; // all eve chains a player was born into summed up together
	this.longestEveChain = 0; // the longest eve chain a player was born into

	this.firstEntry = 9999999999999; // Unix time in seconds since blabla
	this.lastEntry = 0; // Unix time in seconds since blabla

	this.males = 0; // how often the player was male
	this.females = 0; // how often the player was female

	this.ignoredUnderAgeDeaths = 0;
	this.ignoredDisconnects = 0;
	this.elderDeaths = 0;

	this.server = []; // array of PlayerServerData() - indices are servernames like "server12" or "bigserver2"

	this.kids = 0;
	this.avgKidAge = 0;
	this.grandKids = 0;

	this.kills = 0;
	this.avgVictimAge = 0;
	this.victimFemaleProbability = 0;
}

function processCollectedPlayerData(player) {
	let killsAge = 0;
	let killsFemales = 0;
	let kidsAge = 0;
	let kidsDead = 0;
	for (var s in player.server) {
		if (player.server[s].kids) {
			player.kids += player.server[s].kids.length;
			for (var i in player.server[s].kidsAge) {
				kidsAge += player.server[s].kidsAge[i];
			}
			kidsDead += player.server[s].kidsDead.length;
			player.grandKids += player.server[s].grandKids.length;
		}
		if (player.server[s].kills) {
			player.kills += player.server[s].kills.length;
			for (var i in player.server[s].killsAge) {
				killsAge += player.server[s].killsAge[i];
				if (player.server[s].killsGender[i] === 'F') killsFemales++;
			}
		}
	}
	player.avgVictimAge = (killsAge/player.kills).toFixed(2);
	player.victimFemaleProbability = (killsFemales/player.kills*100).toFixed(2);
	player.avgKidAge = (kidsAge/kidsDead).toFixed(2);
}

function PlayerServerData() {
	this.ids = []; // contains ints of the specefic server player ids

	this.kids = [];
	this.kidsDead = []; 
	this.kidsAge = [];
	this.grandKids = [];

	this.kills = [];
	this.killsAge = [];
	this.killsGender = [];

	this.addId = function(id) {
		for (var i in this.ids) {
			if (this.ids[i] === id) return;
		}
		this.ids.push(id);
	}
	this.equalsId = function(id) {
		for (var i in this.ids) {
			if (this.ids[i] === id) return true;
		}
		return false;
	}
	this.isChild = function(kidId) {
		for (var i in this.kids) {
			if (this.kids[i] === kidId) return true;
		}
		return false;
	}
	this.addKid = function(parentId, kidId) {
		if (!this.equalsId(parentId)) return;
		if (this.isChild(kidId)) return;
		this.kids.push(kidId);
	}
	this.addKill = function(killerId, killedId, killedAge, killedGender) {
		if (!this.equalsId(killerId)) return;
		for (var i in this.kills) {
			if (this.kills[i] === killedId) return;
		}
		this.kills.push(killedId);
		this.killsAge.push(killedAge);
		this.killsGender.push(killedGender);
	}
	this.addGrandKid = function(parentId, kidId) {
		if (!this.isChild(parentId)) return;
		for (var i in this.grandKids) {
			if (this.grandKids[i] === kidId) return;
		}
		this.grandKids.push(kidId);
	}
	this.childDied = function(kidId, kidAge) {
		if (!this.isChild(kidId)) return;
		for (var i in this.kidsDead) {
			if (this.kidsDead[i] === kidId) return;
		}
		this.kidsDead.push(kidId);
		this.kidsAge.push(kidAge);
	}
}

var allLinks = []; // array of Links() - indices are servernames like "server12" or "bigserver2"

function Links() {
	this.link = ""; // contains link to the list of data and name links
	this.dateLinks = []; // contains link to text file that has the data - indices are dates like "2019_02_09"
}

main();
async function main() {

	printFileDesc();
	let hashFileExists = false;
	let hashFile = ""; 
	while (!hashFileExists) {
		hashFile = await getUserInput('filename: ');
		if (!fs.existsSync(hashFile)) {
			console.log("ERROR: can not find file '"+hashFile+"'");
		} else hashFileExists = true;
	}
	getUserDataFromFile(hashFile);

	console.log("Input dates in this format 'YEAR_MONTH_DAY', for example '2019_01_23'");
	let strDateBegin = await getUserInput('date_begin: ');
	let strDateEnd = await getUserInput('date_end: ');
	date_begin = stringToDate(strDateBegin);
	date_end = stringToDate(strDateEnd);
	console.log(" ");

	if (dateEqualsDate(date_begin, date_end) > 0) {
		console.log("Error date_begin is bigger than date_end "+getDateString(date_begin)+" > "+getDateString(date_end));
		return;
	}

	for (var i = 0; i < 3; i++) {
		date_real_begin[i] = date_begin[i];
	}
	for (var i = 0; i < 3; i++) {
		date_real_end[i] = date_end[i];
	}

	let strOutputToFile = await getUserInput('Do you want to save the results to a file? (y/n): ');
	if (strOutputToFile === 'Y' || strOutputToFile === 'y') outputResultsToFile = true;
	if (outputResultsToFile) {
		let fileIsGood = false;
		while (!fileIsGood) {
			resultFile = await getUserInput('filename: ');
			try {
				fileIsGood = true;
				fs.writeFileSync(resultFile, "test");
			} catch (err) {
				console.log("ERROR: "+err);
				fileIsGood = false;
			}
		}
	}
	console.log(" ");

	if (fs.existsSync(rootFolder)){
		localDataAvailable = true;
	}

	if (localDataAvailable) {
		await getAllFileLinks();
	} else {
		await getAllLinks();
	}

	await downloadAndProcessData();
	logPlayerData();
}

function printFileDesc() {
	console.log("This script uses player hashes to find data about players");
	console.log("Create a file that looks like this: ");
	console.log("-----------------------------------------");
	console.log(" ");
	console.log("9e0b3888a1eab461062d25fc7da846e17531df25 optional name");
	console.log("0c3152a280f2bed64c71482062924702df9f41a5 blablala");
	console.log("9e0b3888a1eab461062d25fc7da846e17531df25");
	console.log("e11fd4f020397a322bca64093713e969d85b140c john doe");
	console.log(" ");
	console.log("-----------------------------------------");
	console.log("'hash' 'description'");
	console.log(" ");
}

async function getFileData(strServer, strDate) {
	if (localDataAvailable) {
		let file = rootFolder + fileSeperator + strServer + fileSeperator + strDate;
		let fileData = fs.readFileSync(file, 'utf8');
		return fileData;
	}
	let fileData;
	fileData = await keepDownloading(allLinks[strServer].dateLinks[strDate]);
	return fileData;
}

function getUserDataFromFile(filename) {
	let contents = fs.readFileSync(filename, 'utf8');
	let lines = contents.split('\n');

	for (var i = 0; i < lines.length; i++) {
		if (lines[i].length < 2) continue;
		let splittedLine = lines[i].split(' ');
		let hash = splittedLine[0];
		if (players[hash]) {
			console.log("Warning: Hash already exists, line "+(i+1)+": "+lines[i]);
			continue;
		}
		players[hash] = new PlayerData();
		if (splittedLine.length < 2) {
			players[hash].desc = 'unnamed';
			continue;
		} 
		for (var k = 1; k < splittedLine.length; k++) {
			players[hash].desc += splittedLine[k];
			if (k+1 != splittedLine.length) players[hash].desc += ' ';
		}
	}
	console.log(" ");
	for (var key in players) {
		console.log(key+" "+players[key].desc);
	}
	console.log(" ");
}

function isValidDate(fileName) {
	let date = stringToDate(fileName);

	if (dateEqualsDate(date, date_begin) < 0) return false;
	if (dateEqualsDate(date, date_end) > 0) return false;
	return true;
}

// returns 0 if they are equal, 1 if dateA is bigger, -1 if dateA is smaller
// dateA = [ 2018, 11, 23 ]; // for example
function dateEqualsDate(dateA, dateB) {
	for (var d in dateA) {
		if (dateA[d] > dateB[d]) return 1;
		if (dateA[d] < dateB[d]) return -1;
	}
	return 0;
}

function getDateString(date) {
 	var str = "";
	str = date[0] + "_";
	if (date[1] < 10) str += 0;
	str += date[1] + "_";
	if (date[2] < 10) str += 0;
	str += date[2];
	return str;
}

function stringToDate(dateStr) {
	let splitted = dateStr.split('_');
	for (var i = 0; i < 3; i++) {
		splitted[i] = splitted[i].match(/[0-9]+/);
	}
	let date = [ parseInt(splitted[0]) , parseInt(splitted[1]) , parseInt(splitted[2]) ];
	return date;
}


function getDateStringFromUnixTime(unixTimeStamp) {
	return new Date(unixTimeStamp*1000).toUTCString();
}

function jsDateToDate(jsDate, date) {
	date[0] = jsDate.getFullYear();
	date[1] = jsDate.getMonth()+1;
	date[2] = jsDate.getDate();
}

function increaseDate(date) {
	let d = new Date(date[0]+'-'+date[1]+'-'+date[2]);
	d.setDate(d.getDate()+1);
	jsDateToDate(d, date);
}

function decreaseDate(date) {
	let d = new Date(date[0]+'-'+date[1]+'-'+date[2]);
	d.setDate(d.getDate()-1);
	jsDateToDate(d, date);
}

function minutesToTimeStr(minutes) {
	minutes = parseInt(minutes);
	let hours = parseInt(minutes/60);
	let days = parseInt(hours/24);
	let str = "";
	if (days > 0) {
		str += days + "d ";
		hours = hours-days*24
		minutes = minutes-days*24*60;
	}
	if (hours > 0) {
		str += hours + "h ";
		minutes = minutes-hours*60;
	}
	str += minutes + "m ";
	return str;
}

async function getAllLinks() {
	let html_serverLinks = await keepDownloading(rootLink);
	let serverLinkList = html_serverLinks.match(/\=\"lifeLog_.+?\.com\//g);
	for (var i in serverLinkList) {
		let cLinkToList = String(serverLinkList[i]).substr(2);
		let serverName = String(String(cLinkToList.match(/_.+?\./)).match(/[A-Za-z0-9]+/));
		allLinks[serverName] = new Links();
		allLinks[serverName].link = rootLink + cLinkToList;

		let html_days = await keepDownloading(allLinks[serverName].link);
		let dayLinkList = html_days.match(/\=\"20.+?[^s]\.txt/g);
		for (var k in dayLinkList) {
			var dayLink = String(dayLinkList[k]).substr(2);
			var date = stringToDate(dayLink);
			var dateStr = getDateString(date);
			allLinks[serverName].dateLinks[dateStr] = allLinks[serverName].link + dayLink;
		}
	}
	console.log(" ");
}

async function getAllFileLinks() {
	fs.readdirSync(rootFolder).forEach( (file) => {
		allLinks[file] = new Links();
	});
	for (var server in allLinks) {
		let dir = rootFolder + fileSeperator + server;
		allLinks[server].link = dir;
		fs.readdirSync(dir).forEach( (file) => {
			if (file.indexOf("names") > -1) return;
			allLinks[server].dateLinks[file] = dir + fileSeperator + file;
		});
	}
}

async function downloadAndProcessData() {
	decreaseDate(date_begin);
	increaseDate(date_end);
	for (var i = 0; i < 3; i++) {
		date_current[i] = date_begin[i];
	}

	while (dateEqualsDate(date_current, date_end) <= 0) {
		let strDate = getDateString(date_current);
		console.log("Get data for "+strDate+" ... "+getDateString(date_end));
		for (var server in allLinks) {
			if (!allLinks[server].dateLinks[strDate]) continue;
			await processDataFromServer(server, strDate);
		}
		increaseDate(date_current);
	}
}

var tdd = []; // array containing ThreeDayData - indices are server names like 'server8'

function ThreeDayData() {
	this.strDates = [];
	this.data = [];
}

async function processDataFromServer(strServer, strDate) {
	if (!tdd[strServer]) tdd[strServer] = new ThreeDayData();

	let fileData = await getFileData(strServer, strDate);
	let linesData = fileData.split('\n');

	tdd[strServer].strDates.push(strDate);
	tdd[strServer].data.push(linesData);

	if (tdd[strServer].data.length >= 3) {
		if (tdd[strServer].data.length === 4) {
			tdd[strServer].strDates.shift(); // shift removes the first element and shifts other elements back
			tdd[strServer].data.shift();
		}
		processTDD(strServer);
	}
}

function processTDD(strServer) {
	for (var l in tdd[strServer].data[1]) {
		processMainDataLine(strServer, tdd[strServer].data[1][l]);
	}
	for (var d in tdd[strServer].data) {
		for (var l in tdd[strServer].data[d]) {
			processSecondaryDataLine(strServer, tdd[strServer].data[d][l]);
		}
	}
	for (var d in tdd[strServer].data) {
		for (var l in tdd[strServer].data[d]) {
			processTertiaryDataLine(strServer, tdd[strServer].data[d][l]);
		}
	}
}

// B 1549411631 93326 5bc06d9755a0cdb55c1776a9b12709e1b2e487e7 F (1702,5693) parent=93206 pop=134 chain=25
// D 1549411621 93037 2616d079c748c8b69a461b4112ee057686c53284 age=34.10 M (4590,-10853) killer_93259 pop=133
// B 1549901981 991847 92ef593a488baacf8f4fa486ecae8df29c8de27c F (-49148,57297) noParent pop=1 chain=1
// D 1549902413 991847 92ef593a488baacf8f4fa486ecae8df29c8de27c age=21.20 F (-48671,57178) hunger pop=0
function processMainDataLine(strServer, line) {
	if (line.length < 2) return;
	let data = line.split(' ');
	if (!data[8]) {
		console.log("Not enough data in line");
		console.log(line);
		return;
	}

	let unixTime = parseInt(data[1]);
	let playerId = data[2];
	let hash = data[3];

	if (players[hash]) {
		if (!players[hash].server[strServer]) players[hash].server[strServer] = new PlayerServerData();
		players[hash].server[strServer].addId(playerId);
		if (data[0] === 'B') {
			if (players[hash].firstEntry > unixTime) players[hash].firstEntry = unixTime;
			if (players[hash].lastEntry < unixTime) players[hash].lastEntry = unixTime;
			players[hash].births++;
			let eveChain = parseInt(data[8].match(/[0-9\.]+/));
			if (eveChain) {
				if (eveChain === 1) {
					players[hash].eves++;
					players[hash].minutesAlive -= eveSpawningAge;
				}
				players[hash].eveChains += eveChain;
				if (eveChain > players[hash].longestEveChain) {
					players[hash].longestEveChain = eveChain;
				}
			}
			if (data[4] === 'F') players[hash].females++;
			else if (data[4] === 'M') players[hash].males++;
		} else if (data[0] === 'D') {
			let age = parseFloat(data[4].match(/[0-9\.]+/));
			let deathReason = String(data[7].match(/[a-zA-Z]+/));
			players[hash].minutesAlive += age;
			if (ignoreDeathsUnderAge > age) {
				players[hash].ignoredUnderAgeDeaths++;
				return;
			}
			if (ignoreDisconnects && deathReason.indexOf('sconnec') > -1) {
				players[hash].ignoredDisconnects++;
				return;
			}
			players[hash].deaths++;
			if (age > countDeathsAsOldAgeOverAge) {
				deathReason = "oldAge";
				players[hash].elderDeaths++;
			}
			if (!players[hash].deathReasons[deathReason]) players[hash].deathReasons[deathReason] = 0;
			players[hash].deathReasons[deathReason]++;
		}
	}
}

function processSecondaryDataLine(strServer, line) {
	if (line.length < 2) return;
	let data = line.split(' ');
	if (!data[8]) {
		return;
	}

	if (players[data[3]]) return;

	let playerId = data[2];
	for (var p in players) {
		if (!players[p].server[strServer]) continue;
		if (data[0] === 'B') {
			let parentInfo = data[6].split('=');
			if (parentInfo.length < 2) continue;
			if (players[p].server[strServer].addKid(parentInfo[1], playerId));
		} else if (data[0] === 'D') {
			let deathReason = data[7].split('_');
			if (deathReason.length < 2 || deathReason[0].toUpperCase() !== 'KILLER') continue;
			let age = parseFloat(data[4].match(/[0-9\.]+/));
			if (players[p].server[strServer].addKill(deathReason[1], playerId, age, data[5]));
		}
	}
}

function processTertiaryDataLine(strServer, line) {
	if (line.length < 2) return;
	let data = line.split(' ');
	if (!data[8]) {
		return;
	}

	let playerId = data[2];
	for (var p in players) {
		if (!players[p].server[strServer]) continue;
		if (data[0] === 'B') {
			let parentInfo = data[6].split('=');
			if (parentInfo.length < 2) continue;
			if (players[p].server[strServer].addGrandKid(parentInfo[1], playerId));
		} else if (data[0] === 'D') {
			let age = parseFloat(data[4].match(/[0-9\.]+/));
			players[p].server[strServer].childDied(playerId, age);
		}
	}
}

function logResults(str) {
	if (outputResultsToFile) {
		fs.appendFileSync(resultFile, str+"\n");		
	} else console.log(str);
}

function logPlayerData() {
	if (outputResultsToFile) {
		fs.writeFileSync(resultFile, "=========================================="+"\n");
		console.log(" ");	
		console.log("Done! Saving results to '"+resultFile+"'");
	}
	if (!outputResultsToFile) console.log(" ");
	if (!outputResultsToFile) console.log("==========================================");
	logResults("Date "+getDateString(date_real_begin)+" - "+getDateString(date_real_end));
	//logResults("days: "+stats.days);
	logResults("==========================================");
	logResults(" ");
	for (var hash in players) {
		processCollectedPlayerData(players[hash]);
		logResults("==========================================");
		logResults(players[hash].desc);
		logResults(hash);
		logResults("------------------------------------------");
		if (players[hash].firstEntry === 9999999999999) logResults("firstEntry: unknown");
		else logResults("firstEntry: "+getDateStringFromUnixTime(players[hash].firstEntry));
		if (players[hash].lastEntry < 1) logResults("lastEntry: unknown");
		else logResults("lastEntry: "+getDateStringFromUnixTime(players[hash].lastEntry));
		logResults("------------------------------------------");
		logResults("births: "+players[hash].births);
		logResults("deaths: "+players[hash].deaths);
		logResults("timeAlive: "+minutesToTimeStr(players[hash].minutesAlive));
		logResults("males: "+players[hash].males);
		logResults("females: "+players[hash].females);
		logResults("males/females: "+(players[hash].males/players[hash].females).toFixed(2));
		logResults("------------------------------------------");
		logResults("avg. death age: "+((players[hash].minutesAlive+(players[hash].eves*eveSpawningAge))/players[hash].deaths).toFixed(2));
		for (var i in players[hash].deathReasons) {
			logResults("Death by "+i+": "+players[hash].deathReasons[i]+" -> "+(players[hash].deathReasons[i]/players[hash].deaths*100).toFixed(2)+"%");
		}
		logResults("------------------------------------------");
		if (players[hash].ignoredUnderAgeDeaths > 0) logResults("ignoredUnderAgeDeaths: "+players[hash].ignoredUnderAgeDeaths);
		if (players[hash].ignoredDisconnects > 0) logResults("ignoredDisconnects: "+players[hash].ignoredDisconnects);
		logResults("elderDeaths: "+players[hash].elderDeaths);
		logResults("------------------------------------------");
		logResults("born as eve: "+players[hash].eves+" -> "+(players[hash].eves/players[hash].births*100).toFixed(2)+"%");
		logResults("avg. generation born into: "+(players[hash].eveChains/players[hash].births).toFixed(2));
		logResults("longest generation born into: "+players[hash].longestEveChain);
		logResults("------------------------------------------");
		logResults("kids: "+players[hash].kids);
		if (players[hash].kids > 0 && players[hash].females > 0) {
			logResults("kids per female life: "+(players[hash].kids/players[hash].females).toFixed(2));	
			logResults("avg. kid lifespan: "+players[hash].avgKidAge);
			logResults("grandkids: "+players[hash].grandKids);
			logResults("grandkids per female life: "+(players[hash].grandKids/players[hash].females).toFixed(2));
		}
		logResults("------------------------------------------");
		logResults("kills: "+players[hash].kills+" -> "+(players[hash].kills/players[hash].deaths*100).toFixed(2)+"%");
		if (players[hash].kills > 0) {
			logResults("avg. victim age: "+players[hash].avgVictimAge);
			logResults("victim female probability: "+players[hash].victimFemaleProbability+"%");
		}
		logResults("==========================================");
		logResults(" ");
	}
}
