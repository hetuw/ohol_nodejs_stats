// Copyright (C) 2019 hetuw
// GNU General Public License version 2 https://www.gnu.org/licenses/gpl-2.0.txt

const fs = require('fs');

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

const c_DoubleLineColor = 'AAAAAA';
const c_LineColor = '555555';

const c_GreenDark = '88BB33';
const c_GreenLight = 'AAFF44';

const c_BlueDark = '8866FF';
const c_BlueLight = '00FFFF';

const c_RedDark = 'AA6600';
const c_RedLight = 'DD9944';

const c_Pink = 'EE22FF';

const colorOrder = [
	c_Pink, c_Pink, // name
	c_BlueDark, c_BlueLight, // date
	c_GreenDark, c_GreenLight, // first stats
	c_RedDark, c_RedLight, // deaths
	c_BlueDark, c_BlueLight, // ignored stats
	c_GreenDark, c_GreenLight, // eve stats
	c_BlueDark, c_BlueLight, // kid stats
	c_RedDark, c_RedLight, // kill stats
];


main();
async function main() {
	var args = process.argv.slice(0);

	console.log("\nThis script takes a file with stats as input and colorizes them for the forums\n");

	let inFile = "";
	if (!args[2] || args[2].length < 0) {
		console.log("Which file, that contains stats, do you want to colorize?");
		inFile = await getFileNameFromUser();
		console.log("");
	} else {
		inFile = args[2];
		if (!fs.existsSync(inFile)) {
			console.log("ERROR: can not find file '"+inFile+"'");
			return;
		}
	}

	colorizeFile(inFile);
}

async function getFileNameFromUser() {
	let fileExists = false;
	let file = ""; 
	while (!fileExists) {
		file = await getUserInput('filename: ');
		if (!fs.existsSync(file)) {
			console.log("ERROR: can not find file '"+file+"'");
		} else fileExists = true;
	}
	return file;
}

function colorLine(line, color) {
	return "[color=#"+color+"]"+line+"[/color]";
}

function splitColorLine(line, colorA, colorB) {
	let firstPart = String(line.match(/^.+?\:/));
	let secondPart = line.substr(firstPart.length).split('->');
	let ret = colorLine(firstPart, colorA) + colorLine(secondPart[0], colorB);
	if (secondPart.length > 1) {
		ret += colorLine('->', colorA)+colorLine(secondPart[1], colorB);
	} 
	return ret;
}

async function colorizeFile(inFile) {
	let fileStr = fs.readFileSync(inFile, 'utf8');
	let lines = fileStr.split('\n');

	let output = "";
	let curLine = 0;
	let initialDate = true;
	let removeHash = false;
	for (var l in lines) {
		let line = lines[l];
		if (line.length < 2) {
			output += "\n";
			continue;
		}
		if (line.indexOf("====") > -1) {
			output += colorLine(line, c_DoubleLineColor)+"\n";
			curLine = 0;
			continue;
		}
		if (line.indexOf("----") > -1) {
			output += colorLine(line, c_LineColor)+"\n";
			curLine += 2;
			continue;
		}
		if (initialDate) {
			output += colorLine(line, c_GreenDark)+"\n";
			initialDate = false;
			continue;
		}
		if (curLine < 2) {
			if (removeHash) {
				removeHash = false;
				continue;
			}
			output += colorLine(line, colorOrder[curLine])+"\n";
			removeHash = true;
			continue;
		}
		output += splitColorLine(line, colorOrder[curLine], colorOrder[curLine+1])+"\n";
	}

	let outFile = inFile.replace(/\..{0,4}$/, "");
	outFile += "_colorized.txt";
	console.log("Saving output to '"+outFile+"'");
	fs.writeFileSync(outFile, output);
}
