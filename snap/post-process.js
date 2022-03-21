const fs = require('fs');
const pathUtils = require('path');
const snapConfig = require('./snap.config.json');

const bundlePath = pathUtils.join(snapConfig.dist, snapConfig.outfileName);

let bundleString = fs.readFileSync(bundlePath, 'utf8');

// Alias `window` as `self`
bundleString = 'var self = window;\n'.concat(bundleString);

// The following two replacements modify two helpers in @babel/runtime,
// depended on by @solana/web3.js.
// Both functions contain the following expressions:
// module.exports.__esModule = true, module.exports["default"] = module.exports;
//
// By the time they are executed, module.exports has been frozen, probably by
// lockdown. Interestingly, the exact same string is injected by Browserify at
// the end of each Browserify module scope, and the removal of these expressions
// do not appear to cause any errors.

// This is the @solana/web3.js#@babel/runtime setPrototypeOf helper.
bundleString = bundleString.replace(
  `function _setPrototypeOf(o, p) {
  module.exports = _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) {
    o.__proto__ = p;
    return o;
  }, module.exports.__esModule = true, module.exports["default"] = module.exports;
  return _setPrototypeOf(o, p);
}`,
  `function _setPrototypeOf(o, p) {
  module.exports = _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) {
    o.__proto__ = p;
    return o;
  };
  return _setPrototypeOf(o, p);
}`,
);

// This is the @solana/web3.js#@babel/runtime getPrototypeOf helper.
bundleString = bundleString.replace(
`function _getPrototypeOf(o) {
  module.exports = _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) {
    return o.__proto__ || Object.getPrototypeOf(o);
  }, module.exports.__esModule = true, module.exports["default"] = module.exports;
  return _getPrototypeOf(o);
}`,
`function _getPrototypeOf(o) {
  module.exports = _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) {
    return o.__proto__ || Object.getPrototypeOf(o);
  };
  return _getPrototypeOf(o);
}`
);

// Convert a use of `setInterval` to `setTimeout`
bundleString = bundleString.replace(
`  _wsOnOpen() {
    this._rpcWebSocketConnected = true;
    this._rpcWebSocketHeartbeat = setInterval(() => {
      
      this._rpcWebSocket.notify('ping').catch(() => {});
    }, 5000);

    this._updateSubscriptions();
  }`,
`  _wsOnOpen() {
    this._rpcWebSocketConnected = true;

    const _pingWebsocket = () => this._rpcWebSocket.notify('ping').catch(() => {});
    const _pingWebsocketPolling = () => {
      _pingWebsocket();
      this._rpcWebSocketHeartbeat = setTimeout(_pingWebsocket, 5000);
    }
    this._rpcWebSocketHeartbeat = setTimeout(_pingWebsocketPolling, 5000);

    this._updateSubscriptions();
  }`
)

bundleString = bundleString.replace(
`  _wsOnClose(code) {
    if (this._rpcWebSocketHeartbeat) {
      clearInterval(this._rpcWebSocketHeartbeat);
      this._rpcWebSocketHeartbeat = null;
    }`,
`  _wsOnClose(code) {
    if (this._rpcWebSocketHeartbeat) {
      clearTimeout(this._rpcWebSocketHeartbeat);
      this._rpcWebSocketHeartbeat = null;
    }`
)

// This is in some dependency called "AgentManager". The "destroy" property
// appears to exist but it's not a function.
bundleString = bundleString.replace(
  `this._agent.destroy();`,
  `this._agent && typeof this._agent.destroy === 'function' && this._agent.destroy();`
)

fs.writeFileSync(bundlePath, bundleString);
