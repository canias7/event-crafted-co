import { CreditCard } from "lucide-react";
import { VendorComingSoonShell } from "@/components/vendor/VendorComingSoonShell";

export default function VendorPayPage() {
  return (
    <VendorComingSoonShell
      title="Vendora Pay"
      subtitle="Take deposits and final payments through Vendora"
      Icon={CreditCard}
    />
  );
}
