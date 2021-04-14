const getUsernamePacket = require('./get-username-packet');
const solveRiddle = require('./solve-riddle');
let mscps = 300,
  fmlts,
  fpsls;

/**
 *
 * @param {Buffer} buffer
 */
function parseBinaryData(connection, buffer) {
  const output = {};
  const timeSinceLastMessage = buffer.readUIntBE(0, 2);
  const messageType = buffer.readUIntBE(2, 1);

  // console.log(`TS = ${timeSinceLastMessage}`);
  // console.log(`messageType = 0x${Number(messageType).toString(16)}`);

  if (messageType === 0x36) {
    // Pre-init response
    const riddleResponse = solveRiddle(buffer.subarray(3));

    connection.sendBytes(riddleResponse);

    connection.sendBytes(getUsernamePacket());
  }

  if (messageType === 0x70) { // PONG

    return {
      command: 'PONG',
    };
  }

  if (messageType === 0x61) {
    // Initial Setup
    mscps = buffer.subarray(6, 8).readUIntBE(0, 2);
    fmlts = [];
    fpsls = [];

    for (b = 0; b <= mscps; b++)
      b >= mscps ? fmlts.push(fmlts[b - 1]) : fmlts.push(Math.pow(1 - b / mscps, 2.25)),
        0 == b ? fpsls.push(0) : fpsls.push(fpsls[b - 1] + 1 / fmlts[b - 1]);

    const c = fmlts[fmlts.length - 1],
      e = fpsls[fpsls.length - 1];

    for (b = 0; 2048 > b; b++) fmlts.push(c), fpsls.push(e);
  }

  if (messageType === 0x76) {
    // disconnect
    return {
      command: 'DEAD',
      data: buffer.subarray(3, 4).readUIntBE(0, 1),
    };
  }

  if (messageType === 0x6c) {
    // Leaderboard

    const users = [];

    let offset = 4;

    //        const localRank = buffer.subarray(offset, offset + 2).readUIntBE(0, 2);
    offset += 2;

    const totalPlayers = buffer.subarray(offset, offset + 2).readUIntBE(0, 2);
    offset += 2;

    do {
      const snakeBodyParts = buffer.subarray(offset, offset + 2).readUIntBE(0, 2);
      offset += 2;

      const snakeLastBodyPartFullness = buffer.subarray(offset, offset + 3).readUIntBE(0, 3) / 16777215.0;
      offset += 3;

      const nameColor = buffer.subarray(offset, offset + 1).readUInt8() % 9;
      offset += 1;

      const userNameLength = buffer.subarray(offset, offset + 1).readUInt8();
      offset += 1;

      const userName = buffer.toString('ascii', offset, offset + userNameLength);
      offset += userNameLength;

      const score =
        Math.floor(15 * (fpsls[snakeBodyParts] + snakeLastBodyPartFullness / fmlts[snakeBodyParts] - 1) - 5) / 1;

      users.push({ userName, score });
    } while (offset < buffer.length);

    users.sort((a, b) => a.score - b.score);

    return {
      command: 'SAVE_SCORES',
      totalPlayers,
      data: users.reverse(),
    };
  }

  return output;
}

module.exports = parseBinaryData;
