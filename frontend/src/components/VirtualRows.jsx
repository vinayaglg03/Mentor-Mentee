import React, { useLayoutEffect, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';

// Renders only the rows that are on screen, for lists long enough that the
// difference matters.
//
// A department with two thousand students was two thousand rows in the DOM,
// each with a handful of nodes in it, rebuilt on every filter keystroke.
//
// Below the threshold nothing here engages: the rows render normally, with no
// measuring and no spacers. A list of thirty behaves exactly as it did
// before, which is the point - virtualising a short list adds risk and buys
// nothing.
//
// The table stays a real <table>: the visible slice is padded above and below
// by two spacer rows of the right height, so the browser's own column sizing,
// the sticky header and the sticky first column all keep working. Rebuilding
// it as absolutely positioned divs would lose all three.
//
// The page is the scroll container - the table does not have its own - so
// this measures against the window and offsets by where the table starts.

const THRESHOLD = 200;
const ESTIMATED_ROW_HEIGHT = 56;

export const VirtualRows = ({ items, renderRow, threshold = THRESHOLD, columnCount }) => {
  const bodyRef = useRef(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const virtualise = items.length > threshold;

  useLayoutEffect(() => {
    if (!virtualise || !bodyRef.current) return;
    setScrollMargin(bodyRef.current.getBoundingClientRect().top + window.scrollY);
  }, [virtualise, items.length]);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 10,
    scrollMargin,
    enabled: virtualise,
  });

  if (!virtualise) {
    return <tbody ref={bodyRef}>{items.map((item, index) => renderRow(item, index))}</tbody>;
  }

  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length ? virtualRows[0].start - scrollMargin : 0;
  const paddingBottom = virtualRows.length
    ? virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1].end - scrollMargin)
    : 0;

  return (
    <tbody ref={bodyRef}>
      {paddingTop > 0 && (
        <tr aria-hidden="true">
          <td colSpan={columnCount} style={{ height: paddingTop, padding: 0, border: 0 }} />
        </tr>
      )}

      {virtualRows.map(virtualRow => renderRow(items[virtualRow.index], virtualRow.index))}

      {paddingBottom > 0 && (
        <tr aria-hidden="true">
          <td colSpan={columnCount} style={{ height: paddingBottom, padding: 0, border: 0 }} />
        </tr>
      )}
    </tbody>
  );
};

export default VirtualRows;
