/************************************************************************
 *  Copyright 2010-2015 Brian McKelvey.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ***********************************************************************/

var util = require('util');
var utils = require('./utils');
var EventEmitter = require('events').EventEmitter;
var WebSocketFrame = require('./WebSocketFrame');
var BufferList = require('./FastBufferList');
var isValidUTF8 = require('utf-8-validate');
var bufferAllocUnsafe = utils.bufferAllocUnsafe;
var bufferFromString = utils.bufferFromString;

// Connected, fully-open, ready to send and receive frames
const STATE_OPEN = 'open';
// Received a close frame from the remote peer
const STATE_PEER_REQUESTED_CLOSE = 'peer_requested_close';
// Sent close frame to remote peer.  No further data can be sent.
const STATE_ENDING = 'ending';
// Connection is fully closed.  No further data can be sent or received.
const STATE_CLOSED = 'closed';

var setImmediateImpl = 'setImmediate' in global ? global.setImmediate.bind(global) : process.nextTick.bind(process);

var idCounter = 0;

function WebSocketConnection(socket, extensions, protocol, maskOutgoingPackets, config) {
  // Superclass Constructor
  EventEmitter.call(this);

  this._pingListenerCount = 0;
  this.on('newListener', function (ev) {
    if (ev === 'ping') {
      this._pingListenerCount++;
    }
  }).on('removeListener', function (ev) {
    if (ev === 'ping') {
      this._pingListenerCount--;
    }
  });

  this.config = config;
  this.socket = socket;
  this.protocol = protocol;
  this.extensions = extensions;
  this.remoteAddress = socket.remoteAddress;
  this.closeReasonCode = -1;
  this.closeDescription = null;
  this.closeEventEmitted = false;

  // We have to mask outgoing packets if we're acting as a WebSocket client.
  this.maskOutgoingPackets = maskOutgoingPackets;

  // We re-use the same buffers for the mask and frame header for all frames
  // received on each connection to avoid a small memory allocation for each
  // frame.
  this.maskBytes = bufferAllocUnsafe(4);
  this.frameHeader = bufferAllocUnsafe(10);

  // the BufferList will handle the data streaming in
  this.bufferList = new BufferList();

  // Prepare for receiving first frame
  this.currentFrame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
  this.fragmentationSize = 0; // data received so far...
  this.frameQueue = [];

  // Various bits of connection state
  this.connected = true;
  this.state = STATE_OPEN;
  this.waitingForCloseResponse = false;
  // Received TCP FIN, socket's readable stream is finished.
  this.receivedEnd = false;

  this.closeTimeout = this.config.closeTimeout;
  this.assembleFragments = this.config.assembleFragments;
  this.maxReceivedMessageSize = this.config.maxReceivedMessageSize;

  this.outputBufferFull = false;
  this.inputPaused = false;
  this.receivedDataHandler = this.processReceivedData.bind(this);
  this._closeTimerHandler = this.handleCloseTimer.bind(this);

  // Disable nagle algorithm?
  this.socket.setNoDelay(this.config.disableNagleAlgorithm);

  // Make sure there is no socket inactivity timeout
  this.socket.setTimeout(0);

  if (this.config.keepalive && !this.config.useNativeKeepalive) {
    if (typeof this.config.keepaliveInterval !== 'number') {
      throw new Error('keepaliveInterval must be specified and numeric ' + 'if keepalive is true.');
    }
    this._keepaliveTimerHandler = this.handleKeepaliveTimer.bind(this);
    this.setKeepaliveTimer();

    if (this.config.dropConnectionOnKeepaliveTimeout) {
      if (typeof this.config.keepaliveGracePeriod !== 'number') {
        throw new Error(
          'keepaliveGracePeriod  must be specified and ' + 'numeric if dropConnectionOnKeepaliveTimeout ' + 'is true.',
        );
      }
      this._gracePeriodTimerHandler = this.handleGracePeriodTimer.bind(this);
    }
  } else if (this.config.keepalive && this.config.useNativeKeepalive) {
    if (!('setKeepAlive' in this.socket)) {
      throw new Error('Unable to use native keepalive: unsupported by ' + 'this version of Node.');
    }
    this.socket.setKeepAlive(true, this.config.keepaliveInterval);
  }

  // The HTTP Client seems to subscribe to socket error events
  // and re-dispatch them in such a way that doesn't make sense
  // for users of our client, so we want to make sure nobody
  // else is listening for error events on the socket besides us.
  this.socket.removeAllListeners('error');
}

WebSocketConnection.CLOSE_REASON_NORMAL = 1000;
WebSocketConnection.CLOSE_REASON_GOING_AWAY = 1001;
WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR = 1002;
WebSocketConnection.CLOSE_REASON_UNPROCESSABLE_INPUT = 1003;
WebSocketConnection.CLOSE_REASON_RESERVED = 1004; // Reserved value.  Undefined meaning.
WebSocketConnection.CLOSE_REASON_NOT_PROVIDED = 1005; // Not to be used on the wire
WebSocketConnection.CLOSE_REASON_ABNORMAL = 1006; // Not to be used on the wire
WebSocketConnection.CLOSE_REASON_INVALID_DATA = 1007;
WebSocketConnection.CLOSE_REASON_POLICY_VIOLATION = 1008;
WebSocketConnection.CLOSE_REASON_MESSAGE_TOO_BIG = 1009;
WebSocketConnection.CLOSE_REASON_EXTENSION_REQUIRED = 1010;
WebSocketConnection.CLOSE_REASON_INTERNAL_SERVER_ERROR = 1011;
WebSocketConnection.CLOSE_REASON_TLS_HANDSHAKE_FAILED = 1015; // Not to be used on the wire

WebSocketConnection.CLOSE_DESCRIPTIONS = {
  1000: 'Normal connection closure',
  1001: 'Remote peer is going away',
  1002: 'Protocol error',
  1003: 'Unprocessable input',
  1004: 'Reserved',
  1005: 'Reason not provided',
  1006: 'Abnormal closure, no further detail available',
  1007: 'Invalid data received',
  1008: 'Policy violation',
  1009: 'Message too big',
  1010: 'Extension requested by client is required',
  1011: 'Internal Server Error',
  1015: 'TLS Handshake Failed',
};

function validateCloseReason(code) {
  if (code < 1000) {
    // Status codes in the range 0-999 are not used
    return false;
  }
  if (code >= 1000 && code <= 2999) {
    // Codes from 1000 - 2999 are reserved for use by the protocol.  Only
    // a few codes are defined, all others are currently illegal.
    return [1000, 1001, 1002, 1003, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015].indexOf(code) !== -1;
  }
  if (code >= 3000 && code <= 3999) {
    // Reserved for use by libraries, frameworks, and applications.
    // Should be registered with IANA.  Interpretation of these codes is
    // undefined by the WebSocket protocol.
    return true;
  }
  if (code >= 4000 && code <= 4999) {
    // Reserved for private use.  Interpretation of these codes is
    // undefined by the WebSocket protocol.
    return true;
  }
  if (code >= 5000) {
    return false;
  }
}

util.inherits(WebSocketConnection, EventEmitter);

WebSocketConnection.prototype._addSocketEventListeners = function () {
  this.socket.on('error', this.handleSocketError.bind(this));
  this.socket.on('end', this.handleSocketEnd.bind(this));
  this.socket.on('close', this.handleSocketClose.bind(this));
  this.socket.on('drain', this.handleSocketDrain.bind(this));
  this.socket.on('pause', this.handleSocketPause.bind(this));
  this.socket.on('resume', this.handleSocketResume.bind(this));
  this.socket.on('data', this.handleSocketData.bind(this));
};

// set or reset the keepalive timer when data is received.
WebSocketConnection.prototype.setKeepaliveTimer = function () {
  if (!this.config.keepalive || this.config.useNativeKeepalive) {
    return;
  }
  this.clearKeepaliveTimer();
  this.clearGracePeriodTimer();
  this._keepaliveTimeoutID = setTimeout(this._keepaliveTimerHandler, this.config.keepaliveInterval);
};

WebSocketConnection.prototype.clearKeepaliveTimer = function () {
  if (this._keepaliveTimeoutID) {
    clearTimeout(this._keepaliveTimeoutID);
  }
};

// No data has been received within config.keepaliveTimeout ms.
WebSocketConnection.prototype.handleKeepaliveTimer = function () {
  this._keepaliveTimeoutID = null;
  this.ping();

  // If we are configured to drop connections if the client doesn't respond
  // then set the grace period timer.
  if (this.config.dropConnectionOnKeepaliveTimeout) {
    this.setGracePeriodTimer();
  } else {
    // Otherwise reset the keepalive timer to send the next ping.
    this.setKeepaliveTimer();
  }
};

WebSocketConnection.prototype.setGracePeriodTimer = function () {
  this.clearGracePeriodTimer();
  this._gracePeriodTimeoutID = setTimeout(this._gracePeriodTimerHandler, this.config.keepaliveGracePeriod);
};

WebSocketConnection.prototype.clearGracePeriodTimer = function () {
  if (this._gracePeriodTimeoutID) {
    clearTimeout(this._gracePeriodTimeoutID);
  }
};

WebSocketConnection.prototype.handleGracePeriodTimer = function () {
  // If this is called, the client has not responded and is assumed dead.
  this._gracePeriodTimeoutID = null;
  this.drop(WebSocketConnection.CLOSE_REASON_ABNORMAL, 'Peer not responding.', true);
};

WebSocketConnection.prototype.handleSocketData = function (data) {
  // Reset the keepalive timer when receiving data of any kind.
  this.setKeepaliveTimer();

  // Add received data to our bufferList, which efficiently holds received
  // data chunks in a linked list of Buffer objects.
  this.bufferList.write(data);

  this.processReceivedData();
};

WebSocketConnection.prototype.processReceivedData = function () {
  // If we're not connected, we should ignore any data remaining on the buffer.
  if (!this.connected) {
    return;
  }

  // Receiving/parsing is expected to be halted when paused.
  if (this.inputPaused) {
    return;
  }

  var frame = this.currentFrame;

  // WebSocketFrame.prototype.addData returns true if all data necessary to
  // parse the frame was available.  It returns false if we are waiting for
  // more data to come in on the wire.
  if (!frame.addData(this.bufferList)) {
    return;
  }

  var self = this;

  // Handle possible parsing errors
  if (frame.protocolError) {
    // Something bad happened.. get rid of this client.
    process.nextTick(function () {
      self.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR, frame.dropReason);
    });
    return;
  } else if (frame.frameTooLarge) {
    process.nextTick(function () {
      self.drop(WebSocketConnection.CLOSE_REASON_MESSAGE_TOO_BIG, frame.dropReason);
    });
    return;
  }

  // For now since we don't support extensions, all RSV bits are illegal
  if (frame.rsv1 || frame.rsv2 || frame.rsv3) {
    process.nextTick(function () {
      self.drop(
        WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
        'Unsupported usage of rsv bits without negotiated extension.',
      );
    });
    return;
  }

  if (!this.assembleFragments) {
    process.nextTick(function () {
      self.emit('frame', frame);
    });
  }

  process.nextTick(function () {
    self.processFrame(frame);
  });

  this.currentFrame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);

  // If there's data remaining, schedule additional processing, but yield
  // for now so that other connections have a chance to have their data
  // processed.  We use setImmediate here instead of process.nextTick to
  // explicitly indicate that we wish for other I/O to be handled first.
  if (this.bufferList.length > 0) {
    setImmediateImpl(this.receivedDataHandler);
  }
};

WebSocketConnection.prototype.handleSocketError = function (error) {
  if (this.state === STATE_CLOSED) {
    // See https://github.com/theturtle32/WebSocket-Node/issues/288
    console.log("  --- Socket 'error' after 'close'");
    return;
  }
  this.closeReasonCode = WebSocketConnection.CLOSE_REASON_ABNORMAL;
  this.closeDescription = 'Socket Error: ' + error.syscall + ' ' + error.code;
  this.connected = false;
  this.state = STATE_CLOSED;
  this.fragmentationSize = 0;
  if (utils.eventEmitterListenerCount(this, 'error') > 0) {
    this.emit('error', error);
  }
  this.socket.destroy();
};

WebSocketConnection.prototype.handleSocketEnd = function () {
  this.receivedEnd = true;
  if (this.state === STATE_CLOSED) {
    // When using the TLS module, sometimes the socket will emit 'end'
    // after it emits 'close'.  I don't think that's correct behavior,
    // but we should deal with it gracefully by ignoring it.
    console.log("  --- Socket 'end' after 'close'");
    return;
  }
  if (this.state !== STATE_PEER_REQUESTED_CLOSE && this.state !== STATE_ENDING) {
    // console.log('  --- UNEXPECTED socket end.');
    this.socket.end();
  }
};

WebSocketConnection.prototype.handleSocketClose = function (hadError) {
  this.socketHadError = hadError;
  this.connected = false;
  this.state = STATE_CLOSED;
  // If closeReasonCode is still set to -1 at this point then we must
  // not have received a close frame!!
  if (this.closeReasonCode === -1) {
    this.closeReasonCode = WebSocketConnection.CLOSE_REASON_ABNORMAL;
    this.closeDescription = 'Connection dropped by remote peer.';
  }
  this.clearCloseTimer();
  this.clearKeepaliveTimer();
  this.clearGracePeriodTimer();
  if (!this.closeEventEmitted) {
    this.closeEventEmitted = true;
    this.emit('close', this.closeReasonCode, this.closeDescription);
  }
};

WebSocketConnection.prototype.handleSocketDrain = function () {
  this.outputBufferFull = false;
  this.emit('drain');
};

WebSocketConnection.prototype.handleSocketPause = function () {
  this.inputPaused = true;
  this.emit('pause');
};

WebSocketConnection.prototype.handleSocketResume = function () {
  this.inputPaused = false;
  this.emit('resume');
  this.processReceivedData();
};

WebSocketConnection.prototype.pause = function () {
  this.socket.pause();
};

WebSocketConnection.prototype.resume = function () {
  this.socket.resume();
};

WebSocketConnection.prototype.close = function (reasonCode, description) {
  if (this.connected) {
    if ('number' !== typeof reasonCode) {
      reasonCode = WebSocketConnection.CLOSE_REASON_NORMAL;
    }
    if (!validateCloseReason(reasonCode)) {
      throw new Error('Close code ' + reasonCode + ' is not valid.');
    }
    if ('string' !== typeof description) {
      description = WebSocketConnection.CLOSE_DESCRIPTIONS[reasonCode];
    }
    this.closeReasonCode = reasonCode;
    this.closeDescription = description;
    this.setCloseTimer();
    this.sendCloseFrame(this.closeReasonCode, this.closeDescription);
    this.state = STATE_ENDING;
    this.connected = false;
  }
};

WebSocketConnection.prototype.drop = function (reasonCode, description, skipCloseFrame) {
  if (typeof reasonCode !== 'number') {
    reasonCode = WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR;
  }

  if (typeof description !== 'string') {
    // If no description is provided, try to look one up based on the
    // specified reasonCode.
    description = WebSocketConnection.CLOSE_DESCRIPTIONS[reasonCode];
  }

  this.closeReasonCode = reasonCode;
  this.closeDescription = description;
  this.frameQueue = [];
  this.fragmentationSize = 0;
  if (!skipCloseFrame) {
    this.sendCloseFrame(reasonCode, description);
  }
  this.connected = false;
  this.state = STATE_CLOSED;
  this.clearCloseTimer();
  this.clearKeepaliveTimer();
  this.clearGracePeriodTimer();

  if (!this.closeEventEmitted) {
    this.closeEventEmitted = true;

    this.emit('close', this.closeReasonCode, this.closeDescription);
  }

  this.socket.destroy();
};

WebSocketConnection.prototype.setCloseTimer = function () {
  this.clearCloseTimer();
  this.waitingForCloseResponse = true;
  this.closeTimer = setTimeout(this._closeTimerHandler, this.closeTimeout);
};

WebSocketConnection.prototype.clearCloseTimer = function () {
  if (this.closeTimer) {
    clearTimeout(this.closeTimer);
    this.waitingForCloseResponse = false;
    this.closeTimer = null;
  }
};

WebSocketConnection.prototype.handleCloseTimer = function () {
  this.closeTimer = null;
  if (this.waitingForCloseResponse) {
    this.waitingForCloseResponse = false;
    this.state = STATE_CLOSED;
    this.socket.end();
  }
};

WebSocketConnection.prototype.processFrame = function (frame) {
  // Any non-control opcode besides 0x00 (continuation) received in the
  // middle of a fragmented message is illegal.
  if (this.frameQueue.length !== 0 && frame.opcode > 0x00 && frame.opcode < 0x08) {
    this.drop(
      WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
      'Illegal frame opcode 0x' + frame.opcode.toString(16) + ' ' + 'received in middle of fragmented message.',
    );
    return;
  }

  switch (frame.opcode) {
    case 0x02: // WebSocketFrame.BINARY_FRAME
      if (this.assembleFragments) {
        if (frame.fin) {
          // Complete single-frame message received
          this.emit('message', {
            type: 'binary',
            binaryData: frame.binaryPayload,
          });
        } else {
          // beginning of a fragmented message
          this.frameQueue.push(frame);
          this.fragmentationSize = frame.length;
        }
      }
      break;
    case 0x01: // WebSocketFrame.TEXT_FRAME
      if (this.assembleFragments) {
        if (frame.fin) {
          if (!isValidUTF8(frame.binaryPayload)) {
            this.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, 'Invalid UTF-8 Data Received');
            return;
          }
          // Complete single-frame message received
          this.emit('message', {
            type: 'utf8',
            utf8Data: frame.binaryPayload.toString('utf8'),
          });
        } else {
          // beginning of a fragmented message
          this.frameQueue.push(frame);
          this.fragmentationSize = frame.length;
        }
      }
      break;
    case 0x00: // WebSocketFrame.CONTINUATION
      if (this.assembleFragments) {
        if (this.frameQueue.length === 0) {
          this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR, 'Unexpected Continuation Frame');
          return;
        }

        this.fragmentationSize += frame.length;

        if (this.fragmentationSize > this.maxReceivedMessageSize) {
          this.drop(WebSocketConnection.CLOSE_REASON_MESSAGE_TOO_BIG, 'Maximum message size exceeded.');
          return;
        }

        this.frameQueue.push(frame);

        if (frame.fin) {
          // end of fragmented message, so we process the whole
          // message now.  We also have to decode the utf-8 data
          // for text frames after combining all the fragments.
          var bytesCopied = 0;
          var binaryPayload = bufferAllocUnsafe(this.fragmentationSize);
          var opcode = this.frameQueue[0].opcode;
          this.frameQueue.forEach(function (currentFrame) {
            currentFrame.binaryPayload.copy(binaryPayload, bytesCopied);
            bytesCopied += currentFrame.binaryPayload.length;
          });
          this.frameQueue = [];
          this.fragmentationSize = 0;

          switch (opcode) {
            case 0x02: // WebSocketOpcode.BINARY_FRAME
              this.emit('message', {
                type: 'binary',
                binaryData: binaryPayload,
              });
              break;
            case 0x01: // WebSocketOpcode.TEXT_FRAME
              if (!isValidUTF8(binaryPayload)) {
                this.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, 'Invalid UTF-8 Data Received');
                return;
              }
              this.emit('message', {
                type: 'utf8',
                utf8Data: binaryPayload.toString('utf8'),
              });
              break;
            default:
              this.drop(
                WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
                'Unexpected first opcode in fragmentation sequence: 0x' + opcode.toString(16),
              );
              return;
          }
        }
      }
      break;
    case 0x09: // WebSocketFrame.PING
      if (this._pingListenerCount > 0) {
        // logic to emit the ping frame: this is only done when a listener is known to exist
        // Expose a function allowing the user to override the default ping() behavior
        var cancelled = false;
        var cancel = function () {
          cancelled = true;
        };
        this.emit('ping', cancel, frame.binaryPayload);

        // Only send a pong if the client did not indicate that he would like to cancel
        if (!cancelled) {
          this.pong(frame.binaryPayload);
        }
      } else {
        this.pong(frame.binaryPayload);
      }

      break;
    case 0x0a: // WebSocketFrame.PONG
      this.emit('pong', frame.binaryPayload);
      break;
    case 0x08: // WebSocketFrame.CONNECTION_CLOSE
      if (this.waitingForCloseResponse) {
        // Got response to our request to close the connection.
        // Close is complete, so we just hang up.
        this.clearCloseTimer();
        this.waitingForCloseResponse = false;
        this.state = STATE_CLOSED;
        this.socket.end();
        return;
      }

      // Got request from other party to close connection.
      // Send back acknowledgement and then hang up.
      this.state = STATE_PEER_REQUESTED_CLOSE;
      var respondCloseReasonCode;

      // Make sure the close reason provided is legal according to
      // the protocol spec.  Providing no close status is legal.
      // WebSocketFrame sets closeStatus to -1 by default, so if it
      // is still -1, then no status was provided.
      if (frame.invalidCloseFrameLength) {
        this.closeReasonCode = 1005; // 1005 = No reason provided.
        respondCloseReasonCode = WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR;
      } else if (frame.closeStatus === -1 || validateCloseReason(frame.closeStatus)) {
        this.closeReasonCode = frame.closeStatus;
        respondCloseReasonCode = WebSocketConnection.CLOSE_REASON_NORMAL;
      } else {
        this.closeReasonCode = frame.closeStatus;
        respondCloseReasonCode = WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR;
      }

      // If there is a textual description in the close frame, extract it.
      if (frame.binaryPayload.length > 1) {
        if (!isValidUTF8(frame.binaryPayload)) {
          this.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, 'Invalid UTF-8 Data Received');
          return;
        }
        this.closeDescription = frame.binaryPayload.toString('utf8');
      } else {
        this.closeDescription = WebSocketConnection.CLOSE_DESCRIPTIONS[this.closeReasonCode];
      }
      this.sendCloseFrame(respondCloseReasonCode, null);
      this.connected = false;
      break;
    default:
      this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR, 'Unrecognized Opcode: 0x' + frame.opcode.toString(16));
      break;
  }
};

WebSocketConnection.prototype.send = function (data, cb) {
  if (Buffer.isBuffer(data)) {
    this.sendBytes(data, cb);
  } else if (typeof data['toString'] === 'function') {
    this.sendUTF(data, cb);
  } else {
    throw new Error('Data provided must either be a Node Buffer or implement toString()');
  }
};

WebSocketConnection.prototype.sendUTF = function (data, cb) {
  data = bufferFromString(data.toString(), 'utf8');
  var frame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
  frame.opcode = 0x01; // WebSocketOpcode.TEXT_FRAME
  frame.binaryPayload = data;
  this.fragmentAndSend(frame, cb);
};

WebSocketConnection.prototype.sendBytes = function (data, cb) {
  if (!Buffer.isBuffer(data)) {
    throw new Error('You must pass a Node Buffer object to WebSocketConnection.prototype.sendBytes()');
  }
  var frame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
  frame.opcode = 0x02; // WebSocketOpcode.BINARY_FRAME
  frame.binaryPayload = data;
  this.fragmentAndSend(frame, cb);
};

WebSocketConnection.prototype.ping = function (data) {
  var frame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
  frame.opcode = 0x09; // WebSocketOpcode.PING
  frame.fin = true;
  if (data) {
    if (!Buffer.isBuffer(data)) {
      data = bufferFromString(data.toString(), 'utf8');
    }
    if (data.length > 125) {
      data = data.slice(0, 124);
    }
    frame.binaryPayload = data;
  }
  this.sendFrame(frame);
};

// Pong frames have to echo back the contents of the data portion of the
// ping frame exactly, byte for byte.
WebSocketConnection.prototype.pong = function (binaryPayload) {
  var frame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
  frame.opcode = 0x0a; // WebSocketOpcode.PONG
  if (Buffer.isBuffer(binaryPayload) && binaryPayload.length > 125) {
    binaryPayload = binaryPayload.slice(0, 124);
  }
  frame.binaryPayload = binaryPayload;
  frame.fin = true;
  this.sendFrame(frame);
};

WebSocketConnection.prototype.fragmentAndSend = function (frame, cb) {
  if (frame.opcode > 0x07) {
    throw new Error('You cannot fragment control frames.');
  }

  var threshold = this.config.fragmentationThreshold;
  var length = frame.binaryPayload.length;

  // Send immediately if fragmentation is disabled or the message is not
  // larger than the fragmentation threshold.
  if (!this.config.fragmentOutgoingMessages || (frame.binaryPayload && length <= threshold)) {
    frame.fin = true;
    this.sendFrame(frame, cb);
    return;
  }

  var numFragments = Math.ceil(length / threshold);
  var sentFragments = 0;
  var sentCallback = function fragmentSentCallback(err) {
    if (err) {
      if (typeof cb === 'function') {
        // pass only the first error
        cb(err);
        cb = null;
      }
      return;
    }
    ++sentFragments;
    if (sentFragments === numFragments && typeof cb === 'function') {
      cb();
    }
  };
  for (var i = 1; i <= numFragments; i++) {
    var currentFrame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);

    // continuation opcode except for first frame.
    currentFrame.opcode = i === 1 ? frame.opcode : 0x00;

    // fin set on last frame only
    currentFrame.fin = i === numFragments;

    // length is likely to be shorter on the last fragment
    var currentLength = i === numFragments ? length - threshold * (i - 1) : threshold;
    var sliceStart = threshold * (i - 1);

    // Slice the right portion of the original payload
    currentFrame.binaryPayload = frame.binaryPayload.slice(sliceStart, sliceStart + currentLength);

    this.sendFrame(currentFrame, sentCallback);
  }
};

WebSocketConnection.prototype.sendCloseFrame = function (reasonCode, description, cb) {
  if (typeof reasonCode !== 'number') {
    reasonCode = WebSocketConnection.CLOSE_REASON_NORMAL;
  }

  if (this.state !== STATE_OPEN && this.state !== STATE_PEER_REQUESTED_CLOSE) {
    return;
  }

  var frame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
  frame.fin = true;
  frame.opcode = 0x08; // WebSocketOpcode.CONNECTION_CLOSE
  frame.closeStatus = reasonCode;
  if (typeof description === 'string') {
    frame.binaryPayload = bufferFromString(description, 'utf8');
  }

  this.sendFrame(frame, cb);
  this.socket.end();
};

WebSocketConnection.prototype.sendFrame = function (frame, cb) {
  frame.mask = this.maskOutgoingPackets;
  var flushed = this.socket.write(frame.toBuffer(), cb);
  this.outputBufferFull = !flushed;
  return flushed;
};

module.exports = WebSocketConnection;
