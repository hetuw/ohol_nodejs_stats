// Copyright (C) 2019 hetuw
// GNU General Public License version 2 https://www.gnu.org/licenses/gpl-2.0.txt

let isWin = process.platform === "win32";
let fileSeperator = '/';
if (isWin) fileSeperator = '\\';

const fs = require('fs');

const http = require('http');

let downloadsInProgress = 0;
let bytesDownloaded = 0;
let filesDownloaded = 0;
let lastLogFilesDownloaded = -1;
let keepUpdating = true;

function createHttpOptions(link) {
	let hostname;
	let path;
	if (link.indexOf("//") > -1) {
        hostname = link.split('/')[2];
    } else {
        hostname = link.split('/')[0];
    }
	path = link.substring(link.indexOf(hostname)+hostname.length);
	let options = {
		hostname: hostname,
		path: path,
		timeout: 10000,
	};
	return options;
}

function getHttp( link ) {
	return new Promise( function (resolve, reject) {
// -------------------------------------------------------------------
		let options = createHttpOptions(link);
		var data = '';
		
		downloadsInProgress++;
		http.get(options, (resp) => {
			// A chunk of data has been recieved.
			resp.on('data', (chunk) => {
				data += chunk;
			});
			// The whole response has been received. Return the result.
			resp.on('end', () => {
				downloadsInProgress--;
				filesDownloaded++;
				bytesDownloaded += data.length;
				resolve(data);
			});
		}).on("error", (err) => {
			downloadsInProgress--;
			reject(err.message);
		});
// -------------------------------------------------------------------
	});
}

function getHttpSilent( link ) {
	return new Promise( function (resolve, reject) {
// -------------------------------------------------------------------
		let options = createHttpOptions(link);
		var data = '';

		http.get(options, (resp) => {
			// A chunk of data has been recieved.
			resp.on('data', (chunk) => {
				data += chunk;
			});
			// The whole response has been received. Return the result.
			resp.on('end', () => {
				resolve(data);
			});
		}).on("error", (err) => {
			reject(err.message);
		});
// -------------------------------------------------------------------
	});
}

const rootLink = "http://onehouronelife.com/publicLifeLogData/";
const rootFolder = "oholData";

var allLinks = []; // array of Links() - indices are servernames like "server12" or "bigserver2"

function Links() {
	this.link = ""; // contains link to the list of data and name links
	this.dateLinks = []; // contains link to text file that has the data - indices are dates like "2019_02_09"
	this.dateLinksSize = []; // contains size of files in bytes
	this.nameLinks = []; // contains link to text file that has the names - indices are dates like "2019_02_09"
	this.nameLinksSize = []; // contains size of files in bytes
}

main();
async function main() {
	console.log("Downloading all data and saving it to '"+rootFolder+"'");
	console.log("This may take a while... ");
	console.log(" ");
	await getAllLinks();

	if (!fs.existsSync(rootFolder)){
   		fs.mkdirSync(rootFolder);
	}

	let intervUpdateLog = setInterval(() => {
		if (lastLogFilesDownloaded === filesDownloaded) return;
		lastLogFilesDownloaded = filesDownloaded;
		let percentProgress = (filesDownloaded/(filesDownloaded+downloadsInProgress)*100).toFixed(2)+" %";
		console.log(getTimeStr()+" - "+filesDownloaded+" files downloaded "+bytesReadable(bytesDownloaded)+", "+downloadsInProgress+" missing - status: "+percentProgress);
		if (downloadsInProgress <= 0) {
			if (keepUpdating) {
				lastLogFilesDownloaded = -1;
				filesDownloaded = 0;
				bytesDownloaded = 0;
				console.log("Updating files ... ");
				updateAllFiles();
				if (!keepUpdating) {
					clearInterval(intervUpdateLog);
					console.log("Download complete!");
				}
				return;
			}
			clearInterval(intervUpdateLog);
			console.log("Download complete!");
		}
	}, 5000);

	console.log("Downloading files ... ");
	downloadAll();
}

function downloadAll() {
	for (let server in allLinks) {
		let serverFolder = rootFolder+fileSeperator+server;
		fs.exists(serverFolder, (exists) => {
			if (!exists) {
				fs.mkdirSync(serverFolder);
			}
			downloadServerData(server, serverFolder);
		});
	}
}

function downloadServerData(server, serverFolder) {
	for (let d in allLinks[server].dateLinks) {
		let file = serverFolder+fileSeperator+d;
		fs.exists(file, (exists) => {
			if (!exists) downloadFile(allLinks[server].dateLinks[d], file);
		});
	}
	for (let d in allLinks[server].nameLinks) {
		let file = serverFolder+fileSeperator+d+"_names";
		fs.exists(file, (exists) => {
			if (!exists) downloadFile(allLinks[server].nameLinks[d], file);
		});
	}
}

function reDownloadLatestFiles() {
	let fileStruct = [];
	fs.readdirSync(rootFolder).forEach( (file) => {
		fileStruct[file] = new Links();
	});
	for (var server in fileStruct) {
		let dir = rootFolder + fileSeperator + server;
		fileStruct[server].link = dir;
		fs.readdirSync(dir).forEach( (file) => {
			if (file.indexOf("names") > -1) {
				fileStruct[server].nameLinks[file] = dir + fileSeperator + file;
				return;
			}
			fileStruct[server].dateLinks[file] = dir + fileSeperator + file;
		});
	}

	for (let server in fileStruct) {
		let latestDate = [ 0, 0, 0 ];
		for (let d in fileStruct[server].dateLinks) {
			let date = stringToDate(d);
			if (dateEqualsDate(date, latestDate) > 0) {
				for (var i in latestDate) {
					latestDate[i] = date[i];
				}
			}
		}
		let strDate = getDateString(latestDate);
		let file = rootFolder + fileSeperator + server + fileSeperator + strDate;
		downloadFile(allLinks[server].dateLinks[strDate], file);

		latestDate = [ 0, 0, 0 ];
		for (let d in fileStruct[server].nameLinks) {
			let date = stringToDate(d);
			if (dateEqualsDate(date, latestDate) > 0) {
				for (var i in latestDate) {
					latestDate[i] = date[i];
				}
			}
		}
		strDate = getDateString(latestDate);
		file = rootFolder + fileSeperator + server + fileSeperator + strDate + "_names";
		downloadFile(allLinks[server].nameLinks[strDate], file);
	}
}

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

function downloadFile(link, file) {
	getHttp(link).then((data) => {
		fs.writeFile(file, data, (err) => {
			if (err) console.log("ERROR: "+err);
		});
	}).catch( function (err) {
		console.log(err);
		console.log("ERROR while downloading "+link);
		let waitSeconds = getRandomInt(7) + 7;
		console.log("Trying again in "+waitSeconds+" seconds ...");
		console.log(" ");
		setTimeout( () => { downloadFile(link, file) }, waitSeconds*1000);
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
			data = await getHttpSilent(link);
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

async function getAllLinks() {
	console.log("Downloading links: "+rootLink+"\n");
	let html_serverLinks = await keepDownloading(rootLink);
	let serverLinkList = html_serverLinks.match(/\=\"lifeLog_.+?\.com\//g);
	for (var i in serverLinkList) {
		let cLinkToList = String(serverLinkList[i]).substr(2);
		let serverName = String(String(cLinkToList.match(/_.+?\./)).match(/[A-Za-z0-9]+/));
		serverName = serverName.toLowerCase();
		allLinks[serverName] = new Links();
		allLinks[serverName].link = rootLink + cLinkToList;

		console.log("Downloading links: "+allLinks[serverName].link);
		let html_days = await keepDownloading(allLinks[serverName].link);
		let lines = html_days.split('\n');
		for (var l in lines) {
			let line = lines[l];
			let dayLink = line.match(/\=\"20.+?[^s]\.txt/g);
			if (dayLink) {
				dayLink = String(dayLink).substr(2);
				let date = stringToDate(dayLink);
				let dateStr = getDateString(date);
				allLinks[serverName].dateLinks[dateStr] = allLinks[serverName].link + dayLink;
				allLinks[serverName].dateLinksSize[dateStr] = parseInt(line.match(/[0-9]+$/gm));
				continue;
			}
			let nameLink = line.match(/\=\"20.+?_names\.txt/g);
			if (nameLink) {
				nameLink = String(nameLink).substr(2);
				let date = stringToDate(nameLink);
				let dateStr = getDateString(date);
				allLinks[serverName].nameLinks[dateStr] = allLinks[serverName].link + nameLink;
				allLinks[serverName].nameLinksSize[dateStr] = parseInt(line.match(/[0-9]+$/gm));	
			}
		}
	}
	console.log(" ");
}

async function updateAllFiles() {
	let allFiles = [];
	fs.readdirSync(rootFolder).forEach( (file) => {
		allFiles[file] = new Links();
	});
	let updateComplete = true;
	for (var server in allFiles) {
		let dir = rootFolder + fileSeperator + server;
		allFiles[server].link = dir;
		fs.readdirSync(dir).forEach( (file) => {
			let diff = 0;
			const filePath = dir+fileSeperator+file;
			const stats = fs.statSync(filePath);
			if (file.indexOf("names") > -1) {
				let d = file.replace("_names", "");
				diff = allLinks[server].nameLinksSize[d] - stats.size;
				if (diff > 0) {
					updateComplete = false;
					console.log("updating: "+server+" "+d+" -> missing "+bytesReadable(diff));
					downloadFile(allLinks[server].nameLinks[d], filePath);
				}
			} else {
				diff = allLinks[server].dateLinksSize[file] - stats.size;
				if (diff > 0) {
					updateComplete = false;
					console.log("updating: "+server+" "+file+" -> missing "+bytesReadable(diff));
					downloadFile(allLinks[server].dateLinks[file], filePath);
				}
			}
		});
	}
	if (updateComplete) keepUpdating = false;
}

function getTimeStr() {
	var date = new Date();
	var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    var minute  = date.getMinutes();
    minute = (minute < 10 ? "0" : "") + minute;
    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
	return hour+":"+minute+":"+sec;
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

const storageUnits = {
	'TB': 1000000000000,
	'GB': 1000000000,
	'MB': 1000000,
	'KB': 1000,
	'B': 1
}

function bytesReadable(bytes) {
	for (var s in storageUnits) {
		if (bytes >= storageUnits[s]) {
			return (bytes/storageUnits[s]).toFixed(2)+s;
		}
	}
	return bytes+"B";
}

