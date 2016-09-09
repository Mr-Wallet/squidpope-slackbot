const Botkit = require('botkit');
const Promise = require('bluebird');
const _ = require('lodash');
// const moment = require('moment');

const BOT_TOKEN = require('./token.js');
const {
  ONLY_ERROR_LOGGING,
  NORMAL_LOGGING,
  VERBOSE_LOGGING
} = require('./resources/logging-constants');


// NOTE EDIT THIS TO CHANGE LOGGING AMOUNT
const LOGGING_LEVEL = NORMAL_LOGGING;


/* ### MESSY GLOBAL VARIABLES ### */
const controller = Botkit.slackbot({
  json_file_store: './saveData'
});

const bot = controller.spawn({
  retry: 100,
  token: BOT_TOKEN
});

const Database = require('./source/Database.js')(controller, bot, LOGGING_LEVEL);
const Message = require('./source/Message.js')(controller, bot, LOGGING_LEVEL);
const Util = require('./source/Util.js')(controller, bot, LOGGING_LEVEL);


/* ### PROMISIFY API CALLS - turns e.g. channels.info into channels.infoAsync which returns a promise ### */
bot.api.chat = Promise.promisifyAll(bot.api.chat);
bot.api.channels = Promise.promisifyAll(bot.api.channels);
bot.api.groups = Promise.promisifyAll(bot.api.groups);
bot.api.im = Promise.promisifyAll(bot.api.im);
bot.api.users = Promise.promisifyAll(bot.api.users);
controller.storage.channels = Promise.promisifyAll(controller.storage.channels);
controller.storage.users = Promise.promisifyAll(controller.storage.users);

// Helper that should really be part of the slack API to begin with
const getUserByName = (userName) => {
  const strippedID = _.get((/^<@(U[^>]+)>$/).exec(userName), 1);
  if (strippedID) {
    return bot.api.users.infoAsync({ user: strippedID })
      .then(({ user }) => user);
  }

  return bot.api.users.listAsync({})
    .then(({ members }) => _.find(members, ({ name }) => name === userName) || null);
};


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
 * @param {Function} callback What the command does.
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
    Promise.method(callback)(message, log, ...params)
      .catch((reason) => {
        const errorMessage = _.get(reason, 'message', reason);
        log(reason, VERBOSE_LOGGING);
        log(`Failed for reason: ${errorMessage}`, ONLY_ERROR_LOGGING);
        Message.private(message.user, errorMessage);
      });
  });
};

registerCommand('help', (message /* , log */) => {
  /* eslint-disable max-len */
  Message.private(
    message.user,
    'Any time I am mentioned, I\'ll pass it along to the current Squid Pope.' +
    '\nI will also pass along any direct messages that I don\'t recognize as a command.' +
    '\nBesides this `help` command, I know the following commands:' +
    '\n`list` lists the current queue of squid popes.' +
    '\n`cyclePope` puts the current pope at the end of the queue.' +
    '\n`deferPope` swaps the current and next popes. Use this when the scheduled pope is unavailable for the week.' +
    '\n`addPope user-name` adds a user to the end of the squid pope queue.' +
    '\n`removePope user-name` removes a user from the squid pope queue. *NOTE:* If the current pope is removed, the next user becomes pope but _is not automatically notified._'
  );
  /* eslint-enable max-len */
});

registerCommand('list', (message, log) =>
  Promise.all([bot.api.users.listAsync({}), Database.getPopes()])
    .then(([{ members }, popes]) => {
      const humanReadablePopes = _.map(popes, (popeId) => _.find(members, ({ id }) => id === popeId).name);
      log(`${message.user} was given the squid pope list`);
      log(`Squid pope list is as follows: ${JSON.stringify(humanReadablePopes)}`, VERBOSE_LOGGING);
      if (!humanReadablePopes.length) {
        Message.private(message.user, 'There are no squid popes registered! Use `addPope user-name` to add one.');
        return;
      }
      if (humanReadablePopes.length === 1) {
        Message.private(message.user, `The only registered squid pope is ${humanReadablePopes[0]}.`);
        return;
      }
      const currentPope = humanReadablePopes.shift();
      let popeMessage = `The current pope is ${currentPope}.`;
      if (humanReadablePopes.length === 1) {
        popeMessage += `\nThe off-duty pope is ${humanReadablePopes[0]}`;
      } else {
        const lastPope = humanReadablePopes.pop();
        popeMessage += `\nThe upcoming popes, in order, are ${_.join(humanReadablePopes, ', ')}` +
          `${humanReadablePopes.length > 1 ? ',' : ''} and ${lastPope}`;
      }
      Message.private(message.user, popeMessage);
    })
);

registerCommand('cyclePope', (message, log) =>
  Database.getPopes()
    .then((popes) => {
      if (popes.length < 2) {
        log('Not enough popes to perform cycling behavior - aborting.');
        return Promise.reject('There must be at least two popes to cycle to the next one!');
      }

      const currentPope = popes.shift();
      popes.push(currentPope);

      return Promise.all([
        bot.api.users.listAsync({}),
        Database.setPopes(popes),
        Util.getInterdimensionalYouTube()
          .catch(() => { /* We don't really care if this one fails */ })
      ]);
    })
    .then(([{ members }, popes, youTubeLink]) => {
      const previousPope = _.last(popes);
      const currentPope = popes[0];
      const previousPopeName = _.find(members, ({ id }) => id === previousPope).name;
      const currentPopeName = _.find(members, ({ id }) => id === currentPope).name;

      log(
        `User ${previousPopeName} (${previousPope}) was cycled out of pope and ` +
        `${currentPopeName} (${currentPope}) cycled in.`
      );
      Message.private(
        message.user,
        `Squid popes cycled. ${previousPopeName} has been replaced by ${currentPopeName} as squid pope.`
      );
      const exitMessage = `You are no longer squid pope.\n${youTubeLink ?
        `For all your hard work, here\'s a YouTube video that I think a human like you will enjoy: ${youTubeLink}` :
        'I tried to find a YouTube video to reward you, but something went wrong. Please inform your squid pope administrator.' // eslint-disable-line max-len
      }`;
      Message.private(previousPope, exitMessage);
      Message.private(
        currentPope,
        `You are now squid pope. If you are ever overwhelmed, just remember: \n"${Util.getDevQuote()}"`
      );
    })
);

registerCommand('deferPope', (message, log) =>
  Database.getPopes()
    .then((popes) => {
      if (popes.length < 2) {
        log('Not enough popes to perform deferring behavior - aborting.');
        return Promise.reject('There must be at least two popes to defer the current one for a week!');
      }

      const deferredPope = popes.shift();
      const newPope = popes.shift();
      popes.unshift(deferredPope);
      popes.unshift(newPope);

      return Promise.all([bot.api.users.listAsync({}), Database.setPopes(popes)]);
    })
    .then(([{ members }, popes]) => {
      const deferredPope = popes[1];
      const currentPope = popes[0];
      const deferredPopeName = _.find(members, ({ id }) => id === deferredPope).name;
      const currentPopeName = _.find(members, ({ id }) => id === currentPope).name;

      log(
        `User ${deferredPopeName} (${deferredPope}) was deferred as pope for a week in favor of ` +
        `${currentPopeName} (${currentPope}).`
      );
      Message.private(
        message.user,
        `${deferredPopeName} will now be squid pope _next_. The current pope is now ${currentPopeName}.`
      );
      Message.private(deferredPope, 'You are no longer squid pope.');
      Message.private(
        currentPope,
        `You are now squid pope. If you are ever overwhelmed, just remember: \n"${Util.getDevQuote()}"`
      );
    })
);

registerCommand('addPope', (message, log, popeNameOrTaggedId) => {
  if (!_.get(popeNameOrTaggedId, 'length')) {
    log(
      `Received request from ${message.user} to add a pope, but no parameter was found`,
      VERBOSE_LOGGING
    );
    return Promise.reject('You must provide a user name!');
  }

  let popeName;
  return getUserByName(popeNameOrTaggedId)
    .then((popeUser) => {
      if (!popeUser) {
        log(`User ${popeNameOrTaggedId} was not found, so no pope was added.`);
        return Promise.reject('User not found on slack - no user added.');
      }

      popeName = popeUser.name;

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

registerCommand('removePope', (message, log, popeNameOrTaggedId) => {
  if (!_.get(popeNameOrTaggedId, 'length')) {
    log(
      `Received request from ${message.user} to remove a pope, but no parameter was found`,
      VERBOSE_LOGGING
    );
    return Promise.reject('You must provide a user name!');
  }

  let popeName;
  return getUserByName(popeNameOrTaggedId)
    .then((popeUser) => {
      if (!popeUser) {
        log(`User ${popeNameOrTaggedId} was not found, so no pope was removed.`);
        return Promise.reject('User not found on slack - no user removed.');
      }

      popeName = popeUser.name;

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

controller.hears([/.+/], ['direct_message', 'direct_mention', 'mention'], (_bot, message) => {
  Util.log('message', `Passively got a mention/message from ${message.user}`, VERBOSE_LOGGING);
  Promise.all([bot.api.users.infoAsync({ user: message.user }), Util.getChannelName(message.channel)])
    .then(([{ user: sender }, channelName]) => {
      Util.log('message', `${sender.name}, @squidpope via ${channelName}: ${message.text}`);
      Message.squidPope(`${sender.name} (${channelName}): ${message.text}`);
    });
});
