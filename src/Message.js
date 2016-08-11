module.exports = (controller, bot, SQUID_POPE_CHANNEL_ID, SQUID_POPE_USER) => {
  const Message = {
    squidPopeChannel: (text) =>
      bot.api.chat.postMessageAsync({ as_user: true, channel: SQUID_POPE_CHANNEL_ID, text }),

    private: (user, text) =>
      bot.api.im.openAsync({ user })
        .then((response) => bot.api.chat.postMessageAsync({ as_user: true, channel: response.channel.id, text })),

    squidPope: (text) =>
      bot.api.im.openAsync({ user: SQUID_POPE_USER })
        .then((response) => bot.api.chat.postMessageAsync({ as_user: true, channel: response.channel.id, text }))
  };

  return Message;
};
