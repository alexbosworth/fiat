const {createHash} = require('crypto');

const template = require('./../outputs/template');

const methodVersion = 5;
const sha256 = n => createHash('sha256').update(n).digest('hex');
const {stringify} = JSON;
const templateHashLength = 8;

/** Get the version of the price derivation method

  {}

  @returns
  {
    version: <Method Version String>
  }
*/
module.exports = ({}) => {
  // A change to the template of round amounts changes the version too
  const hash = sha256(stringify(template));

  const templateVersion = hash.slice(Number(), templateHashLength);

  return {version: `${methodVersion}.${templateVersion}`};
};
