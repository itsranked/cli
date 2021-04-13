const nickName = 'itsranked.net';

function getUsernamePacket() {
    return Buffer.from(
        new Uint8Array([
            0x73, // SetUsernameAndSkin
            0x0a, // protocol version
            0x05, // skin id
            nickName.length
        ].concat(nickName.split("").map(char => char.charCodeAt(0))))
    );
}

module.exports = getUsernamePacket;
