import { QueryClient } from '@tanstack/react-query';

// One cache for every read in the app.
//
// Before this, each page fetched everything again on every visit: going to a
// student and pressing back re-fetched the whole mentee list and sat on a
// spinner while it did. The data behind this app changes when a person types
// a mark, not continuously, so a short staleness window costs nothing and
// removes almost every one of those spinners.

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Fresh for a minute: a back-click inside that window renders from the
      // cache with no request at all.
      staleTime: 60_000,
      // Kept for ten minutes after nothing is using it, so navigating away
      // and back shows the previous answer immediately while the new one is
      // fetched behind it.
      gcTime: 10 * 60_000,
      // The previous answer stays on screen during a refetch rather than
      // being replaced by a spinner.
      placeholderData: previous => previous,
      refetchOnWindowFocus: false,
      // A 403 means not allowed and a 404 means not there; retrying either is
      // just a slower way to show the same message.
      retry: (failureCount, error) => {
        const status = error?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});
