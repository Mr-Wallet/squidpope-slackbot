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

/**
 * Convenience method for setting up a command that the bot will respond to, complete with easy logging/errors.
 * @param {String} command The first word the bot hears, which is the "command".
 *                         Not case sensitive except for what gets logged.
 * @param {Function} callback What the command does. This MUST RETURN A PROMISE. registerCommand tacks a `catch` on the
 *                            end of the callback for error handling, so the meat of the callback should be promisified.
 *                            callback takes the arguments (message, log, ...params) where:
 *                              message is the slack API message object
 *                              log is Util.log, partially applied with `command` as its first parameter - use this for
 *                                  logging to ensure that log output is consistent (avoids copy-paste errors).
 *                              ...params all of the space-separated words the user sent with the command.
 *                                        If the user said 'myCommand a b c' then params are 'a', 'b', 'c'.
 * @param {Array | String} types (optional) The 2nd parameter to controller.hears (i.e. the type(s) of message/mention)
 *                               See https://github.com/howdyai/botkit#matching-patterns-and-keywords-with-hears
 */
const registerCommand = (command, callback, types = ['direct_message']) => {
  const commandRegExp = new RegExp(`^${command}(\\b.+)?$`, 'i');

  controller.hears([commandRegExp], types, (_bot, message) => {
    const params = message.text.split(' ');
    params.shift();
    const log = _.partial(Util.log, command);
    log(`Received request from ${message.user}: ${message.text}`);
    callback(message, log, ...params)
      .catch((reason) => {
        const errorMessage = _.get(reason, 'message', reason);
        log(reason, VERBOSE_LOGGING);
        log(`Failed for reason: ${errorMessage}`);
        Message.private(message.user, errorMessage);
      });
  });
};

registerCommand('addPope', (message, log, _popeName) => {
  if (!_popeName || !_popeName.length) {
    log(
      `Received request from ${message.user} to add a pope, but no parameter was found`,
      VERBOSE_LOGGING
    );
    return Promise.reject('You must provide a user name!');
  }

  const popeName = _popeName[0] === '@' ? _popeName.substring(1) : _popeName;

  return bot.api.users.listAsync({})
    .then(({ members }) => {
      const popeUser = _.find(members, (member) => member.name === popeName);
      if (!popeUser) {
        log(`User ${popeName} was not found, so no pope was added.`);
        return Promise.reject('User not found on slack - no user added.');
      }

      return Database.addSquidPope(popeUser);
    })
    .then((popeUser) => {
      log(`User ${popeName} (${popeUser}) added to end of pope queue.`);
      Message.private(message.user, 'Pope successfully added to end of queue.');
      Message.private(
        popeUser,
        'You have been added to the Squid Pope queue, making you eligible for Squid Pope duties.'
      );
    });
});

registerCommand('removePope', (message, log, _popeName) => {
  if (!_popeName || !_popeName.length) {
    log(
      `Received request from ${message.user} to remove a pope, but no parameter was found`,
      VERBOSE_LOGGING
    );
    return Promise.reject('You must provide a user name!');
  }

  const popeName = _popeName[0] === '@' ? _popeName.substring(1) : _popeName;

  return bot.api.users.listAsync({})
    .then(({ members }) => {
      const popeUser = _.find(members, (member) => member.name === popeName);
      if (!popeUser) {
        log(`User ${popeName} was not found, so no pope was removed.`);
        return Promise.reject('User not found on slack - no user removed.');
      }

      return Database.removeSquidPope(popeUser);
    })
    .then((popeUser) => {
      log(`User ${popeName} (${popeUser}) removed from the pope queue.`);
      Message.private(message.user, 'Pope successfully removed from queue.');
      Message.private(
        popeUser,
        'You have been removed from the Squid Pope queue - you will no longer be squid pope.'
      );
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
