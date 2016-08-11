const Promise = require('bluebird');
const _ = require('lodash');
const moment = require('moment');

const VERBOSE_LOGGING = 2;

module.exports = (controller, bot, SLACKUP_CHANNEL_ID, LOGGING_LEVEL = 1) => {
  const Util = require('./Util.js')(LOGGING_LEVEL); // eslint-disable-line global-require

  const Database = {
    /**
     * @param {Object} newData An object that will be merged with the existing slackup channel data.
     *                         Recursively, no defined properties in newData ought to resolve to `undefined`;
     *                         these will be treated as `null`, which is the "explicitly update to not a value" value.
     */
    updateChannelRecord: (newData) => {
      Util.log('Database', 'updateChannelRecord called.', VERBOSE_LOGGING);
      return controller.storage.channels.getAsync(SLACKUP_CHANNEL_ID)
        .catch((reason) => {
          Util.log('Database',
            'updateChannelRecord: Could not load channel record, continuing with empty data. Reason follows:');
          Util.log('Database', reason);
          return {};
        })
        .then((record) => {
          Util.log('updateChannelRecord', `saving data: ${JSON.stringify(_.keys(newData))}`, VERBOSE_LOGGING);
          _.mergeWith(record, newData, (objValue, srcValue) => {
            if (srcValue === undefined) {
              // source values should not be undefined, but if that happens then
              // map them to null to properly "un-set" the key
              return null;
            }
            return undefined; // otherwise default to _.merge behavior
          });

          record.id = SLACKUP_CHANNEL_ID; // eslint-disable-line no-param-reassign

          return controller.storage.channels.saveAsync(record)
            .then(() => record);
        });
    },

  /**
   * @param {Boolean} skipKnownMembers An optimization to not hammer the api with user info requests.
   *                                   User info is unlikely to change over time, so we can skip it a lot and only cause
   *                                   teeny tiny UX bugs by not detecting user info changes after the bot is loaded.
   *                                   This is an internal tool so teeny tiny bugs aren't a big deal.
   */
    updateChannelMembers: (skipKnownMembers) => {
      Util.log('Database', `updateChannelMembers called, skipKnownMembers: ${skipKnownMembers}`, VERBOSE_LOGGING);
      return bot.api.channels.infoAsync({ channel: SLACKUP_CHANNEL_ID })
        .then((channelInfo) => {
          if (skipKnownMembers) {
            return controller.storage.channels.getAsync(SLACKUP_CHANNEL_ID)
              .catch((reason) => {
                Util.log('Database',
                  'updateChannelMembers: Could not load channel record, continuing with empty data. Reason follows:');
                Util.log('Database', reason);
                return {};
              })
              .then(({ userInfo }) =>
                _.filter(channelInfo.channel.members, (value, key) => !_.keys(userInfo).includes(key))
              );
          }

          return channelInfo.channel.members;
        })
        .then((members) => {
          const promises = _(members).map((user) =>
            bot.api.users.infoAsync({ user })
              .then((_info) => [user, _info.user])
          );
          return Promise.all(promises);
        })
        .then((pairs) => {
          const userInfo = _(pairs)
            .fromPairs()
            .omitBy(({ is_bot }) => is_bot) // eslint-disable-line camelcase
            .value();

          return Database.updateChannelRecord({ userInfo });
        })
        .then(({ userInfo }) => userInfo);
    }
  };

  return Database;
};
