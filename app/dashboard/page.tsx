import { BridgeErrorBoundary } from './bridge-error-boundary';
import { DashboardClient } from './dashboard-client';

export default function DashboardPage() {
  return (
    <BridgeErrorBoundary>
      <DashboardClient />
    </BridgeErrorBoundary>
  );
}
