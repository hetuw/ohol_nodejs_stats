var args = process.argv.slice(0);
if (!args[2] || args[2].length < 0) {
	console.log("Missing email, usage: "+args[0].match(/[A-Za-z0-9\.]+$/)+" "+args[1].match(/[A-Za-z0-9\.]+$/)+" email");
	return;
}
var crypto = require('crypto')
shasum = crypto.createHash('sha1');
shasum.update(args[2]);
var link = "lineage.onehouronelife.com/server.php?action=front_page&email_sha1=";
console.log(link+shasum.digest('hex').toUpperCase());
