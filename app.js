// Untitled Dice v0.0.8

// Customize these configuration settings:

var config = {
  // - Your app's id on moneypot.com
  app_id: 18,                             // <----------------------------- EDIT ME!
  // - Displayed in the navbar
  app_name: 'TestDice',
  // - For your faucet to work, you must register your site at Recaptcha
  // - https://www.google.com/recaptcha/intro/index.html
  recaptcha_sitekey: '6LeaXhgTAAAAAOW1XHHpP9rtqzzVLUf47o2Qckcj',  // <----- EDIT ME!
  redirect_uri: 'https://www.testdice.github.io',
  mp_browser_uri: 'https://www.moneypot.com',
  mp_api_uri: 'https://api.moneypot.com',
  chat_uri: 'https://socket.moneypot.com',
  // - Show debug output only if running on localhost
  debug: isRunningLocally(),
  // - Set this to true if you want users that come to http:// to be redirected
  //   to https://
  force_https_redirect: false,
  // - Configure the house edge (default is 1%)
  //   Must be between 0.0 (0%) and 1.0 (100%)
  house_edge: 0.01,
  minWager: 0.01,
  chat_buffer_size: 250,
  // - The amount of bets to show on screen in each tab
  bet_buffer_size: 25,
  bet_kind: false	// true = simple_dice, false = custom
};

////////////////////////////////////////////////////////////
// You shouldn't have to edit anything below this line
////////////////////////////////////////////////////////////

// Validate the configured house edge
(function() {
  var errString;

  if (config.house_edge <= 0.0) {
    errString = 'House edge must be > 0.0 (0%)';
  } else if (config.house_edge >= 100.0) {
    errString = 'House edge must be < 1.0 (100%)';
  }

  if (errString) {
    alert(errString);
    throw new Error(errString);
  }

  // Sanity check: Print house edge
  console.log('House Edge:', (config.house_edge * 100).toString() + '%');
})();

////////////////////////////////////////////////////////////

if (config.force_https_redirect && window.location.protocol !== "https:") {
  alert('why?')
  console.log(3);
  window.location.href = "https:" + window.location.href.substring(window.location.protocol.length);
}

// Hoist it. It's impl'd at bottom of page.
var socket;

// :: Bool
function isRunningLocally() {
  console.log(4);
  return /^localhost/.test(window.location.host);
}

var el = React.DOM;

// Generates UUID for uniquely tagging components
var genUuid = function() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};

var helpers = {};

// For displaying HH:MM timestamp in chat
//
// String (Date JSON) -> String
helpers.formatDateToTime = function(dateJson) {
  var date = new Date(dateJson);
  return _.padLeft(date.getHours().toString(), 2, '0') +
    ':' +
    _.padLeft(date.getMinutes().toString(), 2, '0');
};

// Number -> Number in range (0, 1)
helpers.multiplierToWinProb = function(multiplier) {
  console.assert(typeof multiplier === 'number');
  console.assert(multiplier > 0);

  // For example, n is 0.99 when house edge is 1%
  var n = 1.0 - config.house_edge;

  return n / multiplier;
};

helpers.calcNumber = function(cond, winProb) {
  console.assert(cond === '<' || cond === '>');
  console.assert(typeof winProb === 'number');

  if (cond === '<') {
    return winProb * 100;
  } else {
    return 99.99 - (winProb * 100);
  }
};

helpers.calcNumberCustom = function(cond, target) {
  console.assert(cond === '<' || cond === '>');
  console.assert(typeof target === 'number');
  
  temp = helpers.convertMpNrToReadableNr(target);

  if (cond === '<') {
    return temp;
  } else {
    return helpers.round10(99.999 - temp, -3);
  }
};

helpers.calcTarget = function(winProb) {
  console.assert(typeof winProb === 'number');
  
  var maxRange = Math.pow(2, 32);
  return Math.round(winProb * maxRange);
};

helpers.convertMpNrToReadableNr = function(number) {
  console.assert(typeof number === 'number');
  
  var maxRange = Math.pow(2, 32);
  var n = (number/maxRange)*100;
  return n.toFixed(3);
};

helpers.calcPayouts = function(cond, target, payout) {
  console.assert(cond === '<' || cond === '>');
  console.assert(typeof target === 'number');
  
  var maxRange = Math.pow(2, 32);

  if (cond === '<') {
    return [
		     { from: 0, to: target, value: payout }
		     //{ from: target, to: maxRange, value: 0 }
		   ];
  } else {
	target = maxRange - target;
    return [
		     //{ from: 0, to: target, value: 0 },
		     { from: target, to: maxRange, value: payout }
		   ];
  }
};

helpers.extractTarget = function(payout) {
  console.assert(typeof payout === 'object');
  
  var min = payout.from;
  var max = payout.to;

  if (min == 0) {
	// 0.001 is the compensation for range beginning at zero
	var str = '<' + (helpers.convertMpNrToReadableNr(max)).toString();
    return str;
  } else {
	var str = '>' + helpers.round10(helpers.convertMpNrToReadableNr(min) - 0.001, -3).toString();
    return str;
  }
};

helpers.check = function(kind) {
  if (kind == "simple_dice") {
	return true;
  } else {
	return false;
  }
};

helpers.percentage = function(amount, range) {
  return (100*amount/range).toFixed(2);
};

helpers.roleToLabelElement = function(role) {
  switch(role) {
    case 'ADMIN':
      return el.span({className: 'label label-danger'}, 'MP Staff');
    case 'MOD':
      return el.span({className: 'label label-info'}, 'Mod');
    case 'OWNER':
      return el.span({className: 'label label-primary'}, 'Owner');
    default:
      return '';
  }
};

// -> Object
helpers.getHashParams = function() {
  var hashParams = {};
  var e,
      a = /\+/g,  // Regex for replacing addition symbol with a space
      r = /([^&;=]+)=?([^&;]*)/g,
      d = function (s) { return decodeURIComponent(s.replace(a, " ")); },
      q = window.location.hash.substring(1);
  while (e = r.exec(q))
    hashParams[d(e[1])] = d(e[2]);
  return hashParams;
};

// getPrecision('1') -> 0
// getPrecision('.05') -> 2
// getPrecision('25e-100') -> 100
// getPrecision('2.5e-99') -> 100
helpers.getPrecision = function(num) {
  var match = (''+num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) { return 0; }
  return Math.max(
    0,
    // Number of digits right of decimal point.
    (match[1] ? match[1].length : 0) -
    // Adjust for scientific notation.
    (match[2] ? +match[2] : 0));
};

/**
 * Decimal adjustment of a number.
 *
 * @param {String}  type  The type of adjustment.
 * @param {Number}  value The number.
 * @param {Integer} exp   The exponent (the 10 logarithm of the adjustment base).
 * @returns {Number} The adjusted value.
 */
helpers.decimalAdjust = function(type, value, exp) {
  // If the exp is undefined or zero...
  if (typeof exp === 'undefined' || +exp === 0) {
    return Math[type](value);
  }
  value = +value;
  exp = +exp;
  // If the value is not a number or the exp is not an integer...
  if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0)) {
    return NaN;
  }
  // Shift
  value = value.toString().split('e');
  value = Math[type](+(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp)));
  // Shift back
  value = value.toString().split('e');
  return +(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp));
}

helpers.round10 = function(value, exp) {
  return helpers.decimalAdjust('round', value, exp);
};

helpers.floor10 = function(value, exp) {
  return helpers.decimalAdjust('floor', value, exp);
};

helpers.ceil10 = function(value, exp) {
  return helpers.decimalAdjust('ceil', value, exp);
};

////////////////////////////////////////////////////////////

// A weak Moneypot API abstraction
//
// Moneypot's API docs: https://www.moneypot.com/api-docs
var MoneyPot = (function() {

  var o = {};

  o.apiVersion = 'v1';

  // method: 'GET' | 'POST' | ...
  // endpoint: '/tokens/abcd-efgh-...'
  var noop = function() {};
  var makeMPRequest = function(method, bodyParams, endpoint, callbacks, overrideOpts) {

    if (!worldStore.state.accessToken)
      throw new Error('Must have accessToken set to call MoneyPot API');

    var url = config.mp_api_uri + '/' + o.apiVersion + endpoint;

    if (worldStore.state.accessToken) {
      url = url + '?access_token=' + worldStore.state.accessToken;
    }

    var ajaxOpts = {
      url:      url,
      dataType: 'json', // data type of response
      method:   method,
      data:     bodyParams ? JSON.stringify(bodyParams) : undefined,
      // By using text/plain, even though this is a JSON request,
      // we avoid preflight request. (Moneypot explicitly supports this)
      headers: {
        'Content-Type': 'text/plain'
      },
      // Callbacks
      success:  callbacks.success || noop,
      error:    callbacks.error || noop,
      complete: callbacks.complete || noop
    };

    $.ajax(_.merge({}, ajaxOpts, overrideOpts || {}));
  };

  o.listBets = function(callbacks) {
    var endpoint = '/list-bets';
    makeMPRequest('GET', undefined, endpoint, callbacks, {
      data: {
        app_id: config.app_id,
        limit: config.bet_buffer_size
      }
    });
  };

  o.getTokenInfo = function(callbacks) {
    var endpoint = '/token';
    makeMPRequest('GET', undefined, endpoint, callbacks);
  };

  o.generateBetHash = function(callbacks) {
    var endpoint = '/hashes';
    makeMPRequest('POST', undefined, endpoint, callbacks);
  };

  o.getDepositAddress = function(callbacks) {
    var endpoint = '/deposit-address';
    makeMPRequest('GET', undefined, endpoint, callbacks);
  };

  // gRecaptchaResponse is string response from google server
  // `callbacks.success` signature	is fn({ claim_id: Int, amoutn: Satoshis })
  o.claimFaucet = function(gRecaptchaResponse, callbacks) {
    console.log('Hitting POST /claim-faucet');
    var endpoint = '/claim-faucet';
    var body = { response: gRecaptchaResponse };
    makeMPRequest('POST', body, endpoint, callbacks);
  };

  // simple_dice
  // bodyParams is an object:
  // - wager: Int in satoshis
  // - client_seed: Int in range [0, 0^32-1)
  // - hash: BetHash
  // - cond: '<' | '>'
  // - number: Int in range [0, 99.99] that cond applies to
  // - payout: how many satoshis to pay out total on win (wager * multiplier)
  //
  // custom
  // bodyParams is an object:
  // - wager: Int in satoshis
  // - client_seed: Int in range [0, 0^32)
  // - hash: BetHash
  // - payout: array of payouts with 3 fields
  // 	- from: unsigned Int in range [0, 2^32]
  //	- to: unsigned Int in range (1, 2^32)
  //	- value: how many satoshis to pay out on win, multiple payouts can be
  //			 won if the ranges overlap
  o.placeBet = function(bodyParams, callbacks) {
	var endpoint = '';
	
	if (config.bet_kind) {
      endpoint = '/bets/simple-dice';
	} else {
      endpoint = '/bets/custom';
	}
    makeMPRequest('POST', bodyParams, endpoint, callbacks);
  };

  return o;
})();

////////////////////////////////////////////////////////////

var Dispatcher = new (function() {
  // Map of actionName -> [Callback]
  this.callbacks = {};

  var self = this;

  // Hook up a store's callback to receive dispatched actions from dispatcher
  //
  // Ex: Dispatcher.registerCallback('NEW_MESSAGE', function(message) {
  //       console.log('store received new message');
  //       self.state.messages.push(message);
  //       self.emitter.emit('change', self.state);
  //     });
  this.registerCallback = function(actionName, cb) {
    console.log('[Dispatcher] registering callback for:', actionName);

    if (!self.callbacks[actionName]) {
      self.callbacks[actionName] = [cb];
    } else {
      self.callbacks[actionName].push(cb);
    }
  };

  this.sendAction = function(actionName, payload) {
    console.log('[Dispatcher] received action:', actionName, payload);

    // Ensure this action has 1+ registered callbacks
    if (!self.callbacks[actionName]) {
      throw new Error('Unsupported actionName: ' + actionName);
    }

    // Dispatch payload to each registered callback for this action
    self.callbacks[actionName].forEach(function(cb) {
      cb(payload);
    });
  };
});

////////////////////////////////////////////////////////////

var Store = function(storeName, initState, initCallback) {

  this.state = initState;
  this.emitter = new EventEmitter();

  // Execute callback immediately once store (above state) is setup
  // This callback should be used by the store to register its callbacks
  // to the dispatcher upon initialization
  initCallback.call(this);

  var self = this;

  // Allow components to listen to store events (i.e. its 'change' event)
  this.on = function(eventName, cb) {
    self.emitter.on(eventName, cb);
  };

  this.off = function(eventName, cb) {
    self.emitter.off(eventName, cb);
  };
};

////////////////////////////////////////////////////////////

// Manage access_token //////////////////////////////////////
//
// - If access_token is in url, save it into localStorage.
//   `expires_in` (seconds until expiration) will also exist in url
//   so turn it into a date that we can compare

var access_token, expires_in, expires_at;

if (helpers.getHashParams().access_token) {
  console.log('[token manager] access_token in hash params');
  access_token = helpers.getHashParams().access_token;
  expires_in = helpers.getHashParams().expires_in;
  expires_at = new Date(Date.now() + (expires_in * 1000));

  localStorage.setItem('access_token', access_token);
  localStorage.setItem('expires_at', expires_at);
} else if (localStorage.access_token) {
  console.log('[token manager] access_token in localStorage');
  expires_at = localStorage.expires_at;
  // Only get access_token from localStorage if it expires
  // in a week or more. access_tokens are valid for two weeks
  if (expires_at && new Date(expires_at) > new Date(Date.now() + (1000 * 60 * 60 * 24 * 7))) {
    access_token = localStorage.access_token;
  } else {
    localStorage.removeItem('expires_at');
    localStorage.removeItem('access_token');
  }
} else {
  console.log('[token manager] no access token');
}

// Scrub fragment params from url.
if (window.history && window.history.replaceState) {
  console.log(1);
  window.history.replaceState({}, document.title, "/dice/");
} else {
  // For browsers that don't support html5 history api, just do it the old
  // fashioned way that leaves a trailing '#' in the url
  console.log(2);
  window.location.hash = '#';
}

////////////////////////////////////////////////////////////

var chatStore = new Store('chat', {
  messages: new CBuffer(config.chat_buffer_size),
  waitingForServer: false,
  userList: {},
  showUserList: false,
  loadingInitialMessages: true
}, function() {
  var self = this;

  // `data` is object received from socket auth
  Dispatcher.registerCallback('INIT_CHAT', function(data) {
    console.log('[ChatStore] received INIT_CHAT');
    // Give each one unique id
    var messages = data.chat.messages.map(function(message) {
      message.id = genUuid();
      return message;
    });

    // Reset the CBuffer since this event may fire multiple times,
    // e.g. upon every reconnection to chat-server.
    self.state.messages.empty();

    self.state.messages.push.apply(self.state.messages, messages);

    // Indicate that we're done with initial fetch
    self.state.loadingInitialMessages = false;

    // Load userList
    self.state.userList = data.chat.userlist;
    self.emitter.emit('change', self.state);
    self.emitter.emit('init');
  });

  Dispatcher.registerCallback('NEW_MESSAGE', function(message) {
    console.log('[ChatStore] received NEW_MESSAGE');
    message.id = genUuid();
    self.state.messages.push(message);

    self.emitter.emit('change', self.state);
    self.emitter.emit('new_message');
  });

  Dispatcher.registerCallback('TOGGLE_CHAT_USERLIST', function() {
    console.log('[ChatStore] received TOGGLE_CHAT_USERLIST');
    self.state.showUserList = !self.state.showUserList;
    self.emitter.emit('change', self.state);
  });

  // user is { id: Int, uname: String, role: 'admin' | 'mod' | 'owner' | 'member' }
  Dispatcher.registerCallback('USER_JOINED', function(user) {
    console.log('[ChatStore] received USER_JOINED:', user);
    self.state.userList[user.uname] = user;
    self.emitter.emit('change', self.state);
  });

  // user is { id: Int, uname: String, role: 'admin' | 'mod' | 'owner' | 'member' }
  Dispatcher.registerCallback('USER_LEFT', function(user) {
    console.log('[ChatStore] received USER_LEFT:', user);
    delete self.state.userList[user.uname];
    self.emitter.emit('change', self.state);
  });

  // Message is { text: String }
  Dispatcher.registerCallback('SEND_MESSAGE', function(text) {
    console.log('[ChatStore] received SEND_MESSAGE');
    self.state.waitingForServer = true;
    self.emitter.emit('change', self.state);
    socket.emit('new_message', { text: text }, function(err) {
      if (err) {
        alert('Chat Error: ' + err);
      }
    });
  });
});

var betStore = new Store('bet', {
  nextHash: undefined,
  wager: {
    str: String(config.minWager),
    num: config.minWager,
    error: undefined
  },
  multiplier: {
    str: '2.00',
    num: 2.00,
    error: undefined
  },
  // AUTOBETTING ADDITION		
  betNumbers: {		
    str: '1',		
    num: 1,		
    error: undefined		
  },		
  multiplyonWin: {		
    str: '1',		
    num: 1,		
    error: undefined		
  },		
  multiplyonLose: {		
    str: '1',		
    num: 1,		
    error: undefined		
  },		
  
  baseWager: {		
    str: '0.01',		
    num: 0.01,		
    error: undefined		
  },
  
  autoWager: {		
    str: '0.01',		
    num: 0.01,		
    error: undefined		
  },		
// END AUTOBETTING ADDITION
  hotkeysEnabled: false
}, function() {
  var self = this;

  Dispatcher.registerCallback('SET_NEXT_HASH', function(hexString) {
    self.state.nextHash = hexString;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('UPDATE_WAGER', function(newWager) {
    self.state.wager = _.merge({}, self.state.wager, newWager);

    var n = parseFloat(self.state.wager.str);

    // If n is a number, ensure it's at least 1 bit
    // if (isFinite(n)) {
    //   n = Math.max(n, 1);
    //   self.state.wager.str = n.toString();
    // }

    // Ensure wagerString is a number
    if (isNaN(n) || /[^\d|\.]/.test(n.toString()) || n < config.minWager) {
      self.state.wager.error = 'INVALID_WAGER';
    // Ensure user can afford balance
    } else if (n * 100 > worldStore.state.user.balance) {
      self.state.wager.error = 'CANNOT_AFFORD_WAGER';
      self.state.wager.num = n;
    } else {
      // wagerString is valid
      self.state.wager.error = null;
      self.state.wager.str = n.toString();
      self.state.wager.num = n;
    }

    self.emitter.emit('change', self.state);
  });
  // AUTOBETTING ADDITION		
  Dispatcher.registerCallback('UPDATE_BASEWAGER', function(newWager) {		
    self.state.baseWager = _.merge({}, self.state.baseWager, newWager);		
    //var n = parseInt(self.state.baseWager.str, 10);		
    var n = self.state.baseWager.str;
	// If n is a number, ensure it's at least 1 bit		
    //if (isFinite(n)) {		
    //  n = Math.max(n, 1);		
      self.state.baseWager.str = n.toString();		
    //}		
    // Ensure wagerString is a number		
    //if (isNaN(n) || /[^\d]/.test(n.toString())) {
	if (isNaN(n)) {		
      self.state.baseWager.error = 'INVALID_WAGER';		
    // Ensure user can afford balance		
    } else if (n * 100 > worldStore.state.user.balance) {		
      self.state.baseWager.error = 'CANNOT_AFFORD_WAGER';		
      self.state.baseWager.num = n;		
    } else {		
      // wagerString is valid		
      self.state.baseWager.error = null;		
      self.state.baseWager.str = n.toString();		
      self.state.baseWager.num = n;		
      self.state.autoWager.error = null;		
      self.state.autoWager.str = n.toString();		
      self.state.autoWager.num = n;		
    }		
    self.emitter.emit('change', self.state);		
  });		
  Dispatcher.registerCallback('UPDATE_ROLLSLIMIT', function(newLimit) {		
    self.state.betNumbers = _.merge({}, self.state.betNumbers, newLimit);		
    var n = parseInt(self.state.betNumbers.str, 10);		
    // If n is a number, ensure it's at least 1 roll		
    if (isFinite(n)) {		
      n = Math.max(n, 1);		
      self.state.betNumbers.str = n.toString();		
    }		
    // Ensure wagerString is a number		
    if (isNaN(n) || /[^\d]/.test(n.toString())) {		
      self.state.betNumbers.error = 'INVALID_LIMIT';		
    } else {		
      // wagerString is valid		
      self.state.betNumbers.error = null;		
      self.state.betNumbers.str = n.toString();		
      self.state.betNumbers.num = n;		
    }		
    self.emitter.emit('change', self.state);		
  });		
  Dispatcher.registerCallback('UPDATE_MULTIPLYONWIN', function(newMult) {		
    self.state.multiplyonWin = _.merge({}, self.state.multiplyonWin, newMult);		
    self.emitter.emit('change', self.state);		
  });		
  Dispatcher.registerCallback('UPDATE_MULTIPLYONLOSE', function(newMult) {		
    self.state.multiplyonLose = _.merge({}, self.state.multiplyonLose, newMult);		
    self.emitter.emit('change', self.state);		
  });		
// END AUTOBETTING ADDITION		


  Dispatcher.registerCallback('UPDATE_MULTIPLIER', function(newMult) {
    self.state.multiplier = _.merge({}, self.state.multiplier, newMult);
    self.emitter.emit('change', self.state);
  });
});

// The general store that holds all things until they are separated
// into smaller stores for performance.
var worldStore = new Store('world', {
  isLoading: true,
  user: undefined,
  accessToken: access_token,
  isRefreshingUser: false,
  hotkeysEnabled: false,
  // AUTOBETTING ADDITION		
  autobettingEnabled: false,		
  stoponwinEnabled: false,		
  resetonwinEnabled: false,		
  stoponloseEnabled: false,		
  resetonloseEnabled: false,		
  rollslimitEnabled: true,		
// END AUTOBETTING ADDITION
  currTab: 'ALL_BETS',
  // TODO: Turn this into myBets or something
  bets: new CBuffer(config.bet_buffer_size),
  // TODO: Fetch list on load alongside socket subscription
  allBets: new CBuffer(config.bet_buffer_size),
  grecaptcha: undefined
}, function() {
  var self = this;

  // TODO: Consider making these emit events unique to each callback
  // for more granular reaction.

  // data is object, note, assumes user is already an object
  Dispatcher.registerCallback('UPDATE_USER', function(data) {
    self.state.user = _.merge({}, self.state.user, data);
    self.emitter.emit('change', self.state);
  });

  // deprecate in favor of SET_USER
  Dispatcher.registerCallback('USER_LOGIN', function(user) {
    self.state.user = user;
    self.emitter.emit('change', self.state);
    self.emitter.emit('user_update');
  });

  // Replace with CLEAR_USER
  Dispatcher.registerCallback('USER_LOGOUT', function() {
    self.state.user = undefined;
    self.state.accessToken = undefined;
    localStorage.removeItem('expires_at');
    localStorage.removeItem('access_token');
    self.state.bets.empty();
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('START_LOADING', function() {
    self.state.isLoading = true;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('STOP_LOADING', function() {
    self.state.isLoading = false;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('CHANGE_TAB', function(tabName) {
    console.assert(typeof tabName === 'string');
    self.state.currTab = tabName;
    self.emitter.emit('change', self.state);
  });

  // This is only for my bets? Then change to 'NEW_MY_BET'
  Dispatcher.registerCallback('NEW_BET', function(bet) {
    console.assert(typeof bet === 'object');
    self.state.bets.push(bet);
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('NEW_ALL_BET', function(bet) {
    self.state.allBets.push(bet);
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('INIT_ALL_BETS', function(bets) {
    console.assert(_.isArray(bets));
    self.state.allBets.push.apply(self.state.allBets, bets);
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('TOGGLE_HOTKEYS', function() {
    self.state.hotkeysEnabled = !self.state.hotkeysEnabled;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('DISABLE_HOTKEYS', function() {
    self.state.hotkeysEnabled = false;
    self.emitter.emit('change', self.state);
  });
  // AUTOBETTING ADDITION		
  Dispatcher.registerCallback('TOGGLE_AUTOBETTING', function() {		
    self.state.autobettingEnabled = !self.state.autobettingEnabled;
    if (!self.state.autobettingEnabled) {
    betStore.state.autoWager.num = betStore.state.baseWager.num;
    }		
    self.emitter.emit('change', self.state);		
  });		
  		
  Dispatcher.registerCallback('TOGGLE_STOPONWIN', function() {		
    self.state.stoponwinEnabled = !self.state.stoponwinEnabled;		
    self.emitter.emit('change', self.state);		
  });		
  		
  Dispatcher.registerCallback('TOGGLE_RESETONWIN', function() {		
    self.state.resetonwinEnabled = !self.state.resetonwinEnabled;		
    self.emitter.emit('change', self.state);		
  });		
  		
  Dispatcher.registerCallback('TOGGLE_STOPONLOSE', function() {		
    self.state.stoponloseEnabled = !self.state.stoponloseEnabled;		
    self.emitter.emit('change', self.state);		
  });		
  		
  Dispatcher.registerCallback('TOGGLE_RESETONLOSE', function() {		
    self.state.resetonloseEnabled = !self.state.resetonloseEnabled;		
    self.emitter.emit('change', self.state);		
  });		
  		
  Dispatcher.registerCallback('TOGGLE_ROLLSLIMIT', function() {		
    self.state.rollslimitEnabled = !self.state.rollslimitEnabled;		
    self.emitter.emit('change', self.state);		
  });		
// END AUTOBETTING ADDITION

  Dispatcher.registerCallback('START_REFRESHING_USER', function() {
    self.state.isRefreshingUser = true;
    self.emitter.emit('change', self.state);
    MoneyPot.getTokenInfo({
      success: function(data) {
        console.log('Successfully loaded user from tokens endpoint', data);
        var user = data.auth.user;
        self.state.user = user;
        self.emitter.emit('change', self.state);
        self.emitter.emit('user_update');
      },
      error: function(err) {
        console.log('Error:', err);
      },
      complete: function() {
        Dispatcher.sendAction('STOP_REFRESHING_USER');
      }
    });
  });

  Dispatcher.registerCallback('STOP_REFRESHING_USER', function() {
    self.state.isRefreshingUser = false;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('GRECAPTCHA_LOADED', function(_grecaptcha) {
    self.state.grecaptcha = _grecaptcha;
    self.emitter.emit('grecaptcha_loaded');
  });

});

////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////

var UserBox = React.createClass({
  displayName: 'UserBox',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
    betStore.on('change', this._onStoreChange);
  },
  componentWillUnount: function() {
    worldStore.off('change', this._onStoreChange);
    betStore.off('change', this._onStoreChange);
  },
  _onLogout: function() {
    Dispatcher.sendAction('USER_LOGOUT');
  },
  _onRefreshUser: function() {
    Dispatcher.sendAction('START_REFRESHING_USER');
  },
  _openWithdrawPopup: function() {
    var windowUrl = config.mp_browser_uri + '/dialog/withdraw?app_id=' + config.app_id;
    var windowName = 'manage-auth';
    var windowOpts = [
      'width=420',
      'height=350',
      'left=100',
      'top=100'
    ].join(',');
    var windowRef = window.open(windowUrl, windowName, windowOpts);
    windowRef.focus();
    return false;
  },
  _openDepositPopup: function() {
    var windowUrl = config.mp_browser_uri + '/dialog/deposit?app_id=' + config.app_id;
    var windowName = 'manage-auth';
    var windowOpts = [
      'width=420',
      'height=350',
      'left=100',
      'top=100'
    ].join(',');
    var windowRef = window.open(windowUrl, windowName, windowOpts);
    windowRef.focus();
    return false;
  },
  render: function() {

    var innerNode;
    if (worldStore.state.isLoading) {
      innerNode = el.p(
        {className: 'navbar-text'},
        'Loading...'
      );
    } else if (worldStore.state.user) {
      innerNode =
        el.div(
          null,
          // Welcome username...
          el.span(
            {
              className: 'navbar-text',
              style: {
                marginRight: '0px'
              }
            },
            'Welcome '
          ),
          el.span(
            {
              className: 'navbar-text',
              style: {
                marginLeft: '5px',
                marginRight: '5px',
                color: '#093f7e'
              }
            },
            worldStore.state.user.uname
          ),
          // Balance
          el.span(
            {
              className: 'navbar-text badge',
              style: {marginRight: '5px'}
            },
            (worldStore.state.user.balance / 100000000).toFixed(8) + ' BTC',
            !worldStore.state.user.unconfirmed_balance ?
             '' :
             el.span(
               {style: { color: '#e67e22'}},
               ' + ' + (worldStore.state.user.unconfirmed_balance / 100) + ' bits pending'
             )
          ),
          // Refresh button
          el.button(
            {
              className: 'btn btn-link navbar-btn navbar-left ' + (worldStore.state.isRefreshingUser ? ' rotate' : ''),
              title: 'Refresh Balance',
              disabled: worldStore.state.isRefreshingUser,
              onClick: this._onRefreshUser,
              style: {
                paddingLeft: 0,
                paddingRight: 0,
                paddingTop: '6px',
              }
            },
            el.i(
              {
                className: 'fa fa-refresh',
                style: { color: '#000'}
              }
            )
          ),
          // Deposit/Withdraw popup buttons
          el.button(
            {
              type: 'button',
              className: 'btn btn-sm ' + (betStore.state.wager.error === 'CANNOT_AFFORD_WAGER' ? 'btn-success' : 'btn-success'),
              onClick: this._openDepositPopup,
              style: {
                marginRight: '10px',
                marginLeft: '10px',
                padding: '6px',
                marginTop: '0px'
              }
            },
            el.i(
              {
                className: 'fa fa-arrow-circle-down'
              }
            ),
            ' Deposit'
          ),
          el.button(
            {
              type: 'button',
              className: 'btn btn-warning btn-sm',
              onClick: this._openWithdrawPopup,
              style: {
                marginRight: '10px',
                padding: '6px',
                marginTop: '0px'
              }
            },
            el.i(
              {
                className: 'fa fa-arrow-circle-up'
              }
            ),
            ' Withdraw'
          ),
          // Logout link
          el.button(
            {
              type: 'button',
              onClick: this._onLogout,
              className: 'btn btn-link',
              style: {
                marginTop: '5px',
                color: '#333'
              }
            },
            'Logout'
          )
      );
    } else {
      // User needs to login
      innerNode = el.p(
        {className: 'navbar-text'},
        el.a(
          {
            href: config.mp_browser_uri + '/oauth/authorize' +
              '?app_id=' + config.app_id +
              '&redirect_uri=' + config.redirect_uri,
            className: 'btn btn-default'
          },
          'Login with Moneypot'
        )
      );
    }

    return el.div(
      {
        className: 'navbar-right'
      },
      innerNode
    );
  }
});

var AffiliateModal = React.createClass({
  displayName: 'AffiliateModal',

  render: function() {

    return el.div(
      {
        className: 'maodal maodal-hide',
        role: 'dialog'
      },
      el.div(
        {
          className: 'maodal-content'
        },
        el.div(
          {
            className: 'maodal-header'
          },
          el.button(
            {
              type: 'button',
              className: 'close',
              onClick: this.props.hideAffiliateModalHandler
            },
            el.i({className: 'fa fa-times'})
          ),
          el.h4(
            {
              className: 'maodal-title'
            },
            'Affiliate'
          )
        ),
        el.div(
          {
            className: 'maodal-body'
          },
          el.p(null,
            "Each user/visitor of ",el.b({style:{textDecoration:'underline'}}, "TestDice")," will automatically receive an affiliate link. To see all details, please click your user name in the menu, next your balance. The more users you refer, the more you can earn. Each time a referral of yours wins the Jackpot, you will get a ",el.b(null, "10% commission"),"  of the Jackpot amount. This could accumulate to a nice sum, and could become a great income"
          ),
          el.p(null, "Max profit is always adjusted according to MoneyPot Bank Roll"),
          el.p(null, el.b(null, "Important!")),
          el.p(null, "Please note that we will always deduct the ",el.b({style:{textDecoration:'underline'}}, "10% commission")," from the winner's Jackpot to pay the affiliate, even if the winner was not referred by an affiliate. The reason for this is that we want to give the affiliates a fair deal, and hinder players who were referred to us by an affiliate who choose to circumvent the affiliate link when opening their own account to avoid the affiliate payments. And yes, we will keep the 10% commission in case the winner was not referred to us, because it could very well be that he directly opened an account to avoid payments to the affiliate. We believe that if we are handling it this way, at the end, all of our customers will use an affiliate. Please show a fair attitude and don't try to be your own referrer.")
        )
      )
    );

  }
});

var MenuElements = React.createClass({
  displayName: 'MenuElements',
  render: function() {

    var innerNode =
    el.li(
      {
        onClick: this.props.showAffiliateModalHandler,
        style: {
          marginLeft: '20px'
        }
      },
      el.a(
        {
          href: '#',
          style: {
            color: '#333',
            backgroundColor: 'rgba(0,0,0,0) !important'
          }
        },
        'Affiliate'
      )
    );

    return el.div(
      {
        className: 'nav navbar-nav navbar-left'
      },
      innerNode
    );
  }
});

var Navbar = React.createClass({
  displayName: 'Navbar',
  render: function() {
    return el.div(
      {className: 'navbar'},
      el.div(
        {className: 'container-fluid'},
        el.div(
          {className: 'navbar-header'},
          el.a({
            className: 'navbar-brand', href:'/'},
            el.span(
              {className: 'glyphicon glyphicon-home'}
            ),
            ' ' + 'Dusty Dice')
        ),
        // Links
        // el.ul(
        //   {className: 'nav navbar-nav'},
        //   el.li(
        //     null,
        //     el.a(
        //       {
        //         href: config.mp_browser_uri + '/apps/' + config.app_id,
        //         target: '_blank'
        //       },
        //       'View on Moneypot ',
        //       // External site glyphicon
        //       el.span(
        //         {className: 'glyphicon glyphicon-new-window'}
        //       )
        //     )
        //   )
        // ),
        // Navbar menu elements
        React.createElement(MenuElements,
          {
            showAffiliateModalHandler: this.props.showAffiliateModalHandler,
            hideAffiliateModalHandler: this.props.hideAffiliateModalHandler
          }),
        // Userbox
        React.createElement(UserBox, null)
      )
    );
  }
});

var ChatBoxInput = React.createClass({
  displayName: 'ChatBoxInput',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    chatStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    chatStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  getInitialState: function() {
    return { text: '' };
  },
  // Whenever input changes
  _onChange: function(e) {
    this.setState({ text: e.target.value });
  },
  // When input contents are submitted to chat server
  _onSend: function() {
    var self = this;
    Dispatcher.sendAction('SEND_MESSAGE', this.state.text);
    this.setState({ text: '' });
  },
  _onFocus: function() {
    // When users click the chat input, turn off bet hotkeys so they
    // don't accidentally bet
    if (worldStore.state.hotkeysEnabled) {
      Dispatcher.sendAction('DISABLE_HOTKEYS');
    }
  },
  _onKeyPress: function(e) {
    var ENTER = 13;
    if (e.which === ENTER) {
      if (this.state.text.trim().length > 0) {
        this._onSend();
      }
    }
  },
  render: function() {
    return (
      el.div(
        {className: 'row'},
        el.div(
          {className: 'col-md-9'},
          chatStore.state.loadingInitialMessages ?
            el.div(
              {
                style: {marginTop: '7px'},
                className: 'text-muted'
              },
              el.span(
                {className: 'glyphicon glyphicon-refresh rotate'}
              ),
              ' Loading...'
            )
          :
            el.input(
              {
                id: 'chat-input',
                className: 'form-control',
                type: 'text',
                value: this.state.text,
                placeholder: worldStore.state.user ?
                  'Click here and begin typing...' :
                  'Login to chat',
                onChange: this._onChange,
                onKeyPress: this._onKeyPress,
                onFocus: this._onFocus,
                ref: 'input',
                // TODO: disable while fetching messages
                disabled: !worldStore.state.user || chatStore.state.loadingInitialMessages
              }
            )
        ),
        el.div(
          {className: 'col-md-3'},
          el.button(
            {
              type: 'button',
              className: 'btn btn-default btn-block',
              disabled: !worldStore.state.user ||
                chatStore.state.waitingForServer ||
                this.state.text.trim().length === 0,
              onClick: this._onSend
            },
            'Send'
          )
        )
      )
    );
  }
});

var ChatUserList = React.createClass({
  displayName: 'ChatUserList',
  render: function() {
    return (
      el.div(
        {className: 'panel panel-default'},
        el.div(
          {className: 'panel-heading'},
          'UserList'
        ),
        el.div(
          {className: 'panel-body'},
          el.ul(
            {},
            _.values(chatStore.state.userList).map(function(u) {
              return el.li(
                {
                  key: u.uname
                },
                helpers.roleToLabelElement(u.role),
                ' ' + u.uname
              );
            })
          )
        )
      )
    );
  }
});

var ChatBox = React.createClass({
  displayName: 'ChatBox',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  // New messages should only force scroll if user is scrolled near the bottom
  // already. This allows users to scroll back to earlier convo without being
  // forced to scroll to bottom when new messages arrive
  _onNewMessage: function() {
    var node = this.refs.chatListRef.getDOMNode();

    // Only scroll if user is within 100 pixels of last message
    var shouldScroll = function() {
      var distanceFromBottom = node.scrollHeight - ($(node).scrollTop() + $(node).innerHeight());
      console.log('DistanceFromBottom:', distanceFromBottom);
      return distanceFromBottom <= 100;
    };

    if (shouldScroll()) {
      this._scrollChat();
    }
  },
  _scrollChat: function() {
    var node = this.refs.chatListRef.getDOMNode();
    $(node).scrollTop(node.scrollHeight);
  },
  componentDidMount: function() {
    chatStore.on('change', this._onStoreChange);
    chatStore.on('new_message', this._onNewMessage);
    chatStore.on('init', this._scrollChat);
  },
  componentWillUnmount: function() {
    chatStore.off('change', this._onStoreChange);
    chatStore.off('new_message', this._onNewMessage);
    chatStore.off('init', this._scrollChat);
  },
  //
  _onUserListToggle: function() {
    Dispatcher.sendAction('TOGGLE_CHAT_USERLIST');
  },
  render: function() {
    return el.div(
      {id: 'chat-box'},
      el.div(
        {className: 'panel panel-default'},
        el.div(
          {className: 'panel-body'},
          el.ul(
            {className: 'chat-list list-unstyled', ref: 'chatListRef'},
            chatStore.state.messages.toArray().map(function(m) {
              return el.li(
                {
                  // Use message id as unique key
                  key: m.id
                },
                el.span(
                  {
                    style: {
                      fontFamily: 'monospace'
                    }
                  },
                  helpers.formatDateToTime(m.created_at),
                  ' '
                ),
                m.user ? helpers.roleToLabelElement(m.user.role) : '',
                m.user ? ' ' : '',
                el.code(
                  null,
                  m.user ?
                    // If chat message:
                    m.user.uname :
                    // If system message:
                    'SYSTEM :: ' + m.text
                ),
                m.user ?
                  // If chat message
                  el.span(null, ' ' + m.text) :
                  // If system message
                  ''
              );
            })
          )
        ),
        el.div(
          {className: 'panel-footer'},
          React.createElement(ChatBoxInput, null)
        )
      ),
      // After the chatbox panel
      // el.p(
      //   {
      //     className: 'text-right text-muted',
      //     style: { marginTop: '-15px' }
      //   },
      //   'Users online: ' + Object.keys(chatStore.state.userList).length + ' ',
      //   // Show/Hide userlist button
      //   el.button(
      //     {
      //       className: 'btn btn-show btn-default btn-xs',
      //       onClick: this._onUserListToggle,
      //     },
      //     chatStore.state.showUserList ? 'Hide' : 'Show'
      //   )
      // ),
      // Show userlist
      chatStore.state.showUserList ? React.createElement(ChatUserList, null) : ''
    );
  }
});

var BetBoxChance = React.createClass({
  displayName: 'BetBoxChance',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  render: function() {
    // 0.00 to 1.00
    var winProb = helpers.multiplierToWinProb(betStore.state.multiplier.num);

    var isError = betStore.state.multiplier.error || betStore.state.wager.error;

    // Just show '--' if chance can't be calculated
    var innerNode;
    if (isError) {
      innerNode = el.span(
        {className: 'lead'},
        ' --'
      );
    } else {
      innerNode = el.span(
        {className: 'lead', style: { fontWeight: 'bold' }},
        ' ' + (winProb * 100).toFixed(2).toString() + '%'
      );
    }

    return el.div(
      {},
      el.span(
        {className: 'lead', style: { fontWeight: 'bold' }},
        'Chance:'
      ),
      innerNode
    );
  }
});

var BetBoxProfit = React.createClass({
  displayName: 'BetBoxProfit',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  render: function() {
    var profit = betStore.state.wager.num * (betStore.state.multiplier.num - 1);

    var innerNode;
    if (betStore.state.multiplier.error || betStore.state.wager.error) {
      innerNode = el.span(
        {className: 'lead'},
        '--'
      );
    } else {
      innerNode = el.span(
        {
          className: 'lead',
          style: { color: '#39b54a', fontWeight: 'bold' }
        },
        '+' + profit.toFixed(2)
      );
    }

    return el.div(
      null,
      el.span(
        {className: 'lead', style: { fontWeight: 'bold' }},
        'Profit: '
      ),
      innerNode
    );
  }
});

var BetBoxMultiplier = React.createClass({
  displayName: 'BetBoxMultiplier',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  _validateMultiplier: function(newStr) {
    var num = parseFloat(newStr, 10);

    // If num is a number, ensure it's at least 0.01x
    // if (Number.isFinite(num)) {
    //   num = Math.max(num, 0.01);
    //   this.props.currBet.setIn(['multiplier', 'str'], num.toString());
    // }

    var isFloatRegexp = /^(\d*\.)?\d+$/;

    // Ensure str is a number
    if (isNaN(num) || !isFloatRegexp.test(newStr)) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'INVALID_MULTIPLIER' });
      // Ensure multiplier is >= 1.00x
    } else if (num < 1.01) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'MULTIPLIER_TOO_LOW' });
      // Ensure multiplier is <= max allowed multiplier (100x for now)
    } else if (num > 9900) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'MULTIPLIER_TOO_HIGH' });
      // Ensure no more than 2 decimal places of precision
    } else if (helpers.getPrecision(num) > 2) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'MULTIPLIER_TOO_PRECISE' });
      // multiplier str is valid
    } else {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', {
        num: num,
        error: null
      });
    }
  },
  _onMultiplierChange: function(e) {
    console.log('Multiplier changed');
    var str = e.target.value;
    console.log('You entered', str, 'as your multiplier');
    Dispatcher.sendAction('UPDATE_MULTIPLIER', { str: str });
    this._validateMultiplier(str);
  },
  render: function() {
    return el.div(
      {className: 'form-group'},
      el.p(
        {className: 'lead'},
        el.strong(
          {
            style: betStore.state.multiplier.error ? { color: 'red' } : {}
          },
          'Multiplier:')
      ),
      el.div(
        {className: 'input-group'},
        el.input(
          {
            type: 'text',
            value: betStore.state.multiplier.str,
            className: 'form-control input-lg',
            onChange: this._onMultiplierChange,
            disabled: !!worldStore.state.isLoading
          }
        ),
        el.span(
          {className: 'input-group-addon'},
          'x'
        )
      )
    );
  }
});

var BetBoxWager = React.createClass({
  displayName: 'BetBoxWager',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  _onBalanceChange: function() {
    // Force validation when user logs in
    // TODO: Re-force it when user refreshes
    Dispatcher.sendAction('UPDATE_WAGER', {});
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
    worldStore.on('user_update', this._onBalanceChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
    worldStore.off('user_update', this._onBalanceChange);
  },
  _onWagerChange: function(e) {
    var str = e.target.value;
    Dispatcher.sendAction('UPDATE_WAGER', { str: str });
  },
  _onHalveWager: function() {
    if(betStore.state.wager.num / 2 < config.minWager){
      return;
    }
    var newWager = betStore.state.wager.num / 2;
    Dispatcher.sendAction('UPDATE_WAGER', { str: newWager.toString() });
  },
  _onDoubleWager: function() {
    var n = betStore.state.wager.num * 2;
    Dispatcher.sendAction('UPDATE_WAGER', { str: n.toString() });

  },
  _onMaxWager: function() {
    // If user is logged in, use their balance as max wager
    var balanceBits;
    if (worldStore.state.user) {
      balanceBits = Math.floor(worldStore.state.user.balance / 100);
    } else {
      balanceBits = 42000;
    }
    Dispatcher.sendAction('UPDATE_WAGER', { str: balanceBits.toString() });
  },
  //
  render: function() {
    var style1 = { borderBottomLeftRadius: '0', borderBottomRightRadius: '0' };
    var style2 = { borderTopLeftRadius: '0' };
    var style3 = { borderTopRightRadius: '0' };
    return el.div(
      {className: 'form-group'},
      el.p(
        {className: 'lead'},
        el.strong(
          // If wagerError, make the label red
          betStore.state.wager.error ? { style: {color: 'red'} } : null,
          'Wager:')
      ),
      el.input(
        {
          value: betStore.state.wager.str,
          type: 'text',
          className: 'form-control input-lg',
          style: style1,
          onChange: this._onWagerChange,
          disabled: !!worldStore.state.isLoading,
          placeholder: 'Bits'
        }
      ),
      el.div(
        {className: 'btn-group btn-group-justified'},
        el.div(
          {className: 'btn-group'},
          el.button(
            {
              className: 'btn btn-default btn-md',
              type: 'button',
              style: style2,
              onClick: this._onHalveWager
            },
            '1/2x ', worldStore.state.hotkeysEnabled ? el.kbd(null, 'X') : ''
          )
        ),
        el.div(
          {className: 'btn-group'},
          el.button(
            {
              className: 'btn btn-default btn-md',
              type: 'button',
              onClick: this._onDoubleWager
            },
            '2x ', worldStore.state.hotkeysEnabled ? el.kbd(null, 'C') : ''
          )
        ),
        el.div(
          {className: 'btn-group'},
          el.button(
            {
              className: 'btn btn-default btn-md',
              type: 'button',
              style: style3,
              onClick: this._onMaxWager
            },
            'Max'
          )
        )
      )
    );
  }
});

var BetBoxButton = React.createClass({
  displayName: 'BetBoxButton',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
    betStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
    betStore.off('change', this._onStoreChange);
  },
  getInitialState: function() {
    return { waitingForServer: false };
  },
  // cond is '>' or '<'
  _makeBetHandler: function(cond) {
    var self = this;

    console.assert(cond === '<' || cond === '>');

    return function(e) {
      console.log('Placing bet...');

      // Indicate that we are waiting for server response
      self.setState({ waitingForServer: true });

      var hash = betStore.state.nextHash;
      console.assert(typeof hash === 'string');

      var wagerSatoshis = worldStore.state.autobettingEnabled ? betStore.state.autoWager.num * 100 : betStore.state.wager.num * 100;
      var multiplier = betStore.state.multiplier.num;
      var payoutSatoshis = wagerSatoshis * multiplier;
			var betProfit;

	  // choose between simple_dice or custom bets
	  if (config.bet_kind) {
	    var target = helpers.calcNumber(
          cond, helpers.multiplierToWinProb(multiplier)
        );
		
		var params = {
          wager: wagerSatoshis,
          client_seed: Math.floor(Math.random()*Math.pow(2,32)),
          hash: hash,
          cond: cond,
          target: target,
          payout: payoutSatoshis
        };
	  } else {
		var winProb = helpers.multiplierToWinProb(multiplier);
	    var target = helpers.calcTarget(winProb);
	    var payouts = helpers.calcPayouts(
	      cond, target, payoutSatoshis
	    );

        var params = {
          wager: wagerSatoshis,
          client_seed: Math.floor(Math.random()*Math.pow(2,32)),
          hash: hash,
          payouts: payouts
        };
	  }

      MoneyPot.placeBet(params, {
        success: function(bet) {
          console.log('Successfully placed bet:', bet);
          // Append to bet list
		  betProfit = bet.profit;
          // We don't get this info from the API, so assoc it for our use
          bet.meta = {
            cond: cond,
            number: target,
            hash: hash,
            isFair: CryptoJS.SHA256(bet.secret + '|' + bet.salt).toString() === hash
          };

          // Sync up with the bets we get from socket
          bet.wager = wagerSatoshis;
          bet.uname = worldStore.state.user.uname;

          Dispatcher.sendAction('NEW_BET', bet);

          // Update next bet hash
          Dispatcher.sendAction('SET_NEXT_HASH', bet.next_hash);

          // Update user balance
          Dispatcher.sendAction('UPDATE_USER', {
            balance: worldStore.state.user.balance + bet.profit
          });
        },
        error: function(xhr) {
          console.log('Error');
          if (xhr.responseJSON && xhr.responseJSON) {
            alert(xhr.responseJSON.error);
          } else {
            alert('Internal Error');
          }
        },
        complete: function() {
          self.setState({ waitingForServer: false });
          // Force re-validation of wager
// IF NOT AUTOBETTING
			if(!worldStore.state.autobettingEnabled) {
          Dispatcher.sendAction('UPDATE_WAGER', {
            str: betStore.state.wager.str
          });
		  // IF AUTOBETTING		
		  } else {		
// Check if number of rolls disabled		
		    if(!worldStore.state.rollslimitEnabled) {		
// Check bet result win or lose		
			  if(betProfit < 0) { // Lose bet		
// Check stop on lose		
				if(!worldStore.state.stoponloseEnabled) { // If not enabled		
// Check if reset on lose enabled		
				  if(!worldStore.state.resetonloseEnabled) { // If not enabled		
				    betStore.state.autoWager.num = betStore.state.autoWager.num*betStore.state.multiplyonLose.str;		
				  } else { // If reset enabled		
				    betStore.state.autoWager.num = betStore.state.baseWager.num;		
				  }		
                  if(cond === '<') {		
					$('#bet-lo').click();		
				  } else {		
					$('#bet-hi').click();		
				  }		
				} else {		
				  Dispatcher.sendAction('UPDATE_BASEWAGER', {		
					str: betStore.state.baseWager.str		
				  });		
				}		
			  } else if(betProfit >= 0) { // Win bet		
// Check stop on win		
				if(!worldStore.state.stoponwinEnabled) { // If not enabled		
// Check if reset on win enabled		
				  if(!worldStore.state.resetonwinEnabled) { // If not enabled		
				    betStore.state.autoWager.num = betStore.state.autoWager.num*betStore.state.multiplyonWin.str;		
				  } else { // If reset enabled		
				    betStore.state.autoWager.num = betStore.state.baseWager.num;		
				  }		
                  if(cond === '<') {		
					$('#bet-lo').click();		
				  } else {		
					$('#bet-hi').click();		
				  }		
				} else {		
				  Dispatcher.sendAction('UPDATE_BASEWAGER', {		
					str: betStore.state.baseWager.str		
				  });		
				}		
			  }		
// If number of rolls enabled		
			} else {		
// Check if number of rolls is still remain		
		      if(betStore.state.betNumbers.str > 1) {		
				betStore.state.betNumbers.str = betStore.state.betNumbers.str-1;		
// Check bet result win or lose		
			    if(betProfit < 0) { // Lose bet		
// Check stop on lose		
				  if(!worldStore.state.stoponloseEnabled) { // If not enabled		
// Check if reset on lose enabled		
				    if(!worldStore.state.resetonloseEnabled) { // If not enabled		
				      betStore.state.autoWager.num = betStore.state.autoWager.num*betStore.state.multiplyonLose.str;		
				    } else { // If reset enabled		
				      betStore.state.autoWager.num = betStore.state.baseWager.num;		
				    }		
                    if(cond === '<') {		
					  $('#bet-lo').click();		
				    } else {		
					  $('#bet-hi').click();		
				    }		
				  } else {		
				    Dispatcher.sendAction('UPDATE_BASEWAGER', {		
					  str: betStore.state.baseWager.str		
				    });		
				  }		
			    } else if(betProfit >= 0) { // Win bet		
// Check stop on win		
				  if(!worldStore.state.stoponwinEnabled) { // If not enabled		
// Check if reset on win enabled		
				    if(!worldStore.state.resetonwinEnabled) { // If not enabled		
				      betStore.state.autoWager.num = betStore.state.autoWager.num*betStore.state.multiplyonWin.str;		
				    } else { // If reset enabled		
				      betStore.state.autoWager.num = betStore.state.baseWager.num;		
				    }		
                    if(cond === '<') {		
					  $('#bet-lo').click();		
				    } else {		
					  $('#bet-hi').click();		
				    }		
				  } else {		
				    Dispatcher.sendAction('UPDATE_BASEWAGER', {		
					  str: betStore.state.baseWager.str		
				    });		
				  }		
			    }		
			  } else {		
				Dispatcher.sendAction('UPDATE_BASEWAGER', {		
				  str: betStore.state.baseWager.str		
				});		
			  }		
			}		
		  }		
// END AUTOBETTING
        }
      });
    };
  },
  render: function() {
    var innerNode;

    // TODO: Create error prop for each input
    var error = betStore.state.wager.error || betStore.state.multiplier.error;

    if (worldStore.state.isLoading) {
      // If app is loading, then just disable button until state change
      innerNode = el.button(
        {type: 'button', disabled: true, className: 'btn btn-lg btn-block btn-default'},
        'Loading...'
      );
    } else if (error) {
      // If there's a betbox error, then render button in error state

      var errorTranslations = {
        'CANNOT_AFFORD_WAGER': 'You cannot afford wager',
        'INVALID_WAGER': 'Invalid wager',
        'INVALID_MULTIPLIER': 'Invalid multiplier',
        'MULTIPLIER_TOO_PRECISE': 'Multiplier too precise',
        'MULTIPLIER_TOO_HIGH': 'Multiplier too high',
        'MULTIPLIER_TOO_LOW': 'Multiplier too low'
      };

      innerNode = el.button(
        {type: 'button',
         disabled: true,
         className: 'btn btn-lg btn-block btn-danger'},
        errorTranslations[error] || 'Invalid bet'
      );
    } else if (worldStore.state.user) {
      // If user is logged in, let them submit bet
      innerNode =
        el.div(
          {className: 'row'},
          // bet hi
          el.div(
            {className: 'col-xs-6'},
            el.button(
              {
                id: 'bet-hi',
                type: 'button',
                className: 'btn btn-lg btn-primary btn-block',
                onClick: this._makeBetHandler('>'),
                disabled: !!this.state.waitingForServer
              },
              'Bet Hi ', worldStore.state.hotkeysEnabled ? el.kbd(null, 'H') : ''
            )
          ),
          // bet lo
          el.div(
            {className: 'col-xs-6'},
            el.button(
              {
                id: 'bet-lo',
                type: 'button',
                className: 'btn btn-lg btn-primary btn-block',
                onClick: this._makeBetHandler('<'),
                disabled: !!this.state.waitingForServer
              },
              'Bet Lo ', worldStore.state.hotkeysEnabled ? el.kbd(null, 'L') : ''
            )
          )
        );
    } else {
      // If user isn't logged in, give them link to /oauth/authorize
      innerNode = el.a(
        {
          href: config.mp_browser_uri + '/oauth/authorize' +
            '?app_id=' + config.app_id +
            '&redirect_uri=' + config.redirect_uri,
          className: 'btn btn-lg btn-block btn-success'
        },
        'Login with MoneyPot'
      );
    }

    return el.div(
      null,
      el.div(
        {className: 'col-md-2',},
        (this.state.waitingForServer) ?
          el.span(
            {
              className: 'glyphicon glyphicon-refresh rotate',
              style: { marginTop: '15px' }
            }
          ) : ''
      ),
      el.div(
        {className: 'col-md-8'},
        innerNode
      )
    );
  }
});

var HotkeyToggle = React.createClass({
  displayName: 'HotkeyToggle',
  _onClick: function() {
    Dispatcher.sendAction('TOGGLE_HOTKEYS');
  },
  render: function() {
    return (
      el.div(
        {className: 'text-center'},
        el.button(
          {
            type: 'button',
            className: 'btn btn-default btn-sm',
            onClick: this._onClick,
            style: { marginTop: '-15px' }
          },
          'Hotkeys: ',
          worldStore.state.hotkeysEnabled ?
            el.span({className: 'label label-success'}, 'ON') :
          el.span({className: 'label label-default'}, 'OFF')
        )
      )
    );
  }
});
// AUTOBETTING ADDITION		
var AutobettingToggle = React.createClass({		
  displayName: 'AutobettingToggle',		
  _onClick: function() {		
    Dispatcher.sendAction('TOGGLE_AUTOBETTING');		
  },		
  render: function() {		
    return (		
      el.div(		
        {className: 'text-center'},		
        el.button(		
          {		
            type: 'button',		
            className: 'btn btn-default btn-sm',		
            onClick: this._onClick,		
            style: { marginTop: '-15px' }		
          },		
          'Auto Bets: ',		
          worldStore.state.autobettingEnabled ?		
            el.span({className: 'label label-success'}, 'ON') :		
          el.span({className: 'label label-default'}, 'OFF')		
        )		
      )		
    );		
  }		
});		
var StopOnWinToggle = React.createClass({		
  displayName: 'StopOnWinToggle',		
  _onClick: function() {		
    Dispatcher.sendAction('TOGGLE_STOPONWIN');		
  },		
  render: function() {		
    return (		
      el.div(		
        {className: 'text-center'},		
        el.button(		
          {		
            type: 'button',		
            className: 'btn btn-default btn-sm',		
            onClick: this._onClick,		
            style: { marginTop: '0px' }		
          },		
          '',		
          worldStore.state.stoponwinEnabled ?		
            el.span({className: 'label label-success'}, 'ON') :		
          el.span({className: 'label label-default'}, 'OFF')		
        )		
      )		
    );		
  }		
});		
var ResetOnWinToggle = React.createClass({		
  displayName: 'ResetOnWinToggle',		
  _onClick: function() {		
    Dispatcher.sendAction('TOGGLE_RESETONWIN');		
  },		
  render: function() {		
    return (		
      el.div(		
        {className: 'text-center'},		
        el.button(		
          {		
            type: 'button',		
            className: 'btn btn-default btn-sm',		
            onClick: this._onClick,		
            style: { marginTop: '0px' }		
          },		
          '',		
          worldStore.state.resetonwinEnabled ?		
            el.span({className: 'label label-success'}, 'ON') :		
          el.span({className: 'label label-default'}, 'OFF')		
        )		
      )		
    );		
  }		
});		
var StopOnLoseToggle = React.createClass({		
  displayName: 'StopOnLoseToggle',		
  _onClick: function() {		
    Dispatcher.sendAction('TOGGLE_STOPONLOSE');		
  },		
  render: function() {		
    return (		
      el.div(		
        {className: 'text-center'},		
        el.button(		
          {		
            type: 'button',		
            className: 'btn btn-default btn-sm',		
            onClick: this._onClick,		
            style: { marginTop: '0px' }		
          },		
          '',		
          worldStore.state.stoponloseEnabled ?		
            el.span({className: 'label label-success'}, 'ON') :		
          el.span({className: 'label label-default'}, 'OFF')		
        )		
      )		
    );		
  }		
});		
var ResetOnLoseToggle = React.createClass({		
  displayName: 'ResetOnLoseToggle',		
  _onClick: function() {		
    Dispatcher.sendAction('TOGGLE_RESETONLOSE');		
  },		
  render: function() {		
    return (		
      el.div(		
        {className: 'text-center'},		
        el.button(		
          {		
            type: 'button',		
            className: 'btn btn-default btn-sm',		
            onClick: this._onClick,		
            style: { marginTop: '0px' }		
          },		
          '',		
          worldStore.state.resetonloseEnabled ?		
            el.span({className: 'label label-success'}, 'ON') :		
          el.span({className: 'label label-default'}, 'OFF')		
        )		
      )		
    );		
  }		
});		
var RollsLimitToggle = React.createClass({		
  displayName: 'RollsLimitToggle',		
  _onClick: function() {		
    Dispatcher.sendAction('TOGGLE_ROLLSLIMIT');		
  },		
  render: function() {		
    return (		
      el.div(		
        {className: 'text-center'},		
        el.button(		
          {		
            type: 'button',		
            className: 'btn btn-default btn-sm',		
            onClick: this._onClick,		
            style: { marginTop: '0px' }		
          },		
          '',		
          worldStore.state.rollslimitEnabled ?		
            el.span({className: 'label label-success'}, 'ON') :		
          el.span({className: 'label label-default'}, 'OFF')		
        )		
      )		
    );		
  }		
});		
var AutoToolBox = React.createClass({		
  displayName: 'AutoToolBox',		
  _onStoreChange: function() {		
    this.forceUpdate();		
  },		
  componentDidMount: function() {		
    worldStore.on('change', this._onStoreChange);		
  },		
  componentWillUnmount: function() {		
    worldStore.off('change', this._onStoreChange);		
  },		
  render: function() {		
    return (		
      el.div(		
      null,		
// ON WIN PROPERTIES		
        el.div(		
          {className: 'col-xs-4', style: { textAlign: 'left' }},		
          el.div(		
            {className: 'row', style: { marginTop: '5px' }},		
            el.div(		
              {className: 'col-xs-15', style: { textAlign: 'left', marginTop: '5px' }},		
              'ON WIN'		
		    )		
		  ),		
          el.div(		
            {className: 'row', style: { marginTop: '5px' }},		
            el.div(		
              {className: 'col-xs-5', style: { textAlign: 'left' }},		
              React.createElement(StopOnWinToggle, null)		
		    ),		
            el.div(		
              {className: 'col-xs-7', style: { textAlign: 'left', marginTop: '5px' }},		
              'STOP'		
		    )		
		  ),		
          el.div(		
            {className: 'row', style: { marginTop: '5px' }},		
            el.div(		
              {className: 'col-xs-5', style: { textAlign: 'left' }},		
              worldStore.state.stoponwinEnabled ? '' : React.createElement(ResetOnWinToggle, null)		
		    ),		
            el.div(		
              {className: 'col-xs-7', style: { textAlign: 'left', marginTop: '5px' }},		
              worldStore.state.stoponwinEnabled ? '' : 'RESET'		
		    )		
		  ),		
          el.div(		
            {className: 'row', style: { marginTop: '5px' }},		
            worldStore.state.stoponwinEnabled ? '' : React.createElement(MultiplyOnWinBox, null)		
		  )		
        ),		
// ON LOSE PROPERTIES		
        el.div(		
          {className: 'col-xs-4', style: { textAlign: 'left' }},		
          el.div(		
            {className: 'row', style: { marginTop: '5px' }},		
            el.div(		
              {className: 'col-xs-15', style: { textAlign: 'left', marginTop: '5px' }},		
              'ON LOSE'		
		    )		
		  ),		
          el.div(		
            {className: 'row', style: { marginTop: '5px' }},		
            el.div(		
              {className: 'col-xs-5', style: { textAlign: 'left' }},		
              React.createElement(StopOnLoseToggle, null)		
		    ),		
            el.div(		
              {className: 'col-xs-7', style: { textAlign: 'left', marginTop: '5px' }},		
              'STOP'		
		    )		
		  ),		
          el.div(		
            {className: 'row', style: { marginTop: '5px' }},		
            el.div(		
              {className: 'col-xs-5', style: { textAlign: 'left' }},		
              worldStore.state.stoponloseEnabled ? '' : React.createElement(ResetOnLoseToggle, null)		
		    ),		
            el.div(		
              {className: 'col-xs-7', style: { textAlign: 'left', marginTop: '5px' }},		
              worldStore.state.stoponloseEnabled ? '' : 'RESET'		
		    )		
		  ),		
          el.div(		
            {className: 'row', style: { marginTop: '5px' }},		
            worldStore.state.stoponloseEnabled ? '' : React.createElement(MultiplyOnLoseBox, null)		
		  )		
        ),		
// ROLLS LIMIT PROPERTIES		
        el.div(		
          {className: 'col-xs-4', style: { textAlign: 'left' }},		
          el.div(		
            {className: 'row', style: { marginTop: '5px' }},		
            el.div(		
              {className: 'col-xs-15', style: { textAlign: 'left', marginTop: '5px' }},		
              'ROLL NUMBERS'		
		    )		
		  ),		
          el.div(		
            {className: 'row', style: { marginTop: '5px' }},		
            el.div(		
              {className: 'col-xs-5', style: { textAlign: 'left' }},		
              React.createElement(RollsLimitToggle, null)		
		    ),		
            el.div(		
              {className: 'col-xs-7', style: { textAlign: 'left', marginTop: '5px' }},		
              'LIMIT'		
		    )		
		  ),
// added by ox
          el.div(		
            {className: 'row', style: { marginTop: '5px' }},		
            el.div(		
              {className: 'col-xs-5', style: { textAlign: 'left', padding: '13px' }}		
              //worldStore.state.stoponloseEnabled ? '' : React.createElement(ResetOnLoseToggle, null)		
		    ),		
            el.div(		
              {className: 'col-xs-7', style: { textAlign: 'left', marginTop: '5px' }}		
              //worldStore.state.stoponloseEnabled ? '' : 'RESET'		
		    )		
		  ),	
// end add

		  
          el.div(		
            {className: 'row', style: { marginTop: '5px' }},		
            worldStore.state.rollslimitEnabled ? React.createElement(AutoRollsLimitBox, null) : ''		
		  )		
        )		
      )		
    );		
  }		
});		
var AutoBoxWager = React.createClass({		
  displayName: 'AutoBoxWager',		
  // Hookup to stores		
  _onStoreChange: function() {		
    this.forceUpdate();		
  },		
  _onBalanceChange: function() {		
    // Force validation when user logs in		
    // TODO: Re-force it when user refreshes		
    Dispatcher.sendAction('UPDATE_BASEWAGER', {});		
  },		
  componentDidMount: function() {		
    betStore.on('change', this._onStoreChange);		
    worldStore.on('change', this._onStoreChange);		
    worldStore.on('user_update', this._onBalanceChange);		
  },		
  componentWillUnmount: function() {		
    betStore.off('change', this._onStoreChange);		
    worldStore.off('change', this._onStoreChange);		
    worldStore.off('user_update', this._onBalanceChange);		
  },		
  _onWagerChange: function(e) {		
    var str = e.target.value;		
    Dispatcher.sendAction('UPDATE_BASEWAGER', { str: str });		
  },		
  //		
  render: function() {		
    return el.div(		
      {className: 'form-group'},		
      el.p(		
        {className: 'lead'},		
        el.strong(		
          // If wagerError, make the label red		
          betStore.state.wager.error ? { style: {color: 'red'} } : null,		
          'Wager:')		
      ),		
      el.input(		
        {		
          value: betStore.state.baseWager.str,		
          type: 'text',		
          className: 'form-control input-lg',		
          onChange: this._onWagerChange,		
          disabled: !!worldStore.state.isLoading,		
          placeholder: 'Bits'		
        }		
      )		
    );		
  }		
});		
var AutoRollsLimitBox = React.createClass({		
  displayName: 'AutoRollsLimitBox',		
  // Hookup to stores		
  _onStoreChange: function() {		
    this.forceUpdate();		
  },		
  componentDidMount: function() {		
    betStore.on('change', this._onStoreChange);		
    worldStore.on('change', this._onStoreChange);		
  },		
  componentWillUnmount: function() {		
    betStore.off('change', this._onStoreChange);		
    worldStore.off('change', this._onStoreChange);		
  },		
  _onLimitChange: function(e) {		
    var str = e.target.value;		
    Dispatcher.sendAction('UPDATE_ROLLSLIMIT', { str: str });		
  },		
  //		
  render: function() {		
    return (		
      el.div(		
      null,		
	    el.div(		
          {className: 'col-xs-15', style: { textAlign: 'left', marginTop: '5px' }},		
          'Number of rolls :'		
	    ),		
	    el.div(		
          {className: 'col-xs-15', style: { textAlign: 'left', marginTop: '0px' }},		
          el.div(		
            {className: 'form-group'},		
            el.div(		
              {className: 'input-group', style: { textAlign: 'left', width: '80%' }},		
              el.input(		
                {		
                  type: 'text',		
                  value: betStore.state.betNumbers.str,		
                  className: 'form-control input-sm',		
                  onChange: this._onLimitChange,		
                  disabled: !!worldStore.state.isLoading		
                }		
              ),		
              el.span(		
                {className: 'input-group-addon'},		
                '#'		
              )		
            )		
		  )		
		)		
	  )		
    );		
  }		
});		
var MultiplyOnWinBox = React.createClass({		
  displayName: 'MultiplyOnWinBox',		
  render: function() {		
    return (		
      el.div(		
      null,		
	    el.div(		
          {className: 'col-xs-15', style: { textAlign: 'left', marginTop: '5px' }},		
          worldStore.state.resetonwinEnabled ? '' : 'Multiply by :'		
	    ),		
	    el.div(		
          {className: 'col-sm-15', style: { textAlign: 'left', width: '80%' }},		
          worldStore.state.resetonwinEnabled ? '' : React.createElement(MultiplyOnWinInputBox, null)		
	    )		
	  )		
	);		
  }		
});		
var MultiplyOnLoseBox = React.createClass({		
  displayName: 'MultiplyOnLoseBox',		
  render: function() {		
    return (		
      el.div(		
      null,		
	    el.div(		
          {className: 'col-xs-15', style: { textAlign: 'left', marginTop: '5px' }},		
          worldStore.state.resetonloseEnabled ? '' : 'Multiply by :'		
	    ),		
	    el.div(		
          {className: 'col-sm-15', style: { textAlign: 'left', width: '80%'}},		
          worldStore.state.resetonloseEnabled ? '' : React.createElement(MultiplyOnLoseInputBox, null)		
	    )		
	  )		
	);		
  }		
});		
var MultiplyOnWinInputBox = React.createClass({		
  displayName: 'MultiplyOnWinInputBox',		
  // Hookup to stores		
  _onStoreChange: function() {		
    this.forceUpdate();		
  },		
  componentDidMount: function() {		
    betStore.on('change', this._onStoreChange);		
    worldStore.on('change', this._onStoreChange);		
  },		
  componentWillUnmount: function() {		
    betStore.off('change', this._onStoreChange);		
    worldStore.off('change', this._onStoreChange);		
  },		
  _validateMultiplier: function(newStr) {		
    var num = parseFloat(newStr, 10);		
    var isFloatRegexp = /^(\d*\.)?\d+$/;		
    // Ensure str is a number		
    if (isNaN(num) || !isFloatRegexp.test(newStr)) {		
      Dispatcher.sendAction('UPDATE_MULTIPLYONWIN', { error: 'INVALID_MULTIPLIER' });		
      // Ensure no more than 2 decimal places of precision		
    } else if (helpers.getPrecision(num) > 1) {		
      Dispatcher.sendAction('UPDATE_MULTIPLYONWIN', { error: 'MULTIPLIER_TOO_PRECISE' });		
      // multiplier str is valid		
    } else {		
      Dispatcher.sendAction('UPDATE_MULTIPLYONWIN', {		
        num: num,		
        error: null		
      });		
    }		
  },		
  _onMultiplyChange: function(e) {		
    var str = e.target.value;		
    Dispatcher.sendAction('UPDATE_MULTIPLYONWIN', { str: str });		
    this._validateMultiplier(str);		
  },		
  //		
  render: function() {		
    return el.div(		
      {className: 'form-group'},		
      el.div(		
        {className: 'input-group'},		
        el.input(		
          {		
            type: 'text',		
            value: betStore.state.multiplyonWin.str,		
            className: 'form-control input-sm',		
            onChange: this._onMultiplyChange,		
            disabled: !!worldStore.state.isLoading		
          }		
        ),		
        el.span(		
          {className: 'input-group-addon'},		
          'x'		
        )		
      )		
    );		
  }		
});		
var MultiplyOnLoseInputBox = React.createClass({		
  displayName: 'MultiplyOnLoseInputBox',		
  // Hookup to stores		
  _onStoreChange: function() {		
    this.forceUpdate();		
  },		
  componentDidMount: function() {		
    betStore.on('change', this._onStoreChange);		
    worldStore.on('change', this._onStoreChange);		
  },		
  componentWillUnmount: function() {		
    betStore.off('change', this._onStoreChange);		
    worldStore.off('change', this._onStoreChange);		
  },		
  _validateMultiplier: function(newStr) {		
    var num = parseFloat(newStr, 10);		
    var isFloatRegexp = /^(\d*\.)?\d+$/;		
    // Ensure str is a number		
    if (isNaN(num) || !isFloatRegexp.test(newStr)) {		
      Dispatcher.sendAction('UPDATE_MULTIPLYONLOSE', { error: 'INVALID_MULTIPLIER' });		
      // Ensure no more than 2 decimal places of precision		
    } else if (helpers.getPrecision(num) > 1) {		
      Dispatcher.sendAction('UPDATE_MULTIPLYONLOSE', { error: 'MULTIPLIER_TOO_PRECISE' });		
      // multiplier str is valid		
    } else {		
      Dispatcher.sendAction('UPDATE_MULTIPLYONLOSE', {		
        num: num,		
        error: null		
      });		
    }		
  },		
  _onMultiplyChange: function(e) {		
    var str = e.target.value;		
    Dispatcher.sendAction('UPDATE_MULTIPLYONLOSE', { str: str });		
    this._validateMultiplier(str);		
  },		
  //		
  render: function() {		
    return el.div(		
      {className: 'form-group'},		
      el.div(		
        {className: 'input-group'},		
        el.input(		
          {		
            type: 'text',		
            value: betStore.state.multiplyonLose.str,		
            className: 'form-control input-sm',		
            onChange: this._onMultiplyChange,		
            disabled: !!worldStore.state.isLoading		
          }		
        ),		
        el.span(		
          {className: 'input-group-addon'},		
          'x'		
        )		
      )		
    );		
  }		
});		
// END AUTOBETTING ADDITION		
// AUTOBETTING ADDITION (THIS BETBOX IS MODIFIED)

var BetBox = React.createClass({
  displayName: 'BetBox',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  render: function() {
    return el.div(
      null,
      el.div(
        {className: 'panel panel-default', style: {background: 'url(/dice/dust_bckg.jpg)'}},
        el.div(
          {className: 'panel-body'},
          el.div(
            {className: 'row'},
            el.div(
              {className: 'col-xs-6'},
              worldStore.state.autobettingEnabled ? React.createElement(AutoBoxWager, null) : React.createElement(BetBoxWager, null)
            ),
            el.div(
              {className: 'col-xs-6'},
              React.createElement(BetBoxMultiplier, null)
            ),
            // HR
            // el.div(
            //   {className: 'row'},
            //   el.div(
            //     {className: 'col-xs-12'},
            //     // el.hr(null)
            //   )
            // ),
            // Bet info bar
            el.div(
              null,
              el.div(
			  {className: 'col-sm-20'},		
			    worldStore.state.autobettingEnabled ? React.createElement(AutoToolBox, null) : ''		
              ),		
              el.div(
                {className: 'col-sm-6'},
                worldStore.state.autobettingEnabled ? '' : React.createElement(BetBoxProfit, null)
              ),
              el.div(
                {className: 'col-sm-6'},
                worldStore.state.autobettingEnabled ? '' : React.createElement(BetBoxChance, null)
              )
            )
          )
        ),
        el.div(
          {className: 'panel-footer clearfix'},
          React.createElement(BetBoxButton, null)
        )
      ),
      // AUTOBETTING ADDITION		
      el.div(		
        {className: 'col-xs-6', style: { textAlign: 'center' }},		
        React.createElement(AutobettingToggle, null)		
      ),		
// END AUTOBETTING ADDITION		
      el.div(		
        {className: 'col-xs-6', style: { textAlign: 'center' }},		
        React.createElement(HotkeyToggle, null)		
      )
    );
  }
});

var Tabs = React.createClass({
  displayName: 'Tabs',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  _makeTabChangeHandler: function(tabName) {
    var self = this;
    return function() {
      Dispatcher.sendAction('CHANGE_TAB', tabName);
    };
  },
  render: function() {
    return el.ul(
      {className: 'nav nav-tabs'},
      el.li(
        {className: worldStore.state.currTab === 'ALL_BETS' ? 'active' : ''},
        el.a(
          {
            href: 'javascript:void(0)',
            onClick: this._makeTabChangeHandler('ALL_BETS')
          },
          'All Bets'
        )
      ),
      // Only show MY BETS tab if user is logged in
      !worldStore.state.user ? '' :
        el.li(
          {className: worldStore.state.currTab === 'MY_BETS' ? 'active' : ''},
          el.a(
            {
              href: 'javascript:void(0)',
              onClick: this._makeTabChangeHandler('MY_BETS')
            },
            'My Bets'
          )
        ),
      // Display faucet tab even to guests so that they're aware that
      // this casino has one.
      !config.recaptcha_sitekey ? '' :
        el.li(
          {className: worldStore.state.currTab === 'FAUCET' ? 'active' : ''},
          el.a(
            {
              href: 'javascript:void(0)',
              onClick: this._makeTabChangeHandler('FAUCET')
            },
            el.span(null, 'Faucet ')
          )
        )
    );
  }
});

var MyBetsTabContent = React.createClass({
  displayName: 'MyBetsTabContent',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  render: function() {
    return el.div(
      null,
      el.table(
        {className: 'table'},
        el.thead(
          null,
          el.tr(
            null,
            el.th(null, 'ID'),
            el.th(null, 'Time'),
            el.th(null, 'User'),
            el.th(null, 'Wager'),
            el.th(null, 'Target'),
            el.th(null, 'Roll'),
            el.th(null, 'Profit')
          )
        ),
        el.tbody(
          null,
          worldStore.state.bets.toArray().map(function(bet) {
            return el.tr(
              {
                key: bet.bet_id || bet.id
              },
              // bet id
              el.td(
                null,
                el.a(
                  {
                    href: config.mp_browser_uri + '/bets/' + (bet.bet_id || bet.id),
                    target: '_blank'
                  },
                  bet.bet_id || bet.id
                )
              ),
              // Time
              el.td(
                null,
                helpers.formatDateToTime(bet.created_at)
              ),
              // User
              el.td(
                null,
                el.a(
                  {
                    href: config.mp_browser_uri + '/users/' + bet.uname,
                    target: '_blank'
                  },
                  bet.uname
                )
              ),
              // wager
              el.td(
                null,
                helpers.round10(bet.wager/100, -2),
                ' bits'
              ),
              // target
              el.td(
                null,
                config.bet_kind ? bet.meta.cond + bet.meta.number.toFixed(2) : bet.meta.cond + helpers.calcNumberCustom(bet.meta.cond, bet.meta.number)
              ),
              // roll
              el.td(
                null,
                config.bet_kind ? bet.outcome.toFixed(2) + ' ' : helpers.convertMpNrToReadableNr(bet.outcome) + ' ',
                bet.meta.isFair ?
                  el.span(
                    {className: 'label label-success'}, 'Verified') : ''
              ),
              // profit
              el.td(
                {style: {color: bet.profit > 0 ? 'green' : 'red'}},
                bet.profit > 0 ?
                  '+' + helpers.round10(bet.profit/100, -2) :
                  helpers.round10(bet.profit/100, -2),
                ' bits'
              )
            );
          }).reverse()
        )
      )
    );
  }
});

var FaucetTabContent = React.createClass({
  displayName: 'FaucetTabContent',
  getInitialState: function() {
    return {
      // SHOW_RECAPTCHA | SUCCESSFULLY_CLAIM | ALREADY_CLAIMED | WAITING_FOR_SERVER
      faucetState: 'SHOW_RECAPTCHA',
      // :: Integer that's updated after the claim from the server so we
      // can show user how much the claim was worth without hardcoding it
      // - It will be in satoshis
      claimAmount: undefined
    };
  },
  // This function is extracted so that we can call it on update and mount
  // when the window.grecaptcha instance loads
  _renderRecaptcha: function() {
    worldStore.state.grecaptcha.render(
      'recaptcha-target',
      {
        sitekey: config.recaptcha_sitekey,
        callback: this._onRecaptchaSubmit
      }
    );
  },
  // `response` is the g-recaptcha-response returned from google
  _onRecaptchaSubmit: function(response) {
    var self = this;
    console.log('recaptcha submitted: ', response);

    self.setState({ faucetState: 'WAITING_FOR_SERVER' });

    MoneyPot.claimFaucet(response, {
      // `data` is { claim_id: Int, amount: Satoshis }
      success: function(data) {
        Dispatcher.sendAction('UPDATE_USER', {
          balance: worldStore.state.user.balance + data.amount
        });
        self.setState({
          faucetState: 'SUCCESSFULLY_CLAIMED',
          claimAmount: data.amount
        });
        // self.props.faucetClaimedAt.update(function() {
        //   return new Date();
        // });
      },
      error: function(xhr, textStatus, errorThrown) {
        if (xhr.responseJSON && xhr.responseJSON.error === 'FAUCET_ALREADY_CLAIMED') {
          self.setState({ faucetState: 'ALREADY_CLAIMED' });
        }
      }
    });
  },
  // This component will mount before window.grecaptcha is loaded if user
  // clicks the Faucet tab before the recaptcha.js script loads, so don't assume
  // we have a grecaptcha instance
  componentDidMount: function() {
    if (worldStore.state.grecaptcha) {
      this._renderRecaptcha();
    }

    worldStore.on('grecaptcha_loaded', this._renderRecaptcha);
  },
  componentWillUnmount: function() {
    worldStore.off('grecaptcha_loaded', this._renderRecaptcha);
  },
  render: function() {

    // If user is not logged in, let them know only logged-in users can claim
    if (!worldStore.state.user) {
      return el.p(
        {className: 'lead'},
        'You must login to claim faucet'
      );
    }

    var innerNode;
    // SHOW_RECAPTCHA | SUCCESSFULLY_CLAIMED | ALREADY_CLAIMED | WAITING_FOR_SERVER
    switch(this.state.faucetState) {
    case 'SHOW_RECAPTCHA':
      innerNode = el.div(
        { id: 'recaptcha-target' },
        !!worldStore.state.grecaptcha ? '' : 'Loading...'
      );
      break;
    case 'SUCCESSFULLY_CLAIMED':
      innerNode = el.div(
        null,
        'Successfully claimed ' + this.state.claimAmount/100 + ' bits.' +
          // TODO: What's the real interval?
          ' You can claim again in 5 minutes.'
      );
      break;
    case 'ALREADY_CLAIMED':
      innerNode = el.div(
        null,
        'ALREADY_CLAIMED'
      );
      break;
    case 'WAITING_FOR_SERVER':
      innerNode = el.div(
        null,
        'WAITING_FOR_SERVER'
      );
      break;
    default:
      alert('Unhandled faucet state');
      return;
    }

    return el.div(
      null,
      innerNode
    );
  }
});

// props: { bet: Bet }
var BetRow = React.createClass({
  displayName: 'BetRow',
  render: function() {
    var bet = this.props.bet;

    if(bet.kind != 'simple_dice' && bet.kind != 'custom'){
      return el.div(null);
    }

// calculate bet info depending on bet kind
	var outcome, cond, target;
	if (helpers.check(bet.kind)){
	  // simple dice
	  outcome = bet.outcome.toFixed(2);
	  cond = bet.cond;
	  target = bet.target.toFixed(2);
	} else {
	  // custom
	  target = helpers.extractTarget(bet.payouts[0]).substring(1);
	  cond = helpers.extractTarget(bet.payouts[0]).substring(0,1);
	  outcome = helpers.convertMpNrToReadableNr(bet.raw_outcome);
	}
	
    return el.tr(
      {},
      // bet id
      el.td(
        null,
        el.a(
          {
            href: config.mp_browser_uri + '/bets/' + (bet.bet_id || bet.id),
            target: '_blank'
          },
          bet.bet_id || bet.id
        )
      ),
      // Time
      el.td(
        null,
        helpers.formatDateToTime(bet.created_at)
      ),
      // User
      el.td(
        null,
        el.a(
          {
            href: config.mp_browser_uri + '/users/' + bet.uname,
            target: '_blank'
          },
          bet.uname
        )
      ),
      // Wager
      el.td(
        null,
        helpers.round10(bet.wager/100, -2),
        ' bits'
      ),
      // Target
      el.td(
        // {
          // className: 'text-right',
          // style: {
            // fontFamily: 'monospace'
          // }
        // },
		null,
		helpers.check(bet.kind) ? bet.cond + bet.target.toFixed(2) : helpers.extractTarget(bet.payouts[0])
      ),
      // // Roll
      // el.td(
      //   null,
      //   bet.outcome
      // ),
      // Visual
      el.td(
        {
          style: {
            //position: 'relative'
            fontFamily: 'monospace'
          }
        },
        // progress bar container
        el.div(
          {
            className: 'progress',
            style: {
              minWidth: '100px',
              position: 'relative',
              marginBottom: 0,
              // make it thinner than default prog bar
              height: '10px'
            }
          },
          el.div(
            {
              className: 'progress-bar ' +
                (bet.profit >= 0 ?
                 'progress-bar-success' : 'progress-bar-grey') ,
              style: {
                float: cond === '<' ? 'left' : 'right',
                width: cond === '<' ?
                  target.toString() + '%' :
                  (100 - target).toString() + '%'
              }
            }
          ),
          el.div(
            {
              style: {
                position: 'absolute',
                left: 0,
                top: 0,
                width: outcome.toString() + '%',
                borderRight: '3px solid #333',
                height: '100%'
              }
            }
          )
        ),
        // arrow container
        el.div(
          {
            style: {
              position: 'relative',
              width: '100%',
              height: '15px'
            }
          },
          // arrow
          el.div(
            {
              style: {
                position: 'absolute',
                top: 0,
                left: (outcome - 1).toString() + '%'
              }
            },
            el.div(
              {
                style: {
                  width: '5em',
                  marginLeft: '-10px'
                }
              },
              // el.span(
              //   //{className: 'glyphicon glyphicon-triangle-top'}
              //   {className: 'glyphicon glyphicon-arrow-up'}
              // ),
              el.span(
                {style: {fontFamily: 'monospace'}},
                '' + outcome
              )
            )
          )
        )
      ),
      // Profit
      el.td(
        {
          style: {
            color: bet.profit > 0 ? 'green' : 'red',
            paddingLeft: '50px'
          }
        },
        bet.profit > 0 ?
          '+' + helpers.round10(bet.profit/100, -2) :
          helpers.round10(bet.profit/100, -2),
        ' bits'
      ),
	  el.td(
	    null,
		bet.raw_outcome
	  )
    );
  }
});

var AllBetsTabContent = React.createClass({
  displayName: 'AllBetsTabContent',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  render: function() {
    return el.div(
      null,
      el.table(
        {className: 'table'},
        el.thead(
          null,
          el.tr(
            null,
            el.th(null, 'ID'),
            el.th(null, 'Time'),
            el.th(null, 'User'),
            el.th(null, 'Wager'),
            el.th({className: 'text-right'}, 'Target'),
            // el.th(null, 'Roll'),
            el.th(null, 'Outcome'),
            el.th(
              {
                style: {
                  paddingLeft: '50px'
                }
              },
              'Profit'
            ),
			el.th(null, 'Raw Outcome')
          )
        ),
        el.tbody(
          null,
          worldStore.state.allBets.toArray().map(function(bet) {
            return React.createElement(BetRow, { bet: bet, key: bet.bet_id || bet.id });
          }).reverse()
        )
      )
    );
  }
});

var TabContent = React.createClass({
  displayName: 'TabContent',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  render: function() {
    switch(worldStore.state.currTab) {
      case 'FAUCET':
        return React.createElement(FaucetTabContent, null);
      case 'MY_BETS':
        return React.createElement(MyBetsTabContent, null);
      case 'ALL_BETS':
        return React.createElement(AllBetsTabContent, null);
      default:
        alert('Unsupported currTab value: ', worldStore.state.currTab);
        break;
    }
  }
});

var Footer = React.createClass({
  displayName: 'Footer',
  render: function() {
    return el.div(
      {
        className: 'text-center text-muted',
        style: {
          marginTop: '200px'
        }
      },
      'Powered by ',
      el.a(
        {
          href: 'https://www.moneypot.com'
        },
        'Moneypot'
      )
    );
  }
});

var App = React.createClass({
  displayName: 'App',
  _showAffiliateModal: function(){
    $('.maodal').removeClass('maodal-hide');
    $('.maodal').addClass('maodal-show');
    return false;
  },
  _hideAffiliateModal: function(){
    $('.maodal').removeClass('maodal-show');
    $('.maodal').addClass('maodal-hide');
    return false;
  },
  render: function() {
    return el.div(
      {className: 'container-fluid'},
      // Navbar
      React.createElement(Navbar,
        {
          showAffiliateModalHandler: this._showAffiliateModal,
          hideAffiliateModalHandler: this._hideAffiliateModal
        }
      ),
      // BetBox & ChatBox
      el.div(
        {
          className: 'row',
          style: {
            backgroundColor: '#333',
            padding: '10px'
          }
        },
        el.div(
          {className: 'col-sm-5'},
          React.createElement(BetBox, null)
        ),
        el.div(
          {className: 'col-sm-7'},
          React.createElement(ChatBox, null)
        )
      ),
      // Tabs
      el.div(
        {style: {marginTop: '15px'}},
        React.createElement(Tabs, null)
      ),
      // Tab Contents
      React.createElement(TabContent, null),
      // Footer
      React.createElement(Footer, null),
      // Affiliate modal
      React.createElement(AffiliateModal,
        {
          hideAffiliateModalHandler: this._hideAffiliateModal
        })
    );
  }
});

React.render(
  React.createElement(App, null),
  document.getElementById('app')
);

// If not accessToken,
// If accessToken, then
if (!worldStore.state.accessToken) {
  Dispatcher.sendAction('STOP_LOADING');
  connectToChatServer();
} else {
  // Load user from accessToken
  MoneyPot.getTokenInfo({
    success: function(data) {
      console.log('Successfully loaded user from tokens endpoint', data);
      var user = data.auth.user;
      Dispatcher.sendAction('USER_LOGIN', user);
    },
    error: function(err) {
      console.log('Error:', err);
    },
    complete: function() {
      Dispatcher.sendAction('STOP_LOADING');
      connectToChatServer();
    }
  });
  // Get next bet hash
  MoneyPot.generateBetHash({
    success: function(data) {
      Dispatcher.sendAction('SET_NEXT_HASH', data.hash);
    }
  });
  // Fetch latest all-bets to populate the all-bets tab
  MoneyPot.listBets({
    success: function(bets) {
      console.log('[MoneyPot.listBets]:', bets);
      Dispatcher.sendAction('INIT_ALL_BETS', bets.reverse());
    },
    error: function(err) {
      console.error('[MoneyPot.listBets] Error:', err);
    }
  });
}

////////////////////////////////////////////////////////////
// Hook up to chat server

function connectToChatServer() {
  config.access_token = worldStore.state.accessToken;
  config.subscriptions = ['CHAT', 'BETS', 'DEPOSITS'];

  console.log('Connecting to chat server. AccessToken:',
              worldStore.state.accessToken);

  socket = io(config.chat_uri);

  socket.on('connect', function() {
                // console.log('[socket] connected');
                var authRequest = {
                    app_id: config.app_id,
                    access_token: config.access_token,
                    subscriptions: config.subscriptions
                };
                socket.emit('auth', authRequest, function(err, data) {
                    // console.log('[auth] Success. Response:', data);
                    setInterval(function(){
                        $.post('/handler.php', {'action': 'update_users_online', 'app': 'dice_online_users', 'user': worldStore.state.user.uname, 'user_action': 'add'}, function(data){});
                    }, 10 * 1000);

                    if (err) {
                            // console.log('[socket] Auth failure:', err);
                            return;
                          }

                          // display history
                          for(var i in data.chat.messages){
                            var msg = data.chat.messages[i];
                            if(msg.created_at.toString() < config.msgFrom){
                                continue;
                            }

                            msg.id = msg.created_at.toString();
                            var msgHtml = '<li id="'+('' + msg.id)+'"';

                            if(escapeHtml(msg.text).indexOf('#jpWsicboCongrat#') === 0){
                                msgHtml += ' style="    background: url(https://www.jackpotracer.com/sicbo/assets/sicbotriplebanner5.jpg); background-size: 100% 100%; padding: 0 10%; padding-top: 20%; padding-bottom: 15%;"';
                            }

                            if(escapeHtml(msg.text).indexOf('#jpWpokerCongrat#') === 0){
                                msgHtml += ' style="background: url(https://www.jackpotracer.com/poker/assets/sprites/pokerjp_bckg.jpg); padding: 50px 17%; background-size: 100% 100%;"';
                            }

                            if(escapeHtml(msg.text).indexOf('#jpWinjprCongrat#') === 0){
                                msgHtml += ' style="background: url(https://www.jackpotracer.com/racing/assets/sprites/jpr5.jpg); padding: 15% 10%; background-size: 100% 100%;"';
                            }

                            if(escapeHtml(msg.text).indexOf('#jpWinnerCongrat#') === 0){
                                msgHtml += ' style="background: url(https://www.jackpotracer.com/dustlottery/assets/sprites/lottery6_bckg.jpg); background-size: 100% 100%; padding-bottom: 25%;"';
                            }

                            if(escapeHtml(msg.text).indexOf('#jpWinnerCong525#') === 0){
                                msgHtml += ' style="    background: url(https://www.jackpotracer.com/dustlottery/assets/sprites/lottery5_new_bckg.jpg);background-size: 100% 100%;padding: 0 30%;padding-top: 1%;padding-bottom: 20%;color: black;"';
                            }

                            msgHtml += '>';

                            var d = new Date(msg.created_at);
                            var dateStr = d.toDateString();
                            var timeStr = d.toTimeString();
                            var dateTimeStr = dateStr.slice(4, -5) + ' ' + timeStr.slice(0, 5);

                            msgHtml += '<span style="font-size: 12px; margin-top: 3px; display: inline-block;">' + dateTimeStr + '</span> ';

                            if(msg.user['role'] && msg.user['role'] != 'MEMBER'){
                                if(msg.user.role == 'OWNER'){
                                    var lblClass = 'label-danger';
                                    msg.user.role = 'MEMBER';
                                }
                                if(msg.user.role == 'MOD'){
                                    var lblClass = 'label-primary';
                                    if(allowedMods.indexOf(msg.user['name']) >= 0){
                                        var lblClass = 'label-success';
                                    }
                                    msg.user.role = 'MOD';
                                }
                                msg.user.role = 'HYPER';
                                msgHtml += '<span style="font-size: 9px; margin-top: 3px;" class="label ' + lblClass + '">' + msg.user.role + '</span>';
                            }
                            // var color = Sha256.hash(msg.user['uname']).replace('/[g-zG-Z]+/g', "0").substr(0,6);
                            msgHtml += '<span class="chatUname"><strong> '+msg.user['uname']+':</strong></span>  ';

                            if(escapeHtml(msg.text).indexOf('#jpWinnerCongrat#') === 0){
                                msgHtml += '<span style="color:yellow"><strong> '+escapeHtml(msg.text.substr(17))+'</strong></span></li>';
                            }
                            else if(escapeHtml(msg.text).indexOf('#jpWsicboCongrat#') === 0){
                                msgHtml += '<span style="color:lime"><strong> '+escapeHtml(msg.text.substr(17))+'</strong></span></li>';
                            }
                            else if(escapeHtml(msg.text).indexOf('#jpWinnerCong525#') === 0){
                                msgHtml += '<span style="color:black"><strong> '+escapeHtml(msg.text.substr(17))+'</strong></span></li>';
                            }
                            else if(escapeHtml(msg.text).indexOf('#jpWinjprCongrat#') === 0){
                                msgHtml += '<span style="color:red"><strong> '+escapeHtml(msg.text.substr(17))+'</strong></span></li>';
                            }
                            else if(escapeHtml(msg.text).indexOf('#jpWpokerCongrat#') === 0){
                                msgHtml += '<span style="color:red"><strong> '+escapeHtml(msg.text.substr(17))+'</strong></span></li>';
                            }
                            else if(escapeHtml(msg.text).indexOf('#winner4Congrat#') === 0){
                                msgHtml += '<span style="color:orange"><strong> '+escapeHtml(msg.text.substr(16))+'</strong></span></li>';
                            }
                            else if(escapeHtml(msg.text).indexOf('#winner5Congrat#') === 0){
                                msgHtml += '<span style="color:lime"><strong> '+escapeHtml(msg.text.substr(16))+'</strong></span></li>';
                            }
                            else{
                                msgHtml += '<span> '+escapeHtml(msg.text)+'</span></li>';
                            }

                            var uname = msg.user['uname'];
                            if(!$('#'+('' + msg.id)).length > -1 && (!$('#chatUser' + uname).length > 0) && !self.chatConnected){
                                $('#chatBody').append(msgHtml);
                                $('#chatBody').parent().scrollTop($('#chatBody').height());
                            }
                          }

                          // display users online
                          self.usersOnlineList = Object.keys(data.chat.userlist);
                          data.userlist = data.chat.userlist;
                          var usersCount=0;
                          for (var i in data.userlist) usersCount++;
                          $('#usersOnlineCount').text(usersCount + ' ');
                          for(var uname in data.userlist){
                            var userString = '<li id="chatUser'+uname+'">';
                            if(data.userlist[uname]['role'] && data.userlist[uname]['role'] != 'MEMBER'){
                                if(data.userlist[uname]['role'] == 'OWNER'){
                                    var lblClass = 'label-danger';
                                    data.userlist[uname]['role'] = 'DUSTY';

                                    // if(uname == self.username && allowedMods.indexOf(self.username) >= 0){
                                    //     $('#audioBtn').show();
                                    // }
                                }

                                if(data.userlist[uname]['role'] == 'MOD'){
                                    var lblClass = 'label-primary';
                                    if(allowedMods.indexOf(uname) >= 0){
                                        var lblClass = 'label-success';
                                    }
                                    data.userlist[uname]['role'] = 'DUSTY';

                                    // if(uname == self.username && allowedMods.indexOf(self.username) >= 0){
                                    //     $('#audioBtn').show();
                                    // }
                                }
                                data.userlist[uname]['role'] = 'DUSTY';
                                userString += '<span class="label '+lblClass+'">' + data.userlist[uname]['role'] + '</span>';
                            }
                            userString += '<span> ' + uname + '</span></li>';
                            if(!$('#chatUser' + uname).length > 0){
                                $('#usersOnline ul').append(userString);
                            }
                          }
                          self.chatConnected = true;
                });


    socket.on('disconnect', function() {
      console.log('[socket] Disconnected');
    });

    // When subscribed to DEPOSITS:

    socket.on('unconfirmed_balance_change', function(payload) {
      console.log('[socket] unconfirmed_balance_change:', payload);
      Dispatcher.sendAction('UPDATE_USER', {
        unconfirmed_balance: payload.balance
      });
    });

    socket.on('balance_change', function(payload) {
      console.log('[socket] (confirmed) balance_change:', payload);
      Dispatcher.sendAction('UPDATE_USER', {
        balance: payload.balance
      });
    });

   socket.on('new_message', function(message) {
                // console.log('[new_message]', message);
                message.id = message.created_at.toString();
                var msgHtml = '<li id="'+('' + message.id)+'"';

                if(escapeHtml(message.text).indexOf('#jpWsicboCongrat#') === 0){
                    msgHtml += ' style="    background: url(https://www.jackpotracer.com/sicbo/assets/sicbotriplebanner5.jpg); background-size: 100% 100%; padding: 0 10%; padding-top: 20%; padding-bottom: 15%;"';
                }

                if(escapeHtml(message.text).indexOf('#jpWpokerCongrat#') === 0){
                    msgHtml += ' style="background: url(https://www.jackpotracer.com/poker/assets/sprites/pokerjp_bckg.jpg); padding: 50px 17%; background-size: 100% 100%;"';
                }

                if(escapeHtml(message.text).indexOf('#jpWinjprCongrat#') === 0){
                    msgHtml += ' style="background: url(https://www.jackpotracer.com/racing/assets/sprites/jpr5.jpg); padding: 15% 10%; background-size: 100% 100%;"';
                }

                if(escapeHtml(message.text).indexOf('#jpWinnerCongrat#') === 0){
                    msgHtml += ' style="background: url(https://www.jackpotracer.com/dustlottery/assets/sprites/lottery6_bckg.jpg); background-size: 100% 100%; padding-bottom: 25%;"';
                }

                if(escapeHtml(message.text).indexOf('#jpWinnerCong525#') === 0){
                    msgHtml += ' style="background: url(https://www.jackpotracer.com/dustlottery/assets/sprites/lottery5_bckg.jpg); background-size: 100% 100%; padding: 30%; color: black;"';
                }

                msgHtml += '>';

                var d = new Date(message.created_at);
                var dateStr = d.toDateString();
                var timeStr = d.toTimeString();
                var dateTimeStr = dateStr.slice(4, -5) + ' ' + timeStr.slice(0, 5);

                msgHtml += '<span style="font-size: 12px; margin-top: 3px; display: inline-block;">' + dateTimeStr + '</span> ';

                if(message.user.role && message.user.role != 'MEMBER'){
                    if(message.user.role == 'OWNER'){
                        var lblClass = 'label-danger';
                        message.user.role = 'DUSTY';
                    }
                    if(message.user.role == 'MOD'){
                        var lblClass = 'label-primary';
                        if(allowedMods.indexOf(message.user.uname) >= 0){
                            var lblClass = 'label-success';
                        }
                        message.user.role = 'DUSTY';
                    }
                    message.user.role = 'DUSTY';
                    msgHtml += '<span style="font-size: 9px; margin-top: 3px;" class="label '+lblClass+'">' + message.user.role + '</span>';
                }
                // var color = Sha256.hash(message.user.uname).replace('/[g-zG-Z]+/g', "0").substr(0,6);
                msgHtml += '<span class="chatUname"><strong> '+message.user.uname+':</strong></span>  ';

                if(escapeHtml(message.text).indexOf('#jpWinnerCongrat#') === 0){
                    if(audioState){
                            var sirenaInterval = setInterval(function(){
                                document.getElementById('sirena').play();
                            }, 1000);
                            setTimeout(function(){
                                clearInterval(sirenaInterval);
                                document.getElementById('sirena').stop();
                            }, 30000);
                    }
                    msgHtml += '<span style="color:yellow"><strong> '+escapeHtml(message.text.substr(17))+'</strong></span></li>';
                }
                else if(escapeHtml(message.text).indexOf('#jpWsicboCongrat#') === 0){
                    msgHtml += '<span style="color:lime"><strong> '+escapeHtml(message.text.substr(17))+'</strong></span></li>';
                }
                else if(escapeHtml(message.text).indexOf('#jpWinjprCongrat#') === 0){
                    msgHtml += '<span style="color:red"><strong> '+escapeHtml(message.text.substr(17))+'</strong></span></li>';
                }
                else if(escapeHtml(message.text).indexOf('#jpWpokerCongrat#') === 0){
                    msgHtml += '<span style="color:red"><strong> '+escapeHtml(message.text.substr(17))+'</strong></span></li>';
                }
                else if(escapeHtml(message.text).indexOf('#jpWinnerCong525#') === 0){
                    if(audioState){
                        var sirena5Interval = setInterval(function(){
                            document.getElementById('sirena5').play();
                        }, 7000);
                        setTimeout(function(){
                            clearInterval(sirena5Interval);
                            document.getElementById('sirena5').stop();
                        }, 15000);
                    }
                    msgHtml += '<span style="color:cyan"><strong> '+escapeHtml(message.text.substr(16))+'</strong></span></li>';
                }
                else if(escapeHtml(message.text).indexOf('#winner4Congrat#') === 0){
                    msgHtml += '<span style="color:orange"><strong> '+escapeHtml(message.text.substr(16))+'</strong></span></li>';
                    if(audioState){
                        document.getElementById('chat_msg').play();
                    }
                }
                else if(escapeHtml(message.text).indexOf('#winner5Congrat#') === 0){
                    msgHtml += '<span style="color:lime"><strong> '+escapeHtml(message.text.substr(16))+'</strong></span></li>';
                    if(audioState){
                        document.getElementById('chat_msg').play();
                    }
                }
                else if(escapeHtml(message.text).indexOf('#winnerSpecJP#') === 0){
                    msgHtml += '<span style="color:#FF00FF"><strong> '+escapeHtml(message.text.substr(14))+'</strong></span></li>';
                }
                else{
                    msgHtml += '<span> '+escapeHtml(message.text)+'</span></li>';

                    if(String(username) != String(message.user.uname) && audioState){
                        document.getElementById('beep').play();
                    }
                }

                if(!$('#'+('' + message.id)).length > -1){
                    $('#chatBody').append(msgHtml);
                    $('#chatBody').parent().scrollTop($('#chatBody').height());
                }
            });

            socket.on('user_joined', function(data) {
                // console.log('[user_joined]', data);

                if(self.usersOnlineList.indexOf(data.uname) == -1){
                    self.usersOnlineList.push(data.uname);
                }

                var userString = '<li id="chatUser'+data.uname+'">';
                if(data.role == 'OWNER'){
                    var lblClass = 'label-danger';
                    data.role = 'DUSTY';
                }

                if(data.role && data.role != 'MEMBER'){
                    var lblClass = 'label-primary';
                    if(data.role == 'MOD'){
                        if(allowedMods.indexOf(data.uname) >= 0){
                            var lblClass = 'label-success';
                        }
                        data.role = 'DUSTY';
                    }
                    userString += '<span class="label '+lblClass+'">' + data.role + '</span>';
                }

                userString += '<span> ' + data.uname + '</span></li>';
                if(!$('#chatUser' + data.uname).length > 0){
                    $('#usersOnline ul').append(userString);
                    $('#usersOnlineCount').text(parseInt($('#usersOnlineCount').text()) + 1 + ' ');
                }
            });
            socket.on('user_left', function(data) {
                // console.log('[user_left]', data);

                if(self.usersOnlineList.indexOf(data.uname) > -1){
                    var ind = self.usersOnlineList.indexOf(data.uname);
                    self.usersOnlineList.splice(ind, 1);
                }

                if($('#chatUser' + data.uname).length > 0){
                    $('#chatUser' + data.uname).remove();
                    $('#usersOnlineCount').text(parseInt($('#usersOnlineCount').text()) - 1 + ' ');
                }
            });

    socket.on('new_bet', function(bet) {
      // console.log('[socket] New bet:', bet);

      // Ignore bets that aren't of kind "simple_dice" or "custom"
	  // with more than one payouts
	  if (bet.kind !== 'simple_dice' && bet.kind !== 'custom') {
	    console.log('[weird] received bet from socket that was NOT a simple_dice or custom bet');
	    return;
	  } else if (bet.kind === 'custom' && bet.payouts.length>1) {
		console.log('[weird] received bet from socket that was NOT a custom dice bet');
	    return;
	  }

	  Dispatcher.sendAction('NEW_ALL_BET', bet);
    });

    // Received when your client doesn't comply with chat-server api
    socket.on('client_error', function(text) {
      console.warn('[socket] Client error:', text);
    });

    // Once we connect to chat server, we send an auth message to join
    // this app's lobby channel.

    var authPayload = {
      app_id: config.app_id,
      access_token: worldStore.state.accessToken,
      subscriptions: ['CHAT', 'DEPOSITS', 'BETS']
    };

  });
}

// This function is passed to the recaptcha.js script and called when
// the script loads and exposes the window.grecaptcha object. We pass it
// as a prop into the faucet component so that the faucet can update when
// when grecaptcha is loaded.
function onRecaptchaLoad() {
  Dispatcher.sendAction('GRECAPTCHA_LOADED', grecaptcha);
}

$(document).on('keydown', function(e) {
  var H = 72, L = 76, C = 67, X = 88, keyCode = e.which;

  // Bail is hotkeys aren't currently enabled to prevent accidental bets
  if (!worldStore.state.hotkeysEnabled) {
    return;
  }

  // Bail if it's not a key we care about
  if (keyCode !== H && keyCode !== L && keyCode !== X && keyCode !== C) {
    return;
  }

  // TODO: Remind self which one I need and what they do ^_^;;
  e.stopPropagation();
  e.preventDefault();

  switch(keyCode) {
    case C:  // Increase wager
      var upWager = betStore.state.wager.num * 2;
      Dispatcher.sendAction('UPDATE_WAGER', {
        num: upWager,
        str: upWager.toString()
      });
      break;
    case X:  // Decrease wager
      var downWager = Math.floor(betStore.state.wager.num / 2);
      Dispatcher.sendAction('UPDATE_WAGER', {
        num: downWager,
        str: downWager.toString()
      });

      break;
    case L:  // Bet lo
      $('#bet-lo').click();
      break;
    case H:  // Bet hi
      $('#bet-hi').click();
      break;
    default:
      return;
  }
});

window.addEventListener('message', function(event) {
  if (event.origin === config.mp_browser_uri && event.data === 'UPDATE_BALANCE') {
    Dispatcher.sendAction('START_REFRESHING_USER');
  }
}, false);
