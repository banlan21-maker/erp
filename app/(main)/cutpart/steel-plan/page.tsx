export const dynamic = "force-dynamic";

import SteelPlanMain from "@/components/steel-plan-main";
import { ShipoutCartProvider } from "@/components/shipout-cart";

export default function SteelPlanPage() {
  return (
    <ShipoutCartProvider>
      <SteelPlanMain />
    </ShipoutCartProvider>
  );
}
