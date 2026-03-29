import { useEffect, useRef, useCallback } from "react";
import { getCookie } from "../utils/cookieUtils.js";

/**
 * useTaskNotifications (optimized)
 *
 * Opens a persistent SSE connection to /api/tasks/notifications.
 * Calls the provided callbacks on each event type.
 *
 * Usage:
 *   useTaskNotifications({
 *     onRunUpdate:  (event) => ...,
 *     onCompleted:  (event) => ...,
 *     onError:      (err)   => ...,   // optional
 *   });
 *
 * Performance improvements:
 *   - Initial retry starts at 5s (was 1s) to reduce reconnection storm pressure
 *   - Exponential backoff up to 60s (was 30s) for sustained failures
 *   - Max reconnection attempts (20) to prevent infinite retry loops
 *   - Visibility-aware: pauses SSE when tab is hidden, reconnects on visibility
 *   - Connection health monitoring with detailed logging
 *   - Cleans up the EventSource on unmount
 */

/* ── Configurable SSE reconnection settings ── */
const SSE_INITIAL_RETRY_MS   = 5_000    // 5 seconds (was 1s — reduces server hammering)
const SSE_MAX_RETRY_MS       = 60_000   // 60 seconds max backoff (was 30s)
const SSE_MAX_RETRY_ATTEMPTS = 20       // Stop retrying after 20 consecutive failures
const SSE_JITTER_MS          = 2_000    // Random jitter to prevent thundering herd

export default function useTaskNotifications({
  onRunUpdate,
  onCompleted,
  onError,
}) {
  const esRef              = useRef(null);
  const retryDelay         = useRef(SSE_INITIAL_RETRY_MS);
  const retryTimer         = useRef(null);
  const retryCount         = useRef(0);
  const unmounted          = useRef(false);
  const lastEventTime      = useRef(0);
  const connectionCount    = useRef(0);

  const connect = useCallback(() => {
    if (unmounted.current) return;

    // ── Guard: Stop retrying after too many consecutive failures ──
    if (retryCount.current >= SSE_MAX_RETRY_ATTEMPTS) {
      console.error(
        `[TaskSSE] Giving up after ${SSE_MAX_RETRY_ATTEMPTS} consecutive failures.`,
        'Task notifications will not update until page reload.'
      );
      return;
    }

    // ── Guard: Don't connect if tab is hidden ──
    if (document.hidden) {
      console.log('[TaskSSE] Tab is hidden — deferring SSE connection');
      return;
    }

    // Close any existing connection before opening a new one
    if (esRef.current) {
      try { esRef.current.close(); } catch { /* ignore */ }
      esRef.current = null;
    }

    const token = getCookie("zenith_token") || localStorage.getItem("token");
    // EventSource doesn't support custom headers natively —
    // pass token as a query param (backend must accept it)
    const url = `/api/tasks/notifications?token=${encodeURIComponent(token || "")}`;

    const connId = ++connectionCount.current;
    console.log(`[TaskSSE] Connection #${connId} opening (retry: ${retryCount.current}/${SSE_MAX_RETRY_ATTEMPTS})`);

    const es = new EventSource(url);
    esRef.current = es;

    // ── task_run_update ───────────────────────────────────────────────────────
    es.addEventListener("task_run_update", (e) => {
      retryDelay.current = SSE_INITIAL_RETRY_MS; // reset backoff on successful event
      retryCount.current = 0;                     // reset retry counter
      lastEventTime.current = Date.now();
      try {
        const data = JSON.parse(e.data);
        onRunUpdate?.(data);
      } catch (err) {
        console.error("[TaskSSE] task_run_update parse error:", err);
      }
    });

    // ── task_completed ────────────────────────────────────────────────────────
    es.addEventListener("task_completed", (e) => {
      retryDelay.current = SSE_INITIAL_RETRY_MS;
      retryCount.current = 0;
      lastEventTime.current = Date.now();
      try {
        const data = JSON.parse(e.data);
        onCompleted?.(data);
      } catch (err) {
        console.error("[TaskSSE] task_completed parse error:", err);
      }
    });

    // ── heartbeat — resets backoff, keeps connection alive ────────────────────
    es.addEventListener("heartbeat", () => {
      retryDelay.current = SSE_INITIAL_RETRY_MS;
      retryCount.current = 0;
      lastEventTime.current = Date.now();
    });

    // ── connection opened successfully ────────────────────────────────────────
    es.onopen = () => {
      console.log(`[TaskSSE] Connection #${connId} opened successfully`);
      retryDelay.current = SSE_INITIAL_RETRY_MS;
      retryCount.current = 0;
      lastEventTime.current = Date.now();
    };

    // ── connection error → reconnect with backoff + jitter ────────────────────
    es.onerror = (err) => {
      es.close();
      esRef.current = null;

      if (unmounted.current) return;

      retryCount.current++;
      onError?.(err);

      // Add random jitter to prevent all clients from reconnecting simultaneously
      const jitter = Math.floor(Math.random() * SSE_JITTER_MS);
      const delay = retryDelay.current + jitter;
      retryDelay.current = Math.min(retryDelay.current * 2, SSE_MAX_RETRY_MS);

      console.warn(
        `[TaskSSE] Connection #${connId} disconnected.`,
        `Reconnecting in ${Math.round(delay / 1000)}s`,
        `(attempt ${retryCount.current}/${SSE_MAX_RETRY_ATTEMPTS})`
      );

      retryTimer.current = setTimeout(connect, delay);
    };
  }, [onRunUpdate, onCompleted, onError]);

  // ── Visibility change handler: pause SSE when tab is hidden ──
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden — close SSE to free up server resources
        console.log('[TaskSSE] Tab hidden — closing SSE connection');
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
        if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
        }
      } else {
        // Tab visible again — reconnect with fresh backoff
        console.log('[TaskSSE] Tab visible — reconnecting SSE');
        retryDelay.current = SSE_INITIAL_RETRY_MS;
        retryCount.current = 0;
        // Small delay to avoid connecting during tab switch animations
        retryTimer.current = setTimeout(connect, 500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [connect]);

  useEffect(() => {
    unmounted.current = false;
    connect();

    return () => {
      unmounted.current = true;
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);
}
