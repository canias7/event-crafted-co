import { Images } from "lucide-react";
import { VendorComingSoonShell } from "@/components/vendor/VendorComingSoonShell";

export default function VendorGalleryPage() {
  return (
    <VendorComingSoonShell
      title="Gallery"
      subtitle="Upload portfolio images, drag to reorder"
      Icon={Images}
    />
  );
}
