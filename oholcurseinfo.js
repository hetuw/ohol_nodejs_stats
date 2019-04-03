
const rootLink = "http://publicdata.onehouronelife.com/publicLifeLogData/";
const rootFolder = "oholData";

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

let localDataAvailable = false;

let outputResultsToFile = false;
let resultFile = "";

var playerHash; // find data about this player

var players = []; // array of PlayerData that contains hashes as indices

function PlayerData() {
	this.desc = ""; // user defined descripton for hash
	this.index = -1; // index number inside the players array

	this.lastCurseScore = "unknown"; // how many curse token this player currently has
	this.lastCurseScoreTime = null; // unix time as number

	this.cursedPlayers = []; // array containing hashes of players that this player cursed
	this.cursedPlayersTime = []; // unix time as number 

	this.cursedFromPlayers = [];
	this.cursedFromPlayersTime = [];

	this.highestCurseScore = 0;
}

var allLinks = []; // array of Links() - indices are servernames like "server12" or "bigserver2"

function Links() {
	this.curseLink = ""; // contains link to the list of curse links
	this.curseLinks = []; // contains link to text file that has the curses - indices are dates like "2019_02_09"
}

main();
async function main() {
	var args = process.argv.slice(0);

	console.log("This script can be used to get curse information about a player");
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
		await getUserDataFromFile(hashFile);
	} else {
		playerHash = args[2];
		players[args[2]] = new PlayerData();
		players[args[2]].desc = "";
	}

	await getBeginEndDates();
	await askIfOutputToFile();

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

async function askIfOutputToFile() {
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
		let file = rootFolder + fileSeperator + strServer + fileSeperator + strDate + "_curses";
		let fileData = fs.readFileSync(file, 'utf8');
		return fileData;
	}
	let fileData;
	fileData = await keepDownloading(allLinks[strServer].curseLinks[strDate]);
	return fileData;
}

async function getUserDataFromFile(filename) {
	let contents = fs.readFileSync(filename, 'utf8');
	let lines = contents.split('\n');

	let hashCount = 1;
	for (var i = 0; i < lines.length; i++) {
		if (lines[i].length < 2) continue;
		let splittedLine = lines[i].split(' ');
		let hash = splittedLine[0];
		if (players[hash]) {
			console.log("Warning: Hash already exists, line "+(i+1)+": "+lines[i]);
			continue;
		}
		players[hash] = new PlayerData();
		players[hash].index = parseInt(hashCount);
		hashCount++;
		if (splittedLine.length < 2) {
			players[hash].desc = 'unnamed';
			continue;
		} 
		for (var k = 1; k < splittedLine.length; k++) {
			players[hash].desc += splittedLine[k];
			if (k+1 != splittedLine.length) players[hash].desc += ' ';
		}
	}
	hashCount--;
	if (hashCount < 1) {
		console.log("No hashes found in '"+filename+"'");
		process.exit();
	}

	console.log("-----------------------------------------");
	console.log(" ");
	for (var key in players) {
		console.log(players[key].index+": "+key+" "+players[key].desc);
	}
	console.log(" ");
	console.log("-----------------------------------------");

	if (hashCount < 2) { // one hash
		for (var h in players) {
			playerHash = h;
		}
		console.log(" ");
		return;
	}
	
	console.log(" ");
	console.log("About which hash do you want to get information?");
	let validHashIndex = false;
	let hash = null;
	while (!validHashIndex) {
		let hashIndex = await getUserInput('hash index (1-'+hashCount+'): ');
		let intHashIndex = parseInt(hashIndex);
		hash = getHashFromIndex(intHashIndex);
		if (hash) {
			validHashIndex = true;
			playerHash = hash;
		}
	}
	console.log(" ");
	console.log(players[hash].index+": "+hash+" "+players[hash].desc);
	console.log(" ");
}

function getHashFromIndex(index) {
	for (var key in players) {
		if (players[key].index === index) return key;
	}
	return null;
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
	let serverLinkList = html_serverLinks.match(/\=\"curseLog.+?\.com\//g);
	for (var i in serverLinkList) {
		let cLinkToList = String(serverLinkList[i]).substr(2);
		let serverName = String(String(cLinkToList.match(/_.+?\./)).match(/[A-Za-z0-9]+/));
		allLinks[serverName] = new Links();
		allLinks[serverName].curseLink = rootLink + cLinkToList;

		let html_days = await keepDownloading(allLinks[serverName].curseLink);
		let dayLinkList = html_days.match(/\=\"20.+?[^s]\.txt/g);
		for (var k in dayLinkList) {
			var dayLink = String(dayLinkList[k]).substr(2);
			var date = stringToDate(dayLink);
			var dateStr = getDateString(date);
			allLinks[serverName].curseLinks[dateStr] = allLinks[serverName].curseLink + dayLink;
		}
	}
	let linkCount = 0;
	for (var key in allLinks) linkCount++;
	if (linkCount < 1) {
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
		allLinks[server].curseLink = dir;
		fs.readdirSync(dir).forEach( (file) => {
			if (file.indexOf("curse") > -1) {
				allLinks[server].curseLinks[file.replace("_curses", "")] = dir + fileSeperator + file;
			}
		});
	}
}

async function getAllLinks() {
	console.log("Downloading links: "+rootLink+"\n");
	let html_serverLinks = await keepDownloading(rootLink);
	let curseLinkList = html_serverLinks.match(/\=\"curseLog_.+?\.com\//g);
	for (var i in curseLinkList) {
		let cLinkToList = String(curseLinkList[i]).substr(2);
		let serverName = String(String(cLinkToList.match(/_.+?\./)).match(/[A-Za-z0-9]+/));
		serverName = serverName.toLowerCase();
		allLinks[serverName] = new Links();
		allLinks[serverName].curseLink = rootLink + cLinkToList;

		console.log("Downloading links: "+allLinks[serverName].curseLink);
		let html_days = await keepDownloading(allLinks[serverName].curseLink);
		let lines = html_days.split('\n');
		for (var l in lines) {
			let line = lines[l];
			let dayLink = line.match(/\=\"20.+?[^s]\.txt/g);
			if (dayLink) {
				dayLink = String(dayLink).substr(2);
				let date = stringToDate(dayLink);
				if (!isValidDate(dayLink)) continue;
				let dateStr = getDateString(date);
				allLinks[serverName].curseLinks[dateStr] = allLinks[serverName].curseLink + dayLink;
				continue;
			}
		}
	}
	let linkCount = 0;
	for (var key in allLinks) linkCount++;
	if (linkCount < 1) {
		console.log("ERROR: Could not find any links");
		process.exit();
	}
	console.log(" ");
}

async function downloadAndProcessData() {
	let date_current = [];
	for (var i = 0; i < 3; i++) {
		date_current[i] = date_begin[i];
	}

	while (dateEqualsDate(date_current, date_end) <= 0) {
		let strDate = getDateString(date_current);
		console.log("Get data for "+strDate+" ... "+getDateString(date_end));
		let noDataAvailable = true;
		for (var server in allLinks) {
			if (!allLinks[server].curseLinks[strDate]) continue;
			noDataAvailable = false;
			await processDataFromServer(server, strDate);
		}
		if (noDataAvailable) console.log("No data available for: "+strDate);
		increaseDate(date_current);
	}
}

// S 1554060500 4480dab629c323e8057ca52845f931ed6d01f33e 3
// C 1554060534 758787 a16408157c22fe8d2158f97ec70fef22276f0ec2 => 4480dab629c323e8057ca52845f931ed6d01f33e
async function processDataFromServer(server, strDate) {
	let fileData = await getFileData(server, strDate);
	let linesData = fileData.split('\n');
	let player = players[playerHash];

	for (var l in linesData) {
		let line = linesData[l];
		if (line.length < 2) return;
		let data = line.split(' ');

		let unixTime = parseInt(data[1]);

		if (data[0] === 'S') {
			if (!data[3]) {
				console.log("Not enough data in line - "+server+" "+strDate+":"+l);
				console.log(line);
				continue;
			}
			if (playerHash !== data[2]) continue;
			let curseScore = parseInt(data[3]);
			if (!player.lastCurseScore) {
				player.lastCurseScore = curseScore;
				player.lastCurseScoreTime = unixTime;
			} else {
				if (unixTime > player.lastCurseScoreTime) {
					player.lastCurseScore = curseScore;
					player.lastCurseScoreTime = unixTime;
				}
			}
			if (curseScore > player.highestCurseScore)
				player.highestCurseScore = curseScore;
		} else if (data[0] === 'C') {
			if (!data[5]) {
				console.log("Not enough data in line - "+server+" "+strDate+":"+l);
				console.log(line);
				continue;
			}
			if (playerHash === data[3]) {
				player.cursedPlayers.push(data[5]);
				player.cursedPlayersTime.push(unixTime);
				continue;
			}
			if (playerHash === data[5]) {
				player.cursedFromPlayers.push(data[3]);
				player.cursedFromPlayersTime.push(unixTime);
				continue;
			}
		}
	}
}

function logResults(str) {
	if (outputResultsToFile) {
		fs.appendFileSync(resultFile, str+"\n");		
	} else console.log(str);
}

function logPlayerData() {
	let player = players[playerHash];
	
	if (outputResultsToFile) {
		fs.writeFileSync(resultFile, "=========================================="+"\n");
		console.log(" ");	
		console.log("Done! Saving results to '"+resultFile+"'");
	}
	if (!outputResultsToFile) console.log(" ");
	if (!outputResultsToFile) console.log("==========================================");
	logResults("Date "+getDateString(date_begin)+" - "+getDateString(date_end));
	logResults("==========================================");
	logResults(" ");

	if (player.index >= 0) logResults("("+player.index+") "+playerHash+" "+player.desc);
	else logResults(playerHash+" "+player.desc);
	logResults(" ");

	logResults("Cursed from players: ");
	for (var key in player.cursedFromPlayers) {
		let hash = player.cursedFromPlayers[key];
		logResults(getDateStringFromUnixTime(player.cursedFromPlayersTime[key]));
		if (players[hash]) 
			logResults("("+players[hash].index+") "+hash+" "+players[hash].desc);
		else
			logResults(hash);
	}

	logResults(" ");
	logResults("Cursed players: ");
	for (var key in player.cursedPlayers) {
		let hash = player.cursedPlayers[key];
		logResults(getDateStringFromUnixTime(player.cursedPlayersTime[key]));
		if (players[hash]) 
			logResults("("+players[hash].index+") "+hash+" "+players[hash].desc);
		else
			logResults(hash);
	}

	logResults(" ");
	logResults(getDateStringFromUnixTime(player.lastCurseScoreTime));
	logResults("last curse score: "+player.lastCurseScore);

	logResults(" ");
	logResults("highest curse score: "+player.highestCurseScore);

	if (!outputResultsToFile) console.log(" ");
}
