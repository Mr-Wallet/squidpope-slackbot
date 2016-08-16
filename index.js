const Botkit = require('botkit');
const Promise = require('bluebird');
const _ = require('lodash');
const moment = require('moment');

const BOT_TOKEN = require('./token.js');
const SQUID_POPE_CHANNEL_ID = 'C0P38P755';
const SQUID_POPE_USER = 'U04CT4Y06'; // jordan_wallet
const LOGGING_LEVEL = 1;
const VERBOSE_LOGGING = 2;


/* ### MESSY GLOBAL VARIABLES ### */
const controller = Botkit.slackbot({
  json_file_store: './saveData'
});

const bot = controller.spawn({
  retry: 100,
  token: BOT_TOKEN
});

const Database = require('./src/Database.js')(controller, bot, SQUID_POPE_CHANNEL_ID, LOGGING_LEVEL);
const Message = require('./src/Message.js')(controller, bot, SQUID_POPE_CHANNEL_ID, SQUID_POPE_USER);
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
});

controller.hears([/addPope .+/], ['direct_message'], (_bot, message) => {
  let popeName = message.text.split(' ')[1].toLowerCase();
  if (popeName[0] === '@') {
    popeName = popeName.substring(1);
  }

  if (!popeName) {
    Util.log(
      'addPope',
      `Received request from ${message.user} to add a pope, but no parameter was found`,
      VERBOSE_LOGGING
    );
    Message.private(message.uer, 'You must provide a user name!');
    return;
  }

  Util.log('addPope', `Received request from ${message.user} to add ${popeName}`);
  bot.api.users.listAsync({})
    .then(({ members }) => {
      const popeUser = _.find(members, (member) => member.name === popeName);
      if (!popeUser) {
        Util.log('addPope', `User ${popeName} was not found, so no pope was added.`);
        return Promise.reject('User not found on slack - no user added.');
      }

      return Database.addSquidPope(popeUser);
    })
    .then((popeUser) => {
      Util.log('addPope', `User ${popeName} (${popeUser}) added to end of pope queue.`);
      Message.private(message.user, 'Pope successfully added to end of queue.');
      Message.private(
        popeUser,
        'You have been added to the Squid Pope queue, making you eligible for Squid Pope duties.'
      );
    })
    .catch((reason) => {
      const errorMessage = _.get(reason, 'message', reason);
      Util.log('removePope', reason, VERBOSE_LOGGING);
      Util.log('addPope', `Failed for reason: ${errorMessage}`);
      Message.private(message.user, errorMessage);
    });
});

controller.hears([/removePope .+/], ['direct_message'], (_bot, message) => {
  let popeName = message.text.split(' ')[1].toLowerCase();
  if (popeName[0] === '@') {
    popeName = popeName.substring(1);
  }

  if (!popeName) {
    Util.log(
      'removePope',
      `Received request from ${message.user} to remove a pope, but no parameter was found`,
      VERBOSE_LOGGING
    );
    Message.private(message.uer, 'You must provide a user name!');
    return;
  }
  Util.log('removePope', `Received request from ${message.user} to remove ${popeName}`);
  bot.api.users.listAsync({})
    .then(({ members }) => {
      const popeUser = _.find(members, (member) => member.name === popeName);
      if (!popeUser) {
        Util.log('removePope', `User ${popeName} was not found, so no pope was removed.`);
        return Promise.reject('User not found on slack - no user removed.');
      }

      return Database.removeSquidPope(popeUser);
    })
    .then((popeUser) => {
      Util.log('removePope', `User ${popeName} (${popeUser}) removed from the pope queue.`);
      Message.private(message.user, 'Pope successfully removed from queue.');
      Message.private(
        popeUser,
        'You have been removed from the Squid Pope queue - you will no longer be squid pope.'
      );
    })
    .catch((reason) => {
      const errorMessage = _.get(reason, 'message', reason);
      Util.log('removePope', reason, VERBOSE_LOGGING);
      Util.log('removePope', `Failed for reason: ${errorMessage}`);
      Message.private(message.user, errorMessage);
    });
});

controller.hears([/.+/], ['direct_message'], (_bot, message) => {
  Util.log('message', `Passing along message from user ${message.user}`, VERBOSE_LOGGING);
  bot.api.users.infoAsync({ user: message.user })
    .then(({ user: sender }) => {
      Util.log('message', `${sender.name} told @squidpope: ${message.text}`);
      Message.squidPope(`${sender.name}: ${message.text}`);
    });
});
