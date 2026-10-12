type Connection = { saveData?: boolean; effectiveType?: string; downlink?: number; rtt?: number };

export function prefetchPolicy(online: boolean, connection?: Connection) {
  const constrained = Boolean(connection?.saveData || ["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? "")
    || (connection?.downlink !== undefined && connection.downlink < 1.5)
    || (connection?.rtt !== undefined && connection.rtt > 500));
  return { enabled: online && !connection?.saveData, audio: online && !constrained, route: online && !constrained };
}
