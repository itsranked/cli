exports.extend = function extend(dest, source) {
    for (var prop in source) {
        dest[prop] = source[prop];
    }
};

exports.eventEmitterListenerCount =
require('events').EventEmitter.listenerCount ||
function(emitter, type) { return emitter.listeners(type).length; };

exports.bufferAllocUnsafe = Buffer.allocUnsafe ?
Buffer.allocUnsafe :
function oldBufferAllocUnsafe(size) { return new Buffer(size); };

exports.bufferFromString = Buffer.from ?
Buffer.from :
function oldBufferFromString(string, encoding) {
    return new Buffer(string, encoding);
};