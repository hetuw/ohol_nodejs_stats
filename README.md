# ohol_nodejs_stats

This repository contains different scripts related to a game called OneHourOneLife https://github.com/jasonrohrer/OneLife 
These scripts can be used to process ohol data from: http://onehouronelife.com/publicLifeLogData/
The data is described here: https://onehouronelife.com/forums/viewtopic.php?id=2529

You will need nodejs to execute the scripts

Step by Step <b>TUTORIAL</b>: https://onehouronelife.com/forums/viewtopic.php?pid=50164#p50164<br>
Output examples: https://onehouronelife.com/forums/viewtopic.php?pid=49707#p49707

### oholdownloaddata.js
This script downloads/updates all the ohol data and saves it to a folder.
When the data is downloaded, other scripts can then use it and will be faster.
This script might get stuck towards the end, if this happens, close it with CTRL+C and restart it.

### oholplayersearch.js
This script can be used to find out a players salted email hash.
This hash will be used by oholgetplayerstats.js and can be used to get stats about a player.

### oholgetplayerstats.js
This script uses salted email hashes to find out stats about players.

### ohollineagefromemail.js
This script can be used to get the lineage link from an email
