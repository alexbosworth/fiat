/** Make an in-memory file system

  {
    files: {<Path String>: <File Contents String>}
  }

  @returns
  {
    getFile: <Read File Contents Function> (path, cbk) => {}
    makeDirectory: <Make Directory Function> (path, cbk) => {}
    renameFile: <Rename File Function> (from, to, cbk) => {}
    writeFile: <Write File Contents Function> (path, contents, cbk) => {}
  }
*/
module.exports = ({files}) => ({
  getFile: (path, cbk) => {
    const missing = {code: 'ENOENT'};

    return !files[path] ? cbk(missing) : cbk(null, Buffer.from(files[path]));
  },
  makeDirectory: (path, cbk) => cbk(),
  renameFile: (from, to, cbk) => {
    files[to] = files[from];

    delete files[from];

    return cbk();
  },
  writeFile: (path, contents, cbk) => {
    files[path] = contents;

    return cbk();
  },
});
