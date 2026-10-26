const {randomBytes} = require('crypto');

const bufferAsHex = buffer => buffer.toString('hex');
const randomIdBytes = 4;

/** Get the path of a temporary file of its own next to a file

  {
    path: <File Path String>
  }

  @returns
  {
    path: <Temporary File Path String>
  }
*/
module.exports = ({path}) => {
  // The pid and random bytes keep writers from sharing a temporary file
  const id = bufferAsHex(randomBytes(randomIdBytes));

  return {path: `${path}.${process.pid}.${id}`};
};
