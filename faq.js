require("dotenv").config()
const Discord = require("discord.js")
const client = new Discord.Client();

const replaceString = require('replace-string');
const https = require('https');
const redis = require("redis");
let redisClient = null;

var fs = require('fs');
var snxRewardsPerMinterUsd = 0.013;
var snxToMintUsd = 1.933;
var snxRewardsThisPeriod = "940,415 SNX";
var totalDebt = "$71,589,622";
var gasPrice = 240;
var fastGasPrice = 300;
var lowGasPrice = 200;
var instantGasPrice = 350;

var tknPrice = 0.77;
var swthPrice = 0.063;
var crvPrice = 3.84;

var ethPrice = 380;

var dhtPrice = 1.92;
var ethDhtPrice = 0.00506203;
var btcDhtPrice = 0.00017752;

var mintGas = 993602;
var claimGas = 1092941;
var periodVolume = "$33,026,800";

var currentFees = "$159,604";
var unclaimedFees = "$40,808";
var poolDistribution = ["sUSD (51.1%)", "sETH (16.6%)", "sBTC (14.9%)", "iETH (8.1%)", "Others (9.2%)"];

var usdtPeg = 1;
var usdcPeg = 1;

var coingeckoUsd;
var coingeckoEth;
var coingeckoBtc;
var binanceUsd;
var kucoinUsd;

var payday = new Date('2020-08-12 10:37');

const clientFaqPrice = new Discord.Client();
clientFaqPrice.login(process.env.BOT_TOKEN_DHT);

const Synth = class {
    constructor(name, price, gain) {
        this.name = name;
        this.price = price;
        this.gain = gain;
    }

    name;
    price;
    gain;
    description = '';
};

var synths = new Array();
var synthsMap = new Map();

let gasSubscribersMap = new Map();
let gasSubscribersLastPushMap = new Map();

console.log("Redis URL:" + process.env.REDIS_URL);

if (process.env.REDIS_URL) {
    redisClient = redis.createClient(process.env.REDIS_URL);
    redisClient.on("error", function (error) {
        console.error(error);
    });

    redisClient.get("gasSubscribersMap", function (err, obj) {
        gasSubscribersMapRaw = obj;
        console.log("gasSubscribersMapRaw:" + gasSubscribersMapRaw);
        if (gasSubscribersMapRaw) {
            gasSubscribersMap = new Map(JSON.parse(gasSubscribersMapRaw));
            console.log("gasSubscribersMap:" + gasSubscribersMap);
        }
    });

    redisClient.get("gasSubscribersLastPushMap", function (err, obj) {
        gasSubscribersLastPushMapRaw = obj;
        console.log("gasSubscribersLastPushMapRaw:" + gasSubscribersLastPushMapRaw);
        if (gasSubscribersLastPushMapRaw) {
            gasSubscribersLastPushMap = new Map(JSON.parse(gasSubscribersLastPushMapRaw));
            console.log("gasSubscribersLastPushMap:" + gasSubscribersLastPushMap);
        }
    });


}

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`)
})
client.on("guildMemberAdd", function (member) {
    member.send("Hi and welcome to dHedge! I am dHedge FAQ bot. I will be very happy to assist you, just ask me for **help**.");
});

client.on("message", msg => {

        if (!msg.author.username.toUpperCase().includes("FAQ")) {
            if (!(msg.channel.type == "dm")) {
                // this is logic for channels
                if (msg.content.toLowerCase().trim() == "!faq") {
                    msg.reply("Hi, I am Synthetix FAQ bot. I will be very happy to assist you, just ask me for **help** in DM.");
                } else if (msg.content.toLowerCase().trim() == "!faq help") {
                    msg.reply("I can only answer a predefined question by its number or by alias in a channel, e.g. **question 1**, or **gas price**. \n For more commands and options send me **help** in DM");
                } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("!faq question")) {
                    doQuestion(msg, "!faq question", false);
                } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("!faq synth ")) {
                    const args = msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').slice("!faq synth".length).split(' ');
                    args.shift();
                    const command = args.shift().trim();
                    if (command) {
                        doShowSynth(command, msg, false);
                    }
                } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("!faq show chart")) {
                    let content = msg.content.toLowerCase().trim().replace(/ +(?= )/g, '');
                    const args = content.slice("!faq show chart".length).split(' ');
                    args.shift();
                    const command = args.shift().trim();
                    doShowChart(command, msg, false);
                } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("!faq ")) {
                    let found = checkAliasMatching(false);
                    if (!found) {
                        msg.reply("Oops, I don't know that one. You can get all aliases if you send me a DM **aliases** \n You can check out https://github.com/dgornjakovic/synthetix-faq-bot for list of known questions and aliases");
                    }
                }
            } else {
                try {

                    // this is the logic for DM
                    console.log("I got sent a DM:" + msg.content);

                    let found = checkAliasMatching(true);
                    // if alias is found, just reply to it, otherwise continue

                    if (!found) {
                        let encodedForm = Buffer.from(msg.content.toLowerCase()).toString('base64');
                        if (checkIfUltimateQuestion(encodedForm)) {
                            answerUltimateQuestion();
                        } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("unsubscribe")) {
                            gasSubscribersMap.delete(msg.author.id);
                            gasSubscribersLastPushMap.delete(msg.author.id);
                            if (process.env.REDIS_URL) {
                                redisClient.set("gasSubscribersMap", JSON.stringify([...gasSubscribersMap]), function () {
                                });
                                redisClient.set("gasSubscribersLastPushMap", JSON.stringify([...gasSubscribersLastPushMap]), function () {
                                });
                            }
                            msg.reply("You are now unsubscribed from gas updates");
                        } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("subscribe gas")) {
                            const args = msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').slice("subscribe gas".length).split(' ');
                            args.shift();
                            const command = args.shift().trim();
                            if (command && !isNaN(command)) {
                                gasSubscribersMap.set(msg.author.id, command);
                                gasSubscribersLastPushMap.delete(msg.author.id);
                                if (process.env.REDIS_URL) {
                                    redisClient.set("gasSubscribersMap", JSON.stringify([...gasSubscribersMap]), function () {
                                    });
                                    redisClient.set("gasSubscribersLastPushMap", JSON.stringify([...gasSubscribersLastPushMap]), function () {
                                    });
                                }
                                msg.reply(" I will send you a message once safe gas price is below " + command + " gwei , and every hour after that that it remains below that level. \nTo change the threshold level for gas price, send me a new subscribe message with the new amount.\n" +
                                    "To unsubscribe, send me another DM **unsubscribe**.");
                            } else {
                                msg.reply(command + " is not a proper integer number.");
                            }
                        } else if (msg.content.toLowerCase().trim() == "aliases") {
                            showAllAliases(true);
                        } else if (msg.content.toLowerCase().trim() == "help") {
                            doFaqHelp();
                        } else if (msg.content.startsWith("help ")) {
                            const args = msg.content.slice("help".length).split(' ');
                            args.shift();
                            const command = args.shift().trim();
                            if (command == "question") {
                                msg.reply("Choose your question with ***question questionNumber***, e.g. ***question 1***\nYou can get the question number via **list** command");
                            } else if (command == "category") {
                                msg.reply("Choose your category with ***category categoryName***, e.g. ***category SNX-Rewards***\nCategory name is fetched from **categories** command");
                            } else if (command == "search") {
                                msg.reply("Search for questions with ***search searchTerm***, e.g. ***search failing transactions***");
                            } else {
                                msg.reply("I don't know that one. Try just **help** for known commands");
                            }
                        } else if (msg.content.toLowerCase().trim() == "list" || msg.content.toLowerCase().trim() == "questions") {
                            listQuestions();
                        } else if (msg.content.toLowerCase().startsWith("question ")) {
                            console.log("question asked:" + msg.content);
                            doQuestion(msg, "question", true);
                        } else if (msg.content == "categories") {
                            listCategories();
                        } else if (msg.content.toLowerCase().startsWith("category")) {

                            const args = msg.content.slice("category".length).split(' ');
                            args.shift();
                            const command = args.shift();

                            let rawdata = fs.readFileSync('categories/categories.json');
                            let categories = JSON.parse(rawdata);

                            const exampleEmbed = new Discord.MessageEmbed()
                                .setColor('#0099ff')
                                .setTitle('Questions in category ' + command + ':');

                            let found = false;
                            categories.forEach(function (category) {
                                if (category.name == command) {
                                    found = true;
                                    category.questions.forEach(function (question) {
                                        rawdata = fs.readFileSync('questions/' + question + ".txt", "utf8");
                                        exampleEmbed.addField(question, rawdata, false);
                                    });
                                }
                            });

                            if (!found) {
                                exampleEmbed.addField('\u200b', "That doesn't look like a known category. Use a category name from **categories** command, e.g. **category Staking&Minting**");
                            } else {
                                exampleEmbed.addField('\u200b', 'Choose your question with e.g. **question 1**');
                            }
                            msg.reply(exampleEmbed);

                        } else if (msg.content.toLowerCase().startsWith("search ")) {

                            const args = msg.content.slice("search".length).split(' ').slice(1);
                            const searchWord = msg.content.substring("search".length + 1);
                            doSearch(searchWord, args);

                        } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("synth ")) {
                            const args = msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').slice("synth".length).split(' ');
                            args.shift();
                            const command = args.shift().trim();
                            if (command) {
                                doShowSynth(command, msg, true);
                            }
                        } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("show chart")) {
                            let content = msg.content.toLowerCase().trim().replace(/ +(?= )/g, '');
                            const args = content.slice("show chart".length).split(' ');
                            args.shift();
                            const command = args.shift().trim();
                            doShowChart(command, msg, true);
                        } else {
                            if (!msg.author.username.toLowerCase().includes("faq")) {
                                if (msg.content.endsWith("?")) {
                                    const args = msg.content.substring(0, msg.content.length - 1).split(' ');
                                    const searchWord = msg.content;
                                    doCustomQuestion(searchWord, args);
                                } else {
                                    msg.reply("Oops, I don't know that one. Try **help** to see what I do know, or if you want to ask a custom question, make sure it ends with a question mark **?**");
                                }
                            }
                        }
                    }
                } catch (e) {
                    msg.reply("Unknown error ocurred.  Try **help** to see what I do know, or if you want to ask a custom question, make sure it ends with a question mark **?**");
                    console.log(e);
                }
            }
        }

        function showAllAliases(isDM) {
            let rawdata = fs.readFileSync('categories/aliases.json');
            let aliases = JSON.parse(rawdata);
            let questionMap = new Map();
            aliases.forEach(function (alias) {
                let aliasQuestion = questionMap.get(alias.number);
                if (aliasQuestion) {
                    aliasQuestion.push(alias.alias);
                    questionMap.set(alias.number, aliasQuestion);
                } else {
                    let aliasQuestion = new Array();
                    aliasQuestion.push(alias.alias);
                    questionMap.set(alias.number, aliasQuestion);
                }
            });

            let exampleEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Known aliases')
                .setURL('https://github.com/dgornjakovic/synthetix-faq-bot');
            exampleEmbed.setDescription('Hello, here are the aliases I know:');

            let counter = 0;
            let pagenumber = 2;
            for (let [questionNumber, questions] of questionMap) {
                let questionsString = "";
                questions.forEach(function (q) {
                    questionsString += (isDM ? "" : "!faq ") + q + "\n";
                })
                let rawdata = fs.readFileSync('answers/' + questionNumber + '.json');
                let answer = JSON.parse(rawdata);
                exampleEmbed.addField(answer.title + ' ' + answer.description, questionsString);

                counter++;
                if (counter == 10) {
                    if (isDM) {
                        msg.reply(exampleEmbed);
                    } else {
                        msg.channel.send(exampleEmbed);
                    }
                    exampleEmbed = new Discord.MessageEmbed()
                        .setColor('#0099ff')
                        .setTitle('Known aliases page ' + pagenumber)
                        .setURL('https://github.com/dgornjakovic/synthetix-faq-bot');
                    exampleEmbed.setDescription('Hello, here are the aliases I know:');
                    pagenumber++;
                    counter = 0;
                }

            }

            if (isDM) {
                msg.reply(exampleEmbed);
            } else {
                msg.channel.send(exampleEmbed);
            }
        }

        function answerUltimateQuestion() {
            const exampleEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Bravo, you found the ultimate question!');

            exampleEmbed.setDescription(Buffer.from("d2hhdCBpcyB0aGUgYW5zd2VyIHRvIGxpZmUgdGhlIHVuaXZlcnNlIGFuZCBldmVyeXRoaW5nPw==", 'base64').toString('utf-8'));
            exampleEmbed.addField("The answer is:", Buffer.from("NDI=", 'base64').toString('utf-8'));

            msg.reply(exampleEmbed);
        }

        function checkIfUltimateQuestion(encodedForm) {
            return encodedForm == "d2hhdCBpcyB0aGUgYW5zd2VyIHRvIGxpZmUgdGhlIHVuaXZlcnNlIGFuZCBldmVyeXRoaW5nPw==" ||
                encodedForm == "d2hhdCdzIHRoZSBhbnN3ZXIgdG8gbGlmZSB0aGUgdW5pdmVyc2UgYW5kIGV2ZXJ5dGhpbmc/" ||
                encodedForm == "dGhlIGFuc3dlciB0byBsaWZlIHRoZSB1bml2ZXJzZSBhbmQgZXZlcnl0aGluZw==" ||
                encodedForm == "d2hhdCBpcyB0aGUgYW5zd2VyIHRvIGxpZmUgdGhlIHVuaXZlcnNlIGFuZCBldmVyeXRoaW5nPw==";
        }

        function checkAliasMatching(doReply) {
            let potentialAlias = msg.content.toLowerCase().replace("!faq", "").trim();
            let rawdata = fs.readFileSync('categories/aliases.json');
            let aliases = JSON.parse(rawdata);
            let found = false;
            aliases.forEach(function (alias) {
                if (alias.alias.toLowerCase().trim() == potentialAlias) {
                    found = true;
                    msg.content = "!faq question " + alias.number;
                    doQuestion(msg, "!faq question", doReply);
                }
            });
            return found;
        }

        function doFaqHelp() {
            const exampleEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Synthetix Frequently Asked Questions')
                .setURL('https://help.synthetix.io/hc/en-us');

            exampleEmbed.setDescription('Hello, here is list of commands I know:');
            exampleEmbed.addField("list", "Lists all known questions");
            exampleEmbed.addField("categories", "Lists all categories of known questions");
            exampleEmbed.addField("category categoryName", "Lists all known questions for a given category name, e.g. ** category *Staking&Minting* **");
            exampleEmbed.addField("question questionNumber", "Shows the answer to the question defined by its number, e.g. ** question *7* **");
            exampleEmbed.addField("search searchTerm", "Search all known questions by given search term, e.g. ** search *SNX price* **");
            exampleEmbed.addField("aliases", "List all known aliases");
            exampleEmbed.addField("subscribe gas gasPrice",
                "I will inform you the next time safe gas price is below your target gasPrice, e.g. **subscribe gas 30** will inform you if safe gas price is below 30 gwei");
            exampleEmbed.addField("calculate rewards snxStaked",
                "Calculate weekly SNX rewards per staked snx amount, as well as minting and claiming transaction estimates at current gas price. E.g. *calculate rewards 1000*. \n You can optionally add the gas price as parameter, e.g *calculate rewards 1000 with 30 gwei*");
            exampleEmbed.addField("\u200b", "*Or just ask me a question and I will do my best to find a match for you, e.g. **What is the current gas price?***");

            msg.reply(exampleEmbed);
        }

        function listQuestions() {
            let exampleEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Frequently Asked Questions')
                .setURL('https://help.synthetix.io/hc/en-us');

            fs.readdir('questions', function (err, files) {
                if (err) {
                    console.log("Error getting directory information.")
                } else {
                    let counter = 0;
                    let pagenumber = 2;
                    files.sort(function (a, b) {
                        return a.substring(0, a.lastIndexOf(".")) * 1.0 - b.substring(0, b.lastIndexOf(".")) * 1.0;
                    });
                    files.forEach(function (file) {
                        let rawdata = fs.readFileSync('questions/' + file, "utf8");
                        exampleEmbed.addField(file.substring(0, file.lastIndexOf(".")), rawdata, false)
                        counter++;
                        if (counter == 20) {
                            msg.reply(exampleEmbed);
                            exampleEmbed = new Discord.MessageEmbed()
                                .setColor('#0099ff')
                                .setTitle('Frequently Asked Questions page ' + pagenumber)
                                .setURL('https://help.synthetix.io/hc/en-us');
                            pagenumber++;
                            counter = 0;
                        }
                    })
                }
                exampleEmbed.addField('\u200b', 'Choose your question with e.g. **question 1**');
                msg.reply(exampleEmbed);
            })
        }

        function listCategories() {
            let rawdata = fs.readFileSync('categories/categories.json');
            let categories = JSON.parse(rawdata);

            const exampleEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Categories');

            categories.forEach(function (category) {
                exampleEmbed.addField(category.name, category.desc, false);
            });

            exampleEmbed.addField('\u200b', "Choose the category with **category categoryName**, e.g. **category SNX**, or **category Synthetix.Exchange**");
            msg.reply(exampleEmbed);
        }

        function doSearch(searchWord, args) {
            const exampleEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Questions found for ***' + searchWord + '***:');

            const Match = class {
                constructor(title, value) {
                    this.title = title;
                    this.value = value;
                }

                matchedCount = 0;
                title;
                value;
            };

            const fullMatches = [];
            const partialMatches = [];
            fs.readdir('questions', function (err, files) {
                if (err) {
                    console.log("Error getting directory information.")
                } else {
                    files.sort(function (a, b) {
                        return a.substring(0, a.lastIndexOf(".")) * 1.0 - b.substring(0, b.lastIndexOf(".")) * 1.0;
                    });
                    files.forEach(function (file) {
                        let rawdata = fs.readFileSync('questions/' + file, "utf8");
                        if (rawdata.includes(searchWord)) {
                            rawdata = replaceString(rawdata, searchWord, '**' + searchWord + '**');
                            fullMatches.push(new Match(file.substring(0, file.lastIndexOf(".")), rawdata));
                        } else {
                            let matchedCount = 0;
                            args.sort(function (a, b) {
                                return a.length - b.length;
                            });
                            args.forEach(function (arg) {
                                if (rawdata.toLowerCase().includes(arg.toLowerCase())) {
                                    rawdata = replaceString(rawdata, arg, '**' + arg + '**');
                                    rawdata = replaceString(rawdata, arg.toLowerCase(), '**' + arg.toLowerCase() + '**');
                                    rawdata = replaceString(rawdata, arg.toUpperCase(), '**' + arg.toUpperCase() + '**');
                                    matchedCount++;
                                }
                            });
                            if (matchedCount > 0) {
                                let match = new Match(file.substring(0, file.lastIndexOf(".")), rawdata);
                                match.matchedCount = matchedCount;
                                partialMatches.push(match);
                            }
                        }
                    })
                }

                if (fullMatches.length == 0 && partialMatches.length == 0) {
                    exampleEmbed.setTitle('No questions found for ***' + searchWord + '***. Please refine your search.');
                } else {

                    let counter = 0;
                    fullMatches.forEach(function (match) {
                        counter++;
                        if (counter < 6) {
                            exampleEmbed.addField(match.title, match.value, false);
                        }
                    });

                    partialMatches.sort(function (a, b) {
                        return b.matchedCount - a.matchedCount;
                    });
                    partialMatches.forEach(function (match) {
                        counter++;
                        if (counter < 6) {
                            exampleEmbed.addField(match.title, match.value, false);
                        }
                    });

                    exampleEmbed.addField('\u200b', 'Choose your question with e.g. **question 1**');
                }
                msg.reply(exampleEmbed);
            })
        }

        function doCustomQuestion(searchWord, args) {
            const exampleEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Looks like you asked a custom question. This is the best I could find for your query:');

            const Match = class {
                constructor(title, value) {
                    this.title = title;
                    this.value = value;
                }

                matchedCount = 0;
                title;
                value;
            };

            const fullMatches = [];
            const partialMatches = [];
            fs.readdir('questions', function (err, files) {
                if (err) {
                    console.log("Error getting directory information.")
                } else {
                    files.sort(function (a, b) {
                        return a.substring(0, a.lastIndexOf(".")) * 1.0 - b.substring(0, b.lastIndexOf(".")) * 1.0;
                    });
                    files.forEach(function (file) {
                        let rawdata = fs.readFileSync('questions/' + file, "utf8");
                        if (rawdata.includes(searchWord)) {
                            rawdata = replaceString(rawdata, searchWord, '**' + searchWord + '**');
                            fullMatches.push(new Match(file.substring(0, file.lastIndexOf(".")), rawdata));
                        } else {
                            args.sort(function (a, b) {
                                return a.length - b.length;
                            });
                            let matchedCount = 0;
                            args.forEach(function (arg) {
                                if (rawdata.toLowerCase().includes(arg.toLowerCase())) {
                                    rawdata = replaceString(rawdata, arg, '**' + arg + '**');
                                    rawdata = replaceString(rawdata, arg.toLowerCase(), '**' + arg.toLowerCase() + '**');
                                    rawdata = replaceString(rawdata, arg.toUpperCase(), '**' + arg.toUpperCase() + '**');
                                    matchedCount++;
                                }
                            });
                            if (matchedCount > 0) {
                                let match = new Match(file.substring(0, file.lastIndexOf(".")), rawdata);
                                match.matchedCount = matchedCount;
                                partialMatches.push(match);
                            }
                        }
                    })
                }

                if (fullMatches.length == 0 && partialMatches.length == 0) {
                    exampleEmbed.setTitle('No questions found for ***' + searchWord + '***. Please refine your search.');
                } else {

                    let counter = 0;
                    fullMatches.forEach(function (match) {
                        counter++;
                        if (counter < 4) {
                            exampleEmbed.addField(match.title, match.value, false);
                        }
                    });

                    partialMatches.sort(function (a, b) {
                        return b.matchedCount - a.matchedCount;
                    });
                    partialMatches.forEach(function (match) {
                        counter++;
                        if (counter < 4) {
                            exampleEmbed.addField(match.title, match.value, false);
                        }
                    });

                    exampleEmbed.addField('\u200b', 'Choose your question with e.g. **question 1**');
                }
                msg.reply(exampleEmbed);
            })
        }


        function doQuestion(msg, toSlice, doReply) {
            const args = msg.content.slice(toSlice.length).split(' ');
            args.shift();
            const command = args.shift();

            try {
                let rawdata = fs.readFileSync('answers/' + command + '.json');
                let answer = JSON.parse(rawdata);

                const exampleEmbed = new Discord.MessageEmbed();
                exampleEmbed.setColor(answer.color);
                exampleEmbed.setTitle(answer.title);
                exampleEmbed.setDescription(answer.description);
                exampleEmbed.setURL(answer.url);

                if (command == "7") {

                    exampleEmbed.addField("Safe low gas price:", lowGasPrice + ' gwei', false);
                    exampleEmbed.addField("Standard gas price:", gasPrice + ' gwei', false);
                    exampleEmbed.addField("Fast gas price:", fastGasPrice + ' gwei', false);
                    exampleEmbed.addField("Instant gas price:", instantGasPrice + ' gwei', false);
                    if (doReply) {
                        msg.reply(exampleEmbed);
                    } else {
                        msg.channel.send(exampleEmbed);
                    }


                } else if (command == "9") {

                    exampleEmbed.addField("USD", dhtPrice, false);
                    exampleEmbed.addField("ETH", ethDhtPrice, false);
                    exampleEmbed.addField("BTC", btcDhtPrice, false);
                    if (doReply) {
                        msg.reply(exampleEmbed);
                    } else {
                        msg.channel.send(exampleEmbed);
                    }

                } else if (command == "61") {

                    https.get('https://api.coingecko.com/api/v3/coins/ethereum', (resp) => {
                        let data = '';

                        // A chunk of data has been recieved.
                        resp.on('data', (chunk) => {
                            data += chunk;
                        });

                        // The whole response has been received. Print out the result.
                        resp.on('end', () => {
                            let result = JSON.parse(data);
                            exampleEmbed.addField("USD", result.market_data.current_price.usd, false);
                            exampleEmbed.addField("BTC:", result.market_data.current_price.btc, false);
                            if (doReply) {
                                msg.reply(exampleEmbed);
                            } else {
                                msg.channel.send(exampleEmbed);
                            }
                        });

                    }).on("error", (err) => {
                        console.log("Error: " + err.message);
                    });

                } else if (command == "8") {

                    https.get('https://api.coingecko.com/api/v3/coins/nusd', (resp) => {
                        let data = '';

                        // A chunk of data has been recieved.
                        resp.on('data', (chunk) => {
                            data += chunk;
                        });

                        // The whole response has been received. Print out the result.
                        resp.on('end', () => {
                            let result = JSON.parse(data);
                            exampleEmbed.addField("USD (coingecko)", result.market_data.current_price.usd, false);
                            exampleEmbed.addField("USDC (1inch)", usdcPeg, false);
                            exampleEmbed.addField("USDT (1inch)", usdtPeg, false);
                            if (result.market_data.current_price.usd == 1 && usdcPeg == 1 && usdtPeg == 1) {
                                exampleEmbed.attachFiles(['images/perfect.jpg'])
                                    .setImage('attachment://perfect.jpg');
                            }
                            if (doReply) {
                                msg.reply(exampleEmbed);
                            } else {
                                msg.channel.send(exampleEmbed);
                            }
                        });

                    }).on("error", (err) => {
                        console.log("Error: " + err.message);
                    });

                } else if (command == "62") {

                    exampleEmbed.addField("Volume in this period:", periodVolume, false);
                    if (doReply) {
                        msg.reply(exampleEmbed);
                    } else {
                        msg.channel.send(exampleEmbed);
                    }

                } else if (command == "63") {

                    var distribution = "";
                    poolDistribution.forEach(function (d) {
                        distribution += d + "\n";
                    });

                    exampleEmbed.addField("Debt distribution:", distribution, false);
                    if (doReply) {
                        msg.reply(exampleEmbed);
                    } else {
                        msg.channel.send(exampleEmbed);
                    }

                } else if (command == "66") {

                    var synthsGainers = "";
                    var synthsBreakEven = "";
                    var synthsLosers = "";
                    synths.forEach(function (s) {
                        let arrow = (s.gain.replace(/%/g, "") * 1.0 == 0) ? " - " : (s.gain.replace(/%/g, "") * 1.0 > 0) ? " ⤤ " : " ⤥ ";
                        if (arrow.includes("⤤")) {
                            synthsGainers += s.name + " " + s.price + " " + s.gain + arrow + "\n";
                        }
                        if (arrow.includes("⤥")) {
                            synthsLosers += s.name + " " + s.price + " " + s.gain + arrow + "\n";
                        }
                        if (arrow.includes("-")) {
                            synthsBreakEven += s.name + " " + s.price + " " + s.gain + arrow + "\n";
                        }
                    });

                    exampleEmbed.addField("Synth gainers:", synthsGainers, false);
                    exampleEmbed.addField("Synth no change:", synthsBreakEven, false);
                    exampleEmbed.addField("Synth losers:", synthsLosers, false);
                    if (doReply) {
                        msg.reply(exampleEmbed);
                    } else {
                        msg.channel.send(exampleEmbed);
                    }

                } else if (command == "74") {

                    var synthsPrices = "";
                    for (var i = 0; i < 10; i++) {
                        synthsPrices += synths[i].name + " " + synths[i].price + " " + synths[i].gain + " ⤤\n";
                    }

                    exampleEmbed.addField("Biggest gainers:", synthsPrices, false);
                    if (doReply) {
                        msg.reply(exampleEmbed);
                    } else {
                        msg.channel.send(exampleEmbed);
                    }

                } else if (command == "75") {

                    var synthsPrices = "";
                    for (var i = 1; i < 11; i++) {
                        synthsPrices += synths[synths.length - i].name + " " + synths[synths.length - i].price + " " + synths[synths.length - i].gain + " ⤥\n";
                    }

                    exampleEmbed.addField("Biggest losers:", synthsPrices, false);
                    if (doReply) {
                        msg.reply(exampleEmbed);
                    } else {
                        msg.channel.send(exampleEmbed);
                    }

                } else {

                    answer.fields.forEach(function (field) {
                        exampleEmbed.addField(field.title, field.value, field.inline);
                    });

                    if (answer.footer.title) {
                        exampleEmbed.setFooter(answer.footer.title, answer.footer.value);

                    }

                    if (answer.image) {
                        exampleEmbed.attachFiles(['images/' + answer.image])
                            .setImage('attachment://' + answer.image);
                    }

                    if (answer.thumbnail) {
                        exampleEmbed.attachFiles(['images/' + answer.thumbnail])
                            .setThumbnail('attachment://' + answer.thumbnail);
                    }

                    if (doReply) {
                        msg.reply(exampleEmbed);
                    } else {
                        msg.channel.send(exampleEmbed);
                    }
                }
            } catch (e) {
                if (doReply) {
                    msg.reply("Oops, there seems to be something wrong there. \nChoose your question with ***question questionNumber***, e.g. **question 1**\nYou can get the question number via **list**");
                } else {
                    msg.reply("Oops, there seems to be something wrong there. \nChoose your question with ***!FAQ question questionNumber***, e.g. **question 1**\nYou can get the question number if you send me **list** in DM");
                }
            }
        }

    }
)

setInterval(function () {
    https.get('https://api.coingecko.com/api/v3/coins/ethereum', (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            try {
                let result = JSON.parse(data);
                ethPrice = result.market_data.current_price.usd;
            } catch (e) {
                console.log(e);
            }
        });

    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });

}, 60 * 1000);

setInterval(function () {
    https.get('https://api.coingecko.com/api/v3/coins/tokencard', (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            try {
                let result = JSON.parse(data);
                tknPrice = result.market_data.current_price.usd;
                tknPrice = Math.round(((tknPrice * 1.0) + Number.EPSILON) * 100) / 100;
            } catch (e) {
                console.log(e);
            }
        });

    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });

}, 60 * 1000);

setInterval(function () {
    https.get('https://api.coingecko.com/api/v3/coins/switcheo', (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            try {
                let result = JSON.parse(data);
                swthPrice = result.market_data.current_price.usd;
                swthPrice = Math.round(((swthPrice * 1.0) + Number.EPSILON) * 1000) / 1000;
            } catch (e) {
                console.log(e);
            }

        });

    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });

}, 60 * 1000);

setInterval(function () {
    https.get('https://api.coingecko.com/api/v3/coins/curve-dao-token', (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            try {
                let result = JSON.parse(data);
                crvPrice = result.market_data.current_price.usd;
                crvPrice = Math.round(((crvPrice * 1.0) + Number.EPSILON) * 100) / 100;
            } catch (e) {
                console.log(e);
            }
        });

    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });

}, 60 * 1000);

setInterval(function () {
    https.get('https://api.coingecko.com/api/v3/coins/dhedge-dao', (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            try {
                let result = JSON.parse(data);
                dhtPrice = result.market_data.current_price.usd;
                ethDhtPrice = result.market_data.current_price.eth;
                btcDhtPrice = result.market_data.current_price.btc;
            } catch (e) {
                console.log(e);
            }
        });

    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });

}, 60 * 1000);


function handleGasSubscription() {
    https.get('https://gasprice.poa.network/', (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            try {
                let result = JSON.parse(data);
                gasPrice = result.standard;
                fastGasPrice = result.fast;
                lowGasPrice = result.slow;
                instantGasPrice = result.instant;
                gasSubscribersMap.forEach(function (value, key) {
                    try {
                        if ((result.standard * 1.0) < (value * 1.0)) {
                            if (gasSubscribersLastPushMap.has(key)) {
                                var curDate = new Date();
                                var lastNotification = new Date(gasSubscribersLastPushMap.get(key));
                                var hours = Math.abs(curDate - lastNotification) / 36e5;
                                if (hours > 1) {
                                    if (client.users.cache.get(key)) {
                                        client.users.cache.get(key).send('gas price is now below your threshold. Current safe gas price is: ' + result.standard);
                                        gasSubscribersLastPushMap.set(key, new Date().getTime());
                                        if (process.env.REDIS_URL) {
                                            redisClient.set("gasSubscribersMap", JSON.stringify([...gasSubscribersMap]), function () {
                                            });
                                            redisClient.set("gasSubscribersLastPushMap", JSON.stringify([...gasSubscribersLastPushMap]), function () {
                                            });
                                        }
                                    } else {
                                        console.log("User:" + key + " is no longer in this server");
                                        gasSubscribersLastPushMap.delete(key);
                                        gasSubscribersMap.delete(key);
                                        if (process.env.REDIS_URL) {
                                            redisClient.set("gasSubscribersMap", JSON.stringify([...gasSubscribersMap]), function () {
                                            });
                                            redisClient.set("gasSubscribersLastPushMap", JSON.stringify([...gasSubscribersLastPushMap]), function () {
                                            });
                                        }
                                    }
                                }
                            } else {
                                if (client.users.cache.get(key)) {
                                    client.users.cache.get(key).send('gas price is now below your threshold. Current safe gas price is: ' + result.standard);
                                    gasSubscribersLastPushMap.set(key, new Date());
                                    if (process.env.REDIS_URL) {
                                        redisClient.set("gasSubscribersMap", JSON.stringify([...gasSubscribersMap]), function () {
                                        });
                                        redisClient.set("gasSubscribersLastPushMap", JSON.stringify([...gasSubscribersLastPushMap]), function () {
                                        });
                                    }
                                } else {
                                    console.log("User:" + key + " is no longer in this server");
                                    gasSubscribersLastPushMap.delete(key);
                                    gasSubscribersMap.delete(key);
                                    if (process.env.REDIS_URL) {
                                        redisClient.set("gasSubscribersMap", JSON.stringify([...gasSubscribersMap]), function () {
                                        });
                                        redisClient.set("gasSubscribersLastPushMap", JSON.stringify([...gasSubscribersLastPushMap]), function () {
                                        });
                                    }
                                }
                            }
                        } else {
                            //console.log("Not sending a gas notification for: " + key + " because " + value + " is below gas " + result.standard);
                        }
                    } catch (e) {
                        console.log("Error occured when going through subscriptions for key: " + key + "and value " + value + " " + e);
                    }
                });
            } catch (e) {
                console.log(e);
            }

        });

    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });

}

const puppeteer = require('puppeteer');

async function getSnxToolStaking() {
    try {
        const browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });
        const page = await browser.newPage();
        await page.setViewport({width: 1000, height: 926});
        await page.goto("https://snx.tools/calculator/staking/", {waitUntil: 'networkidle2'});

        /** @type {string[]} */
        var prices = await page.evaluate(() => {
            var div = document.querySelectorAll('span.text-white');

            var prices = []
            div.forEach(element => {
                prices.push(element.textContent);
            });

            return prices
        })

        snxRewardsPerMinterUsd = prices[3].split(' ')[0] * 1.0;
        snxToMintUsd = prices[4].split(' ')[0] * 1.0;
        snxRewardsThisPeriod = prices[5];
        totalDebt = prices[6];
        browser.close()
    } catch (e) {
        console.log("Error happened on getting data from SNX tools.");
        console.log(e);
    }
}

async function getSnxToolHome() {
    try {
        const browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });
        const page = await browser.newPage();
        await page.setViewport({width: 1000, height: 926});
        await page.goto("https://snx.tools/home", {waitUntil: 'networkidle2'});

        /** @type {string[]} */
        var prices = await page.evaluate(() => {
            var div = document.querySelectorAll('span.text-2xl');

            var prices = []
            div.forEach(element => {
                prices.push(element.textContent);
            });

            return prices
        })

        periodVolume = prices[3];
        browser.close()
    } catch (e) {
        console.log("Error happened on getting data from SNX tools home.");
        console.log(e);
    }
}


async function getDashboard() {
    try {
        const browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });
        const page = await browser.newPage();
        await page.setViewport({width: 1000, height: 926});
        await page.goto("https://dashboard.synthetix.io/", {waitUntil: 'networkidle2'});

        /** @type {string[]} */
        var prices = await page.evaluate(() => {
            var div = document.querySelectorAll('h2');

            var prices = []
            div.forEach(element => {
                prices.push(element.textContent);
            });

            div = document.querySelectorAll('.pieLegendElement');
            div.forEach(element => {
                prices.push(element.textContent);
            });

            return prices
        })

        currentFees = prices[13];
        unclaimedFees = prices[14];
        poolDistribution = prices.slice(27, prices.length);
        browser.close()
    } catch (e) {
        console.log("Error happened on getting data from dashboard")
    }
}

async function getExchange() {
    try {
        const browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });
        const page = await browser.newPage();
        await page.setViewport({width: 1000, height: 926});
        await page.goto("https://synthetix.exchange/#/synths", {waitUntil: 'networkidle2'});

        /** @type {string[]} */
        var prices = await page.evaluate(() => {
            var div = document.querySelectorAll('.table-body-row span');

            var prices = []
            div.forEach(element => {
                prices.push(element.textContent);
            });

            return prices
        })

        var i = 0;
        synths = new Array();
        while (i < prices.length) {
            let synthName = prices[i].substring(0, prices[i].lastIndexOf(prices[i + 1]));
            let gain = prices[i + 3];
            if (gain == "-") {
                gain = "0%";
            }
            let synth = new Synth(synthName, prices[i + 2], gain);
            if (synthsMap.has(synthName.toLowerCase())) {
                synth = synthsMap.get(synthName.toLowerCase());
                synth.gain = gain;
                synth.price = prices[i + 2];
            }
            synths.push(synth);
            if (prices[i + 3] == "-" && synthName.toLowerCase() != "susd") {
                i = i + 5;
            } else {
                i = i + 4;
            }
            synthsMap.set(synthName.toLowerCase(), synth);
        }
        synths.sort(function (a, b) {
            return b.gain.replace(/%/g, "") * 1.0 - a.gain.replace(/%/g, "") * 1.0;
        });

        browser.close()
    } catch (e) {
        console.log("Error happened on getting data from synthetix exchange");
        console.log(e);
    }
}

async function getSynthInfo(synth) {
    try {
        const browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });
        const page = await browser.newPage();
        await page.setViewport({width: 1000, height: 926});
        await page.goto("https://synthetix.exchange/#/synths/" + synth, {waitUntil: 'networkidle2'});
        await page.waitForSelector('div.isELEY');

        const rect = await page.evaluate(() => {
            const element = document.querySelector('div.isELEY');
            const {x, y, width, height} = element.getBoundingClientRect();
            return {left: x, top: y, width, height, id: element.id};
        });

        await page.screenshot({
            path: 'charts/chart' + synth.toLowerCase() + '.png',
            clip: {
                x: rect.left - 0,
                y: rect.top - 0,
                width: rect.width + 0 * 2,
                height: rect.height + 0 * 2
            }
        });
        console.log("Got screenshot for: " + synth);
        browser.close()
    } catch (e) {
        console.log("Error happened on getting data from synthetix exchange");
        console.log(e);
    }
}


setInterval(function () {
    try {
        https.get('https://api-v2.dex.ag/price?from=sUSD&to=USDT&fromAmount=10000&dex=ag', (resp) => {
            try {
                let data = '';

                // A chunk of data has been recieved.
                resp.on('data', (chunk) => {
                    data += chunk;
                });

                // The whole response has been received. Print out the result.
                resp.on('end', () => {
                    try {
                        let result = JSON.parse(data);
                        usdtPeg = Math.round(((result.price * 1.0) + Number.EPSILON) * 1000) / 1000;
                    } catch
                        (e) {
                        console.log("Error on fetching 1inch peg: ", e);
                    }
                });
            } catch
                (e) {
                console.log("Error on fetching 1inch peg: ", e);
            }

        }).on("error", (err) => {
            console.log("Error: " + err.message);
        });
    } catch
        (e) {
        console.log("Error on fetching 1inch peg: ", e);
    }

}, 60 * 1000);

setInterval(function () {
    try {
        https.get('https://api-v2.dex.ag/price?from=sUSD&to=USDC&fromAmount=10000&dex=ag', (resp) => {
            try {
                let data = '';

                // A chunk of data has been recieved.
                resp.on('data', (chunk) => {
                    data += chunk;
                });

                // The whole response has been received. Print out the result.
                resp.on('end', () => {
                    try {
                        let result = JSON.parse(data);
                        usdcPeg = Math.round(((result.price * 1.0) + Number.EPSILON) * 1000) / 1000;
                    } catch
                        (e) {
                        console.log("Error on fetching 1inch peg: ", e);
                    }
                });
            } catch
                (e) {
                console.log("Error on fetching 1inch peg: ", e);
            }

        }).on("error", (err) => {
            console.log("Error: " + err.message);
        });
    } catch
        (e) {
        console.log("Error on fetching 1inch peg: ", e);
    }

}, 60 * 1000);

// setInterval(function () {
//     try {
//         https.get('https://api.1inch.exchange/v1.1/quote?fromTokenSymbol=sUSD&toTokenSymbol=USDC&amount=10000000000000000000000', (resp) => {
//             try {
//                 let data = '';
//
//                 // A chunk of data has been recieved.
//                 resp.on('data', (chunk) => {
//                     data += chunk;
//                 });
//
//                 // The whole response has been received. Print out the result.
//                 resp.on('end', () => {
//                     try {
//                         let result = JSON.parse(data);
//                         usdcPeg = Math.round(((result.toTokenAmount / 10000000000) + Number.EPSILON) * 100) / 100;
//                     } catch
//                         (e) {
//                         console.log("Error on fetching 1inch peg: ", e);
//                     }
//                 });
//             } catch
//                 (e) {
//                 console.log("Error on fetching 1inch peg: ", e);
//             }
//
//         }).on("error", (err) => {
//             console.log("Error: " + err.message);
//         });
//     } catch
//         (e) {
//         console.log("Error on fetching 1inch peg: ", e);
//     }
//
// }, 60 * 1000);


// setInterval(function () {
//     try {
//         https.get('https://api.1inch.exchange/v1.1/quote?fromTokenSymbol=sUSD&toTokenSymbol=USDT&amount=10000000000000000000000', (resp) => {
//             let data = '';
//
//             // A chunk of data has been recieved.
//             resp.on('data', (chunk) => {
//                 data += chunk;
//             });
//
//             // The whole response has been received. Print out the result.
//             resp.on('end', () => {
//                 try {
//                     let result = JSON.parse(data);
//                     usdtPeg = Math.round(((result.toTokenAmount / 10000000000) + Number.EPSILON) * 100) / 100;
//                 } catch
//                     (e) {
//                     console.log("Error on fetching 1inch peg: ", e);
//                 }
//             });
//
//         }).on("error", (err) => {
//             console.log("Error: " + err.message);
//         });
//     } catch
//         (e) {
//         console.log("Error on fetching 1inch peg: ", e);
//     }
//
// }, 60 * 1000
// );

setInterval(function () {
    try {
        https.get('https://api.coingecko.com/api/v3/coins/havven', (resp) => {
            let data = '';

            // A chunk of data has been recieved.
            resp.on('data', (chunk) => {
                data += chunk;
            });

            // The whole response has been received. Print out the result.
            resp.on('end', () => {
                let result = JSON.parse(data);
                coingeckoUsd = result.market_data.current_price.usd;
                coingeckoEth = result.market_data.current_price.eth;
                coingeckoEth = Math.round(((coingeckoEth * 1.0) + Number.EPSILON) * 1000) / 1000;
                coingeckoBtc = result.market_data.current_price.btc;
                coingeckoBtc = Math.round(((coingeckoBtc * 1.0) + Number.EPSILON) * 1000000) / 1000000;
            });

        }).on("error", (err) => {
            console.log("Error: " + err.message);
        });
    } catch (e) {
        console.log(e);
    }
}, 60 * 1000);

setInterval(function () {
    https.get('https://api.binance.com/api/v1/ticker/price?symbol=SNXUSDT', (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            let result = JSON.parse(data);
            binanceUsd = Math.round(((result.price * 1.0) + Number.EPSILON) * 100) / 100;
        });

    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });
}, 60 * 1000);

setInterval(function () {
    try {
        https.get('https://trade.kucoin.com/_api/trade-front/market/getSymbolTick?symbols=SNX-USDT', (resp) => {
            let data = '';

            // A chunk of data has been recieved.
            resp.on('data', (chunk) => {
                data += chunk;
            });

            // The whole response has been received. Print out the result.
            resp.on('end', () => {
                let result = JSON.parse(data);
                kucoinUsd = result.data[0].lastTradedPrice;
                kucoinUsd = Math.round(((kucoinUsd * 1.0) + Number.EPSILON) * 100) / 100;
            });

        }).on("error", (err) => {
            console.log("Error: " + err.message);
        });
    } catch (e) {
        console.log(e);
    }
}, 60 * 1000);

function doShowSynth(command, msg, fromDm) {
    try {
        let synthInfo = synthsMap.get(command);
        if (synthInfo) {
            const exampleEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Synth info:');

            let arrow = (synthInfo.gain.replace(/%/g, "") * 1.0 == 0) ? " - " : (synthInfo.gain.replace(/%/g, "") * 1.0 > 0) ? " ⤤ " : " ⤥ ";
            exampleEmbed.addField(synthInfo.name,
                "Price:**" + synthInfo.price + "**\n"
                + "Gain:**" + synthInfo.gain + arrow + "**\n"
            );


            exampleEmbed.attachFiles(['charts/chart' + command.toLowerCase() + '.png'])
                .setImage('attachment://' + 'chart' + command.toLowerCase() + '.png');

            if (fromDm) {
                msg.reply(exampleEmbed);
            } else {
                msg.channel.send(exampleEmbed);
            }
        } else {
            msg.reply("Synth not available");
        }
    } catch (e) {
        console.log("Error occurred on show synth");
    }
}

function doShowChart(type, msg, fromDM) {
    try {
        const exampleEmbed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle(type + ' SNX price chart');
        exampleEmbed.addField("Possible options:", "realtime, 24H, 7D, 1M, 3M, 6M, YTD, 1Y, ALL");
        exampleEmbed.attachFiles(['charts/chart' + type.toLowerCase() + '.png'])
            .setImage('attachment://' + 'chart' + type.toLowerCase() + '.png');
        msg.reply(exampleEmbed);
    } catch (e) {
        console.log("Exception happened when showing the chart");
        console.log(e);
    }
}

async function getChart(type) {
    try {
        const browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });
        const page = await browser.newPage();
        await page.setViewport({width: 1000, height: 926});
        await page.goto("https://coincodex.com/crypto/synthetix/?period=" + type, {waitUntil: 'networkidle2'});
        await page.waitForSelector('.chart');

        const rect = await page.evaluate(() => {
            const element = document.querySelector('.chart');
            const {x, y, width, height} = element.getBoundingClientRect();
            return {left: x, top: y, width, height, id: element.id};
        });

        await page.screenshot({
            path: 'charts/chart' + type.toLowerCase() + '.png',
            clip: {
                x: rect.left - 0,
                y: rect.top - 0,
                width: rect.width + 0 * 2,
                height: rect.height + 0 * 2
            }
        });
        browser.close();
    } catch (e) {
        console.log("Error happened on getting chart.");
        console.log(e);
    }
}

setInterval(function () {
    clientFaqPrice.guilds.cache.forEach(function (value, key) {
        try {
            value.members.cache.get("756117019572568164").setNickname("$" + dhtPrice);
            value.members.cache.get("756117019572568164").user.setActivity("Ξ" + ethDhtPrice + " ₿" + btcDhtPrice, {type: 'PLAYING'});
        } catch (e) {
            console.log(e);
        }
    });
}, 30 * 1000);

setTimeout(function () {
    try {
        var increment = 1;
        synthsMap.forEach(function (value, key) {
            increment += 1;
            setTimeout(function () {
                getSynthInfo(value.name)
            }, 1000 * 10 * increment);
        });
    } catch (e) {
        console.log(e);
    }
}, 2 * 60 * 1000);

setInterval(function () {
    try {
        var increment = 1;
        synthsMap.forEach(function (value, key) {
            increment += 1;
            setTimeout(function () {
                getSynthInfo(value.name)
            }, 1000 * 10 * increment);
        });
    } catch (e) {
        console.log(e);
    }
}, 1 * 30 * 60 * 1000);


setTimeout(function () {
    try {
        getChart('realtime');
    } catch (e) {
        console.log(e);
    }
}, 5 * 1000);
setTimeout(function () {
    try {
        getChart('24H');
    } catch (e) {
        console.log(e);
    }
}, 8 * 1000);
setTimeout(function () {
    try {
        getChart('7D');
    } catch (e) {
        console.log(e);
    }
}, 10 * 1000);
setTimeout(function () {
    try {
        getChart('1M');
    } catch (e) {
        console.log(e);
    }
}, 20 * 1000);
setTimeout(function () {
    try {
        getChart('3M');
    } catch (e) {
        console.log(e);
    }
}, 30 * 1000);
setTimeout(function () {
    try {
        getChart('6M');
    } catch (e) {
        console.log(e);
    }
}, 40 * 1000);

setTimeout(function () {
    try {
        getChart('YTD');
    } catch (e) {
        console.log(e);
    }
}, 50 * 1000);
setTimeout(function () {
    try {
        getChart('1Y');
    } catch (e) {
        console.log(e);
    }
}, 60 * 1000);
setTimeout(function () {
    try {
        getChart('ALL');
    } catch (e) {
        console.log(e);
    }
}, 70 * 1000);


setInterval(function () {
    try {
        getChart('realtime');
    } catch (e) {
        console.log(e);
    }
}, 60 * 1000);
setInterval(function () {
    try {
        getChart('24H');
    } catch (e) {
        console.log(e);
    }
}, 60 * 7 * 1000);
setInterval(function () {
    try {
        getChart('7D');
    } catch (e) {
        console.log(e);
    }
}, 60 * 10 * 1000);
setInterval(function () {
    try {
        getChart('1M');
    } catch (e) {
        console.log(e);
    }
}, 60 * 20 * 1000);
setInterval(function () {
    try {
        getChart('3M');
    } catch (e) {
        console.log(e);
    }
}, 60 * 25 * 1000);
setInterval(function () {
    try {
        getChart('6M');
    } catch (e) {
        console.log(e);
    }
}, 60 * 50 * 1000);
setInterval(function () {
    try {
        getChart('YTD');
    } catch (e) {
        console.log(e);
    }
}, 60 * 50 * 1000);
setInterval(function () {
    try {
        getChart('1Y');
    } catch (e) {
        console.log(e);
    }
}, 60 * 50 * 1000);
setInterval(function () {
    try {
        getChart('ALL');
    } catch (e) {
        console.log(e);
    }
}, 60 * 100 * 1000);

setTimeout(function () {
    try {
        getSnxToolStaking();
    } catch (e) {
        console.log(e);
    }
}, 10 * 1000);
setInterval(function () {
    try {
        getSnxToolStaking();
    } catch (e) {
        console.log(e);
    }
}, 60 * 10 * 1000);

setTimeout(function () {
    try {
        getSnxToolHome();
    } catch (e) {
        console.log(e);
    }
}, 30 * 1000);
setInterval(function () {
    try {
        getSnxToolHome();
    } catch (e) {
        console.log(e);
    }
}, 60 * 7 * 1000);

setTimeout(function () {
    try {
        getDashboard();
    } catch (e) {
        console.log(e);
    }
}, 20 * 1000);
setInterval(function () {
    try {
        getDashboard();
    } catch (e) {
        console.log(e);
    }
}, 60 * 13 * 1000);

setTimeout(function () {
    try {
        getExchange();
    } catch (e) {
        console.log(e);
    }
}, 40 * 1000);
setInterval(function () {
    try {
        getExchange();
    } catch (e) {
        console.log(e);
    }
}, 60 * 5 * 1000);

setTimeout(function () {
    try {
        handleGasSubscription();
    } catch (e) {
        console.log(e);
    }
}, 10 * 1000);
setInterval(function () {
    try {
        handleGasSubscription();
    } catch (e) {
        console.log(e);
    }
}, 60 * 1000);


client.login(process.env.BOT_TOKEN);


// const ethers = require('ethers');
// let contractRaw = fs.readFileSync('contracts/Synthetix.json');
// let contract = JSON.parse(contractRaw);
//
// async function getMintrData() {
//     const provider = ethers.getDefaultProvider("homestead");
//     const synthetix = new ethers.Contract('0xC011A72400E58ecD99Ee497CF89E3775d4bd732F',
//         contract, provider);
//     const transferable = await synthetix.transferableSynthetix('0xa0c2d3ad9c5100a6a5daa03dc6bab01f0d54c361');
//     console.log(transferable);
//     let s = transferable.toString();
//     let number = parseInt(Number(transferable._hex), 10) / 1e18;
//     console.log(number);
// }
//
// getMintrData();
