import type { PictureSource } from "@/components/shared/Picture";
import p02 from "@/assets/photos/02.webp?as=picture";
import p05 from "@/assets/photos/05.webp?as=picture";
import p06 from "@/assets/photos/06.webp?as=picture";
import p08 from "@/assets/photos/08.webp?as=picture";
import p12 from "@/assets/photos/12.webp?as=picture";
import p14 from "@/assets/photos/14.webp?as=picture";
import p16 from "@/assets/photos/16.webp?as=picture";
import p20 from "@/assets/photos/20.webp?as=picture";
import p23 from "@/assets/photos/23.webp?as=picture";
import p24 from "@/assets/photos/24.webp?as=picture";
import p27 from "@/assets/photos/27.webp?as=picture";
import p30 from "@/assets/photos/30.webp?as=picture";
import p31 from "@/assets/photos/31.webp?as=picture";
import p32 from "@/assets/photos/32.webp?as=picture";
import p35 from "@/assets/photos/35.webp?as=picture";
import p46 from "@/assets/photos/46.webp?as=picture";
import p50 from "@/assets/photos/50.webp?as=picture";
import p51 from "@/assets/photos/51.webp?as=picture";
import p52 from "@/assets/photos/52.webp?as=picture";
import p53 from "@/assets/photos/53.webp?as=picture";
import p54 from "@/assets/photos/54.webp?as=picture";
import p55 from "@/assets/photos/55.webp?as=picture";
import p57 from "@/assets/photos/57.webp?as=picture";

// The photo a vendor profile shares in link previews and structured data,
// by the vendor's sub-category: one of the owner's pictures that matches
// the kind of business (numbers as in the "Photos" tab of the page
// walkthrough doc). Pages never show it; visitors see the listing's own
// photos, or a plain placeholder.
const BY_SUB: Record<string, PictureSource> = {
  // Venues
  "Event Venues": p53,
  "Outdoor Spaces": p54,
  "Private Dining Spaces": p12,
  "Corporate / Conference Spaces": p55,
  // Food & Beverage
  Catering: p16,
  "Bartending / Mobile Bars": p52,
  "Desserts & Cakes": p50,
  "Food Trucks / Specialty": p46,
  // Entertainment
  DJs: p30,
  "Live Music": p31,
  Performers: p31,
  "Hosts / MCs": p32,
  // Media
  Photography: p08,
  Videography: p51,
  "Photo Booths": p06,
  // Design & Decor
  "Event Coordinators": p24,
  Florists: p27,
  Beauty: p02,
  "Decor Rentals": p05,
  "Grooming Services": p20,
  // Rentals
  "Furniture Rentals": p53,
  "Tents & Outdoor": p54,
  "Lighting & AV Equipment": p32,
  "Dance Floors & Staging": p31,
  Transportation: p35,
  // Experiences
  Tastings: p14,
  "Specialty Services": p57,
  // Corporate Services
  Staffing: p23,
  "Speakers / Hosts": p55,
  Security: p24,
  Valet: p12,
};

export function vendorStandInPhoto(subCategory: string): PictureSource {
  return BY_SUB[subCategory] ?? p53;
}
