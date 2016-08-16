const Promise = require('bluebird');
const _ = require('lodash');
const fse = Promise.promisifyAll(require('fs-extra'));
const moment = require('moment');

const POPES_FILE = './squid_popes.json';
const VERBOSE_LOGGING = 2;

module.exports = (controller, bot, SLACKUP_CHANNEL_ID, LOGGING_LEVEL = 1) => {
  const Util = require('./Util.js')(LOGGING_LEVEL); // eslint-disable-line global-require

  const Database = {
    addSquidPope: ({ id }) => {
      Util.log('Database', 'addSquidPope called.', VERBOSE_LOGGING);
      return Database.getPopes()
        .then((popes) => {
          if (_.includes(popes, id)) {
            return Promise.reject('That user is already in the pope queue!');
          }
          popes.push(id);
          return Database.setPopes(popes);
        })
        .then(() => id);
    },

    ensurePopesFile: () => {
      try {
        const stats = fse.statSync(POPES_FILE);
        if (stats.isFile()) {
          return Promise.resolve();
        }
      } catch (e) {
        // fall through
      }

      return fse.writeJsonAsync(POPES_FILE, { popes: [] });
    },

    getPopes: () =>
      Database.ensurePopesFile()
        .then(() => fse.readJsonAsync(POPES_FILE))
        .then(({ popes }) => popes),

    removeSquidPope: ({ id }) => {
      Util.log('Database', 'removeSquidPope called.', VERBOSE_LOGGING);
      return Database.getPopes()
        .then((popes) => {
          if (!_.includes(popes, id)) {
            return Promise.reject('That user is not in the squid popes queue!');
          }
          _.pull(popes, id);
          return Database.setPopes(popes);
        })
        .then(() => id);
    },

    setPopes: (popes) =>
      Database.ensurePopesFile()
        .then(() => fse.writeJsonAsync(POPES_FILE, { popes }))
        .then(() => popes),

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
    }
  };

  return Database;
};
