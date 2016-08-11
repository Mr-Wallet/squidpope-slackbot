const Botkit = require('botkit');
const Promise = require('bluebird');
const _ = require('lodash');
const moment = require('moment');

const BOT_TOKEN = require('./token.js');
const SLACKUP_CHANNEL_ID = 'C0P38P755';
const LOGGING_LEVEL = 1;
const VERBOSE_LOGGING = 2;


/* ### MESSY GLOBAL VARIABLES ### */
const controller = Botkit.slackbot({
  json_file_store: './saveData'
});

const bot = controller.spawn({
  token: BOT_TOKEN
});

const Database = require('./src/Database.js')(controller, bot, SLACKUP_CHANNEL_ID, LOGGING_LEVEL);
const Message = require('./src/Message.js')(controller, bot, SLACKUP_CHANNEL_ID);
const Util = require('./src/Util.js')(LOGGING_LEVEL);


/* ### PROMISIFY API CALLS - turns e.g. channels.info into channels.infoAsync which returns a promise ### */
bot.api.chat = Promise.promisifyAll(bot.api.chat);
bot.api.channels = Promise.promisifyAll(bot.api.channels);
bot.api.im = Promise.promisifyAll(bot.api.im);
bot.api.users = Promise.promisifyAll(bot.api.users);
controller.storage.channels = Promise.promisifyAll(controller.storage.channels);
controller.storage.users = Promise.promisifyAll(controller.storage.users);

/* ### INITALIZE BOT ### */
bot.startRTM((error /* , _bot, _payload */) => {
  if (error) {
    throw new Error('Could not connect to Slack');
  }
  Database.updateChannelMembers();
});

controller.hears([/.+/], ['direct_message'], (_bot, message) => {
  Util.log('unmatched', `Received unmatched message from user ${message.user}`, VERBOSE_LOGGING);
  Message.private(message.user, 'SquidPope is operational.');
});
