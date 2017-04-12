(function(window, document) {
  var SESSION_KEY = 'sumologic.logger.session';
  var SESSION_KEY_LEN = SESSION_KEY.length + 1;

  var currentLogs = [];

  function SumoLogger() {
    this.sendErrors = false;
    this.endpoint = '';
    this.interval = 0;
    this.session = '';
    this.timestamp = '';
    this.hostName = '';
    this.sourceCategory = '';
    this.name = '';
    this.successCB = false;
    this.errorCB = false;
  }

  function getUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var piece = Math.random() * 16 | 0;
      var elem = c == 'x' ? piece : (piece & 0x3 | 0x8);
      return elem.toString(16);
    });
  }

  function logToConsole(msg) {
    if (window && window.console && typeof window.console.log === 'function') {
      console.log(msg);
    }
  }

  function setSendError(logger, sendErrors) {
    logger.sendErrors = sendErrors;

    if(logger.sendErrors === true){
      var _onerror = window.onerror;
      window.onerror = function (msg, url, line, col){
        var msg = 'message: ' + msg + ', url: ' + url + ', line_num: ' + line + ', col_num: ' + col;
        logger.log({
          error: 'BrowserJsException',
          exception: msg
        });

        if (_onerror && typeof _onerror === 'function') {
          _onerror.apply(window, arguments);
        }
      };
    }
  }

  SumoLogger.prototype = {
    reset: function () {
      currentLogs = [];
      this.endpoint = '';
      this.interval = 0;
      this.session = '';
      this.timestamp = '';
      this.hostName = '';
      this.sourceCategory = '';
      this.name = '';
    },

    getCurrentLogs: function () {
      return currentLogs;
    },

    setSession: function (session) {
      if (session) {
        this.session = session;
        this.setCookie(this.session);
      } else if (!this.session) {
        this.session = this.getCookie();
        if (!this.session) {
          this.session = getUUID();
          this.setCookie(this.session);
        }
      }
    },

    config: function (opts) {
      if (!opts || typeof opts !== 'object') {
        logToConsole('Sumo Logic Logger requires you to set an endpoint.');
        return;
      }

      if (!opts.endpoint || opts.endpoint === '') {
        logToConsole('Sumo Logic Logger requires you to set an endpoint.');
        return;
      }

      this.endpoint = opts.endpoint;

      if (opts.interval) {
        this.interval = opts.interval;
      }

      this.setSession(opts.sessionKey ? opts.sessionKey : getUUID());

      if (opts.sendErrors) {
        setSendError(opts.sendErrors);
      }

      if (opts.sourceName) {
        this.name = opts.sourceName;
      }

      if (opts.sourceCategory) {
        this.sourceCategory = opts.sourceCategory;
      }

      if (opts.hostName) {
        this.hostName = opts.hostName;
      }

      if (opts.successCB) {
        this.successCB = opts.successCB;
      }

      if (opts.errorCB) {
        this.errorCB = opts.errorCB;
      }

      if (this.interval > 0) {
        var that = this;
        var sync = setInterval(function() {
          that.sendLogs()
        }, this.interval);
      }
    },

    log: function(msg, opts) {
      if (this.endpoint === '') {
        logToConsole('Sumo Logic Logger requires you to set an endpoint before pushing logs.');
        return;
      }
      if (!msg) {
        logToConsole('Sumo Logic Logger requires that you pass a value to log.');
        return;
      }

      opts = opts || false;

      var isArray = msg instanceof Array;
      var testEl = isArray ? msg[0] : msg;
      var type = typeof testEl;

      if (type === 'undefined' || (type === 'string' && testEl === '')) {
        logToConsole('Sumo Logic Logger requires that you pass a value to log.');
        return;
      } else if (type === 'object') {
        if (Object.keys(msg).length === 0) {
          logToConsole('Sumo Logic Logger requires that you pass a non-empty JSON object to log.');
          return;
        }
      }

      if (!isArray) {
        msg = [msg];
      }

      var ts = new Date();
      if (opts) {
        if (opts.sessionKey) {
          this.setSession(opts.sessionKey);
        }

        if (opts.timestamp) {
          ts = opts.timestamp;
        }
      }
      this.timestamp = ts.toUTCString();

      var that = this;
      var msgs = msg.map(function (item) {
        if (typeof item === "string") {
          return JSON.stringify({
            msg:       item,
            sessionId: that.session,
            url:       encodeURI(window.location),
            timestamp: that.timestamp
          });
        } else {
          var curr = {
            sessionId: that.session,
            url:       encodeURI(window.location),
            timestamp: that.timestamp
          };
          Object.keys(item).forEach(function (ky) {
            curr[ky] = item[ky];
          });
          return JSON.stringify(curr);
        }
      });

      currentLogs = currentLogs.concat(msgs);
      if (this.interval === 0) {
        this.sendLogs();
      }
    },

    logSent: function () {
      //no-op
    },

    sendLogs: function() {
      if (currentLogs.length === 0) {
        return;
      }

      try {
        var xmlHttp = new XMLHttpRequest();

        if (this.errorCB) {
          xmlHttp.addEventListener('error', this.errorCB);
        }
        if (this.successCB) {
          var successCB = this.successCB;
          xmlHttp.addEventListener('load', function() {
            currentLogs = [];
            successCB();
          });
        }
        xmlHttp.open('POST', this.endpoint + '?callback=logSent', true);
        xmlHttp.setRequestHeader('Content-Type', 'application/json');
        if (this.name !== '') {
          xmlHttp.setRequestHeader('X-Sumo-Name', this.name);
        }
        if (this.sourceCategory !== '') {
          xmlHttp.setRequestHeader('X-Sumo-Category', this.sourceCategory);
        }
        if (this.hostName !== '') {
          xmlHttp.setRequestHeader('X-Sumo-Host', this.hostName);
        }

        xmlHttp.send(currentLogs.join('\n'));
      } catch (ex) {
        if (this.errorCB) {
          this.errorCB();
        }
      }
    },

    flushLogs: function () {
      this.sendLogs();
    },

    emptyLogQueue: function () {
      currentLogs = [];
    },

    getCookie: function() {
      var cookie = document.cookie;
      var i = cookie.indexOf(SESSION_KEY);
      if (i < 0) {
        return false;
      } else {
        var end = cookie.indexOf(';', i + 1);
        end = end < 0 ? cookie.length : end;
        return cookie.slice(i + SESSION_KEY_LEN, end);
      }
    },

    setCookie: function(value) {
      document.cookie = SESSION_KEY + '=' + value;
    }
  };

  var existing = window.SLLogger;
  var logger = new SumoLogger();

  if(existing && existing.length ) {
    var i = 0;
    var eLength = existing.length;
    for (i = 0; i < eLength; i++) {
      logger.log(existing[i]);
    }
  }

  window.SLLogger = logger; // default global logger
  window.SumoLogger = SumoLogger;   // To instantiate additional loggers
})(window, document);
