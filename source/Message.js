module.exports = (controller, bot, LOGGING_LEVEL) => {
  /* eslint-disable global-require */
  const Database = require('./Database.js')(controller, bot, LOGGING_LEVEL);
  /* eslint-enable global-require */

  const Message = {
    private: (user, text) =>
      bot.api.im.openAsync({ user })
        .then((response) => bot.api.chat.postMessageAsync({ as_user: true, channel: response.channel.id, text })),

    squidPope: (text) =>
      Database.getCurrentPopeId()
        .then((user) => bot.api.im.openAsync({ user }))
        .then((response) => bot.api.chat.postMessageAsync({ as_user: true, channel: response.channel.id, text }))
  };

  return Message;
};
