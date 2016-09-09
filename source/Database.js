const Promise = require('bluebird');
const _ = require('lodash');
const fse = Promise.promisifyAll(require('fs-extra'));
const moment = require('moment');

const POPES_FILE = './squid_popes.json';
const {
  VERBOSE_LOGGING
} = require('../resources/logging-constants');

module.exports = (controller, bot, LOGGING_LEVEL = 1) => {
  const Util = require('./Util.js')(controller, bot, LOGGING_LEVEL); // eslint-disable-line global-require

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

    getCurrentPopeId: () =>
      Database.getPopes()
        .then((popes) => {
          if (!popes.length) {
            return Promise.reject('There are no registered squid popes!');
          }

          return popes[0];
        }),

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
        .then(() => popes)
  };

  return Database;
};
