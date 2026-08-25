import { useCallback, useEffect, useRef } from 'react';

// Below 640px a data table becomes one card per row, and each value needs the
// name of its column beside it - otherwise it is a stack of anonymous
// numbers. The CSS reads that name from data-label on the cell.
//
// Writing data-label by hand on every td means eleven chances to forget one,
// and a forgotten one shows as a value with no label rather than as an error.
// This copies them from the header row instead, and keeps them in step when
// the rows change.
//
// A callback ref rather than an effect on a ref object: a table that lives
// behind a tab does not exist when the page mounts, and an effect that ran
// once at mount attached its observer to nothing at all.
//
// Returns a ref to put on the <table>.

export const useCardLabels = () => {
  const observerRef = useRef(null);

  const attach = useCallback((table) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!table) return;

    const apply = () => {
      const headings = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
      if (headings.length === 0) return;

      for (const row of table.querySelectorAll('tbody tr')) {
        const cells = [...row.children];

        // A detail row is one cell spanning the table; labelling it with the
        // first column's name would be worse than leaving it alone.
        if (cells.length === 1 && Number(cells[0].getAttribute('colspan') || 1) > 1) continue;

        cells.forEach((cell, index) => {
          const label = headings[index];
          // Only set what is missing: a cell that names itself deliberately
          // keeps what it was given.
          if (label && !cell.hasAttribute('data-label')) {
            cell.setAttribute('data-label', label);
          }
        });
      }
    };

    apply();

    // Rows arrive after the fetch resolves, and change on every filter.
    const observer = new MutationObserver(apply);
    observer.observe(table, { childList: true, subtree: true });
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return attach;
};
