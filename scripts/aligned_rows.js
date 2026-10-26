const {max} = Math;

/** Align rows of text cells into columns

  {
    rows: [[<Cell String>]]
  }

  @returns
  {
    lines: [<Line String>]
  }
*/
module.exports = ({rows}) => {
  // Exit early when there are no rows
  if (!rows.length) {
    return {lines: []};
  }

  const [first] = rows;

  const widths = first.map((cell, i) => max(...rows.map(n => n[i].length)));

  return {
    lines: rows.map(row => {
      return row.map((n, i) => n.padEnd(widths[i])).join('  ').trimEnd();
    }),
  };
};
