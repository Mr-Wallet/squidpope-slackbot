const _ = require('lodash');
const moment = require('moment');
const devQuotes = require('../resources/dev-quotes.js');

module.exports = (controller, bot, logLevel) => {
  const Util = {
    getChannelName: (channel) => {
      const typeCode = channel[0];
      switch (typeCode) {
        case 'C':
          return bot.api.channels.infoAsync({ channel })
            .then(({ channel: { name } }) => `In channel \`${name}\``);
        case 'D':
          return Promise.resolve('Private messaged me');
        case 'G':
          return bot.api.groups.infoAsync({ channel })
            .then(({ group: { name } }) => `In private channel \`${name}\``);
        default:
          return Promise.resolve('Unknown source');
      }
    },

    getDevQuote: () => _.sample(devQuotes),

    log: (type, message, level = 1) => {
      const theTime = moment();
      if (!type) {
        console // eslint-disable-line no-console
          .log(`## ${theTime} ## error: Util.log was called with no arguments or falsy first argument`);
      }

      if (logLevel < level) {
        return;
      }

      if (!message) {
        console.log(`## ${theTime} ## log: ${type}`); // eslint-disable-line no-console
        return;
      }

      console.log(`## ${theTime} ## ${type}: ${message}`); // eslint-disable-line no-console
    }
  };

  return Util;
};
