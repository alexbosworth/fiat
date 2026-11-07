const saveEvery = 24;

/** Count a fetched block, saving the kept blocks every so many new blocks

  {
    height: <Fetched Block Height Number>
    [kept]: {
      blocks: <Kept Blocks By Height Map Object>
      fetched: <Heights Fetched Since a Save Was Asked For Set Object>
      floor: <Lowest Recent Block Height Number>
      saved: <Heights of the Blocks In the Blocks File Set Object>
      saves: <Saves of the Blocks File Queue Object>
    }
  }
*/
module.exports = ({height, kept}) => {
  // Exit early when blocks are not kept
  if (!kept || !kept.saves) {
    return;
  }

  const isRecent = height >= kept.floor && kept.blocks.has(height);

  // Exit early when the block is not a new recent kept block
  if (!isRecent || kept.saved.has(height)) {
    return;
  }

  kept.fetched.add(height);

  // Exit early when there are not enough new blocks to save yet
  if (kept.fetched.size < saveEvery) {
    return;
  }

  kept.fetched.clear();

  kept.saves.push({});
};
