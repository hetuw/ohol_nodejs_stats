// Copyright (C) 2019 hetuw
// GNU General Public License version 2 https://www.gnu.org/licenses/gpl-2.0.txt

let isWin = process.platform === "win32";
let fileSeperator = '/';
if (isWin) fileSeperator = '\\';

var ccolor_yellow = "\033[38;2;"+"255;255;0m";
var ccolor_reset = "\033[0m";
if (isWin) {
	ccolor_yellow = "";
	ccolor_reset = "";
}

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


const rootLink = "http://publicdata.onehouronelife.com/publicLifeLogData/";
const rootFolder = "oholData";
let localDataAvailable = false;

var date_begin = []; // contains 3 ints, year - month - day
var date_end = [];
var date_current = [];

// chosen by user
var date_real_begin = [];
var date_real_end = [];

let outputResultsToFile = false;
let resultFile = "";
let	usingLineageLink = false;

var pInfo = new PlayerInfo();

function PlayerInfo() {
	this.pName = ""; // like "AMY" or "AMY AVAND"
	this.gender = ""; // F or M
	this.deathAge = 0;
	this.server = ""; // like "server1" or "bigserver2"
}

var allLinks = []; // array of Links() - indices are servernames like "server12" or "bigserver2"

function Links() {
	this.link = ""; // contains link to the list of data and name links
	this.dateLinks = []; // contains link to text file that has the data - indices are dates like "2019_02_09"
	this.nameLinks = []; // contains link to text file that has the names - indices are dates like "2019_02_09"
}

main();
async function main() {
	var args = process.argv.slice(0);
	if (!args[2] || args[2].length < 0) {
		await getPlayerInfo();
	} else {
		if (args[3]) {
			console.log(" ");
			console.log("Error: too many arguments");
			console.log("call the script like this: nodejs "+args[1]+" \"lineagelink\"");
			console.log("replace lineagelink with a real lineage link and be sure to put it inside \"\"");
			return;
		}
		if (fs.existsSync(args[2])) {
			await processLineageLinkFile(args[2]);
			return;
		} else await getPlayerInfoFromLineageLink(args[2]);
	}
	if (!usingLineageLink) await askSaveToFile();	

	await loadAllLinks();

	await downloadAndProcessData();
	logSearchResults();
}

// returns array with objects, each obj has properties "link" and "desc"
async function getLineageListFromFile(file) {
	let lineageLinkList = [];
	let fileData = fs.readFileSync(file, 'utf8');
	let lines = fileData.split('\n');
	for (let l in lines) {
		let words = lines[l].split(' ');
		let lineageInfo = {};
		if (words[0].length < 1) continue;
		lineageInfo.link = words[0];
		lineageInfo.desc = "";
		for (let w in words) {
			if (w == 0) continue; // dont make this === or it will not work
			lineageInfo.desc += words[w] + " ";
		}
		lineageLinkList.push(lineageInfo);
	}
	return lineageLinkList;
}

async function processLineageLinkFile(file) {
	let lineageLinkList = await getLineageListFromFile(file);
	console.log(lineageLinkList);

	await loadAllLinks();
	let strResultShort = "";
	let strResult = "";
	for (let i in lineageLinkList) {
		await getPlayerInfoFromLineageLink(lineageLinkList[i].link);
		await downloadAndProcessData();
		strResult += "--------------------------------------------------"+"\n";
		strResult += "link: "+lineageLinkList[i].link+"\n";
		strResult += "desc: "+lineageLinkList[i].desc+"\n";
		for (let r in results) {
			strResult += "hash: "+results[r].hash+"\n";
			strResultShort += results[r].hash+" ";
		}
		strResultShort += lineageLinkList[i].desc+"\n";
	}
	strResult += "--------------------------------------------------"+"\n";
	logResults("--------------------------------------------------"+"\n");
	logResults(strResultShort);
	logResults("--------------------------------------------------"+"\n");
	logResults(strResult);
}

async function loadAllLinks() {
	if (fs.existsSync(rootFolder)) {
		localDataAvailable = true;
	}

	if (localDataAvailable) {
		await getAllFileLinks();
	} else {
		await getAllLinks();
	}
}

async function askSaveToFile() {
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
}

function getBeginEndDatesFromTimeAgo(timeAgo) {
	let number = parseInt(timeAgo.match(/[0-9]*/)[0]);
	let timeUnit = timeAgo.match(/[0-9]* ([A-z]*)/)[1];
	timeUnit = timeUnit.toLowerCase();

	//let today = new Date();
	let startDate = new Date();
	let endDate = new Date();
	if (timeUnit.includes("second")) {
		startDate.setDate(startDate.getDate()-2);
	} else if (timeUnit.includes("minute")) {
		startDate.setDate(startDate.getDate()-2);
	} else if (timeUnit.includes("hour")) {
		startDate.setDate(startDate.getDate()-2);
	} else if (timeUnit.includes("day")) {
		startDate.setDate(startDate.getDate()-number-1);
		endDate.setDate(endDate.getDate()-number+1);
	} else if (timeUnit.includes("month")) {
		startDate.setDate(startDate.getDate()-(number*31)-31);
		endDate.setDate(endDate.getDate()-(number*31)+31);
	} else {
		console.log("Error: unknown time unit: "+timeUnit);
		process.exit();
	}
	jsDateToDate(startDate, date_begin);
	jsDateToDate(endDate, date_end);
	for (var i = 0; i < 3; i++) {
		date_real_begin[i] = date_begin[i];
	}
	for (var i = 0; i < 3; i++) {
		date_real_end[i] = date_end[i];
	}
}

async function getPlayerInfoFromLineageLink(link) {
	pInfo = new PlayerInfo();
	usingLineageLink = true;
	console.log(" ");
	let regex = /\&id\=([0-9]*)/;
	let result = link.match(regex);
	if (!result || !result[1]) {
		console.log("Error: cannot find player id");
		console.log("Error: invalid lineage link");
		process.exit();
	}
	let strId = result[1];
	link = link.replace(/\&rel_id\=[0-9]*/, "") // remove relation id so we dont get relation info that would confuse the regex filters
	console.log("player id: "+strId);
	console.log(" ");
	console.log("Downloading lineage link: "+link);
	let website = await keepDownloading(link);
	website = website.replace(/(\r\n|\n|\r)/gm, "");
	console.log(" ");
	console.log("download complete");
	regex = "character\_page\&id\="+strId+"&rel_id\="+strId+".\>\<img.*?\<\/a\>\<\/a\>\<br\>(.*?)\<\/td\>";
	result = website.match(regex);
	console.log(" ");
	if (!result || !result[1]) {
		console.log("Error: cannot find player info from lineage link");
		process.exit();
	}
	result = result[1];
	console.log(result);
	console.log(" ");
	pInfo.server = null;
	pInfo.pName = result.match(/([A-z ]*?)\<br/)[1].toUpperCase();
	pInfo.deathAge = parseInt(result.match(/\<br\>([0-9]*)/)[1]);
	let timeAgo = result.match(/\<br\>.*?\<br\>([0-9A-z ]* ago)/)[1];
	console.log("time ago: "+timeAgo);
	console.log(" ");
	getBeginEndDatesFromTimeAgo(timeAgo);
	logPInfo();
}

async function getPlayerInfo() {
	console.log("Start searching for players... ");
	console.log(" ");

	await getBeginEndDates();

	console.log("Input server to search on, e.g. 'server1' or 'bigserver2' or 'u' for unknown");
	let server = await getUserInput("server: ");
	server = server.toLowerCase();
	if (server === 'u') pInfo.server = null;
	else pInfo.server = server;

	console.log(" ");
	console.log("Describe the player you are searching for (u === unknown)");
	
	let name = 'U';
	while (name === 'U') {
		name = await getUserInput("name: ");
		name = name.toUpperCase();
		if (name === 'U') console.log("Name is required, can not be unknown");
	}
	pInfo.pName = name;
	if (pInfo.pName === 'NAMELESS') pInfo.pName = 'UNNAMED';

	let gender = await getUserInput("gender (F/M): ");
	gender = gender.toUpperCase();
	if (gender === 'F' || gender === 'M') pInfo.gender = gender;
	else pInfo.gender = null;

	let deathAge = await getUserInput("age of death: ");
	let intDeathAge = parseInt(deathAge);
	if (isNaN(intDeathAge)) pInfo.deathAge = null;
	else pInfo.deathAge = intDeathAge;

	for (var i = 0; i < 3; i++) {
		date_real_begin[i] = date_begin[i];
	}
	for (var i = 0; i < 3; i++) {
		date_real_end[i] = date_end[i];
	}

	console.log(" ");
	logPInfo();
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

function logPInfo() {
	console.log("==================================================");
	if (pInfo.server) console.log(getDateString(date_begin)+" - "+getDateString(date_end)+"     server: "+pInfo.server);
	else console.log(getDateString(date_begin)+" - "+getDateString(date_end)+"     server: unknown");
	console.log("--------------------------------------------------");
	if (pInfo.pName) console.log("name: "+pInfo.pName);
	else console.log("name: unknown");
	if (pInfo.gender) console.log("gender: "+pInfo.gender);
	else console.log("gender: unknown");
	if (pInfo.deathAge) console.log("age of death: "+pInfo.deathAge);
	else console.log("age of death: unknown");
	console.log("==================================================");
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
	date[0] = jsDate.getUTCFullYear();
	date[1] = jsDate.getUTCMonth()+1;
	date[2] = jsDate.getUTCDate();
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

async function getAllLinks() {
	let html_serverLinks = await keepDownloading(rootLink);
	let serverLinkList = html_serverLinks.match(/\=\"lifeLog_.+?\.com\//g);
	for (var i in serverLinkList) {
		let cLinkToList = String(serverLinkList[i]).substr(2);
		let serverName = String(String(cLinkToList.match(/_.+?\./)).match(/[A-Za-z0-9]+/));
		serverName = serverName.toLowerCase();
		if (pInfo.server && pInfo.server !== serverName) continue;
		allLinks[serverName] = new Links();
		allLinks[serverName].link = rootLink + cLinkToList;

		let html_days = await keepDownloading(allLinks[serverName].link);
		let dayLinkList = html_days.match(/\=\"20.+?[^s]\.txt/g);
		for (var k in dayLinkList) {
			let dayLink = String(dayLinkList[k]).substr(2);
			let date = stringToDate(dayLink);
			let dateStr = getDateString(date);
			allLinks[serverName].dateLinks[dateStr] = allLinks[serverName].link + dayLink;
		}
		let nameLinkList = html_days.match(/\=\"20.+?_names\.txt/g);
		for (var k in nameLinkList) {
			let nameLink = String(nameLinkList[k]).substr(2);
			let date = stringToDate(nameLink);
			let dateStr = getDateString(date);
			allLinks[serverName].nameLinks[dateStr] = allLinks[serverName].link + nameLink;
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
		if (pInfo.server && pInfo.server !== server) continue;
		let dir = rootFolder + fileSeperator + server;
		allLinks[server].link = dir;
		fs.readdirSync(dir).forEach( (file) => {
			if (file.indexOf("names") > -1) {
				allLinks[server].nameLinks[file.replace("_names", "")] = dir + fileSeperator + file;
				return;
			}
			if (file.indexOf("curses") > -1) return;
			allLinks[server].dateLinks[file] = dir + fileSeperator + file;
		});
	}
}

// type 2 === names
async function getFileData(strServer, strDate, type) {
	if (localDataAvailable) {
		let file = rootFolder + fileSeperator + strServer + fileSeperator + strDate;
		if (type === 2) file += "_names";
		let fileData = fs.readFileSync(file, 'utf8');
		return fileData;
	}
	let fileData;
	if (type === 2) fileData = await keepDownloading(allLinks[strServer].nameLinks[strDate]); 
	else fileData = await keepDownloading(allLinks[strServer].dateLinks[strDate]);
	return fileData;
}


async function downloadAndProcessData() {
	tdd = [];
	results = [];

	decreaseDate(date_begin);
	increaseDate(date_end);
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
	for (var server in allLinks) { // process remaining data
		if (!tdd[server]) continue;
		if (!tdd[server].processed[1]) { // if there is only one input day and its the last day
			processTDD(server, 1);
		}
		if (tdd[server].strDates[2] === getDateString(date_real_end)) { // if there are atleast 2 input days and one is the last day
			processTDD(server, 2);
		}
	}

	let resultsCopy = [];
	for (var r in results) {
		if (pInfo.gender && pInfo.gender !== results[r].gender) continue;
		if (pInfo.deathAge && pInfo.deathAge !== parseInt(results[r].deathAge)) continue;
		resultsCopy.push(results[r]);
	}
	results = resultsCopy;
}

var tdd = []; // array containing ThreeDayData - indices are server names like 'server8'

function ThreeDayData() {
	this.strDates = [];
	this.data = [];
	this.names = [];
	this.processed = [];
}

async function processDataFromServer(strServer, strDate) {
	if (!tdd[strServer]) tdd[strServer] = new ThreeDayData();

	let fileData = await getFileData(strServer, strDate, 1);
	let linesData = fileData.split('\n');
	if (!allLinks[strServer].nameLinks[strDate]) {
		console.log(ccolor_yellow+"Warning: missing name file from "+strServer+", date: "+strDate+ccolor_reset);
		return;
	}

	let fileNames = await getFileData(strServer, strDate, 2);
	let linesNames = fileNames.split('\n');

	tdd[strServer].strDates.push(strDate);
	tdd[strServer].data.push(linesData);
	tdd[strServer].names.push(linesNames);
	tdd[strServer].processed.push(false);

	if (tdd[strServer].data.length >= 3) {
		if (tdd[strServer].data.length === 4) {
			tdd[strServer].strDates.shift(); // shift removes the first element and shifts other elements back
			tdd[strServer].data.shift();
			tdd[strServer].names.shift();
			tdd[strServer].processed.shift();
		}
		processTDD(strServer, 0);
	} 
}

var results = []; // array containing ResultInfo() 

function ResultInfo() {
	this.pName = "unknown";
	this.id = "unknown"; // server specific id
	this.server = "unknown"; // like 'server7' or 'bigserver2'
	this.hash = "unknown";
	this.gender = "unknown"; // F or M
	this.generation = 0;
	this.kills = []; // array containing specific server id from killed players
	this.kids = []; // array containing specific server id from born players
	this.deathAge = 0;
	this.deathReason = "unknown";
	this.birthUnixTime = 0;
	this.deathUnixTime = 0;
	this.birthCords = "unknown";
	this.deathCords = "unknown";
}

function processTDD(strServer, mode) {
	let index = 1;
	if (mode === 2) index = 2;
	let t = tdd[strServer];
	t.processed[index] = true;
	for (var l in t.names[index]) {
		let line = t.names[index][l].split(' ');
		let name = "";
		let nameFound = false;
		for (var i = 1; i < line.length; i++) {
			if (line[i] === pInfo.pName) {
				nameFound = true;
			}
			name += line[i];
			if (name === pInfo.pName) {
				nameFound = true;
			}
			if (i+1 !== line.length) name += ' ';
		}
		if (nameFound || name === pInfo.pName) {
			let rId = results.length;
			results[rId] = new ResultInfo();
			results[rId].pName = name;
			results[rId].id = line[0];
			results[rId].server = strServer;
		}
	}
	if (results.length < 1) return;
	if (mode === 1) {
		checkLines(t.data[0], strServer);
		checkLines(t.data[1], strServer);
		return;
	}
	if (mode === 2) {
		checkLines(t.data[1], strServer);
		checkLines(t.data[2], strServer);
		return;
	}
	checkLines(t.data[0], strServer);
	checkLines(t.data[1], strServer);
	checkLines(t.data[2], strServer);
}

// B 1549411631 93326 5bc06d9755a0cdb55c1776a9b12709e1b2e487e7 F (1702,5693) parent=93206 pop=134 chain=25
// D 1549411621 93037 2616d079c748c8b69a461b4112ee057686c53284 age=34.10 M (4590,-10853) killer_93259 pop=133
// B 1549901981 991847 92ef593a488baacf8f4fa486ecae8df29c8de27c F (-49148,57297) noParent pop=1 chain=1
// D 1549902413 991847 92ef593a488baacf8f4fa486ecae8df29c8de27c age=21.20 F (-48671,57178) hunger pop=0
function checkLines(lines, strServer) {
	for (var l in lines) {
		if (lines[l].length < 2) continue;
		let line = lines[l].split(' ');
		if (!line[8]) {
			console.log("Not enough data, lineNumber: "+l);
			console.log(lines[l]);
			continue;
		}
		for (var r in results) {
			if (results[r].server !== strServer) continue;
			if (results[r].id === line[2]) {
				results[r].hash = line[3];
				if (line[0] === 'B') {
					results[r].birthUnixTime = line[1];
					results[r].gender = line[4];
					results[r].generation = parseInt(line[8].match(/[0-9]+/));
					results[r].birthCords = line[5];
				} else if (line[0] === 'D') {
					results[r].deathUnixTime = line[1];
					results[r].deathAge = parseFloat(line[4].match(/[0-9\.]+/));
					results[r].gender = line[5];
					results[r].deathReason = line[7];
					results[r].deathCords = line[6];
				}
				continue;
			}
			if (line[0] === 'B') {
				let parentInfo = line[6].split('=');
				if (parentInfo.length < 2) continue;
				if (parentInfo[1] === results[r].id) {
					let alreadyAdded = false;
					for (var k in results[r].kids) {
						if (results[r].kids[k] === line[2]) {
							alreadyAdded = true;
							break;
						}
					}
					if (!alreadyAdded) results[r].kids.push(line[2]);
				}
			} else if (line[0] === 'D') {
				let deathReason = line[7].split('_');
				if (deathReason.length < 2) continue;
				if (deathReason[1] === results[r].id) {
					let alreadyAdded = false;
					for (var k in results[r].kills) {
						if (results[r].kills[k] === line[2]) {
							alreadyAdded = true;
							break;
						}
					}
					if (!alreadyAdded) results[r].kills.push(line[2]);
				}
			}
		}
	}
}

function logResults(str) {
	if (outputResultsToFile) {
		fs.appendFileSync(resultFile, str+"\n");		
	} else console.log(str);
}

function logSearchResults() {
	let resultCount = 0;
	for (var r in results) {
		if (pInfo.gender && pInfo.gender !== results[r].gender) continue;
		if (pInfo.deathAge && pInfo.deathAge !== parseInt(results[r].deathAge)) continue;
		resultCount++;
	}

	console.log(" ");
	if (outputResultsToFile) {
		if (results.length < 1) {
			console.log("Search completed, no players found!");
			fs.writeFileSync(resultFile, "Search completed, no players found!"+"\n");
			return;
		}
		fs.writeFileSync(resultFile, "Search completed for: "+"\n");
		if (resultCount === 1) console.log("Search completed, "+resultCount+" player found, saving results to '"+resultFile+"'");
		else console.log("Search completed, "+resultCount+" players found, saving results to '"+resultFile+"'");
	} 
	if (!outputResultsToFile) console.log("Search completed for: ");
	logResults("==================================================");
	if (pInfo.server) logResults(getDateString(date_real_begin)+" - "+getDateString(date_real_end)+"     server: "+pInfo.server);
	else logResults(getDateString(date_real_begin)+" - "+getDateString(date_real_end)+"     server: unknown");
	logResults("--------------------------------------------------");
	if (pInfo.pName) logResults("name: "+pInfo.pName);
	else logResults("name: unknown");
	if (pInfo.gender) logResults("gender: "+pInfo.gender);
	else logResults("gender: unknown");
	if (pInfo.deathAge) logResults("age of death: "+pInfo.deathAge);
	else logResults("age of death: unknown");
	logResults("==================================================");
	logResults(" ");
	if (results.length < 1) {
		logResults("No players found!");
		return;
	}
	if (resultCount === 1) logResults(resultCount+" player found:\n");
	else logResults(resultCount+" players found:\n");
	for (var r in results) {
		logResults("==================================================");
		logResults("server: "+results[r].server);
		if (results[r].birthUnixTime > 0) logResults("birth: "+getDateStringFromUnixTime(results[r].birthUnixTime));
		else logResults("birth time is unknown");
		if (results[r].deathUnixTime > 0) logResults("death: "+getDateStringFromUnixTime(results[r].deathUnixTime));
		else logResults("death time is unknown");
		logResults("--------------------------------------------------");
		logResults("birthCords: "+results[r].birthCords);
		logResults("deathCords: "+results[r].deathCords);
		logResults("--------------------------------------------------");
		logResults("name: "+results[r].pName);
		logResults("hash: "+results[r].hash);
		logResults("id: "+results[r].id);
		logResults("gender: "+results[r].gender);
		logResults("generation: "+results[r].generation);
		logResults("deathAge: "+results[r].deathAge);
		logResults("deathReason: "+results[r].deathReason);
		logResults("kids: "+results[r].kids.length);
		logResults("kills: "+results[r].kills.length);
		logResults("==================================================");
		logResults(" ");
	}
}
