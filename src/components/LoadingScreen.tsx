import { Landmark } from 'lucide-react';

/**
 * Shown once while SystemContext's initial hydration is in flight. Before this,
 * the app rendered Login or Dashboard immediately regardless of whether real
 * data had arrived yet, so a slow connection could show an empty shell for a
 * moment. One deliberate reveal beats a generic spinner.
 *
 * No client company name here — this is white-label software used by many
 * different exchange offices, not built for one of them. The mark stays
 * neutral; the topbar/sidebar/receipts pick up each tenant's own company
 * name from settings once it loads.
 */
export default function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-mark">
        <Landmark size={32} strokeWidth={2.2} />
      </div>
      <div className="loading-bar-track">
        <div className="loading-bar-fill" />
      </div>
    </div>
  );
}
