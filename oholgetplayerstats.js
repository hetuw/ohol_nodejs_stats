// Copyright (C) 2019 hetuw
// GNU General Public License version 2 https://www.gnu.org/licenses/gpl-2.0.txt

const ignoreDisconnects = false; // set this to true to ignore disconnects
const ignoreDeathsUnderAge = 3; // disable it by setting it to 0
const countDeathsAsOldAgeOverAge = 54; // disable it by setting it to 60 or higher

const rootLink = "http://onehouronelife.com/publicLifeLogData/";
const rootFolder = "oholData";
const eveSpawningAge = 14;
const ignoreEveDeathsUnderAge = eveSpawningAge + 3;

/*

FORMAT:

==========================================
births: All births
deaths: All deaths (births and deaths might be different because of incomplete data)
timeAlive: All the time you were alive
males: All male births
females: All female births
males/females: male births divided by female births
------------------------------------------
The next section doesnt count deaths for players that played less than 3 min in that life
avg. death age: Average life span
Death by hunger: How often you starved -> deathByHunger divided by deaths
Death by oldAge: Deaths after the age of 54 -> oldAge divided by deaths 
Death by killer: How often you got killed -> deathByKiller divided by deaths
Death by disconnect: How often you died because of a disconnect -> deathByDisconnect divided by deaths
------------------------------------------
ignoredUnderAgeDeaths: how many deaths under the age of 3 occurred
ignoredDisconnects: how many disconnects were ignored
timeAliveIgnored: all the time that you were alive but got ignored in some stats because you dident live long enough
ignoredEveDeaths: how many eve deaths were ignored because you dident live long enough
------------------------------------------
born as eve: how often you were born as eve -> bornAsEve divided by births
avg. generation born into: average generation you were born into
longest generation born into
------------------------------------------
kids: how many kids you had, counting all kids also suicide babies (doesnt count babies you got in an ignored life)
kids per female life: how many kids you had per female death (doesnt count female deaths were you lived less than 3 min)
avg. kid lifespan: the average death age of your kids
grandkids: how many kids your kids had (doesnt count babies you got in an ignored life)
grandkids per female life: how many grandkids you had per female death (doesnt count female deaths were you lived less than 3 min)
------------------------------------------
kills: how many people you killed -> peopleKilled divided by deaths (only counts lives where you lived at least 3 min)
avg. victim age: average age of the people you killed
victim female probability: what percentage of kills were female
==========================================

*/

const millisPerDay = 1000 * 60 * 60 * 24;

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

var date_begin = []; // contains 3 ints, year - month - day
var date_end = [];
let processingDate = null; // contains Date() of main data being currently processed

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
	this.minutesAliveIgnored = 0;
	this.deathReasons = []; 

	this.eves = 0; // how often the player spawned as an eve (with generation 1)
	this.eveChains = 0; // all eve chains a player was born into summed up together
	this.longestEveChain = 0; // the longest eve chain a player was born into

	this.firstEntry = 9999999999999; // Unix time in seconds since blabla
	this.lastEntry = 0; // Unix time in seconds since blabla

	this.males = 0; // how often the player was born as male
	this.females = 0; // how often the player was born as female
	this.femaleDeaths = 0; // ignoring underage deaths or disconnects

	this.ignoredUnderAgeDeaths = 0;
	this.ignoredEveDeaths = 0;
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
	let kidsAge = 0;
	let deadKids = 0;
	let killsAge = 0;
	let killedFemales = 0;
	for (var s in player.server) {
		let serverInfo = player.server[s];
		serverInfo.processAll();

		player.kids += serverInfo.kids;
		player.grandKids += serverInfo.grandKids;
		player.kills += serverInfo.kills;

		deadKids += serverInfo.deadKids;
		kidsAge += serverInfo.kidsAge;
		killsAge += serverInfo.killsAge;
		killedFemales += serverInfo.killedFemales;
	}
	player.avgKidAge = (kidsAge/deadKids).toFixed(2);
	player.avgVictimAge = (killsAge/player.kills).toFixed(2);
	player.victimFemaleProbability = (killedFemales/player.kills*100).toFixed(2);
}

function PlayerServerIdInfo() {
	this.id = ""; // containing specific server id for a player as a string
	this.date = null; // first encounter of the id ( birth ), contains Date()
	this.kids = []; // ids of kids from this player
	this.kidsDead = []; // ids of kids that died from this player
	this.kidsAge = 0; // whenever a kid dies add lifespan to kidsAge - needs kidsDead[] to work correctly
	this.grandKids = []; // ids of grandkids from this player
	this.kills = []; // ids of killed players from this player
	this.killsAge = 0;
	this.killedFemales = 0; // how many females killed
	this.eveChain = 0; // in which generation the id was born into, 1 === eve
	this.ignore = false; // if this player id should be ignored, because he died to early or disconnected
}

function getDayDiff(dateA, dateB) {
	return Math.abs(dateA.getTime() - dateB.getTime()) / millisPerDay;
}

function PlayerServerData() {
	this.idInfos = []; // array containing PlayerServerIdInfo()

	this.kids = 0;
	this.deadKids = 0;
	this.kidsAge = 0;
	this.grandKids = 0;

	this.kills = 0;
	this.killsAge = 0;
	this.killedFemales = 0;

	this.processIdInfoData = function(idInfoId) {
		if (this.idInfos[idInfoId].ignore) return;

		this.kids += this.idInfos[idInfoId].kids.length;
		this.deadKids += this.idInfos[idInfoId].kidsDead.length;
		this.kidsAge += this.idInfos[idInfoId].kidsAge;
		this.grandKids += this.idInfos[idInfoId].grandKids.length;

		this.kills += this.idInfos[idInfoId].kills.length;
		this.killsAge += this.idInfos[idInfoId].killsAge;
		this.killedFemales += this.idInfos[idInfoId].killedFemales;
	}
	this.processAll = function() {
		for (var i in this.idInfos) {
			this.processIdInfoData(i);
		}
	}
	this.removeOldIds = function(currentDate) {
		let newIdInfo = [];
		for (var i in this.idInfos) {
			if (getDayDiff(currentDate, this.idInfos[i].date) < 3) { // forget ids after 2 days
				newIdInfo.push(this.idInfos[i]);
			} else {
				this.processIdInfoData(i);
			}
		}
		this.idInfos = null;
		this.idInfos = newIdInfo;
	} 

	this.addId = function(id, date) {
		for (var i in this.idInfos) {
			if (this.idInfos[i].id === id) return;
		}
		let newIdInfo = new PlayerServerIdInfo();
		newIdInfo.id = id;
		newIdInfo.date = new Date(date);
		this.idInfos.push(newIdInfo);
	}

	this.getIdInfoId = function(playerServerId) {
		for (var i in this.idInfos) {
			if (this.idInfos[i].id === playerServerId) return i;
		}
		return -1;
	}
	this.isChild = function(idInfosId, kidId) {
		for (var i in this.idInfos[idInfosId].kids) {
			if (this.idInfos[idInfosId].kids[i] === kidId) return true;
		}
		return false;
	}

	this.addKid = function(parentId, kidId) {
		let idInfosId = this.getIdInfoId(parentId);
		if (idInfosId < 0) return;
		if (this.isChild(idInfosId, kidId)) return;
		this.idInfos[idInfosId].kids.push(kidId);
	}
	this.addGrandKid = function(parentId, kidId) {
		let idInfosId = -1;
		for (var i in this.idInfos) {
			if (this.isChild(i, parentId)) {
				idInfosId = i;
				break;
			}
		}
		if (idInfosId < 0) return;
		for (var i in this.idInfos[idInfosId].grandKids) {
			if (this.idInfos[idInfosId].grandKids[i] === kidId) return;
		}
		this.idInfos[idInfosId].grandKids.push(kidId);
	}
	this.childDied = function(kidId, kidAge) {
		let idInfosId = -1;
		for (var i in this.idInfos) {
			if (this.isChild(i, kidId)) {
				idInfosId = i;
				break;
			}
		}
		if (idInfosId < 0) return;
		for (var i in this.idInfos[idInfosId].kidsDead) {
			if (this.idInfos[idInfosId].kidsDead[i] === kidId) return;
		}
		this.idInfos[idInfosId].kidsDead.push(kidId);
		this.idInfos[idInfosId].kidsAge += kidAge;
	}

	this.addKill = function(killerId, killedId, killedAge, killedGender) {
		let idInfosId = this.getIdInfoId(killerId);
		if (idInfosId < 0) return;
		for (var i in this.idInfos[idInfosId].kills) {
			if (this.idInfos[idInfosId].kills[i] === killedId) return;
		}
		this.idInfos[idInfosId].kills.push(killedId);
		this.idInfos[idInfosId].killsAge += killedAge;
		if (killedGender === 'F') this.idInfos[idInfosId].killedFemales++;
	}

	this.setEveChain = function(id, eveChain) {
		let idInfosId = this.getIdInfoId(id);
		if (idInfosId < 0) return;
		this.idInfos[idInfosId].eveChain = eveChain;
	}
	this.getEveChain = function(id) {
		let idInfosId = this.getIdInfoId(id);
		if (idInfosId < 0) return -1;
		return this.idInfos[idInfosId].eveChain;
	}

	this.ignore = function(id) {
		let idInfosId = this.getIdInfoId(id);
		if (idInfosId < 0) return -1;
		this.idInfos[idInfosId].ignore = true;
	}
}

var allLinks = []; // array of Links() - indices are servernames like "server12" or "bigserver2"

function Links() {
	this.link = ""; // contains link to the list of data and name links
	this.dateLinks = []; // contains link to text file that has the data - indices are dates like "2019_02_09"
}

main();
async function main() {
	var args = process.argv.slice(0);
	console.log("This script uses player hashes to find data about players");
	console.log("You can start this script like this: "+args[0].match(/[A-Za-z0-9\.]+$/)+" "+args[1].match(/[A-Za-z0-9\.]+$/)+" hash");
	console.log("Or you can just start it like this:  "+args[0].match(/[A-Za-z0-9\.]+$/)+" "+args[1].match(/[A-Za-z0-9\.]+$/));
	console.log("Then it will ask you for a file containing hashes");
	console.log(" ");
	if (!args[2] || args[2].length < 0) {
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
	} else {
		players[args[2]] = new PlayerData();
		players[args[2]].desc = "";
	}

	await getBeginEndDates();

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
				fs.writeFileSync(resultFile, "processing data... ");
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

async function getBeginEndDates() {
	console.log("Input dates in this format 'YEAR_MONTH_DAY', for example '2019_01_23'");
	let datesAreGood = false;
	while (!datesAreGood) {
		date_begin = await getDateFromUser('date_begin: ');
		date_end = await getDateFromUser('date_end: ');

		if (dateEqualsDate(date_begin, date_end) > 0) {
			console.log("ERROR: date_begin is bigger than date_end "+getDateString(date_begin)+" > "+getDateString(date_end)+"\n");
		} else datesAreGood = true;
	}
	console.log(" ");
}

async function getDateFromUser(question) {
	let dateIsGood = false;
	let date;
	while (!dateIsGood) {
		let dateStr = await getUserInput(question);
		try {
			date = stringToDate(dateStr);
			let d = new Date(date[0]+'-'+date[1]+'-'+date[2]);
			if (isNaN(d.getTime())) console.log("ERROR: Invalid date: "+dateStr+"\n");
			else dateIsGood = true;
		} catch (err) {
			console.log("ERROR: Invalid date: "+dateStr+"\n");
		}
	}
	return date;
}

function printFileDesc() {
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
	console.log("-----------------------------------------");
	console.log(" ");
	for (var key in players) {
		console.log(key+" "+players[key].desc);
	}
	console.log(" ");
	console.log("-----------------------------------------");
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
	if (allLinks.length < 1) {
		console.log("ERROR: Could not find any links");
		process.exit();
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
	let date_current = [];
	for (var i = 0; i < 3; i++) {
		date_current[i] = date_begin[i];
	}

	while (dateEqualsDate(date_current, date_end) <= 0) {
		let strDate = getDateString(date_current);
		console.log("Get data for "+strDate+" ... "+getDateString(date_end));
		let noDataAvailable = true;
		for (var server in allLinks) {
			if (!allLinks[server].dateLinks[strDate]) continue;
			noDataAvailable = false;
			await processDataFromServer(server, strDate);
		}
		if (noDataAvailable) console.log("No data available for: "+strDate);
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
	processingDate = new Date(tdd[strServer].strDates[1].replace(/_/g, '-'));
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
	for (var h in players) {
		if (!players[h].server[strServer]) continue;
		players[h].server[strServer].removeOldIds(processingDate);
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
		players[hash].server[strServer].addId(playerId, processingDate);
		if (data[0] === 'B') {
			if (players[hash].firstEntry > unixTime) players[hash].firstEntry = unixTime;
			if (players[hash].lastEntry < unixTime) players[hash].lastEntry = unixTime;
			players[hash].births++;
			let eveChain = parseInt(data[8].match(/[0-9\.]+/));
			if (eveChain) {
				if (eveChain === 1) {
					players[hash].eves++;
				}
				players[hash].eveChains += eveChain;
				if (eveChain > players[hash].longestEveChain) {
					players[hash].longestEveChain = eveChain;
				}
				players[hash].server[strServer].setEveChain(playerId, eveChain);
			}
			if (data[4] === 'F') players[hash].females++;
			else if (data[4] === 'M') players[hash].males++;
		} else if (data[0] === 'D') {
			let age = parseFloat(data[4].match(/[0-9\.]+/));
			let deathReason = String(data[7].match(/[a-zA-Z]+/));
			players[hash].minutesAlive += age;
			let eveChain = players[hash].server[strServer].getEveChain(playerId);
			if (eveChain === 1) {
				players[hash].minutesAlive -= eveSpawningAge;
			}
			if (ignoreDeathsUnderAge > age) {
				players[hash].minutesAliveIgnored += age;
				players[hash].ignoredUnderAgeDeaths++;
				players[hash].server[strServer].ignore(playerId);
				return;
			}
			if (ignoreDisconnects && deathReason.indexOf('sconnec') > -1) {
				players[hash].minutesAliveIgnored += age;
				players[hash].ignoredDisconnects++;
				players[hash].server[strServer].ignore(playerId);
				return;
			}
			if (eveChain === 1 && ignoreEveDeathsUnderAge > age) {
				players[hash].minutesAliveIgnored += age-eveSpawningAge;
				players[hash].ignoredEveDeaths++;
				players[hash].server[strServer].ignore(playerId);
				return;
			}
			players[hash].deaths++;
			if (age > countDeathsAsOldAgeOverAge) {
				deathReason = "oldAge";
				players[hash].elderDeaths++;
			}
			if (!players[hash].deathReasons[deathReason]) players[hash].deathReasons[deathReason] = 0;
			players[hash].deathReasons[deathReason]++;
			if (data[5] === 'F') players[hash].femaleDeaths++;
		}
	}
}

function processSecondaryDataLine(strServer, line) {
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
			players[p].server[strServer].addKid(parentInfo[1], playerId);
		} else if (data[0] === 'D') {
			let deathReason = data[7].split('_');
			if (deathReason.length < 2 || deathReason[0].toUpperCase() !== 'KILLER') continue;
			let age = parseFloat(data[4].match(/[0-9\.]+/));
			players[p].server[strServer].addKill(deathReason[1], playerId, age, data[5]);
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
		if (players[hash].desc.length > 0) logResults(players[hash].desc);
		logResults(hash);
		logResults("------------------------------------------");
		if (players[hash].firstEntry === 9999999999999) logResults("firstEntry: unknown");
		else logResults("firstEntry: "+getDateStringFromUnixTime(players[hash].firstEntry));
		if (players[hash].lastEntry < 1) logResults("lastEntry: unknown");
		else logResults("lastEntry: "+getDateStringFromUnixTime(players[hash].lastEntry));
		logResults("------------------------------------------");
		logResults("births: "+players[hash].births);
		logResults("deaths: "+(players[hash].deaths+players[hash].ignoredUnderAgeDeaths+players[hash].ignoredEveDeaths+players[hash].ignoredDisconnects));
		logResults("timeAlive: "+minutesToTimeStr(players[hash].minutesAlive));
		logResults("males: "+players[hash].males);
		logResults("females: "+players[hash].females);
		logResults("males/females: "+(players[hash].males/players[hash].females).toFixed(2));
		logResults("------------------------------------------");
		let allowedMinutesLive = players[hash].minutesAlive-players[hash].minutesAliveIgnored;
		let allowedEveDeaths = players[hash].eves-players[hash].ignoredEveDeaths;
		//logResults("allowedMinutesLive: "+minutesToTimeStr(allowedMinutesLive));
		//logResults("allowedEveDeaths: "+allowedEveDeaths);
		logResults("avg. death age: "+((allowedMinutesLive+(allowedEveDeaths*eveSpawningAge))/players[hash].deaths).toFixed(2));
		for (var i in players[hash].deathReasons) {
			logResults("Death by "+i+": "+players[hash].deathReasons[i]+" -> "+(players[hash].deathReasons[i]/players[hash].deaths*100).toFixed(2)+"%");
		}
		logResults("------------------------------------------");
		if (players[hash].ignoredUnderAgeDeaths > 0) logResults("ignoredUnderAgeDeaths: "+players[hash].ignoredUnderAgeDeaths);
		if (players[hash].ignoredEveDeaths > 0) logResults("ignoredEveDeaths: "+players[hash].ignoredEveDeaths);
		if (players[hash].ignoredDisconnects > 0) logResults("ignoredDisconnects: "+players[hash].ignoredDisconnects);
		logResults("timeAliveIgnored: "+minutesToTimeStr(players[hash].minutesAliveIgnored));
		//logResults("elderDeaths: "+players[hash].elderDeaths);
		logResults("------------------------------------------");
		logResults("born as eve: "+players[hash].eves+" -> "+(players[hash].eves/players[hash].births*100).toFixed(2)+"%");
		logResults("avg. generation born into: "+(players[hash].eveChains/players[hash].births).toFixed(2));
		logResults("longest generation born into: "+players[hash].longestEveChain);
		logResults("------------------------------------------");
		logResults("kids: "+players[hash].kids);
		if (players[hash].kids > 0 && players[hash].females > 0) {
			logResults("kids per female life: "+(players[hash].kids/players[hash].femaleDeaths).toFixed(2));	
			logResults("avg. kid lifespan: "+players[hash].avgKidAge);
			logResults("grandkids: "+players[hash].grandKids);
			logResults("grandkids per female life: "+(players[hash].grandKids/players[hash].femaleDeaths).toFixed(2));
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
