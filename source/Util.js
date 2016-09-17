const _ = require('lodash');
const https = require('https');
const moment = require('moment');

const devQuotes = require('../resources/dev-quotes.js');

const {
  ONLY_ERROR_LOGGING
} = require('../resources/logging-constants');

module.exports = (controller, bot, logLevel) => {
  const Util = {};

  Util.getChannelName = (channel) => {
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
  };

  Util.getDevQuote = () => _.sample(devQuotes);

  Util.getInterdimensionalYouTube = () => new Promise((resolve, reject) => {
    const url = 'https://www.reddit.com/r/InterdimensionalCable/.json?limit=5';

    const request = https.get(url, (response) => {
      let json = '';
      response.on('data', (chunk) => {
        json += chunk;
      });

      response.on('end', () => {
        try {
          const redditResponse = JSON.parse(json);
          const videoPost = _.find(
            redditResponse.data.children,
            ({ data }) => !data.is_self && data.url.includes('https://www.youtube.com/watch?')
          );

          resolve(videoPost.data.url);
        } catch (e) {
          Util.log('getInterdimensionalYouTube', e, ONLY_ERROR_LOGGING);
          Util.log('getInterdimensionalYouTube', `The data JSON was: ${json}`, ONLY_ERROR_LOGGING);
          reject(e);
        }
      });
    });
    request.on('error', (err) => {
      Util.log('getInterdimensionalYouTube', 'Could not retrieve a youtube, error follows:', ONLY_ERROR_LOGGING);
      Util.log('getInterdimensionalYouTube', err, ONLY_ERROR_LOGGING);
      reject(err);
    });
  });

  Util.log = (type, message, level = 1) => {
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
  };

  return Util;
};
